/**
 * WORKERFS-backed FFmpeg extractor — handles files of any size, including >2GB.
 *
 * The repo's main lib (VideoMetadataExtractor.extractMetadata) writes the
 * whole file into FFmpeg's MEMFS via writeFile(). MEMFS is in-memory and
 * capped at ~2GB by the WASM heap, so it fails on a 13GB MKV with
 * "File could not be read! Code=-1".
 *
 * This module sidesteps that by using the `mkve` FFmpeg.js workers
 * (qgustavor's build, included under public/). Those workers expose
 * Emscripten's WORKERFS filesystem so FFmpeg reads bytes from the user's
 * File on demand. RAM stays bounded regardless of input size and the
 * extracted SRT bytes are byte-identical to local `ffmpeg -map 0:N -c copy`.
 */

import JSZip from 'jszip';

// Vite injects BASE_URL at build time. Falls back to '/' in non-Vite contexts.
const BASE_URL: string =
  (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) || '/';

const FFPROBE_WORKER = `${BASE_URL}ffprobe-worker-mkve.js`;
const FFMPEG_WORKER = `${BASE_URL}ffmpeg-worker-mkve.js`;

export interface StreamInfo {
  index: number;
  codecType: 'video' | 'audio' | 'subtitle' | 'attachment' | 'data' | 'unknown';
  codecName: string;
  language?: string;
  title?: string;
  forced?: boolean;
  hearingImpaired?: boolean;
  default?: boolean;
  width?: number;
  height?: number;
  channels?: string;
  durationSec?: number;
}

export interface MetadataReport {
  fileName: string;
  fileSize: number;
  format: string;
  duration: string;
  bitrate: string;
  streams: StreamInfo[];
  raw: unknown;
}

export interface SubtitleFile {
  filename: string;
  streamIndex: number;
  language?: string;
  title?: string;
  codec: string;
  size: number;
  data: Uint8Array;
  sha256: string;
}

export interface BatchSubtitleReport {
  ok: boolean;
  fileName: string;
  fileSize: number;
  totalSubtitleStreams: number;
  extractedCount: number;
  failedCount: number;
  durationMs: number;
  peakHeapBytes: number | null;
  zipFilename: string;
  zipSize: number;
  extracted: Array<Omit<SubtitleFile, 'data'>>;
  errors: string[];
}

type ProgressFn = (text: string, percent?: number) => void;

// ---------- worker protocol --------------------------------------------

interface WorkerInMsg {
  type: 'ready' | 'stdout' | 'stderr' | 'done' | 'exit';
  data?: unknown;
}

interface MountSpec {
  type: 'WORKERFS';
  opts: { files: File[] };
  mountpoint: string;
}

interface RunArgs {
  type: 'run';
  arguments: string[];
  MEMFS?: Array<{ name: string; data: Uint8Array | ArrayBuffer }>;
  mounts?: MountSpec[];
}

interface DoneData {
  MEMFS?: Array<{ name: string; data: Uint8Array }>;
}

function runWorker(
  workerUrl: string,
  args: string[],
  mountFile: File,
  onStderr?: (line: string) => void,
): Promise<{ stdout: string; stderr: string; memfs: Array<{ name: string; data: Uint8Array }> }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl);
    let stdout = '';
    let stderr = '';
    let memfs: Array<{ name: string; data: Uint8Array }> = [];

    const cleanup = () => {
      try { worker.terminate(); } catch { /* no-op */ }
    };

    worker.addEventListener('error', (e) => {
      cleanup();
      reject(new Error(`Worker error: ${e.message || 'unknown'}`));
    });

    worker.addEventListener('message', (e: MessageEvent<WorkerInMsg>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'ready': {
          const runMsg: RunArgs = {
            type: 'run',
            arguments: args,
            mounts: [
              {
                type: 'WORKERFS',
                opts: { files: [mountFile] },
                mountpoint: '/data',
              },
            ],
          };
          worker.postMessage(runMsg);
          break;
        }
        case 'stdout':
          stdout += String(msg.data ?? '') + '\n';
          break;
        case 'stderr': {
          const line = String(msg.data ?? '');
          stderr += line + '\n';
          onStderr?.(line);
          break;
        }
        case 'done': {
          const d = msg.data as DoneData | undefined;
          if (d?.MEMFS) memfs = d.MEMFS;
          cleanup();
          resolve({ stdout, stderr, memfs });
          break;
        }
        case 'exit':
          // Worker reports exit before done in some flows — keep waiting for done.
          break;
      }
    });
  });
}

// ---------- metadata via ffprobe-worker ---------------------------------

interface FfprobeStream {
  index: number;
  codec_type: string;
  codec_name?: string;
  width?: number;
  height?: number;
  channels?: number;
  channel_layout?: string;
  duration?: string;
  duration_ts?: number;
  tags?: Record<string, string | undefined>;
  disposition?: Record<string, number>;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: {
    format_name?: string;
    duration?: string;
    bit_rate?: string;
    size?: string;
  };
}

function normalizeCodecType(t: string): StreamInfo['codecType'] {
  const lower = t.toLowerCase();
  if (lower === 'video' || lower === 'audio' || lower === 'subtitle' || lower === 'attachment' || lower === 'data') {
    return lower;
  }
  return 'unknown';
}

export async function extractMetadataWorkerFS(
  file: File,
  onProgress?: ProgressFn,
): Promise<MetadataReport> {
  onProgress?.('Spawning ffprobe worker…', 5);
  const { stdout, stderr } = await runWorker(
    FFPROBE_WORKER,
    [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '/data/' + file.name,
    ],
    file,
    () => onProgress?.('Probing…', 40),
  );

  onProgress?.('Parsing ffprobe JSON…', 80);
  let parsed: FfprobeOutput;
  try {
    parsed = JSON.parse(stdout) as FfprobeOutput;
  } catch {
    throw new Error(`ffprobe returned unparseable JSON.\nstdout:\n${stdout.slice(0, 500)}\nstderr:\n${stderr.slice(0, 500)}`);
  }

  const streams: StreamInfo[] = (parsed.streams ?? []).map((s) => {
    const info: StreamInfo = {
      index: s.index,
      codecType: normalizeCodecType(s.codec_type),
      codecName: s.codec_name ?? 'unknown',
    };
    if (s.tags?.language) info.language = s.tags.language;
    if (s.tags?.title) info.title = s.tags.title;
    if (s.disposition?.forced) info.forced = s.disposition.forced === 1;
    if (s.disposition?.hearing_impaired) info.hearingImpaired = s.disposition.hearing_impaired === 1;
    if (s.disposition?.default) info.default = s.disposition.default === 1;
    if (s.width) info.width = s.width;
    if (s.height) info.height = s.height;
    if (s.channels) info.channels = `${s.channels}`;
    if (s.channel_layout) info.channels = s.channel_layout;
    if (s.duration) info.durationSec = parseFloat(s.duration);
    return info;
  });

  onProgress?.(`Found ${streams.length} streams (${streams.filter((s) => s.codecType === 'subtitle').length} subtitles).`, 100);

  return {
    fileName: file.name,
    fileSize: file.size,
    format: parsed.format?.format_name ?? 'unknown',
    duration: parsed.format?.duration ?? 'unknown',
    bitrate: parsed.format?.bit_rate ?? 'unknown',
    streams,
    raw: parsed,
  };
}

// ---------- subtitle extraction via ffmpeg-worker ----------------------

function subtitleExt(codec: string): string {
  const c = codec.toLowerCase();
  if (c === 'subrip' || c === 'srt') return 'srt';
  if (c === 'ass' || c === 'ssa') return 'ass';
  if (c === 'webvtt' || c === 'vtt') return 'vtt';
  if (c.includes('mov_text')) return 'srt';
  return 'srt';
}

async function sha256(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function sanitizeForFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60);
}

export async function extractAllSubtitlesWorkerFS(
  file: File,
  meta: MetadataReport,
  onProgress?: ProgressFn,
): Promise<BatchSubtitleReport> {
  const t0 = performance.now();
  const errors: string[] = [];
  const heapSamples: number[] = [];
  const sampleHeap = () => {
    const m = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
    if (m && typeof m.usedJSHeapSize === 'number') heapSamples.push(m.usedJSHeapSize);
  };

  const subtitleStreams = meta.streams.filter((s) => s.codecType === 'subtitle');
  if (subtitleStreams.length === 0) {
    return {
      ok: false,
      fileName: file.name,
      fileSize: file.size,
      totalSubtitleStreams: 0,
      extractedCount: 0,
      failedCount: 0,
      durationMs: 0,
      peakHeapBytes: null,
      zipFilename: '',
      zipSize: 0,
      extracted: [],
      errors: ['No subtitle streams found in file'],
    };
  }

  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const args: string[] = ['-hide_banner', '-y', '-i', '/data/' + file.name];
  const outputs: Array<{ name: string; stream: StreamInfo }> = [];
  for (const s of subtitleStreams) {
    const ext = subtitleExt(s.codecName);
    const langSuffix = s.language ? `.${s.language}` : '';
    const titleSuffix = s.title ? `.${sanitizeForFilename(s.title)}` : '';
    const name = `${baseName}.s${s.index}${langSuffix}${titleSuffix}.${ext}`;
    outputs.push({ name, stream: s });
    args.push('-map', `0:${s.index}`, '-c:s', 'copy', name);
  }

  onProgress?.(`Spawning ffmpeg worker, ${subtitleStreams.length} subtitle streams…`, 5);
  sampleHeap();

  const { memfs, stderr } = await runWorker(
    FFMPEG_WORKER,
    args,
    file,
    (line) => {
      // Surface meaningful progress when ffmpeg prints output filenames.
      if (line.includes('Output #')) onProgress?.('Writing output streams…', 50);
    },
  );
  sampleHeap();

  const extracted: SubtitleFile[] = [];
  for (const { name, stream } of outputs) {
    const member = memfs.find((m) => m.name === name);
    if (!member || member.data.length === 0) {
      errors.push(`stream ${stream.index}: no output produced (filename=${name})`);
      continue;
    }
    const digest = await sha256(member.data);
    extracted.push({
      filename: name,
      streamIndex: stream.index,
      language: stream.language,
      title: stream.title,
      codec: stream.codecName,
      size: member.data.length,
      data: member.data,
      sha256: digest,
    });
  }
  sampleHeap();

  if (extracted.length === 0) {
    return {
      ok: false,
      fileName: file.name,
      fileSize: file.size,
      totalSubtitleStreams: subtitleStreams.length,
      extractedCount: 0,
      failedCount: subtitleStreams.length,
      durationMs: +(performance.now() - t0).toFixed(1),
      peakHeapBytes: heapSamples.length ? Math.max(...heapSamples) : null,
      zipFilename: '',
      zipSize: 0,
      extracted: [],
      errors: errors.length ? errors : [`ffmpeg produced no outputs. stderr tail:\n${stderr.slice(-500)}`],
    };
  }

  onProgress?.(`Building ZIP of ${extracted.length} files…`, 90);
  const zip = new JSZip();
  for (const f of extracted) zip.file(f.filename, f.data);
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipFilename = `${baseName}.subtitles.zip`;

  // Trigger download
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  sampleHeap();

  const durationMs = performance.now() - t0;
  return {
    ok: extracted.length === subtitleStreams.length,
    fileName: file.name,
    fileSize: file.size,
    totalSubtitleStreams: subtitleStreams.length,
    extractedCount: extracted.length,
    failedCount: subtitleStreams.length - extracted.length,
    durationMs: +durationMs.toFixed(1),
    peakHeapBytes: heapSamples.length ? Math.max(...heapSamples) : null,
    zipFilename,
    zipSize: zipBlob.size,
    extracted: extracted.map(({ data: _data, ...rest }) => rest),
    errors,
  };
}

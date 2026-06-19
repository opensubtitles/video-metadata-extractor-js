/**
 * Real-browser 2GB+ runner — drives both manual UI and Puppeteer automation.
 *
 * Loaded by /browser-2gb-test.html (multi-page Vite entry). Two surfaces:
 *
 *  1) Manual UI: wires file picker + buttons + result panel for humans to
 *     run on the GitHub Pages demo against their own >2GB files.
 *
 *  2) Automation API: exposes window.__runBig2GBTest(mode) so the Puppeteer
 *     driver in tests/automation/real-2gb-browser.test.ts can run the same
 *     chunked-processing test programmatically.
 *
 * No mocks. Real Blob.slice() + real ArrayBuffer reads + real FFmpeg WASM
 * subtitle extraction against files of any size, including >2GB.
 */

import {
  FileProcessor,
  isLargeFile,
  isVeryLargeFile,
  getRecommendedProcessingStrategy,
} from '../utils/fileProcessor';
import { PROCESSING_CONSTANTS } from '../constants/index';
import {
  extractMetadataWorkerFS,
  extractAllSubtitlesWorkerFS,
  type MetadataReport,
  type BatchSubtitleReport,
} from './browser2GBExtractor';

// ---------- types -------------------------------------------------------

export interface Big2GBAssertions {
  fileSizeOver2GB: boolean;
  isLargeFileFlag: boolean;
  strategyNotQuick: boolean;
  allChunksProcessed: boolean;
  firstBytesRead: boolean;
  heapBoundedUnder1GB: boolean | null;
  noErrors: boolean;
}

export interface Big2GBResult {
  ok: boolean;
  product: string;
  mode: 'file' | 'synthetic';
  fileName: string;
  fileSize: number;
  fileSizeGB: number;
  isLargeFile: boolean;
  isVeryLargeFile: boolean;
  strategy: 'quick' | 'chunked' | 'progressive';
  chunkSize: number;
  totalChunks: number;
  chunksProcessed: number;
  firstByteSamples: number[];
  durationMs: number;
  peakHeapBytes: number | null;
  heapSamples: number[];
  errors: string[];
  assertions: Big2GBAssertions;
}

declare global {
  interface Window {
    __big2gbResult?: Big2GBResult;
    __big2gbMetaResult?: MetadataReport;
    __big2gbSubsResult?: BatchSubtitleReport;
    __runBig2GBTest: (mode: 'file' | 'synthetic') => Promise<Big2GBResult>;
    __runBig2GBMetadata: () => Promise<MetadataReport>;
    __runBig2GBSubtitles: () => Promise<BatchSubtitleReport>;
  }
}

// ---------- constants ---------------------------------------------------

const SYNTHETIC_TARGET = 2.1 * 1024 * 1024 * 1024;
const HEAP_LIMIT_BYTES = 1024 * 1024 * 1024;

// ---------- utilities ---------------------------------------------------

const log = (m: string) => console.log(`[big2gb] ${m}`);

function detectProduct(): string {
  const ua = navigator.userAgent;
  const m =
    ua.match(/Firefox\/[\d.]+/) ||
    ua.match(/Edg\/[\d.]+/) ||
    ua.match(/Chrome\/[\d.]+/);
  return m ? m[0] : 'unknown';
}

function sampleHeap(): number | null {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
  return mem && typeof mem.usedJSHeapSize === 'number' ? mem.usedJSHeapSize : null;
}

function gbStr(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(3) + ' GB';
}

function mbStr(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

async function buildSyntheticFile(targetBytes: number): Promise<File> {
  // OPFS-backed real File >2GB.
  // Writes the target size to the Origin Private File System using a 64MB
  // reusable buffer, then returns the file handle's File. Real disk-backed
  // File — slice() reads lazily, RAM stays at ~64MB during build.
  // Works in Chrome 86+ and Firefox 111+.
  if (
    !('storage' in navigator) ||
    typeof navigator.storage.getDirectory !== 'function'
  ) {
    throw new Error(
      'OPFS not available — synthetic mode requires navigator.storage.getDirectory (Chrome 86+, Firefox 111+)',
    );
  }

  const root = await navigator.storage.getDirectory();
  const name = `synthetic-2gb-${Date.now()}.mkv`;
  const handle = await root.getFileHandle(name, { create: true });
  const writable = await (handle as unknown as {
    createWritable: () => Promise<{
      write: (chunk: BufferSource) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }).createWritable();

  const partSize = 64 * 1024 * 1024;
  const buf = new Uint8Array(partSize);
  buf.set([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);
  for (let i = 9; i < partSize; i++) buf[i] = (i * 31) & 0xff;

  let written = 0;
  while (written < targetBytes) {
    const remaining = targetBytes - written;
    const len = Math.min(partSize, remaining);
    await writable.write(len === partSize ? buf : buf.subarray(0, len));
    written += len;
  }
  await writable.close();
  return await handle.getFile();
}

// ---------- core: chunked processing test -------------------------------

export async function runChunkedTest(
  mode: 'file' | 'synthetic',
  inputFile: File | null,
  onUpdate?: (text: string) => void,
): Promise<Big2GBResult> {
  const errors: string[] = [];
  const heapSamples: number[] = [];
  const firstByteSamples: number[] = [];
  const product = detectProduct();

  let file: File;
  try {
    if (mode === 'file') {
      if (!inputFile) throw new Error('no file provided');
      file = inputFile;
    } else {
      log(`building synthetic ${(SYNTHETIC_TARGET / 1024 ** 3).toFixed(2)}GB File via OPFS`);
      onUpdate?.(`Building synthetic ${(SYNTHETIC_TARGET / 1024 ** 3).toFixed(2)}GB OPFS file...`);
      file = await buildSyntheticFile(SYNTHETIC_TARGET);
    }
  } catch (e) {
    errors.push(`file setup: ${(e as Error).message}`);
    throw e;
  }

  const fileSize = file.size;
  const chunkSize = PROCESSING_CONSTANTS.CHUNK_SIZES.COMPLETE_FILE;
  const totalChunks = Math.ceil(fileSize / chunkSize);
  log(`mode=${mode} name="${file.name}" size=${fileSize} (${gbStr(fileSize)}) totalChunks=${totalChunks}`);
  onUpdate?.(`File ${gbStr(fileSize)} → ${totalChunks} chunks of ${mbStr(chunkSize)}`);

  heapSamples.push(sampleHeap() ?? 0);

  const processor = new FileProcessor(true);
  const t0 = performance.now();

  let chunksProcessed = 0;
  try {
    await processor.processInChunks(
      file,
      async (chunk, index) => {
        // Force real byte access — read first byte of each chunk via slice().
        const ab = await chunk.slice(0, 1).arrayBuffer();
        firstByteSamples.push(new Uint8Array(ab)[0]);
        chunksProcessed++;
        const h = sampleHeap();
        if (h !== null) heapSamples.push(h);
        const heapMsg = h !== null ? ` heap=${Math.round(h / 1024 / 1024)}MB` : '';
        onUpdate?.(`Chunk ${index + 1}/${totalChunks} ok${heapMsg}`);
        return null;
      },
      { chunkSize },
    );
  } catch (e) {
    errors.push(`processInChunks: ${(e as Error).message}`);
  }

  const durationMs = performance.now() - t0;
  const peakHeapBytes = heapSamples.length ? Math.max(...heapSamples) : null;
  const strategy = getRecommendedProcessingStrategy(file);

  const heapBoundedUnder1GB =
    peakHeapBytes === null ? null : peakHeapBytes < HEAP_LIMIT_BYTES;

  const assertions: Big2GBAssertions = {
    fileSizeOver2GB: fileSize > 2 * 1024 ** 3,
    isLargeFileFlag: isLargeFile(file),
    strategyNotQuick: strategy !== 'quick',
    allChunksProcessed: chunksProcessed === totalChunks,
    firstBytesRead: firstByteSamples.length === totalChunks,
    heapBoundedUnder1GB,
    noErrors: errors.length === 0,
  };

  const ok = Object.values(assertions).every((v) => v === true || v === null);

  const result: Big2GBResult = {
    ok,
    product,
    mode,
    fileName: file.name,
    fileSize,
    fileSizeGB: +(fileSize / 1024 ** 3).toFixed(3),
    isLargeFile: isLargeFile(file),
    isVeryLargeFile: isVeryLargeFile(file),
    strategy,
    chunkSize,
    totalChunks,
    chunksProcessed,
    firstByteSamples: firstByteSamples.slice(0, 8),
    durationMs: +durationMs.toFixed(1),
    peakHeapBytes,
    heapSamples,
    errors,
    assertions,
  };

  window.__big2gbResult = result;
  console.log('BIG2GB_RESULT:' + JSON.stringify(result));
  return result;
}

// ---------- metadata extraction (WORKERFS) -----------------------------

export async function runMetadataExtraction(
  file: File,
  onUpdate?: (text: string) => void,
): Promise<MetadataReport> {
  return extractMetadataWorkerFS(file, (text, percent) => {
    onUpdate?.(percent !== undefined ? `${text} (${percent}%)` : text);
  });
}

// ---------- subtitle extraction (WORKERFS, single-pass) ----------------

export async function runSubtitleExtraction(
  file: File,
  onUpdate?: (text: string) => void,
): Promise<BatchSubtitleReport> {
  const meta = await extractMetadataWorkerFS(file, (text, percent) => {
    onUpdate?.(percent !== undefined ? `[metadata] ${text} (${percent}%)` : `[metadata] ${text}`);
  });
  return extractAllSubtitlesWorkerFS(file, meta, (text, percent) => {
    onUpdate?.(percent !== undefined ? `[extract] ${text} (${percent}%)` : `[extract] ${text}`);
  });
}

// ---------- Puppeteer-compatible automation entry ----------------------

function selectedAutomationFile(): File {
  const input = document.getElementById('big2gb-file') as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) throw new Error('no file selected — call uploadFile() before invoking automation');
  return file;
}

async function automationChunked(mode: 'file' | 'synthetic'): Promise<Big2GBResult> {
  const input = document.getElementById('big2gb-file') as HTMLInputElement | null;
  const file = input?.files?.[0] ?? null;
  return runChunkedTest(mode, file);
}

async function automationMetadata(): Promise<MetadataReport> {
  const file = selectedAutomationFile();
  const meta = await runMetadataExtraction(file, (t) => console.log('[big2gb:meta] ' + t));
  window.__big2gbMetaResult = meta;
  console.log('BIG2GB_META_RESULT:' + JSON.stringify({
    fileName: meta.fileName,
    fileSize: meta.fileSize,
    format: meta.format,
    duration: meta.duration,
    bitrate: meta.bitrate,
    streamCount: meta.streams.length,
    subtitleCount: meta.streams.filter((s) => s.codecType === 'subtitle').length,
  }));
  return meta;
}

async function automationSubtitles(): Promise<BatchSubtitleReport> {
  const file = selectedAutomationFile();
  const report = await runSubtitleExtraction(file, (t) => console.log('[big2gb:sub] ' + t));
  window.__big2gbSubsResult = report;
  console.log('BIG2GB_SUBS_RESULT:' + JSON.stringify({
    ok: report.ok,
    fileName: report.fileName,
    fileSize: report.fileSize,
    totalSubtitleStreams: report.totalSubtitleStreams,
    extractedCount: report.extractedCount,
    durationMs: report.durationMs,
    peakHeapBytes: report.peakHeapBytes,
    zipFilename: report.zipFilename,
    zipSize: report.zipSize,
    extracted: report.extracted,
    errors: report.errors,
  }));
  return report;
}

window.__runBig2GBTest = automationChunked;
window.__runBig2GBMetadata = automationMetadata;
window.__runBig2GBSubtitles = automationSubtitles;

// ---------- UI wiring (manual mode) ------------------------------------

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function setStatus(msg: string): void {
  const el = $('status');
  if (el) el.textContent = msg;
}

function appendLog(msg: string): void {
  const el = $('event-log');
  if (!el) return;
  const ts = new Date().toISOString().slice(11, 19);
  el.textContent = `[${ts}] ${msg}\n` + (el.textContent ?? '');
  if ((el.textContent?.length ?? 0) > 20000) {
    el.textContent = el.textContent!.slice(0, 20000);
  }
}

function renderJson(target: string, data: unknown): void {
  const el = $(target);
  if (el) el.textContent = JSON.stringify(data, null, 2);
}

function renderSubtitleList(report: BatchSubtitleReport): void {
  const el = $('subtitle-list');
  if (!el) return;
  if (!report.extracted.length) {
    el.innerHTML = '<em>No subtitles extracted.</em>';
    return;
  }
  const rows = report.extracted
    .map(
      (s, i) =>
        `<tr><td>${i + 1}</td><td>${s.streamIndex}</td><td>${s.language ?? '—'}</td><td>${s.title ?? ''}</td><td>${s.codec}</td><td>${s.size.toLocaleString()} B</td><td><code>${s.sha256.slice(0, 12)}…</code></td><td>${s.filename}</td></tr>`,
    )
    .join('');
  el.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Stream</th><th>Lang</th><th>Title</th><th>Codec</th><th>Size</th><th>sha256</th><th>Filename</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>ZIP: <strong>${report.zipFilename}</strong> (${mbStr(report.zipSize)}) — downloaded automatically.</p>
  `;
}

function currentFile(): File | null {
  const input = $('big2gb-file') as HTMLInputElement | null;
  return input?.files?.[0] ?? null;
}

function busy(flag: boolean): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('button[data-action]');
  buttons.forEach((b) => (b.disabled = flag));
}

async function uiRunChunkedTest(mode: 'file' | 'synthetic'): Promise<void> {
  busy(true);
  setStatus(`Running chunked processing test (${mode})...`);
  appendLog(`Chunked test started (mode=${mode})`);
  try {
    const f = mode === 'file' ? currentFile() : null;
    if (mode === 'file' && !f) {
      setStatus('Pick a video file first.');
      appendLog('No file selected — abort.');
      return;
    }
    const result = await runChunkedTest(mode, f, (t) => appendLog(t));
    renderJson('chunked-result', result);
    setStatus(result.ok ? `✅ PASS — all assertions hold` : `❌ FAIL — see result panel`);
    appendLog(`Chunked test done in ${(result.durationMs / 1000).toFixed(2)}s, peak heap ${result.peakHeapBytes === null ? 'n/a' : mbStr(result.peakHeapBytes)}`);
  } catch (e) {
    setStatus(`Error: ${(e as Error).message}`);
    appendLog(`ERROR: ${(e as Error).message}`);
  } finally {
    busy(false);
  }
}

async function uiRunMetadata(): Promise<void> {
  const f = currentFile();
  if (!f) {
    setStatus('Pick a video file first.');
    return;
  }
  busy(true);
  setStatus(`Extracting metadata from ${gbStr(f.size)}...`);
  appendLog(`Metadata extraction started on ${f.name}`);
  try {
    const metadata = await runMetadataExtraction(f, (t) => appendLog(t));
    renderJson('metadata-result', metadata);
    setStatus(`Metadata extracted (${metadata.streams?.length ?? 0} streams)`);
    appendLog('Metadata extraction done');
  } catch (e) {
    setStatus(`Error: ${(e as Error).message}`);
    appendLog(`ERROR: ${(e as Error).message}`);
  } finally {
    busy(false);
  }
}

async function uiRunSubtitles(): Promise<void> {
  const f = currentFile();
  if (!f) {
    setStatus('Pick a video file first.');
    return;
  }
  busy(true);
  setStatus(`Extracting all subtitle tracks from ${gbStr(f.size)} — be patient on big files...`);
  appendLog(`Subtitle extraction started on ${f.name}`);
  try {
    const report = await runSubtitleExtraction(f, (t) => appendLog(t));
    renderJson('subtitle-result', report);
    renderSubtitleList(report);
    setStatus(
      report.ok
        ? `✅ Extracted ${report.extractedCount}/${report.totalSubtitleStreams} subtitle tracks in ${(report.durationMs / 1000).toFixed(1)}s`
        : `❌ Subtitle extraction failed (see panel) — got ${report.extractedCount}/${report.totalSubtitleStreams}`,
    );
    appendLog('Subtitle extraction done');
  } catch (e) {
    setStatus(`Error: ${(e as Error).message}`);
    appendLog(`ERROR: ${(e as Error).message}`);
  } finally {
    busy(false);
  }
}

function showFileInfo(): void {
  const f = currentFile();
  const el = $('file-info');
  if (!el) return;
  if (!f) {
    el.textContent = 'No file selected.';
    return;
  }
  const lines = [
    `Name:     ${f.name}`,
    `Size:     ${f.size} bytes (${gbStr(f.size)})`,
    `Type:     ${f.type || '(unknown)'}`,
    `Large?:   isLargeFile=${isLargeFile(f)}, isVeryLargeFile=${isVeryLargeFile(f)}`,
    `Strategy: ${getRecommendedProcessingStrategy(f)}`,
    `Past 2GB browser Blob limit? ${f.size > 2 * 1024 ** 3 ? 'YES — this is the real test' : 'no (file is under 2GB)'}`,
  ];
  el.textContent = lines.join('\n');
}

function wireUi(): void {
  $('big2gb-file')?.addEventListener('change', showFileInfo);

  document.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      switch (a) {
        case 'chunked-file':
          void uiRunChunkedTest('file');
          break;
        case 'chunked-synthetic':
          void uiRunChunkedTest('synthetic');
          break;
        case 'metadata':
          void uiRunMetadata();
          break;
        case 'subtitles':
          void uiRunSubtitles();
          break;
      }
    });
  });

  const product = detectProduct();
  const envEl = $('env-info');
  if (envEl) {
    envEl.textContent = `Browser: ${product} • OPFS: ${'storage' in navigator && typeof navigator.storage.getDirectory === 'function' ? 'available' : 'unavailable'} • performance.memory: ${(performance as unknown as { memory?: unknown }).memory ? 'available' : 'n/a'}`;
  }
  setStatus('Runner ready. Pick a video file and choose an action.');
  appendLog('Runner loaded.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireUi);
} else {
  wireUi();
}

log('runner ready');

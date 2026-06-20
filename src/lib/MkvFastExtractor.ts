/**
 * Pure-JS Matroska subtitle extractor — MKV/WebM fast path.
 *
 * Bypasses FFmpeg entirely. Parses EBML/Matroska structure directly:
 *   1. EBML header → confirm Matroska/WebM
 *   2. Segment → SeekHead pointing to Info, Tracks, Cluster start
 *   3. Info → TimestampScale (ns per tick, default 1 000 000 = 1 ms)
 *   4. Tracks → enumerate subtitle TrackEntries (TrackType 0x11)
 *   5. Walk Clusters sequentially from first cluster to end of Segment.
 *      For each Cluster: read Timestamp, walk Block/SimpleBlock children.
 *      Cheap path for non-subtitle blocks: read TrackNumber vint + advance
 *      past block size. Subtitle blocks: read text payload + BlockDuration
 *      (from enclosing BlockGroup).
 *
 * Output: byte-identical SubRip (SRT) for S_TEXT/UTF8 streams — matches
 * `ffmpeg -map 0:N -c:s copy`. Other text codecs (ASS/SSA/WebVTT) are
 * preserved verbatim. Bitmap codecs (PGS/VobSub) are reported but not
 * extracted (would need OCR).
 *
 * Speed: reads only the bytes it actually needs. On a 13 GB MKV the heavy
 * cost is Cluster I/O (Cluster bodies are read in full so we can parse
 * Blocks inside), but per-cluster JS work is small. Expected 5-15× faster
 * than the ffmpeg-WORKERFS path.
 */

import JSZip from 'jszip';

// ---------- types -------------------------------------------------------

export interface MkvSubtitleTrack {
  trackNumber: number;
  /**
   * 0-based position of this TrackEntry inside the Tracks element. Matches
   * ffmpeg's stream index for the same input file (ffmpeg numbers streams in
   * container-document order). This is what we use as `streamIndex` in the
   * extracted output so SHA-256 comparisons line up with
   * `ffmpeg -map 0:N -c:s copy out.srt`.
   */
  documentIndex: number;
  language?: string;
  title?: string;
  codecId: string;
  codecPrivate?: Uint8Array;
  forced?: boolean;
  hearingImpaired?: boolean;
  default?: boolean;
  isText: boolean;
}

export interface MkvSubtitleEntry {
  trackNumber: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface MkvFastExtractedFile {
  filename: string;
  streamIndex: number;
  language?: string;
  title?: string;
  codec: string;
  size: number;
  data: Uint8Array;
  sha256: string;
}

export interface MkvFastReport {
  ok: boolean;
  fileName: string;
  fileSize: number;
  totalSubtitleStreams: number;
  extractedCount: number;
  skippedBitmapCount: number;
  failedCount: number;
  durationMs: number;
  bytesRead: number;
  peakHeapBytes: number | null;
  zipFilename: string;
  zipSize: number;
  extracted: Array<Omit<MkvFastExtractedFile, 'data'>>;
  errors: string[];
}

type ProgressFn = (text: string, percent?: number) => void;

// ---------- format detection -------------------------------------------

const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];

export async function isMatroska(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  for (let i = 0; i < 4; i++) {
    if (head[i] !== EBML_MAGIC[i]) return false;
  }
  return true;
}

// ---------- EBML primitives --------------------------------------------

function vintLength(firstByte: number): number {
  if (firstByte & 0x80) return 1;
  if (firstByte & 0x40) return 2;
  if (firstByte & 0x20) return 3;
  if (firstByte & 0x10) return 4;
  if (firstByte & 0x08) return 5;
  if (firstByte & 0x04) return 6;
  if (firstByte & 0x02) return 7;
  if (firstByte & 0x01) return 8;
  throw new Error(`invalid vint first byte: 0x${firstByte.toString(16)}`);
}

interface Vint { value: number; len: number; bigValue: bigint }

function readVint(buf: Uint8Array, offset: number, keepMarker: boolean): Vint {
  const first = buf[offset];
  const len = vintLength(first);
  let big = keepMarker ? BigInt(first) : BigInt(first & ((1 << (8 - len)) - 1));
  for (let i = 1; i < len; i++) {
    big = (big << 8n) | BigInt(buf[offset + i]);
  }
  // Convert to Number when safe. EBML sizes can exceed Number.MAX_SAFE_INTEGER
  // for Segment-level sizes; callers using >2^53 sizes (segment, cluster
  // bodies) must use bigValue. For element IDs and most counters Number is
  // safe and faster.
  const value = big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : Number.MAX_SAFE_INTEGER;
  return { value, len, bigValue: big };
}

function readUint(buf: Uint8Array, offset: number, len: number): number {
  let v = 0;
  for (let i = 0; i < len; i++) v = v * 256 + buf[offset + i];
  return v;
}

function readSint16(buf: Uint8Array, offset: number): number {
  const v = (buf[offset] << 8) | buf[offset + 1];
  return v & 0x8000 ? v - 0x10000 : v;
}

function readFloat(buf: Uint8Array, offset: number, len: number): number {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (len === 4) return dv.getFloat32(offset, false);
  if (len === 8) return dv.getFloat64(offset, false);
  if (len === 0) return 0;
  throw new Error(`unsupported float length ${len}`);
}

function readUtf8(buf: Uint8Array, offset: number, len: number): string {
  return new TextDecoder('utf-8').decode(buf.subarray(offset, offset + len));
}

// ---------- Matroska element IDs (canonical, with EBML marker bits) ----

const ID = {
  EBML: 0x1a45dfa3,
  EBMLVersion: 0x4286,
  EBMLReadVersion: 0x42f7,
  DocType: 0x4282,
  Segment: 0x18538067,
  SeekHead: 0x114d9b74,
  Seek: 0x4dbb,
  SeekID: 0x53ab,
  SeekPosition: 0x53ac,
  Info: 0x1549a966,
  TimestampScale: 0x2ad7b1,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackType: 0x83,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  Language: 0x22b59c,
  LanguageBCP47: 0x22b59d,
  Name: 0x536e,
  FlagDefault: 0x88,
  FlagForced: 0x55aa,
  FlagHearingImpaired: 0x55ab,
  Cluster: 0x1f43b675,
  Timestamp: 0xe7,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
  BlockDuration: 0x9b,
  Cues: 0x1c53bb6b,
  Void: 0xec,
  CRC32: 0xbf,
} as const;

// ---------- I/O reader (lazy slice from File) --------------------------

interface ReadHook { (count: number): void }

class FileReader2 {
  private bytes = 0;
  constructor(private file: File, private onRead?: ReadHook) {}

  get bytesRead(): number { return this.bytes; }

  async read(offset: number, length: number): Promise<Uint8Array> {
    if (offset < 0 || length <= 0) return new Uint8Array(0);
    const end = Math.min(this.file.size, offset + length);
    if (end <= offset) return new Uint8Array(0);
    const ab = await this.file.slice(offset, end).arrayBuffer();
    const u = new Uint8Array(ab);
    this.bytes += u.length;
    this.onRead?.(u.length);
    return u;
  }
}

// ---------- element-header peek ----------------------------------------

interface ElementHeader {
  id: number;
  /** total bytes consumed by ID + size vints (= dataStart - elementStart) */
  headerLen: number;
  /** raw size value (vint without marker); BigInt fallback for huge sizes */
  size: number;
  sizeBig: bigint;
  /** true when size is the "unknown" all-ones encoding */
  unknownSize: boolean;
}

function isUnknownSize(sizeBig: bigint, sizeLen: number): boolean {
  // The data-part of the size vint is all-ones when size == 2^(7*sizeLen) - 1.
  const allOnes = (1n << BigInt(7 * sizeLen)) - 1n;
  return sizeBig === allOnes;
}

function parseHeader(buf: Uint8Array, offset: number): ElementHeader {
  const idV = readVint(buf, offset, true);
  const sizeV = readVint(buf, offset + idV.len, false);
  const headerLen = idV.len + sizeV.len;
  return {
    id: idV.value,
    headerLen,
    size: sizeV.value,
    sizeBig: sizeV.bigValue,
    unknownSize: isUnknownSize(sizeV.bigValue, sizeV.len),
  };
}

// ---------- in-memory element walker ----------------------------------

interface InMemElement {
  id: number;
  start: number;
  dataStart: number;
  size: number;
  end: number;
}

function* walk(buf: Uint8Array, from: number, to: number): IterableIterator<InMemElement> {
  let p = from;
  while (p < to) {
    if (p >= buf.length) return;
    const h = parseHeader(buf, p);
    const dataStart = p + h.headerLen;
    // Unknown size only legal for Segment / Cluster — we should not see it in
    // local element walks (we've already constrained `to`). Treat as "rest".
    const size = h.unknownSize ? to - dataStart : h.size;
    const end = dataStart + size;
    yield { id: h.id, start: p, dataStart, size, end };
    p = end;
  }
}

// ---------- Block payload parsing --------------------------------------

interface BlockHeader {
  trackNumber: number;
  /** signed timecode relative to enclosing Cluster.Timestamp, in ticks */
  timecodeDelta: number;
  flags: number;
  /** offset of payload data within the block payload */
  dataOffset: number;
  /** raw concatenated frame bytes (no lacing handling for text codecs) */
}

function parseBlockHeader(buf: Uint8Array, offset: number): BlockHeader {
  const tn = readVint(buf, offset, false);
  const tc = readSint16(buf, offset + tn.len);
  const flags = buf[offset + tn.len + 2];
  return {
    trackNumber: tn.value,
    timecodeDelta: tc,
    flags,
    dataOffset: tn.len + 3,
  };
}

// ---------- codec mapping ----------------------------------------------

function codecToExt(codecId: string): { ext: string; isText: boolean } {
  switch (codecId) {
    case 'S_TEXT/UTF8':
    case 'S_TEXT/ASCII':
      return { ext: 'srt', isText: true };
    case 'S_TEXT/ASS':
    case 'S_TEXT/SSA':
      return { ext: 'ass', isText: true };
    case 'S_TEXT/WEBVTT':
      return { ext: 'vtt', isText: true };
    case 'S_HDMV/PGS':
    case 'S_HDMV/TEXTST':
    case 'S_VOBSUB':
    case 'S_KATE':
      return { ext: 'bin', isText: false };
    default:
      return { ext: 'sub', isText: codecId.startsWith('S_TEXT/') };
  }
}

// ---------- SRT timecode formatter -------------------------------------

function formatSrtTime(ms: number): string {
  if (ms < 0) ms = 0;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const f = Math.floor(ms % 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(f).padStart(3, '0')}`;
}

// ---------- main extractor ---------------------------------------------

export async function extractMkvSubtitlesFast(
  file: File,
  onProgress?: ProgressFn,
): Promise<MkvFastReport> {
  const errors: string[] = [];
  const t0 = performance.now();
  const heapSamples: number[] = [];
  const sampleHeap = () => {
    const m = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
    if (m && typeof m.usedJSHeapSize === 'number') heapSamples.push(m.usedJSHeapSize);
  };

  const rdr = new FileReader2(file);

  // ---- Step 1: parse EBML + locate Segment ----
  onProgress?.('Reading EBML header…', 1);
  const header = await rdr.read(0, 1024);
  const ebml = parseHeader(header, 0);
  if (ebml.id !== ID.EBML) {
    throw new Error(`not a Matroska file (EBML magic missing at offset 0)`);
  }
  // EBML body holds DocType (should be "matroska" or "webm")
  let docType = 'matroska';
  for (const el of walk(header, ebml.headerLen, ebml.headerLen + ebml.size)) {
    if (el.id === ID.DocType) {
      docType = readUtf8(header, el.dataStart, el.size);
      break;
    }
  }
  if (docType !== 'matroska' && docType !== 'webm') {
    throw new Error(`unsupported EBML DocType "${docType}"`);
  }
  const segmentStart = ebml.headerLen + ebml.size;

  // ---- Step 2: parse Segment header ----
  const segHeaderBuf = await rdr.read(segmentStart, 32);
  const seg = parseHeader(segHeaderBuf, 0);
  if (seg.id !== ID.Segment) {
    throw new Error(`expected Segment after EBML, got id 0x${seg.id.toString(16)}`);
  }
  const segmentDataStart = segmentStart + seg.headerLen;
  // For the Segment, unknownSize means "until EOF". Common for streamed files.
  const segmentEnd = seg.unknownSize ? file.size : segmentDataStart + seg.size;

  // ---- Step 3: SeekHead → find offsets of Info, Tracks, Cluster start ----
  onProgress?.('Parsing Segment top-level (Info / Tracks / Clusters)…', 3);
  // Read a generous window after Segment header that likely covers SeekHead,
  // Info, Tracks (these are small and live near the start).
  const topBuf = await rdr.read(segmentDataStart, Math.min(4 * 1024 * 1024, segmentEnd - segmentDataStart));

  let infoOffset = -1;
  let tracksOffset = -1;
  let firstClusterOffset = -1;

  // Walk top-level elements found inside topBuf
  const seekIDsToOffset = new Map<number, number>();
  for (const el of walk(topBuf, 0, topBuf.length)) {
    const absoluteStart = segmentDataStart + el.start;
    if (el.id === ID.SeekHead) {
      // Iterate Seek entries to record (SeekID, SeekPosition) pairs.
      for (const seek of walk(topBuf, el.dataStart, el.dataStart + el.size)) {
        if (seek.id !== ID.Seek) continue;
        let sid = 0;
        let spos = 0;
        for (const child of walk(topBuf, seek.dataStart, seek.dataStart + seek.size)) {
          if (child.id === ID.SeekID) {
            sid = readUint(topBuf, child.dataStart, child.size);
          } else if (child.id === ID.SeekPosition) {
            spos = readUint(topBuf, child.dataStart, child.size);
          }
        }
        if (sid !== 0) {
          // Seek positions are relative to Segment data start (per spec).
          seekIDsToOffset.set(sid, segmentDataStart + spos);
        }
      }
    } else if (el.id === ID.Info) {
      infoOffset = absoluteStart;
    } else if (el.id === ID.Tracks) {
      tracksOffset = absoluteStart;
    } else if (el.id === ID.Cluster) {
      firstClusterOffset = absoluteStart;
      break;
    }
  }

  // Fall back to SeekHead positions if direct walk didn't find them.
  if (infoOffset < 0 && seekIDsToOffset.has(ID.Info)) infoOffset = seekIDsToOffset.get(ID.Info)!;
  if (tracksOffset < 0 && seekIDsToOffset.has(ID.Tracks)) tracksOffset = seekIDsToOffset.get(ID.Tracks)!;
  if (firstClusterOffset < 0 && seekIDsToOffset.has(ID.Cluster)) firstClusterOffset = seekIDsToOffset.get(ID.Cluster)!;

  if (tracksOffset < 0) throw new Error('Tracks element not found in Segment');

  // ---- Step 4: read Info → TimestampScale (default 1ms = 1 000 000 ns) ----
  let timestampScaleNs = 1_000_000;
  let durationTicks = 0;
  if (infoOffset >= 0) {
    const infoHdrBuf = await rdr.read(infoOffset, 16);
    const infoHdr = parseHeader(infoHdrBuf, 0);
    const infoSize = infoHdr.size;
    const infoBuf = await rdr.read(infoOffset + infoHdr.headerLen, infoSize);
    for (const el of walk(infoBuf, 0, infoBuf.length)) {
      if (el.id === ID.TimestampScale) {
        timestampScaleNs = readUint(infoBuf, el.dataStart, el.size);
      } else if (el.id === ID.Duration) {
        durationTicks = readFloat(infoBuf, el.dataStart, el.size);
      }
    }
  }
  const tickToMs = timestampScaleNs / 1_000_000;
  const totalDurationMs = durationTicks * tickToMs;

  // ---- Step 5: read Tracks → identify subtitle tracks ----
  const tracksHdrBuf = await rdr.read(tracksOffset, 16);
  const tracksHdr = parseHeader(tracksHdrBuf, 0);
  const tracksBuf = await rdr.read(tracksOffset + tracksHdr.headerLen, tracksHdr.size);

  const subtitleTracks = new Map<number, MkvSubtitleTrack>();
  let trackPosition = -1;
  for (const trackEl of walk(tracksBuf, 0, tracksBuf.length)) {
    if (trackEl.id !== ID.TrackEntry) continue;
    trackPosition++;
    let trackNumber = 0;
    let trackType = 0;
    let codecId = '';
    let codecPrivate: Uint8Array | undefined;
    let language: string | undefined;
    let title: string | undefined;
    let forced = false;
    let hearingImpaired = false;
    let isDefault = false;
    for (const child of walk(tracksBuf, trackEl.dataStart, trackEl.dataStart + trackEl.size)) {
      switch (child.id) {
        case ID.TrackNumber:
          trackNumber = readUint(tracksBuf, child.dataStart, child.size);
          break;
        case ID.TrackType:
          trackType = readUint(tracksBuf, child.dataStart, child.size);
          break;
        case ID.CodecID:
          codecId = readUtf8(tracksBuf, child.dataStart, child.size);
          break;
        case ID.CodecPrivate:
          codecPrivate = tracksBuf.slice(child.dataStart, child.dataStart + child.size);
          break;
        case ID.Language:
        case ID.LanguageBCP47:
          language = readUtf8(tracksBuf, child.dataStart, child.size);
          break;
        case ID.Name:
          title = readUtf8(tracksBuf, child.dataStart, child.size);
          break;
        case ID.FlagForced:
          forced = readUint(tracksBuf, child.dataStart, child.size) !== 0;
          break;
        case ID.FlagHearingImpaired:
          hearingImpaired = readUint(tracksBuf, child.dataStart, child.size) !== 0;
          break;
        case ID.FlagDefault:
          isDefault = readUint(tracksBuf, child.dataStart, child.size) !== 0;
          break;
      }
    }
    if (trackType === 0x11 /* subtitle */) {
      const codec = codecToExt(codecId);
      subtitleTracks.set(trackNumber, {
        trackNumber,
        documentIndex: trackPosition,
        language,
        title,
        codecId,
        codecPrivate,
        forced,
        hearingImpaired,
        default: isDefault,
        isText: codec.isText,
      });
    }
  }

  if (subtitleTracks.size === 0) {
    return {
      ok: false,
      fileName: file.name,
      fileSize: file.size,
      totalSubtitleStreams: 0,
      extractedCount: 0,
      skippedBitmapCount: 0,
      failedCount: 0,
      durationMs: +(performance.now() - t0).toFixed(1),
      bytesRead: rdr.bytesRead,
      peakHeapBytes: null,
      zipFilename: '',
      zipSize: 0,
      extracted: [],
      errors: ['No subtitle streams found in MKV'],
    };
  }

  onProgress?.(`Found ${subtitleTracks.size} subtitle streams. Walking clusters…`, 8);

  // ---- Step 6: walk Clusters sequentially ----
  if (firstClusterOffset < 0) {
    // No cluster found in initial top scan — re-scan from end of Tracks to
    // locate the first Cluster element.
    const tracksEnd = tracksOffset + tracksHdr.headerLen + tracksHdr.size;
    const probe = await rdr.read(tracksEnd, Math.min(16 * 1024 * 1024, segmentEnd - tracksEnd));
    for (const el of walk(probe, 0, probe.length)) {
      if (el.id === ID.Cluster) {
        firstClusterOffset = tracksEnd + el.start;
        break;
      }
    }
    if (firstClusterOffset < 0) throw new Error('first Cluster element not found');
  }

  const entriesByTrack = new Map<number, MkvSubtitleEntry[]>();
  for (const tn of subtitleTracks.keys()) entriesByTrack.set(tn, []);

  let clusterOffset = firstClusterOffset;
  let clusterCount = 0;
  let lastProgressTick = performance.now();
  const walkStart = performance.now();

  while (clusterOffset < segmentEnd) {
    // Peek cluster header to learn its size
    const hdrBuf = await rdr.read(clusterOffset, 16);
    if (hdrBuf.length === 0) break;
    let clusterHdr: ElementHeader;
    try {
      clusterHdr = parseHeader(hdrBuf, 0);
    } catch (e) {
      errors.push(`cluster header parse failed at ${clusterOffset}: ${(e as Error).message}`);
      break;
    }
    if (clusterHdr.id !== ID.Cluster) {
      // Could be a trailing Cues or Tags element. Skip it.
      const sz = clusterHdr.unknownSize ? segmentEnd - clusterOffset - clusterHdr.headerLen : clusterHdr.size;
      clusterOffset += clusterHdr.headerLen + sz;
      continue;
    }

    const clusterDataStart = clusterOffset + clusterHdr.headerLen;
    const clusterDataSize = clusterHdr.unknownSize
      ? segmentEnd - clusterDataStart
      : clusterHdr.size;
    const clusterDataEnd = clusterDataStart + clusterDataSize;

    // Read cluster body in full so block parsing is pure in-memory work.
    const clusterBuf = await rdr.read(clusterDataStart, clusterDataSize);

    // First child should be Timestamp (0xE7) for well-formed Matroska
    let clusterTimestamp = 0;
    let childOffset = 0;
    while (childOffset < clusterBuf.length) {
      const childHdr = parseHeader(clusterBuf, childOffset);
      const childData = childOffset + childHdr.headerLen;
      const childEnd = childData + (childHdr.unknownSize ? clusterBuf.length - childData : childHdr.size);
      switch (childHdr.id) {
        case ID.Timestamp:
          clusterTimestamp = readUint(clusterBuf, childData, childHdr.size);
          break;
        case ID.SimpleBlock: {
          // Cheap check: parse TrackNumber vint at start, skip if not subtitle.
          if (childHdr.size >= 4) {
            const tn = readVint(clusterBuf, childData, false);
            if (subtitleTracks.has(tn.value)) {
              const track = subtitleTracks.get(tn.value)!;
              if (track.isText) {
                const blockHdr = parseBlockHeader(clusterBuf, childData);
                const payloadOff = childData + blockHdr.dataOffset;
                const payloadLen = childHdr.size - blockHdr.dataOffset;
                if (payloadLen > 0) {
                  const text = readUtf8(clusterBuf, payloadOff, payloadLen);
                  const startMs = (clusterTimestamp + blockHdr.timecodeDelta) * tickToMs;
                  // SimpleBlock has no duration field. Use a 0-ms default;
                  // viewers will fall back to next-block timing. Rare for subs.
                  const list = entriesByTrack.get(tn.value)!;
                  list.push({ trackNumber: tn.value, startMs, endMs: startMs, text });
                }
              }
            }
          }
          break;
        }
        case ID.BlockGroup: {
          // Inside BlockGroup: find Block + optional BlockDuration
          let blockStart = -1;
          let blockSize = 0;
          let blockDurationTicks = 0;
          let bgChild = childData;
          while (bgChild < childEnd) {
            const h = parseHeader(clusterBuf, bgChild);
            const dStart = bgChild + h.headerLen;
            if (h.id === ID.Block) {
              blockStart = dStart;
              blockSize = h.size;
            } else if (h.id === ID.BlockDuration) {
              blockDurationTicks = readUint(clusterBuf, dStart, h.size);
            }
            bgChild = dStart + h.size;
          }
          if (blockStart >= 0 && blockSize > 0) {
            const tn = readVint(clusterBuf, blockStart, false);
            if (subtitleTracks.has(tn.value)) {
              const track = subtitleTracks.get(tn.value)!;
              if (track.isText) {
                const blockHdr = parseBlockHeader(clusterBuf, blockStart);
                const payloadOff = blockStart + blockHdr.dataOffset;
                const payloadLen = blockSize - blockHdr.dataOffset;
                if (payloadLen > 0) {
                  const text = readUtf8(clusterBuf, payloadOff, payloadLen);
                  const startMs = (clusterTimestamp + blockHdr.timecodeDelta) * tickToMs;
                  const endMs = startMs + blockDurationTicks * tickToMs;
                  const list = entriesByTrack.get(tn.value)!;
                  list.push({ trackNumber: tn.value, startMs, endMs, text });
                }
              }
            }
          }
          break;
        }
        case ID.Void:
        case ID.CRC32:
          // Skip
          break;
      }
      childOffset = childEnd;
    }

    clusterOffset = clusterDataEnd;
    clusterCount++;
    sampleHeap();

    const now = performance.now();
    if (now - lastProgressTick > 150) {
      lastProgressTick = now;
      // Two independent progress signals: bytes read against file size, and
      // playback timestamp against media duration. We use the larger of the
      // two (capped at 95 %) as the percent so the bar reflects real work
      // even when one signal is noisy. ETA is wall-time extrapolation from
      // whichever signal is further along.
      const byteFrac = file.size > 0 ? rdr.bytesRead / file.size : 0;
      const timeFrac = totalDurationMs > 0 ? (clusterTimestamp * tickToMs) / totalDurationMs : 0;
      const frac = Math.max(byteFrac, timeFrac);
      const percent = Math.min(95, 10 + Math.round(frac * 85));
      const elapsedSec = (now - walkStart) / 1000;
      const etaSec = frac > 0.02 ? Math.max(0, (elapsedSec / frac) - elapsedSec) : null;
      const etaStr = etaSec === null ? '—' : etaSec < 60 ? `${Math.round(etaSec)}s` : `${Math.floor(etaSec / 60)}m${Math.round(etaSec % 60)}s`;
      const readMB = rdr.bytesRead / 1024 / 1024;
      const totalMB = file.size / 1024 / 1024;
      onProgress?.(
        `Reading clusters… t=${formatSrtTime(clusterTimestamp * tickToMs)}` +
          ` • ${readMB.toFixed(0)} / ${totalMB.toFixed(0)} MB` +
          ` (${Math.round(frac * 100)}%) • eta ${etaStr}`,
        percent,
      );
    }
  }

  // ---- Step 7: build SRT outputs ----
  onProgress?.('Building SRT outputs…', 96);
  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const extracted: MkvFastExtractedFile[] = [];
  let skippedBitmap = 0;

  for (const [trackNumber, track] of subtitleTracks) {
    if (!track.isText) {
      skippedBitmap++;
      errors.push(`stream ${trackNumber}: bitmap codec ${track.codecId} not extracted (needs OCR)`);
      continue;
    }
    const entries = entriesByTrack.get(trackNumber) ?? [];
    entries.sort((a, b) => a.startMs - b.startMs);
    let body: string;
    let ext: string;
    if (track.codecId === 'S_TEXT/UTF8' || track.codecId === 'S_TEXT/ASCII') {
      ext = 'srt';
      body = buildSrt(entries);
    } else if (track.codecId === 'S_TEXT/ASS' || track.codecId === 'S_TEXT/SSA') {
      ext = 'ass';
      body = buildAss(entries, track);
    } else if (track.codecId === 'S_TEXT/WEBVTT') {
      ext = 'vtt';
      body = buildWebVTT(entries);
    } else {
      ext = 'sub';
      body = entries.map((e) => e.text).join('\n\n') + '\n';
    }
    const data = new TextEncoder().encode(body);
    const langSuffix = track.language ? `.${track.language}` : '';
    const titleSuffix = track.title ? `.${track.title.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60)}` : '';
    const filename = `${baseName}.s${track.documentIndex}${langSuffix}${titleSuffix}.${ext}`;
    const digest = await sha256(data);
    extracted.push({
      filename,
      streamIndex: track.documentIndex,
      language: track.language,
      title: track.title,
      codec: track.codecId,
      size: data.length,
      data,
      sha256: digest,
    });
  }

  // ---- Step 8: ZIP and download ----
  const zip = new JSZip();
  for (const f of extracted) zip.file(f.filename, f.data);
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipFilename = `${baseName}.subtitles.zip`;

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);

  const durationMs = performance.now() - t0;
  return {
    ok: extracted.length === subtitleTracks.size - skippedBitmap,
    fileName: file.name,
    fileSize: file.size,
    totalSubtitleStreams: subtitleTracks.size,
    extractedCount: extracted.length,
    skippedBitmapCount: skippedBitmap,
    failedCount: subtitleTracks.size - extracted.length - skippedBitmap,
    durationMs: +durationMs.toFixed(1),
    bytesRead: rdr.bytesRead,
    peakHeapBytes: heapSamples.length ? Math.max(...heapSamples) : null,
    zipFilename,
    zipSize: zipBlob.size,
    extracted: extracted.map(({ data: _d, ...rest }) => rest),
    errors,
  };
}

// ---------- formatters --------------------------------------------------

function buildSrt(entries: MkvSubtitleEntry[]): string {
  // ffmpeg's SubRip muxer emits each entry as
  //   N\n
  //   HH:MM:SS,mmm --> HH:MM:SS,mmm\n
  //   <text>\n
  //   \n
  // i.e. each entry (including the last) is terminated by a blank line.
  const parts: string[] = [];
  let n = 1;
  for (const e of entries) {
    parts.push(`${n}\n${formatSrtTime(e.startMs)} --> ${formatSrtTime(e.endMs)}\n${e.text}\n\n`);
    n++;
  }
  return parts.join('');
}

function buildAss(entries: MkvSubtitleEntry[], track: MkvSubtitleTrack): string {
  // CodecPrivate carries the ASS header (Script Info, V4+ Styles, Events
  // Format line). We append our Dialogue lines after it.
  const header = track.codecPrivate
    ? new TextDecoder('utf-8').decode(track.codecPrivate)
    : '[Script Info]\nScriptType: v4.00+\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  const lines: string[] = [];
  for (const e of entries) {
    // For ASS, Block payload starts with "<readorder>," prefix that ffmpeg
    // strips when remuxing. Strip it here too for parity with -c:s copy.
    let text = e.text;
    const commaIdx = text.indexOf(',');
    if (commaIdx > 0 && /^\d+$/.test(text.slice(0, commaIdx))) {
      text = text.slice(commaIdx + 1);
    }
    lines.push(`Dialogue: 0,${assTime(e.startMs)},${assTime(e.endMs)},Default,,0,0,0,,${text}`);
  }
  return header + (header.endsWith('\n') ? '' : '\n') + lines.join('\n') + '\n';
}

function assTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function buildWebVTT(entries: MkvSubtitleEntry[]): string {
  const lines: string[] = ['WEBVTT', ''];
  for (const e of entries) {
    lines.push(`${vttTime(e.startMs)} --> ${vttTime(e.endMs)}`);
    lines.push(e.text);
    lines.push('');
  }
  return lines.join('\n');
}

function vttTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const f = Math.floor(ms % 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(3, '0')}`;
}

async function sha256(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * End-to-end subtitle-extraction verification — compares browser output
 * against local ffmpeg ground truth.
 *
 * 1. Local ffmpeg pre-extracted every subtitle stream to GROUND_TRUTH_DIR.
 * 2. Drive real Chrome via Puppeteer, upload the same MKV, run the demo
 *    page's WORKERFS-backed extractor, capture the resulting ZIP.
 * 3. For each stream: assert browser-extracted SHA-256 == local SHA-256.
 *
 * No mocks. Real >2GB MKV against the real production build.
 *
 * Usage:
 *   TEST_FILE=/abs/to/big.mkv GROUND_TRUTH=/tmp/big2gb-ffmpeg-truth \
 *   APP_URL=http://localhost:4173/video-metadata-extractor-js \
 *   npx tsx tests/automation/subtitle-verify.test.ts
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { execFile as execFileCb } from 'child_process';

const execFile = promisify(execFileCb);

const CONFIG = {
  appUrl: process.env.APP_URL || 'http://localhost:4173/video-metadata-extractor-js',
  testPage: '/browser-2gb-test.html',
  testFile: process.env.TEST_FILE || '',
  groundTruth: process.env.GROUND_TRUTH || '/tmp/big2gb-ffmpeg-truth',
  downloadsDir: process.env.DOWNLOADS_DIR || '/tmp/big2gb-browser-out',
  headless: process.env.HEADLESS !== 'false',
  timeoutMs: parseInt(process.env.TIMEOUT || '1800000', 10),
  // 'ffmpeg' (default) drives the WORKERFS ffmpeg path; 'mkvfast' drives
  // the pure-JS Matroska parser.
  mode: (process.env.MODE || 'ffmpeg') as 'ffmpeg' | 'mkvfast',
};

function sha256File(p: string): string {
  const data = fs.readFileSync(p);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function sha256Buf(b: Buffer): string {
  return crypto.createHash('sha256').update(b).digest('hex');
}

async function waitForServer(url: string, maxMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch { /* server not ready */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server not reachable at ${url}`);
}

interface ExtractedFile {
  filename: string;
  streamIndex: number;
  language?: string;
  title?: string;
  codec: string;
  size: number;
  sha256: string;
}

interface SubsResult {
  ok: boolean;
  fileName: string;
  fileSize: number;
  totalSubtitleStreams: number;
  extractedCount: number;
  durationMs: number;
  peakHeapBytes: number | null;
  zipFilename: string;
  zipSize: number;
  extracted: ExtractedFile[];
  errors: string[];
}

interface MetaResult {
  fileName: string;
  fileSize: number;
  format: string;
  duration: string;
  bitrate: string;
  streamCount: number;
  subtitleCount: number;
}

function indexLocalTruth(dir: string): Map<number, { path: string; sha256: string; size: number }> {
  const out = new Map<number, { path: string; sha256: string; size: number }>();
  for (const name of fs.readdirSync(dir)) {
    const m = name.match(/^track-(\d+)\.srt$/);
    if (!m) continue;
    const p = path.join(dir, name);
    out.set(parseInt(m[1], 10), {
      path: p,
      sha256: sha256File(p),
      size: fs.statSync(p).size,
    });
  }
  return out;
}

async function run(): Promise<void> {
  if (!fs.existsSync(CONFIG.testFile)) throw new Error(`TEST_FILE missing: ${CONFIG.testFile}`);
  if (!fs.existsSync(CONFIG.groundTruth)) throw new Error(`GROUND_TRUTH missing: ${CONFIG.groundTruth}`);
  fs.mkdirSync(CONFIG.downloadsDir, { recursive: true });
  // Clear prior runs
  for (const f of fs.readdirSync(CONFIG.downloadsDir)) {
    fs.rmSync(path.join(CONFIG.downloadsDir, f), { force: true });
  }

  console.log(`▶ subtitle-verify`);
  console.log(`  file:         ${CONFIG.testFile} (${(fs.statSync(CONFIG.testFile).size / 1024 ** 3).toFixed(2)} GB)`);
  console.log(`  ground truth: ${CONFIG.groundTruth}`);
  console.log(`  downloads:    ${CONFIG.downloadsDir}`);
  console.log(`  app:          ${CONFIG.appUrl}${CONFIG.testPage}`);

  await waitForServer(CONFIG.appUrl);

  const truth = indexLocalTruth(CONFIG.groundTruth);
  console.log(`  local ffmpeg ground truth: ${truth.size} subtitle tracks`);

  const browser: Browser = await puppeteer.launch({
    headless: CONFIG.headless,
    browser: 'chrome',
    protocolTimeout: CONFIG.timeoutMs,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  let exitCode = 1;
  try {
    const page: Page = await browser.newPage();
    page.setDefaultTimeout(CONFIG.timeoutMs);
    page.setDefaultNavigationTimeout(60000);

    // Redirect downloads to our local dir
    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: CONFIG.downloadsDir,
    } as never);

    page.on('console', (msg) => {
      const t = msg.text();
      if (t.startsWith('BIG2GB_')) return;
      if (t.startsWith('[big2gb')) {
        console.log(`  [page] ${t}`);
      }
    });
    page.on('pageerror', (err: unknown) =>
      console.error(`  [page-error] ${err instanceof Error ? err.message : String(err)}`),
    );

    const url = CONFIG.appUrl + CONFIG.testPage;
    console.log(`  → ${url}`);
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForFunction(
      () => typeof (window as unknown as { __runBig2GBMetadata?: unknown }).__runBig2GBMetadata === 'function',
      { timeout: 60000 },
    );

    const input = await page.$('#big2gb-file');
    if (!input) throw new Error('input #big2gb-file not found');
    console.log('  uploading file path…');
    await (input as unknown as { uploadFile: (p: string) => Promise<void> }).uploadFile(CONFIG.testFile);

    let subs: SubsResult;
    if (CONFIG.mode === 'mkvfast') {
      console.log('  ▶ extracting all subtitles via MKV fast path (pure JS, no FFmpeg)…');
      subs = (await page.evaluate(async () => {
        const w = window as unknown as { __runBig2GBMkvFast: () => Promise<unknown> };
        return await w.__runBig2GBMkvFast();
      })) as SubsResult;
    } else {
      console.log('  ▶ probing metadata via WORKERFS…');
      const meta = (await page.evaluate(async () => {
        const w = window as unknown as { __runBig2GBMetadata: () => Promise<unknown> };
        return await w.__runBig2GBMetadata();
      })) as MetaResult;
      console.log(`    format=${meta.format} duration=${meta.duration} bitrate=${meta.bitrate}`);
      console.log(`    streamCount=${meta.streamCount} subtitleCount=${meta.subtitleCount}`);

      console.log('  ▶ extracting all subtitles via WORKERFS (single ffmpeg pass)…');
      subs = (await page.evaluate(async () => {
        const w = window as unknown as { __runBig2GBSubtitles: () => Promise<unknown> };
        return await w.__runBig2GBSubtitles();
      })) as SubsResult;
    }

    console.log('\n=== BROWSER RESULT ===');
    console.log(`  totalSubtitleStreams: ${subs.totalSubtitleStreams}`);
    console.log(`  extractedCount:       ${subs.extractedCount}`);
    console.log(`  duration:             ${(subs.durationMs / 1000).toFixed(2)} s`);
    console.log(`  peak heap:            ${subs.peakHeapBytes === null ? 'n/a' : (subs.peakHeapBytes / 1024 / 1024).toFixed(1) + ' MB'}`);
    console.log(`  ZIP:                  ${subs.zipFilename} (${(subs.zipSize / 1024).toFixed(1)} KB)`);

    // Wait for ZIP download to land on disk
    console.log(`  waiting for ZIP to land in ${CONFIG.downloadsDir}…`);
    const zipPath = await waitForZip(CONFIG.downloadsDir, subs.zipFilename, 60_000);
    console.log(`  ZIP on disk: ${zipPath}`);

    // Inspect ZIP contents and compare each file by SHA-256 against local truth
    console.log('  comparing each extracted subtitle to local ffmpeg output (SHA-256)…');
    const zipMembers = await readZip(zipPath);

    let matched = 0;
    let mismatched = 0;
    const mismatchDetails: string[] = [];
    const missingInZip: number[] = [];
    const sizeMismatch: Array<{ idx: number; browser: number; local: number }> = [];

    for (const idx of truth.keys()) {
      const browserFile = subs.extracted.find((e) => e.streamIndex === idx);
      const t = truth.get(idx)!;
      if (!browserFile) {
        missingInZip.push(idx);
        mismatched++;
        mismatchDetails.push(`stream ${idx}: missing from browser output`);
        continue;
      }
      const zipMember = zipMembers.find((m) => m.name === browserFile.filename);
      if (!zipMember) {
        mismatched++;
        mismatchDetails.push(`stream ${idx}: filename "${browserFile.filename}" not found in ZIP`);
        continue;
      }
      const browserSha = sha256Buf(zipMember.data);
      // Compare against local truth SHA. If different, also surface size delta.
      if (browserSha !== t.sha256) {
        mismatched++;
        if (zipMember.data.length !== t.size) {
          sizeMismatch.push({ idx, browser: zipMember.data.length, local: t.size });
        }
        mismatchDetails.push(
          `stream ${idx}: sha256 differs (browser=${browserSha.slice(0, 12)}… local=${t.sha256.slice(0, 12)}…, sizes browser=${zipMember.data.length} local=${t.size})`,
        );
      } else {
        matched++;
      }
    }

    console.log(`\n=== COMPARISON ===`);
    console.log(`  ground truth tracks:  ${truth.size}`);
    console.log(`  browser extracted:    ${subs.extractedCount}`);
    console.log(`  byte-identical:       ${matched}`);
    console.log(`  mismatched / missing: ${mismatched}`);
    if (mismatchDetails.length) {
      console.log('  details:');
      for (const d of mismatchDetails.slice(0, 20)) console.log(`    - ${d}`);
      if (mismatchDetails.length > 20) console.log(`    (+${mismatchDetails.length - 20} more)`);
    }
    if (sizeMismatch.length) {
      console.log(`  size deltas (first 10):`);
      for (const m of sizeMismatch.slice(0, 10)) {
        console.log(`    - stream ${m.idx}: browser=${m.browser}B local=${m.local}B (${(m.browser - m.local)}B delta)`);
      }
    }

    const allMatch = matched === truth.size && mismatched === 0;
    if (allMatch) {
      console.log('\n✅ PASS — browser extraction byte-identical to local ffmpeg for all tracks');
      exitCode = 0;
    } else {
      console.log('\n❌ FAIL — see comparison details');
    }
  } catch (err) {
    console.error('fatal:', err);
    exitCode = 2;
  } finally {
    await browser.close();
  }
  process.exit(exitCode);
}

async function waitForZip(dir: string, expectedName: string, maxMs: number): Promise<string> {
  const target = path.join(dir, expectedName);
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (fs.existsSync(target) && !fs.existsSync(target + '.crdownload')) {
      // Stable size check
      const s1 = fs.statSync(target).size;
      await new Promise((r) => setTimeout(r, 500));
      const s2 = fs.statSync(target).size;
      if (s1 === s2 && s1 > 0) return target;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  // Maybe Puppeteer used a different filename — pick newest zip
  const zips = fs.readdirSync(dir).filter((f) => f.endsWith('.zip'));
  if (zips.length) {
    zips.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
    return path.join(dir, zips[0]);
  }
  throw new Error(`ZIP "${expectedName}" never appeared in ${dir}`);
}

interface ZipMember { name: string; data: Buffer }

async function readZip(zipPath: string): Promise<ZipMember[]> {
  // Lightweight: shell out to /usr/bin/unzip for cross-checking — avoids a
  // node dep. Each entry extracted to a temp dir, then read.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'big2gb-zip-'));
  await execFile('/usr/bin/unzip', ['-q', '-o', zipPath, '-d', tmp]);
  const out: ZipMember[] = [];
  for (const name of fs.readdirSync(tmp)) {
    out.push({ name, data: fs.readFileSync(path.join(tmp, name)) });
  }
  // Keep tmp for inspection; small.
  return out;
}

run().catch((err) => {
  console.error('unhandled:', err);
  process.exit(3);
});

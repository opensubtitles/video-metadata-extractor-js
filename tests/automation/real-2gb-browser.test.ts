/**
 * Real 2GB+ browser test — drives a real Chrome (or Firefox) headless browser
 * against the FileProcessor chunked path with either:
 *   - a real >2GB file from disk (mode=file, default when TEST_FILE is set)
 *   - a real >2GB Blob composed of part-references built in-browser (mode=synthetic)
 *
 * No mocks, no Object.defineProperty(size). Actual browser allocation, actual
 * Blob.slice(), actual ArrayBuffer reads.
 *
 * Prereq: dev server running on http://localhost:5180 (`npm run dev`).
 *
 * Usage:
 *   TEST_FILE="/abs/path/to/big.mkv" PRODUCT=chrome  npx ts-node --esm tests/automation/real-2gb-browser.test.ts
 *   TEST_FILE="/abs/path/to/big.mkv" PRODUCT=firefox npx ts-node --esm tests/automation/real-2gb-browser.test.ts
 *   MODE=synthetic PRODUCT=chrome                    npx ts-node --esm tests/automation/real-2gb-browser.test.ts
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';

type Product = 'chrome' | 'firefox';
type Mode = 'file' | 'synthetic';

const CONFIG = {
  appUrl: process.env.APP_URL || 'http://localhost:5180',
  testPage: '/browser-2gb-test.html',
  testFile: process.env.TEST_FILE || '',
  product: (process.env.PRODUCT || 'chrome').toLowerCase() as Product,
  mode: (process.env.MODE || (process.env.TEST_FILE ? 'file' : 'synthetic')).toLowerCase() as Mode,
  headless: process.env.HEADLESS !== 'false',
  timeoutMs: parseInt(process.env.TIMEOUT || '1800000', 10), // 30 min
};

interface Assertions {
  fileSizeOver2GB: boolean;
  isLargeFileFlag: boolean;
  strategyNotQuick: boolean;
  allChunksProcessed: boolean;
  firstBytesRead: boolean;
  heapBoundedUnder1GB: boolean | null;
  noErrors: boolean;
}

interface BigResult {
  ok: boolean;
  product: string;
  mode: Mode;
  fileName: string;
  fileSize: number;
  fileSizeGB: number;
  isLargeFile: boolean;
  isVeryLargeFile: boolean;
  strategy: string;
  chunkSize: number;
  totalChunks: number;
  chunksProcessed: number;
  firstByteSamples: number[];
  durationMs: number;
  peakHeapBytes: number | null;
  heapSamples: number[];
  errors: string[];
  assertions: Assertions;
}

async function waitForServer(url: string, maxMs = 30000): Promise<void> {
  const start = Date.now();
  let lastErr: unknown = null;
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return; // 404 means server up, page missing — still up
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `dev server not reachable at ${url} after ${maxMs}ms — start it with 'npm run dev' first. Last error: ${String(lastErr)}`,
  );
}

function summarize(result: BigResult): void {
  console.log('\n=== RESULT ===');
  console.log(`product:           ${result.product}`);
  console.log(`mode:              ${result.mode}`);
  console.log(`file:              ${result.fileName}`);
  console.log(`size:              ${result.fileSize} bytes (${result.fileSizeGB} GB)`);
  console.log(`strategy:          ${result.strategy}`);
  console.log(`chunkSize:         ${(result.chunkSize / 1024 / 1024).toFixed(0)} MB`);
  console.log(`chunks processed:  ${result.chunksProcessed} / ${result.totalChunks}`);
  console.log(`duration:          ${(result.durationMs / 1000).toFixed(2)} s`);
  console.log(
    `peak heap:         ${
      result.peakHeapBytes === null
        ? 'n/a (engine does not expose performance.memory)'
        : (result.peakHeapBytes / 1024 / 1024).toFixed(0) + ' MB'
    }`,
  );
  console.log(`first-byte samples: [${result.firstByteSamples.join(', ')}]`);
  if (result.errors.length) {
    console.log('errors:');
    for (const e of result.errors) console.log(`  - ${e}`);
  }
  console.log('\nassertions:');
  for (const [k, v] of Object.entries(result.assertions)) {
    const mark = v === true ? '✔' : v === null ? '∅' : '✘';
    console.log(`  ${mark} ${k}`);
  }
}

async function run(): Promise<void> {
  console.log('▶ real-2gb-browser test');
  console.log(`  product = ${CONFIG.product}`);
  console.log(`  mode    = ${CONFIG.mode}`);
  console.log(`  appUrl  = ${CONFIG.appUrl}`);
  if (CONFIG.mode === 'file') {
    if (!CONFIG.testFile || !fs.existsSync(CONFIG.testFile)) {
      throw new Error(`TEST_FILE missing or not found: ${CONFIG.testFile}`);
    }
    const sz = fs.statSync(CONFIG.testFile).size;
    console.log(`  file    = ${CONFIG.testFile} (${(sz / 1024 ** 3).toFixed(2)} GB)`);
  }

  await waitForServer(CONFIG.appUrl);

  const launchOpts: Parameters<typeof puppeteer.launch>[0] = {
    headless: CONFIG.headless,
    browser: CONFIG.product,
    protocolTimeout: CONFIG.timeoutMs,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--js-flags=--max-old-space-size=8192',
    ],
  };

  console.log(`  launching ${CONFIG.product} (headless=${CONFIG.headless})...`);
  const browser: Browser = await puppeteer.launch(launchOpts);
  let exitCode = 1;
  let result: BigResult | null = null;

  try {
    const page: Page = await browser.newPage();
    page.setDefaultTimeout(CONFIG.timeoutMs);
    page.setDefaultNavigationTimeout(60000);

    page.on('console', (msg) => {
      const t = msg.text();
      if (t.startsWith('BIG2GB_RESULT:')) return; // suppress noisy envelope echo
      console.log(`  [page:${msg.type()}] ${t}`);
    });
    page.on('pageerror', (err: unknown) =>
      console.error(`  [page-error] ${err instanceof Error ? err.message : String(err)}`),
    );
    page.on('requestfailed', (req) =>
      console.error(`  [req-failed] ${req.url()} ${req.failure()?.errorText}`),
    );

    const url = CONFIG.appUrl + CONFIG.testPage;
    console.log(`  → ${url}`);
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => typeof (window as Window).__runBig2GBTest === 'function', {
      timeout: 60000,
    });

    if (CONFIG.mode === 'file') {
      const input = await page.$('#big2gb-file');
      if (!input) throw new Error('file input #big2gb-file not found on page');
      console.log('  uploading file path to <input type="file"> (no copy, browser streams from disk)...');
      await (input as unknown as { uploadFile: (p: string) => Promise<void> }).uploadFile(
        CONFIG.testFile,
      );
    }

    console.log('  ▶ running test in browser (this may take several minutes for multi-GB files)...');
    result = await page.evaluate(async (mode: Mode): Promise<BigResult> => {
      return await window.__runBig2GBTest(mode);
    }, CONFIG.mode);

    summarize(result);
    exitCode = result.ok ? 0 : 1;
    console.log(result.ok ? '\n✅ PASS' : '\n❌ FAIL');
  } catch (err) {
    console.error('\n❌ fatal:', err);
    if (result) summarize(result);
    exitCode = 2;
  } finally {
    await browser.close();
  }
  process.exit(exitCode);
}

run().catch((err) => {
  console.error('unhandled:', err);
  process.exit(3);
});

// Augment Window typing for evaluate() callback.
declare global {
  interface Window {
    __runBig2GBTest: (mode: Mode) => Promise<BigResult>;
  }
}

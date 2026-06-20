/**
 * Trace progress UX on the main demo page on GitHub Pages.
 *
 * Drives real Chrome via Puppeteer, uploads the 13.10 GB MKV through the
 * hidden #videoFile input that the dropzone wires up, polls the DOM every
 * 250 ms for visible ProgressBar instances + their text/percent, and
 * dumps the full timeline. Lets us see exactly what the user sees during
 * "Extract all subtitles" without having to drop the file by hand.
 *
 * Usage:
 *   APP_URL=https://opensubtitles.github.io/video-metadata-extractor-js \
 *   TEST_FILE=/abs/path/to/big.mkv \
 *   npx tsx tests/automation/main-app-progress-trace.test.ts
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';

const CONFIG = {
  appUrl: process.env.APP_URL || 'https://opensubtitles.github.io/video-metadata-extractor-js',
  testFile: process.env.TEST_FILE || '',
  headless: process.env.HEADLESS !== 'false',
  pollMs: parseInt(process.env.POLL || '250', 10),
  maxMs: parseInt(process.env.MAX || '120000', 10),
};

interface BarSnapshot {
  text: string;
  percent: number;
  domRect: { x: number; y: number; w: number; h: number };
}

interface Snapshot {
  t: number;
  bars: BarSnapshot[];
  stillVisible: boolean;
}

async function snapshot(page: Page): Promise<Snapshot> {
  return (await page.evaluate(() => {
    const t = performance.now();
    // ProgressBar root is `fixed inset-0 z-50` modal — find all of them.
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>('div.fixed.inset-0.z-50'),
    );
    const bars = candidates
      .filter((el) => el.offsetParent !== null || el.getClientRects().length > 0)
      .map((el) => {
        const textEl = el.querySelector('p.text-center');
        const percentEl = el.querySelector('span.font-medium');
        const rect = el.getBoundingClientRect();
        const pctText = percentEl?.textContent?.trim() ?? '';
        const percent = parseInt(pctText.replace('%', ''), 10);
        return {
          text: textEl?.textContent?.trim() ?? '',
          percent: Number.isFinite(percent) ? percent : -1,
          domRect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        };
      });
    return { t, bars, stillVisible: bars.length > 0 };
  })) as Snapshot;
}

async function run(): Promise<void> {
  if (!fs.existsSync(CONFIG.testFile)) throw new Error(`TEST_FILE missing: ${CONFIG.testFile}`);
  const fileSize = fs.statSync(CONFIG.testFile).size;

  console.log('▶ main-app-progress-trace');
  console.log(`  app:  ${CONFIG.appUrl}`);
  console.log(`  file: ${CONFIG.testFile} (${(fileSize / 1024 ** 3).toFixed(2)} GB)`);
  console.log(`  poll: ${CONFIG.pollMs}ms, max: ${CONFIG.maxMs}ms`);

  const browser: Browser = await puppeteer.launch({
    headless: CONFIG.headless,
    browser: 'chrome',
    protocolTimeout: CONFIG.maxMs + 60_000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page: Page = await browser.newPage();
    page.setDefaultTimeout(60_000);
    page.setDefaultNavigationTimeout(60_000);

    const consoleLines: string[] = [];
    page.on('console', (msg) => {
      const t = msg.text();
      if (t.startsWith('[EXTRACT ALL') || t.startsWith('[BATCH ') || t.startsWith('[MKV') || t.includes('MKV fast path') || t.includes('mkvfast')) {
        consoleLines.push(t);
      }
    });

    console.log(`  loading…`);
    await page.goto(CONFIG.appUrl, { waitUntil: 'networkidle0' });
    // Give React time to render the FileUpload component
    await new Promise((r) => setTimeout(r, 3000));
    // Wait for the file input to exist and be ready.
    await page.waitForSelector('#videoFile', { timeout: 120_000 });
    // Wait until isLoaded propagates (the input becomes not-disabled).
    await page.waitForFunction(
      () => {
        const inp = document.querySelector<HTMLInputElement>('#videoFile');
        return inp != null && !inp.disabled;
      },
      { timeout: 60_000 },
    );
    console.log('  input ready, uploading file path…');

    const input = await page.$('#videoFile');
    if (!input) throw new Error('#videoFile not found');
    await (input as unknown as { uploadFile: (p: string) => Promise<void> }).uploadFile(CONFIG.testFile);

    // Poll for bars until extraction visibly finishes or max time elapses.
    const start = Date.now();
    const timeline: Snapshot[] = [];
    let lastSig = '';
    let stableSince: number | null = null;
    while (Date.now() - start < CONFIG.maxMs) {
      const s = await snapshot(page);
      const sig = JSON.stringify(s.bars.map((b) => `${b.percent}|${b.text}`));
      if (sig !== lastSig) {
        timeline.push(s);
        const tag = `[${((Date.now() - start) / 1000).toFixed(1)}s]`;
        if (s.bars.length === 0) {
          console.log(`${tag} (no progress bar visible)`);
        } else {
          for (let i = 0; i < s.bars.length; i++) {
            const b = s.bars[i];
            console.log(
              `${tag} bar${s.bars.length > 1 ? `[${i + 1}/${s.bars.length}]` : ''}: ${b.percent}% — "${b.text}"`,
            );
          }
        }
        lastSig = sig;
        stableSince = null;
      } else {
        if (stableSince === null) stableSince = Date.now();
      }
      // Stop once the bar has been at 100 % for >2 s, or has stayed hidden for >2 s after we saw something.
      const sawSomething = timeline.some((x) => x.bars.length > 0);
      const allDone = s.bars.length > 0 && s.bars.every((b) => b.percent >= 100);
      const lingeredHidden = sawSomething && s.bars.length === 0 && stableSince !== null && Date.now() - stableSince > 2000;
      if (allDone && stableSince !== null && Date.now() - stableSince > 2000) {
        console.log(`  all bars at 100% for >2s, stopping early`);
        break;
      }
      if (lingeredHidden) {
        console.log(`  bars stayed hidden for >2s after first appearance, stopping early`);
        break;
      }
      await new Promise((r) => setTimeout(r, CONFIG.pollMs));
    }

    console.log('\n=== relevant page console (filtered) ===');
    for (const l of consoleLines.slice(-40)) console.log(`  ${l}`);

    // Pull in-app progress state via React-free DOM probe for a final read.
    const final = await snapshot(page);
    console.log(`\nfinal: ${final.bars.length} bar(s) visible`);
    for (const b of final.bars) console.log(`  ${b.percent}% — "${b.text}" at ${b.domRect.x},${b.domRect.y}`);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('fatal:', err);
  process.exit(2);
});

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const url = process.env.TIDEBORN_URL ?? 'http://localhost:4173/globe-slice-preview.html';
const output = new URL('../output/globe-slice/', import.meta.url);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1920 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__tidebornSliceReady === true, { timeout: 30000 });
const state = await page.evaluate(() => window.__tidebornSlice);
await page.screenshot({ path: new URL('tideborn-2d-planet-slice.png', output).pathname });
const report = { state, errors };
await writeFile(new URL('capture-report.json', output), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (errors.length > 0) throw new Error(`Globe slice capture emitted browser errors: ${errors.join(' | ')}`);

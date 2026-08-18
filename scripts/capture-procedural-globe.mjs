import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const url = process.env.TIDEBORN_URL ?? 'http://localhost:4173/globe-preview.html';
const output = new URL('../output/procedural-globe/', import.meta.url);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1920 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__tidebornGlobeReady === true, { timeout: 60000 });
await page.waitForTimeout(400);
const front = await page.evaluate(() => window.__tidebornGlobe.snapshot());
await page.screenshot({ path: new URL('tideborn-globe-front.png', output).pathname });

await page.evaluate(() => {
  const snapshot = window.__tidebornGlobe.snapshot();
  window.__tidebornGlobe.setRotation(snapshot.rotationRadians + Math.PI);
});
await page.waitForTimeout(350);
const back = await page.evaluate(() => window.__tidebornGlobe.snapshot());
await page.screenshot({ path: new URL('tideborn-globe-opposite.png', output).pathname });

const report = { front, back, errors };
await writeFile(new URL('capture-report.json', output), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (errors.length > 0) throw new Error(`Procedural globe capture emitted browser errors: ${errors.join(' | ')}`);

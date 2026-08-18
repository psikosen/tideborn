import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/breach-jet/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.clear();
  document.querySelector('#start-btn')?.click();
});
await page.waitForTimeout(160);

const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.keyboard.down('ShiftLeft');
await page.evaluate(() => window.advanceTime(34));
await page.keyboard.up('ShiftLeft');
await page.evaluate(() => window.advanceTime(55));
await page.keyboard.down('KeyW');
await page.keyboard.down('KeyD');

let apex = await state();
for (let pass = 0; pass < 16; pass += 1) {
  await page.evaluate(() => window.advanceTime(45));
  const current = await state();
  if (current.player.y > apex.player.y) apex = current;
}
await page.keyboard.up('KeyW');
await page.keyboard.up('KeyD');
await page.waitForTimeout(100);
await page.screenshot({ path: new URL('diagonal-breach-apex.png', outputDir).pathname });
await writeFile(new URL('state.json', outputDir), JSON.stringify(apex, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (apex.player.underwater || apex.player.y <= 4.05) throw new Error(`Jet did not clear the sea surface: ${JSON.stringify(apex.player)}`);
if (Math.abs(apex.player.tiltDegrees) < 8) throw new Error(`Directional tilt was not visible: ${apex.player.tiltDegrees}`);
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ player: apex.player, errors }, null, 2));

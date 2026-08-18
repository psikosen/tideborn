import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/mineral-economy/', import.meta.url);
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
async function tap(code, duration = 40) {
  await page.keyboard.down(code);
  await page.evaluate((ms) => window.advanceTime(ms), duration);
  await page.keyboard.up(code);
  await page.evaluate(() => window.advanceTime(34));
}

// Settle onto the saline shelf immediately below the spawn point.
await page.keyboard.down('KeyS');
await page.evaluate(() => window.advanceTime(420));
await page.keyboard.up('KeyS');
await page.evaluate(() => window.advanceTime(160));

await page.keyboard.down('KeyX');
let dropped = null;
for (let pass = 0; pass < 22; pass += 1) {
  await page.evaluate(() => window.advanceTime(330));
  const current = await state();
  if (current.nearbyMinerals.some((drop) => drop.mineral === 'salt')) {
    dropped = current;
    break;
  }
}
await page.keyboard.up('KeyX');
await page.waitForTimeout(100);
await page.screenshot({ path: new URL('salt-excavated.png', outputDir).pathname });

await tap('KeyE');
const collected = await state();
await tap('KeyY');
const seasoned = await state();
await page.waitForTimeout(100);
await page.screenshot({ path: new URL('seasoned-meal.png', outputDir).pathname });
await writeFile(new URL('states.json', outputDir), JSON.stringify({ dropped, collected, seasoned }, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (!dropped) throw new Error('Digging saline sediment did not release sea salt.');
if (collected.inventory.salt !== 1) throw new Error(`Salt did not enter inventory: ${JSON.stringify(collected.inventory)}`);
if (seasoned.inventory.seasonedFood !== 1 || seasoned.inventory.salt) throw new Error(`Seasoning failed: ${JSON.stringify(seasoned.inventory)}`);
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ drop: dropped.nearbyMinerals, collected: collected.inventory, seasoned: seasoned.inventory, errors }, null, 2));

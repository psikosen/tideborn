import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const outputDir = new URL('../output/jet-chain/', import.meta.url);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(process.env.TIDEBORN_URL ?? 'http://localhost:4173', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); document.querySelector('#start-btn')?.click(); });
await page.waitForTimeout(150);
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.keyboard.down('KeyD');
const bursts = [];
for (let burst = 0; burst < 3; burst += 1) {
  await page.keyboard.down('ShiftLeft');
  await page.evaluate(() => window.advanceTime(34));
  await page.keyboard.up('ShiftLeft');
  await page.evaluate(() => window.advanceTime(205));
  bursts.push(await state());
}
await page.keyboard.up('KeyD');
await page.waitForTimeout(80);
await page.screenshot({ path: new URL('three-jet-chain.png', outputDir).pathname });
await page.evaluate(() => window.advanceTime(1220));
const recharged = await state();
await writeFile(new URL('states.json', outputDir), JSON.stringify({ bursts, recharged }, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

const charges = bursts.map((entry) => entry.player.jetCharges);
if (charges.join(',') !== '2,1,0') throw new Error(`Jet chain did not consume three charges: ${charges.join(',')}`);
if (recharged.player.jetCharges < 1) throw new Error('A spent jet charge did not regenerate.');
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ charges, recharge: recharged.player, activeVFX: bursts[2].activeVFX, errors }, null, 2));

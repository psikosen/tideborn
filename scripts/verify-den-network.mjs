import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/den-network/', import.meta.url);
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
async function steer(target, tolerance = 0.42) {
  let current = await state();
  for (let attempt = 0; attempt < 70; attempt += 1) {
    const dx = target.x - current.player.x;
    const dy = target.y - current.player.y;
    if (Math.abs(dx) < tolerance && Math.abs(dy) < tolerance) return current;
    const keys = [];
    if (Math.abs(dx) >= tolerance) keys.push(dx > 0 ? 'KeyD' : 'KeyA');
    if (Math.abs(dy) >= tolerance) keys.push(dy > 0 ? 'KeyW' : 'KeyS');
    for (const key of keys) await page.keyboard.down(key);
    await page.evaluate(() => window.advanceTime(135));
    for (const key of keys) await page.keyboard.up(key);
    current = await state();
  }
  throw new Error(`Could not reach ${JSON.stringify(target)}; stopped at ${current.player.x}, ${current.player.y} (${current.prompt})`);
}

for (const target of [
  { x: -9.6, y: 2.55 },
  { x: -11.6, y: 2.6 },
  { x: -13.0, y: 2.9 },
]) await steer(target);
const firstDen = await state();

for (const target of [
  { x: -10.0, y: 3.0 },
  { x: -2.0, y: 3.1 },
  { x: 5.0, y: 0.1 },
  { x: 8.75, y: -2.75 },
  { x: 9.15, y: -3.35 },
  { x: 9.55, y: -3.9 },
  { x: 10.0, y: -4.55 },
  { x: 10.5, y: -5.25 },
  { x: 11.05, y: -5.95 },
  { x: 11.8, y: -6.35 },
]) await steer(target);

const beforeClaim = await state();
await tap('KeyN');
const secondDen = await state();
await page.waitForTimeout(100);
await page.screenshot({ path: new URL('reef-den-claimed.png', outputDir).pathname });
await writeFile(new URL('states.json', outputDir), JSON.stringify({ firstDen, beforeClaim, secondDen }, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (firstDen.den.count !== 1) throw new Error(`Starter den was not discovered: ${firstDen.den.count}.`);
if (secondDen.den.count !== 2) throw new Error(`Reef den was not claimed: ${secondDen.prompt}`);
if (secondDen.den.active !== 'den-2') throw new Error(`Claimed den is not active: ${secondDen.den.active}`);
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ first: firstDen.den.sites, second: secondDen.den.sites, prompt: secondDen.prompt, errors }, null, 2));

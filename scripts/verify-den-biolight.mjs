import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const outputDir = new URL('../output/den-biolight/', import.meta.url);
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

async function tap(code) {
  await page.keyboard.down(code);
  await page.evaluate(() => window.advanceTime(40));
  await page.keyboard.up(code);
  await page.evaluate(() => window.advanceTime(34));
}
async function steer(targets) {
  for (const target of targets) {
    for (let attempt = 0; attempt < 110; attempt += 1) {
      const current = await state();
      const dx = target.x - current.player.x;
      const dy = target.y - current.player.y;
      if (Math.abs(dx) < 0.42 && Math.abs(dy) < 0.4) break;
      const keys = [];
      if (Math.abs(dx) > 0.42) keys.push(dx > 0 ? 'KeyD' : 'KeyA');
      if (Math.abs(dy) > 0.4) keys.push(dy > 0 ? 'KeyW' : 'KeyS');
      for (const key of keys) await page.keyboard.down(key);
      await page.evaluate(() => window.advanceTime(145));
      for (const key of keys) await page.keyboard.up(key);
    }
  }
}

await steer([{ x: -2, y: 3.2 }, { x: 4.5, y: 0.2 }, { x: 8.9, y: -2.35 }]);
await tap('KeyE');
const carried = await state();
await steer([{ x: 5, y: 0.2 }, { x: -2, y: 3.1 }, { x: -9.6, y: 2.55 }, { x: -11.6, y: 2.6 }, { x: -13, y: 2.9 }]);
await tap('KeyV');
await page.evaluate(() => window.advanceTime(1450));
const steadyA = await state();
await page.waitForTimeout(90);
await page.screenshot({ path: new URL('steady-den-light-a.png', outputDir).pathname });
await page.evaluate(() => window.advanceTime(900));
const steadyB = await state();
await page.waitForTimeout(90);
await page.screenshot({ path: new URL('steady-den-light-b.png', outputDir).pathname });
await writeFile(new URL('states.json', outputDir), JSON.stringify({ carried, steadyA, steadyB }, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (carried.inventory.glowKelp !== 1) throw new Error('The luminous seaweed was not harvested.');
if (steadyA.inventory.glowKelp) throw new Error('Placed seaweed remained in carried inventory.');
if (steadyA.den.sites[0]?.bioLights !== 1) throw new Error('The den did not retain its placed living lamp.');
if (steadyA.biolight.source !== 'steady-den-lamp' || steadyB.biolight.source !== 'steady-den-lamp') throw new Error('Den light is not in steady mode.');
if ([...steadyA.activeVFX, ...steadyB.activeVFX].some((effect) => effect.id === 'bioPulse')) throw new Error('A recurring bioPulse remained active inside the den.');
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ carried: carried.inventory, den: steadyA.den, lightA: steadyA.biolight, lightB: steadyB.biolight, errors }, null, 2));

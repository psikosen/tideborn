import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const outputDir = new URL('../output/deep-fauna/', import.meta.url);
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
  await page.evaluate(() => window.advanceTime(38));
  await page.keyboard.up(code);
}
async function steer(targets) {
  for (const target of targets) {
    for (let attempt = 0; attempt < 125; attempt += 1) {
      const current = await state();
      const dx = target.x - current.player.x;
      const dy = target.y - current.player.y;
      if (Math.abs(dx) < 0.46 && Math.abs(dy) < 0.42) break;
      const keys = [];
      if (Math.abs(dx) > 0.46) keys.push(dx > 0 ? 'KeyD' : 'KeyA');
      else if (Math.abs(dy) > 0.42) keys.push(dy > 0 ? 'KeyW' : 'KeyS');
      for (const key of keys) await page.keyboard.down(key);
      await page.evaluate(() => window.advanceTime(210));
      for (const key of keys) await page.keyboard.up(key);
    }
  }
}

await steer([{ x: -2, y: 3.2 }, { x: 4.5, y: 0.2 }, { x: 8.9, y: -2.35 }]);
await tap('KeyE');
await steer([
  { x: 15, y: -5 }, { x: 23.5, y: -8.1 }, { x: 26, y: -8.7 }, { x: 28, y: -12.4 },
  { x: 30, y: -18.2 }, { x: 32.0, y: -20.6 },
]);
const shark = await state();
await page.waitForTimeout(100);
await page.screenshot({ path: new URL('sixgill-shark.png', outputDir).pathname });
await writeFile(new URL('states.json', outputDir), JSON.stringify({ shark }, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (!shark.deepSeaLife.nearby.some((creature) => creature.species === 'sixgill-shark')) throw new Error('No sixgill shark materialized in the midnight habitat.');
if (!shark.deepSeaLife.nearby.some((creature) => creature.species === 'lantern-school')) throw new Error('No lantern fish school shares the midnight shark habitat.');
for (const species of ['orca', 'sixgill-shark', 'lantern-school', 'gulper-eel', 'siphonophore', 'giant-isopod']) {
  if (!shark.deepSeaLife.population[species]) throw new Error(`Missing deep species population: ${species}`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ deepLife: shark.deepSeaLife, health: shark.survival.health, errors }, null, 2));

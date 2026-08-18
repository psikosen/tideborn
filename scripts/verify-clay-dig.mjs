import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/clay-dig/', import.meta.url);

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
await page.waitForTimeout(200);

const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
async function steer(targets) {
  for (const target of targets) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const current = await state();
      const dx = target.x - current.player.x;
      const dy = target.y - current.player.y;
      if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) break;
      const keys = [];
      if (Math.abs(dx) > 0.3) keys.push(dx > 0 ? 'KeyD' : 'KeyA');
      if (Math.abs(dy) > 0.3) keys.push(dy > 0 ? 'KeyW' : 'KeyS');
      for (const key of keys) await page.keyboard.down(key);
      await page.evaluate(() => window.advanceTime(120));
      for (const key of keys) await page.keyboard.up(key);
    }
  }
}

// Enter the deterministic starter den and face its exposed upper clay wall.
await steer([
  { x: -9.6, y: 2.55 },
  { x: -11.6, y: 2.6 },
  { x: -13.0, y: 2.9 },
  { x: -14.1, y: 3.55 },
  { x: -14.55, y: 4.0 },
]);
await page.keyboard.down('KeyA');
await page.evaluate(() => window.advanceTime(80));
await page.keyboard.up('KeyA');

const checkpoints = [];
const samples = [{ phase: 'before-dig', state: await state() }];
let previousPrompt = '';
let firstClay = null;
let midClay = null;
let breakthrough = null;

await page.keyboard.down('KeyX');
for (let pass = 0; pass < 90; pass += 1) {
  await page.evaluate(() => window.advanceTime(330));
  const current = await state();
  if (current.prompt !== previousPrompt) {
    samples.push({ phase: `pass-${pass}`, state: current });
    previousPrompt = current.prompt;
  }
  const clayMatch = current.prompt.match(/fractures? clay · (\d+)%/i);
  if (clayMatch) {
    const progress = Number(clayMatch[1]);
    if (!firstClay) {
      firstClay = current;
      checkpoints.push({ phase: 'first-clay-contact', progress, state: current });
    }
    if (!midClay && progress >= 45) {
      midClay = current;
      checkpoints.push({ phase: 'visible-fractures', progress, state: current });
      await page.keyboard.up('KeyX');
      await page.evaluate(() => window.advanceTime(700));
      await page.waitForTimeout(80);
      await page.screenshot({ path: new URL('clay-fracturing.png', outputDir).pathname });
      await page.keyboard.down('KeyX');
    }
  }
  if (firstClay && current.den.excavatedCells > firstClay.den.excavatedCells && current.prompt.includes('displaced')) {
    breakthrough = current;
    checkpoints.push({ phase: 'breakthrough', progress: 100, state: current });
    break;
  }
}
await page.keyboard.up('KeyX');
await page.waitForTimeout(100);

if (breakthrough) await page.screenshot({ path: new URL('clay-breakthrough.png', outputDir).pathname });
await writeFile(new URL('states.json', outputDir), JSON.stringify({ checkpoints, samples }, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (!firstClay) throw new Error('The player never reached clay while holding X.');
if (!midClay) throw new Error('Clay fracture progress did not reach a visible midpoint.');
if (!breakthrough) throw new Error('Bare-arm clay scraping never produced a breakthrough.');
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify({
  firstClay: {
    prompt: firstClay.prompt,
    stamina: firstClay.player.stamina,
    excavatedCells: firstClay.den.excavatedCells,
  },
  midClay: {
    prompt: midClay.prompt,
    stamina: midClay.player.stamina,
    excavatedCells: midClay.den.excavatedCells,
  },
  breakthrough: {
    prompt: breakthrough.prompt,
    stamina: breakthrough.player.stamina,
    excavatedCells: breakthrough.den.excavatedCells,
  },
  errors,
}, null, 2));

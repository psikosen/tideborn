import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/depth-lighting/', import.meta.url);

await mkdir(outputDir, { recursive: true });

async function gameState(page) {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}

async function tap(page, code) {
  await page.keyboard.down(code);
  await page.evaluate(() => window.advanceTime(34));
  await page.keyboard.up(code);
}

async function steer(page, targets) {
  for (const target of targets) {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      const state = await gameState(page);
      const dx = target.x - state.player.x;
      const dy = target.y - state.player.y;
      if (Math.abs(dx) < 0.42 && Math.abs(dy) < 0.38) break;
      const keys = [];
      // Traverse east into open water before dropping to the next contour.
      // Diagonal steering can cut the corner of a steep granular trench wall.
      if (Math.abs(dx) > 0.42) {
        if (dx > 0) keys.push('KeyD');
        else keys.push('KeyA');
      } else if (dy > 0.28) keys.push('KeyW');
      else if (dy < -0.28) keys.push('KeyS');
      for (const key of keys) await page.keyboard.down(key);
      await page.evaluate(() => window.advanceTime(240));
      for (const key of keys) await page.keyboard.up(key);
    }
  }
}

async function newGame(browser) {
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
  return { page, errors };
}

const routeToGlow = [
  { x: -2, y: 3.2 },
  { x: 4.5, y: 0.2 },
  { x: 8.9, y: -2.35 },
];
const routeToVent = [
  { x: 15.0, y: -5.0 },
  { x: 23.5, y: -8.1 },
  { x: 26.0, y: -8.7 },
  { x: 28.0, y: -12.4 },
  { x: 30.0, y: -18.2 },
  { x: 31.0, y: -20.4, collectGlow: true },
  { x: 32.0, y: -23.4 },
  { x: 34.0, y: -25.7 },
  { x: 36.0, y: -29.0 },
  { x: 38.0, y: -37.3 },
  { x: 40.0, y: -48.2, collectGlow: true },
  { x: 42.0, y: -63.0 },
  { x: 44.0, y: -76.7 },
  { x: 46.0, y: -89.4, collectGlow: true },
  { x: 48.0, y: -97.1 },
  { x: 50.0, y: -100.2 },
  { x: 51.7, y: -102.1 },
];

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });

const blind = await newGame(browser);
await steer(blind.page, routeToGlow);
const blindGradient = [];
for (const [index, target] of routeToVent.entries()) {
  await steer(blind.page, [target]);
  const checkpoint = await gameState(blind.page);
  blindGradient.push({
    x: checkpoint.player.x,
    y: checkpoint.player.y,
    depthM: checkpoint.depthRoute.canonicalDepthM,
    darkness: checkpoint.depthRoute.darkness,
  });
  await blind.page.waitForTimeout(80);
  await blind.page.screenshot({ path: new URL(`gradient-${index}.png`, outputDir).pathname });
}
await blind.page.waitForTimeout(250);
const blindState = await gameState(blind.page);
await blind.page.screenshot({ path: new URL('blind-27km.png', outputDir).pathname });
await writeFile(new URL('blind-state.json', outputDir), JSON.stringify(blindState, null, 2));
await writeFile(new URL('blind-gradient.json', outputDir), JSON.stringify(blindGradient, null, 2));

const lit = await newGame(browser);
await steer(lit.page, routeToGlow);
await tap(lit.page, 'KeyE');
for (const target of routeToVent) {
  await steer(lit.page, [target]);
  if (target.collectGlow) await tap(lit.page, 'KeyE');
}
await lit.page.waitForTimeout(250);
const litState = await gameState(lit.page);
await lit.page.screenshot({ path: new URL('biolight-27km.png', outputDir).pathname });
await writeFile(new URL('biolight-state.json', outputDir), JSON.stringify(litState, null, 2));

await writeFile(
  new URL('console-errors.json', outputDir),
  JSON.stringify({ blind: blind.errors, biolight: lit.errors }, null, 2),
);
await browser.close();

console.log(JSON.stringify({
  blind: { depthRoute: blindState.depthRoute, gradient: blindGradient, lightOcclusion: blindState.lightOcclusion, inventory: blindState.inventory },
  biolight: { depthRoute: litState.depthRoute, lightOcclusion: litState.lightOcclusion, inventory: litState.inventory },
}, null, 2));

if (blind.errors.length || lit.errors.length) throw new Error(`Lighting browser errors: ${[...blind.errors, ...lit.errors].join(' | ')}`);
if (blindState.biolight.active) throw new Error('Blind descent unexpectedly gained a light source.');
if (!litState.biolight.active || litState.biolight.carried.stacks < 1 || !litState.ventDiscovered) {
  throw new Error(`Stacked biolight route failed: ${JSON.stringify({ biolight: litState.biolight, vent: litState.ventDiscovered })}`);
}

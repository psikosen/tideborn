import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const output = new URL('../output/core-worms-clams/', import.meta.url);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(process.env.TIDEBORN_URL ?? 'http://localhost:4173', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.clear(); document.querySelector('#start-btn')?.click(); });
await page.waitForTimeout(500);

const core = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const scale = game.planetScale.state(32000);
  game.atlasOpen = true;
  game.atlasPanel.classList.add('open');
  game.mode = 'paused';
  game.render();
  return scale.planetInterior;
});
await page.waitForTimeout(160);
await page.screenshot({ path: new URL('planet-core-atlas.png', output).pathname });

const clam = await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.atlasOpen = false;
  game.atlasPanel.classList.remove('open');
  game.mode = 'playing';
  const target = game.proceduralClams.snapshot(6.5, -1.8).nearby[0];
  game.player.x = target.x;
  game.player.y = target.y + 0.22;
  game.player.vx = 0;
  game.player.vy = 0;
  const before = game.proceduralClams.snapshot(game.player.x, game.player.y);
  const foodBefore = game.inventory.food;
  const shellBefore = game.inventory.largeShell;
  game.handleInteract();
  const gripped = game.proceduralClams.snapshot(game.player.x, game.player.y);
  game.player.x = target.x - 0.95;
  game.player.y = target.y + 0.34;
  game.handleHeldOrganismDig();
  game.handleHeldOrganismDig();
  game.vfx.update(0.7);
  const halfOpen = game.proceduralClams.snapshot(game.player.x, game.player.y);
  game.cameraTarget.set(game.player.x, game.player.y);
  game.camera.position.set(game.player.x, game.player.y, 24);
  game.updateUI();
  game.mode = 'paused';
  game.render();
  return { target, before, gripped, halfOpen, foodBefore, shellBefore };
});
await page.waitForTimeout(180);
await page.screenshot({ path: new URL('clam-grip-and-peel.png', output).pathname });

const clamOpened = await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.mode = 'playing';
  for (let attempt = 0; attempt < 5 && game.proceduralClams.held(); attempt += 1) game.handleHeldOrganismDig();
  const state = game.proceduralClams.snapshot(game.player.x, game.player.y);
  game.updateUI();
  return { state, food: game.inventory.food, shells: game.inventory.largeShell, shellfish: game.ecosystem.shellfish };
});

const worm = await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.inventory.glowKelp = 1;
  game.bioluminescence.reconcile(1, []);
  const target = game.deepTubeWorms.snapshot(52.8, -102.7).nearby[0];
  game.player.x = target.x - 1.0;
  game.player.y = target.y + 1.05;
  game.player.vx = 0;
  game.player.vy = 0;
  game.survival.health = 92;
  game.depthState = game.depthAccess.sample(game.player.x, game.player.y, game.world.seaLevel, true);
  game.cameraTarget.set(target.x + 0.35, game.player.y);
  game.camera.position.set(target.x + 0.35, game.player.y, 24);
  game.viewHeight = 9.5;
  game.resize();
  const before = game.deepTubeWorms.snapshot(game.player.x, game.player.y);
  const healthBeforeGrip = game.survival.health;
  game.handleInteract();
  game.vfx.update(0.18);
  game.updateDepthRendering();
  game.updateUI();
  game.bannerUntil = 0;
  game.ui.querySelector('[data-ui="banner"]')?.classList.remove('show');
  const gripped = game.deepTubeWorms.snapshot(game.player.x, game.player.y);
  game.mode = 'paused';
  game.render();
  return { target, before, gripped, healthBeforeGrip, healthAfterGrip: game.survival.health, message: game.message };
});
await page.waitForTimeout(200);
await page.screenshot({ path: new URL('deep-tube-worm-thermal-defense.png', output).pathname });

const harvest = await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.mode = 'playing';
  for (let cut = 0; cut < 4 && game.deepTubeWorms.held(); cut += 1) game.handleHeldOrganismDig();
  const afterCut = game.deepTubeWorms.snapshot(game.player.x, game.player.y);
  const wormMeatAfterCut = game.inventory.tubeWormMeat;
  game.handleInteract();
  const tonicAfterCollection = game.inventory.ventTonic;
  game.survival.hunger = 25;
  game.survival.health = 65;
  game.eat();
  const afterMeal = { hunger: game.survival.hunger, health: game.survival.health, wormMeat: game.inventory.tubeWormMeat };
  game.survival.health = 40;
  game.useVentTonic();
  const afterTonic = { health: game.survival.health, tonic: game.inventory.ventTonic };
  game.vfx.update(0.16);
  game.updateDepthRendering();
  game.updateUI();
  game.mode = 'paused';
  game.render();
  return { afterCut, wormMeatAfterCut, tonicAfterCollection, afterMeal, afterTonic, message: game.message };
});
await page.waitForTimeout(180);
await page.screenshot({ path: new URL('tube-worm-harvest-and-tonic.png', output).pathname });

const result = { core, clam, clamOpened, worm, harvest, errors };
await writeFile(new URL('results.json', output), `${JSON.stringify(result, null, 2)}\n`);
await writeFile(new URL('console-errors.json', output), `${JSON.stringify(errors, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(result, null, 2));

if (core.core.beginsAtDepthKm < 2500 || core.layers.filter((layer) => layer.id.includes('core')).length !== 2) {
  throw new Error(`Planet core model is incomplete: ${JSON.stringify(core)}`);
}
if (core.deepestOcean.layer !== 'Abyssal ocean & megacave shell' || core.deepestOcean.distanceAboveCoreKm < 1700 || core.habitableShell.thicknessKm !== 966) {
  throw new Error(`Ocean/core scale boundary is misleading: ${JSON.stringify(core.deepestOcean)}`);
}
if (!clam.gripped.held || clam.halfOpen.nearby[0]?.pryProgress <= 0 || clamOpened.state.opened !== 1) {
  throw new Error(`Clam grip -> dig -> open chain failed: ${JSON.stringify({ clam, clamOpened })}`);
}
if (clamOpened.food !== clam.foodBefore + 1 || clamOpened.shells !== clam.shellBefore + 1) {
  throw new Error(`Clam rewards failed: ${JSON.stringify(clamOpened)}`);
}
if (!worm.gripped.held || worm.healthAfterGrip >= worm.healthBeforeGrip || !worm.message.includes('THERMAL SPRAY')) {
  throw new Error(`Tube worm thermal defense failed: ${JSON.stringify(worm)}`);
}
if (harvest.afterCut.harvested < 1 || harvest.wormMeatAfterCut !== 1 || harvest.tonicAfterCollection !== 1) {
  throw new Error(`Tube worm harvest/drop chain failed: ${JSON.stringify(harvest)}`);
}
if (harvest.afterMeal.hunger < 75 || harvest.afterMeal.wormMeat !== 0 || harvest.afterTonic.health !== 74 || harvest.afterTonic.tonic !== 0) {
  throw new Error(`Tube worm nutrition/tonic use failed: ${JSON.stringify(harvest)}`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

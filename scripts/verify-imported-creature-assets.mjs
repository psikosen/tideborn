import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/imported-creatures/', import.meta.url);
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
const detailedAssets = ['clownfish', 'reef-fish', 'orca', 'animated-shore-crab', 'coconut-crab', 'ilyoplax-mud-crab'];
const startupAssets = ['clownfish', 'reef-fish', 'orca', 'animated-shore-crab'];
await page.waitForFunction((ids) => {
  const state = JSON.parse(window.render_game_to_text());
  return state.creatureAssets.assetMode === 'full-glb'
    && ids.every((id) => state.creatureAssets.loaded.includes(id))
    && state.creatureAssets.failed.length === 0;
}, startupAssets, { timeout: 90_000 });

const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const stagePlayer = async (x, y) => page.evaluate(({ targetX, targetY }) => {
  const game = window.__tidebornTest;
  game.player.x = targetX;
  game.player.y = targetY;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.camouflage = true;
  game.inventory.glowKelp = 1;
  game.cameraTarget.set(targetX, targetY);
  game.camera.position.x = targetX;
  game.camera.position.y = targetY;
  window.advanceTime(650);
}, { targetX: x, targetY: y });

const coastalState = await state();
await page.screenshot({ path: new URL('detailed-coastal-fish.png', outputDir).pathname });

await stagePlayer(28.5, -9.8);
await page.waitForTimeout(100);
const orcaState = await state();
const orcaOrientation = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const orca = game.deepSeaLife.creatures.find((creature) => creature.alive && creature.species === 'orca');
  const model = orca?.visual.getObjectByName('asset-orca');
  if (!model) return null;
  model.updateMatrixWorld(true);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let vertices = 0;
  model.traverse((node) => {
    const positions = node.geometry?.attributes?.position;
    if (!positions) return;
    const elements = node.matrixWorld.elements;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      const worldX = elements[0] * x + elements[4] * y + elements[8] * z + elements[12];
      const worldY = elements[1] * x + elements[5] * y + elements[9] * z + elements[13];
      minX = Math.min(minX, worldX);
      minY = Math.min(minY, worldY);
      maxX = Math.max(maxX, worldX);
      maxY = Math.max(maxY, worldY);
      vertices += 1;
    }
  });
  const width = maxX - minX;
  const height = maxY - minY;
  return { width, height, aspect: width / Math.max(0.0001, height), vertices };
});
await page.screenshot({ path: new URL('pelagic-orca.png', outputDir).pathname });

await stagePlayer(30.5, -18.8);
await page.waitForTimeout(100);
const sharkState = await state();
await page.screenshot({ path: new URL('animated-shark.png', outputDir).pathname });

const crabId = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const crab = game.amphibiousCrabs.crabs.find((candidate) => candidate.alive && candidate.species === 'mudflat-crab');
  game.player.x = crab.x + 0.75;
  game.player.y = crab.y + 0.15;
  game.player.vx = 0;
  game.player.vy = 0;
  game.cameraTarget.set(crab.x, crab.y);
  game.camera.position.set(crab.x, crab.y, 24);
  game.viewHeight = 7;
  game.amphibiousCrabs.update(0.12, game.elapsed + 0.12, { x: game.player.x, y: game.player.y, vx: 0, concealed: false }, []);
  game.resize();
  game.render();
  return crab.id;
});
await page.waitForFunction((id) => {
  const crab = window.__tidebornTest.amphibiousCrabs.crabs.find((candidate) => candidate.id === id);
  return crab?.visual.userData.creatureAssetReady === 'ilyoplax-mud-crab';
}, crabId, { timeout: 15_000 });
const crabAsset = await page.evaluate((id) => {
  const game = window.__tidebornTest;
  const crab = game.amphibiousCrabs.crabs.find((candidate) => candidate.id === id);
  game.amphibiousCrabs.update(0.12, game.elapsed + 0.24, { x: game.player.x, y: game.player.y, vx: 0, concealed: false }, []);
  game.render();
  let visibleFallbacks = 0;
  crab.visual.traverse((node) => { if (node.userData.assetFallback && node.visible) visibleFallbacks += 1; });
  return { ready: crab.visual.userData.creatureAssetReady, visibleFallbacks };
}, crabId);
await page.screenshot({ path: new URL('detailed-mudflat-crab.png', outputDir).pathname });

const coconutId = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const crab = game.amphibiousCrabs.crabs.find((candidate) => candidate.alive && candidate.species === 'coconut-crab');
  game.player.x = crab.x + 0.9;
  game.player.y = crab.y + 0.2;
  game.cameraTarget.set(crab.x, crab.y);
  game.camera.position.set(crab.x, crab.y, 24);
  game.amphibiousCrabs.update(0.12, game.elapsed + 0.36, { x: game.player.x, y: game.player.y, vx: 0, concealed: false }, []);
  game.render();
  return crab.id;
});
await page.waitForFunction((id) => {
  const crab = window.__tidebornTest.amphibiousCrabs.crabs.find((candidate) => candidate.id === id);
  return crab?.visual.userData.creatureAssetReady === 'coconut-crab';
}, coconutId, { timeout: 60_000 });
const coconutAsset = await page.evaluate((id) => {
  const game = window.__tidebornTest;
  const crab = game.amphibiousCrabs.crabs.find((candidate) => candidate.id === id);
  let visibleFallbacks = 0;
  crab.visual.traverse((node) => { if (node.userData.assetFallback && node.visible) visibleFallbacks += 1; });
  return { ready: crab.visual.userData.creatureAssetReady, visibleFallbacks };
}, coconutId);
await page.screenshot({ path: new URL('detailed-coconut-crab.png', outputDir).pathname });
const finalState = await state();

await writeFile(new URL('state.json', outputDir), JSON.stringify({ coastalState, orcaState, orcaOrientation, sharkState, crabAsset, coconutAsset, finalState }, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

const assets = finalState.creatureAssets;
if (assets.assetMode !== 'full-glb'
  || detailedAssets.some((id) => !assets.loaded.includes(id) || assets.original.includes(id))
  || assets.failed.length
  || assets.instances < 22
  || assets.animatedInstances < 8) {
  throw new Error(`Creature asset library did not fully resolve: ${JSON.stringify(assets)}`);
}
if (!orcaState.deepSeaLife.nearby.some((creature) => creature.species === 'orca')) {
  throw new Error('Imported orca was not represented by nearby AI.');
}
if (!orcaOrientation || orcaOrientation.aspect < 2.1 || orcaOrientation.vertices < 100) {
  throw new Error(`Imported orca is not a broadside 2D silhouette: ${JSON.stringify(orcaOrientation)}`);
}
if (!sharkState.deepSeaLife.nearby.some((creature) => creature.species === 'sixgill-shark')) {
  throw new Error('Imported animated shark was not represented by nearby AI.');
}
if (crabAsset.ready !== 'ilyoplax-mud-crab' || crabAsset.visibleFallbacks !== 0) {
  throw new Error(`Detailed crab GLB did not replace the stand-in: ${JSON.stringify(crabAsset)}`);
}
if (coconutAsset.ready !== 'coconut-crab' || coconutAsset.visibleFallbacks !== 0) {
  throw new Error(`Detailed coconut-crab GLB did not replace the stand-in: ${JSON.stringify(coconutAsset)}`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify({
  assets,
  coastalFish: coastalState.marineLife.visibleFish,
  orca: orcaState.deepSeaLife.nearby.filter((creature) => creature.species === 'orca'),
  orcaOrientation,
  sharks: sharkState.deepSeaLife.nearby.filter((creature) => creature.species === 'sixgill-shark'),
  crabAsset,
  coconutAsset,
  errors,
}, null, 2));

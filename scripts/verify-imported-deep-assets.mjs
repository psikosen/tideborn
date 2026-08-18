import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const outputDir = new URL('../output/imported-deep-assets/', import.meta.url);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(process.env.TIDEBORN_URL ?? 'http://localhost:4173', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); document.querySelector('#start-btn')?.click(); });
await page.waitForTimeout(120);
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const coast = await state();

async function stage(species) {
  const location = await page.evaluate((targetSpecies) => {
    const game = window.__tidebornTest;
    const creature = game.importedDeepFauna.creatures.find((candidate) => candidate.alive && candidate.species === targetSpecies);
    const desiredDistance = targetSpecies === 'bloodfin-leviathan' ? 3.35 : 2.35;
    const probe = { id: 'asset-viewer', x: creature.x + desiredDistance, y: creature.y - 0.35, vx: 0, vy: 0, radiusX: 0.5, radiusY: 0.56 };
    const clear = game.importedDeepFauna.terrainCollision.nearestClear(probe, game.world, probe.x, probe.y, 5.5) ?? { x: creature.x, y: creature.y };
    game.player.x = clear.x;
    game.player.y = clear.y;
    game.player.vx = 0;
    game.player.vy = 0;
    game.player.camouflage = true;
    game.inventory.glowKelp = 1;
    game.cameraTarget.set(creature.x, creature.y);
    game.camera.position.x = creature.x;
    game.camera.position.y = creature.y;
    game.bannerUntil = 0;
    game.messageUntil = 0;
    document.querySelector('[data-ui="banner"]')?.classList.remove('show');
    window.advanceTime(180);
    return { id: creature.id, x: creature.x, y: creature.y };
  }, species);
  await page.waitForFunction((id) => {
    const game = window.__tidebornTest;
    const creature = game.importedDeepFauna.creatures.find((candidate) => candidate.id === id);
    return Boolean(creature?.visual.userData.creatureAssetReady);
  }, location.id, { timeout: 60000 });
  await page.evaluate((id) => {
    const game = window.__tidebornTest;
    game.bannerUntil = 0;
    game.messageUntil = 0;
    document.querySelector('[data-ui="banner"]')?.classList.remove('show');
    window.advanceTime(220);
    const visible = game.importedDeepFauna.creatures.find((candidate) => candidate.id === id);
    if (visible) {
      game.cameraTarget.set(visible.x, visible.y);
      game.camera.position.x = visible.x;
      game.camera.position.y = visible.y;
    }
    game.bannerUntil = 0;
    game.messageUntil = 0;
    document.querySelector('[data-ui="banner"]')?.classList.remove('show');
    game.updateUI();
    game.render();
  }, location.id);
  const snapshot = await state();
  await page.screenshot({ path: new URL(`${species}.png`, outputDir).pathname });
  return snapshot;
}

const species = [
  'twilight-emperor', 'midnight-angler', 'abyss-manta', 'abyss-spinefish',
  'cyan-abyss-hunter', 'hadal-stalker', 'bloodfin-leviathan',
];
const staged = {};
for (const name of species) staged[name] = await stage(name);

const foodWeb = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const predator = game.importedDeepFauna.creatures.find((creature) => creature.alive && creature.species === 'midnight-angler');
  const prey = game.deepSeaShoals.fish.find((fish) => fish.alive && fish.species === 'bristlemouth');
  predator.x = prey.x + 0.03;
  predator.y = prey.y;
  predator.homeX = predator.x;
  predator.homeY = predator.y;
  predator.inkedUntil = 0;
  predator.staggeredUntil = 0;
  game.player.x = prey.x + 7;
  game.player.y = prey.y;
  game.player.camouflage = true;
  game.deepSeaShoals.predatorCooldowns.delete(predator.id);
  window.advanceTime(1100);
  return game.deepSeaShoals.snapshot(game.player.x, game.player.y).foodWeb;
});

await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.player.x = -8;
  game.player.y = 2.8;
  game.player.vx = 0;
  game.player.vy = 0;
  game.cameraTarget.set(-8, 2.8);
  game.camera.position.x = -8;
  game.camera.position.y = 2.8;
  window.advanceTime(180);
});
const culled = await state();
const results = {
  coast: { fauna: coast.importedDeepFauna, assets: coast.creatureAssets },
  staged: Object.fromEntries(Object.entries(staged).map(([name, snapshot]) => [name, { fauna: snapshot.importedDeepFauna, assets: snapshot.creatureAssets }])),
  foodWeb,
  culled: { fauna: culled.importedDeepFauna, assets: culled.creatureAssets },
  errors,
};
await writeFile(new URL('states.json', outputDir), JSON.stringify(results, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (coast.importedDeepFauna.visibleCreatures !== 0 || coast.importedDeepFauna.simulatedCreatures !== 0) throw new Error('Imported deep fauna activated at the coast.');
if (coast.creatureAssets.requested.some((asset) => species.includes(asset))) throw new Error('Deep GLBs were eagerly requested at the coast.');
for (const name of species) {
  const snapshot = staged[name];
  const creature = snapshot.importedDeepFauna.nearby.find((candidate) => candidate.species === name);
  if (!creature?.assetReady) throw new Error(`Imported asset did not replace fallback: ${name}`);
  if (!creature.terrainClear) throw new Error(`Imported fauna overlaps granular terrain: ${name}`);
  if (!snapshot.creatureAssets.loaded.includes(name)) throw new Error(`Asset library did not report loaded: ${name}`);
}
if (!(foodWeb.predatorKills['midnight-angler>bristlemouth'] > 0)) throw new Error('Imported angler did not enter the shoal food web.');
if (culled.importedDeepFauna.visibleCreatures !== 0 || culled.importedDeepFauna.simulatedCreatures !== 0) throw new Error('Imported deep fauna did not proximity-cull at the coast.');
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ loaded: culled.creatureAssets.loaded, foodWeb, culling: culled.importedDeepFauna, errors }, null, 2));

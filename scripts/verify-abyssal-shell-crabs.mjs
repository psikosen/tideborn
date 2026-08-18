import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const output = new URL('../output/abyssal-shell-crabs/', import.meta.url);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(process.env.TIDEBORN_URL ?? 'http://localhost:4173', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.clear(); document.querySelector('#start-btn')?.click(); });
await page.waitForFunction(() => {
  const assets = window.__tidebornTest?.creatureAssets.snapshot();
  return assets?.loaded.includes('animated-shore-crab') && assets.loaded.includes('coconut-crab') && assets.loaded.includes('ilyoplax-mud-crab');
}, { timeout: 30000 });

const shell = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const scale = game.planetScale.state(0);
  return {
    radiusKm: scale.planet.radiusKm,
    maximumNavigableDepthKm: scale.planet.maximumNavigableDepthKm,
    interior: scale.planetInterior,
  };
});

const surface = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const crab = game.amphibiousCrabs.crabs.find((candidate) => candidate.species === 'shore-crab');
  game.player.x = crab.x + 1.1;
  game.player.y = crab.y + 0.35;
  game.player.vx = 0;
  game.player.vy = 0;
  game.cameraTarget.set(crab.x, crab.y + 0.7);
  game.camera.position.set(crab.x, crab.y + 0.7, 24);
  game.viewHeight = 8.5;
  game.resize();
  game.amphibiousCrabs.update(0.16, game.elapsed + 0.16, { x: game.player.x, y: game.player.y, vx: 0, concealed: false }, [
    ...game.marineLife.preyField().map((fish) => ({ ...fish, kind: 'fish' })),
    ...game.proceduralClams.preyField().map((clam) => ({ id: clam.id, x: clam.x, y: clam.y, kind: 'clam' })),
  ]);
  game.updateUI();
  game.mode = 'paused';
  game.render();
  return game.amphibiousCrabs.snapshot(game.player.x, game.player.y);
});
await page.waitForTimeout(180);
await page.screenshot({ path: new URL('amphibious-shore-crabs.png', output).pathname });

const interactions = await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.mode = 'playing';
  const clam = game.proceduralClams.preyField().find((candidate) => candidate.depthZone === 'reef');
  const predatoryCrab = game.amphibiousCrabs.crabs.find((candidate) => candidate.alive && candidate.species === 'shore-crab');
  predatoryCrab.x = clam.x;
  predatoryCrab.y = clam.y;
  predatoryCrab.homeX = clam.x;
  predatoryCrab.hunger = 0;
  const predationEvents = game.amphibiousCrabs.update(0.12, game.elapsed + 2, { x: clam.x + 3, y: clam.y, vx: 0, concealed: true }, [
    { id: clam.id, x: clam.x, y: clam.y, kind: 'clam' },
  ]);
  const clamEvent = predationEvents.find((event) => event.kind === 'predation');
  const consumed = clamEvent ? game.proceduralClams.consumeByPredator(clamEvent.preyId) : null;

  const female = game.amphibiousCrabs.crabs.find((candidate) => candidate.alive && candidate.species === 'mudflat-crab' && candidate.life.sex === 'female');
  const male = game.amphibiousCrabs.crabs.find((candidate) => candidate.alive && candidate.species === 'mudflat-crab' && candidate.life.sex === 'male');
  for (const crab of [female, male]) {
    crab.life.ageYears = crab.life.maturityYears + 0.5;
    crab.life.nextBreedingAgeYears = 0;
    crab.hunger = 95;
  }
  male.x = female.x + 0.2;
  male.y = female.y;
  game.amphibiousCrabs.nextBreedingCheck = 0;
  const beforeBreeding = game.amphibiousCrabs.snapshot(0, 0).population['mudflat-crab'];
  const breedingEvents = game.amphibiousCrabs.update(0.12, game.elapsed + 6, { x: -50, y: 10, vx: 0, concealed: true }, []);
  const afterBreeding = game.amphibiousCrabs.snapshot(0, 0).population['mudflat-crab'];

  const jetCrab = game.amphibiousCrabs.crabs.find((candidate) => candidate.alive && candidate.species === 'coconut-crab');
  const vxBeforeJet = jetCrab.vx;
  const jetAffected = game.amphibiousCrabs.applyJet(jetCrab.x - 0.4, jetCrab.y, { x: 1, y: 0, lengthSq: () => 1, clone: () => ({ normalize: () => ({ x: 1, y: 0 }) }) }, game.elapsed + 7, 1);
  const vxAfterJet = jetCrab.vx;

  game.player.x = jetCrab.x - 0.7;
  game.player.y = jetCrab.y;
  game.player.facing = 1;
  game.player.stamina = 100;
  const foodBefore = game.inventory.food;
  game.handleFishHunt();
  return {
    clamPredation: Boolean(clamEvent && consumed),
    beforeBreeding,
    afterBreeding,
    births: breedingEvents.filter((event) => event.kind === 'birth').length,
    jetAffected,
    vxBeforeJet,
    vxAfterJet,
    playerCrabFoodGain: game.inventory.food - foodBefore,
    message: game.message,
  };
});

const cave = await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.inventory.glowKelp = 2;
  game.bioluminescence.reconcile(2, []);
  game.player.x = 53.2;
  game.player.y = -106.7;
  game.player.vx = 0;
  game.player.vy = 0;
  game.depthState = game.depthAccess.sample(game.player.x, game.player.y, game.world.seaLevel, true);
  game.proceduralClams.update(game.elapsed, game.player.x, game.player.y);
  game.deepSeaShoals.update(0.16, game.elapsed + 8, { x: game.player.x, y: game.player.y, concealed: false }, []);
  game.creatureAssets.update(0.16);
  game.cameraTarget.set(game.player.x, game.player.y);
  game.camera.position.set(game.player.x, game.player.y, 24);
  game.viewHeight = 9.5;
  game.resize();
  game.updateDepthRendering();
  game.updateUI();
  game.bannerUntil = 0;
  game.ui.querySelector('[data-ui="banner"]')?.classList.remove('show');
  game.mode = 'paused';
  game.render();
  return {
    depth: game.depthState,
    clams: game.proceduralClams.snapshot(game.player.x, game.player.y),
    shoals: game.deepSeaShoals.snapshot(game.player.x, game.player.y),
  };
});
await page.waitForTimeout(180);
await page.screenshot({ path: new URL('megacave-clams-and-glassfish.png', output).pathname });

const assets = await page.evaluate(() => window.__tidebornTest.creatureAssets.snapshot());
const result = { shell, surface, interactions, cave, assets, errors };
await writeFile(new URL('results.json', output), `${JSON.stringify(result, null, 2)}\n`);
await writeFile(new URL('console-errors.json', output), `${JSON.stringify(errors, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(result, null, 2));

const layers = Object.fromEntries(shell.interior.layers.map((layer) => [layer.id, layer]));
if (layers.crust.thicknessKm !== 21 || layers['lower-mantle'].thicknessKm !== 945 || layers['abyssal-cave-shell'].thicknessKm !== 966) {
  throw new Error(`Interior reclamation is incorrect: ${JSON.stringify(shell.interior.layers)}`);
}
if (surface.visible < 1 || surface.onLand < 1 || surface.underwater < 1 || surface.culled < 1) {
  throw new Error(`Amphibious/culling state failed: ${JSON.stringify(surface)}`);
}
if (!interactions.clamPredation || interactions.births < 1 || interactions.afterBreeding <= interactions.beforeBreeding) {
  throw new Error(`Crab food web/lifecycle failed: ${JSON.stringify(interactions)}`);
}
if (interactions.jetAffected < 1 || interactions.vxAfterJet <= interactions.vxBeforeJet || interactions.playerCrabFoodGain < 1) {
  throw new Error(`Crab force/player hunt failed: ${JSON.stringify(interactions)}`);
}
if (cave.depth.band !== 'Abyssal megacave ocean' || cave.clams.nearby.length < 1 || cave.shoals.nearby.filter((fish) => fish.species === 'megacave-glassfish').length < 1) {
  throw new Error(`Megacave ecology failed: ${JSON.stringify(cave)}`);
}
for (const id of ['animated-shore-crab', 'coconut-crab', 'ilyoplax-mud-crab', 'survivor-octopus']) {
  if (!assets.loaded.includes(id)) throw new Error(`New asset did not load: ${id}`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

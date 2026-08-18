import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const output = new URL('../output/pelagic-predators-crabs/', import.meta.url);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(process.env.TIDEBORN_URL ?? 'http://localhost:4173', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.clear(); document.querySelector('#start-btn')?.click(); });
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

const pelagicBefore = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const orca = game.deepSeaLife.creatures.find((creature) => creature.alive && creature.species === 'orca');
  const prey = game.deepSeaShoals.fish.filter((fish) => fish.alive && (fish.species === 'silver-sprat' || fish.species === 'blue-mackerel'));
  game.inventory.glowKelp = 2;
  game.bioluminescence.reconcile(2, []);
  game.player.x = 24;
  game.player.y = -10;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.camouflage = true;
  game.player.gripping = true;
  game.cameraTarget.set(24, -10);
  game.camera.position.set(24, -10, 24);
  game.viewHeight = 14;
  game.resize();
  orca.x = 25.2;
  orca.y = -10.2;
  orca.homeX = 25.2;
  orca.homeY = -10.2;
  orca.satiatedUntil = 0;
  orca.feedingUntil = 0;
  orca.inkedUntil = 0;
  orca.staggeredUntil = 0;
  for (let index = 0; index < Math.min(18, prey.length); index += 1) {
    const fish = prey[index];
    fish.x = 25.7 + (index % 6) * 0.42;
    fish.y = -11.1 + Math.floor(index / 6) * 0.46;
    fish.homeX = fish.x;
    fish.homeY = fish.y;
    fish.vx = 0;
    fish.vy = 0;
  }
  window.advanceTime(120);
  return JSON.parse(window.render_game_to_text());
});
await page.screenshot({ path: new URL('open-ocean-school-and-orca-hunt.png', output).pathname });

await page.evaluate(() => window.advanceTime(1800));
const pelagicAfter = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

const predator = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const shark = game.deepSeaLife.creatures.find((creature) => creature.alive && creature.species === 'sixgill-shark');
  game.player.x = shark.x + 3.2;
  game.player.y = shark.y;
  game.player.vx = 1.4;
  game.player.vy = 0.3;
  game.player.camouflage = false;
  game.player.gripping = false;
  game.player.inkTime = 0;
  shark.inkedUntil = 0;
  shark.staggeredUntil = 0;
  shark.feedingUntil = 0;
  shark.satiatedUntil = 0;
  shark.attackCooldown = 0;
  game.cameraTarget.set(shark.x, shark.y);
  game.camera.position.set(shark.x, shark.y, 24);
  game.viewHeight = 12;
  game.resize();
  window.advanceTime(1600);
  game.bannerUntil = 0;
  game.messageUntil = 0;
  document.querySelector('[data-ui="banner"]')?.classList.remove('show');
  game.updateUI();
  game.render();
  return JSON.parse(window.render_game_to_text());
});
await page.screenshot({ path: new URL('sixgill-senses-and-attacks.png', output).pathname });

const crab = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const target = game.amphibiousCrabs.crabs.find((candidate) => candidate.alive && candidate.species === 'mudflat-crab');
  game.player.x = target.x + 0.8;
  game.player.y = target.y + 0.2;
  game.player.vx = 0;
  game.player.vy = 0;
  game.cameraTarget.set(target.x, target.y);
  game.camera.position.set(target.x, target.y, 24);
  game.amphibiousCrabs.update(0.12, game.elapsed + 0.12, { x: game.player.x, y: game.player.y, vx: 0, concealed: false }, []);
  return { id: target.id, species: target.species };
});
await page.waitForTimeout(300);
const crabAsset = await page.evaluate((id) => {
  const game = window.__tidebornTest;
  const target = game.amphibiousCrabs.crabs.find((candidate) => candidate.id === id);
  game.amphibiousCrabs.update(0.12, game.elapsed + 0.24, { x: game.player.x, y: game.player.y, vx: 0, concealed: false }, []);
  game.updateUI();
  game.render();
  let fallbackVisible = 0;
  target.visual.traverse((node) => { if (node.userData.assetFallback && node.visible) fallbackVisible += 1; });
  return {
    ready: target.visual.userData.creatureAssetReady,
    fallbackVisible,
    requested: target.visual.userData.assetRequested,
    optimization: game.creatureAssets.snapshot(),
  };
}, crab.id);
await page.screenshot({ path: new URL('supplied-mudflat-crab-asset.png', output).pathname });

const result = {
  openOcean: {
    visible: pelagicBefore.deepSeaShoals.visibleFish,
    nearbyPelagic: pelagicBefore.deepSeaShoals.nearby.filter((fish) => fish.depthBand === 'pelagic').length,
    population: {
      sprat: pelagicBefore.deepSeaShoals.activePopulation['silver-sprat'],
      mackerel: pelagicBefore.deepSeaShoals.activePopulation['blue-mackerel'],
    },
    predation: pelagicAfter.deepSeaShoals.foodWeb.recentPredation,
  },
  predator: {
    health: predator.survival.health,
    nearby: predator.deepSeaLife.nearby,
  },
  crabAsset,
  errors,
};
await writeFile(new URL('results.json', output), `${JSON.stringify(result, null, 2)}\n`);
await writeFile(new URL('console-errors.json', output), `${JSON.stringify(errors, null, 2)}\n`);
await browser.close();

if (result.openOcean.visible < 28 || result.openOcean.nearbyPelagic < 18) {
  throw new Error(`Open-ocean representative bubble is too sparse: ${JSON.stringify(result.openOcean)}`);
}
if (!result.openOcean.predation.some((event) => event.predator === 'orca' && (event.prey === 'silver-sprat' || event.prey === 'blue-mackerel'))) {
  throw new Error(`Orca did not consume pelagic prey: ${JSON.stringify(result.openOcean.predation)}`);
}
const alerted = result.predator.nearby.find((creature) => creature.species === 'sixgill-shark' && creature.targetId === 'player');
if (!alerted?.alertWaves || result.predator.health >= 100) {
  throw new Error(`Sixgill sensing/attack/alert chain failed: ${JSON.stringify(result.predator)}`);
}
if (crabAsset.ready !== 'ilyoplax-mud-crab' || crabAsset.fallbackVisible !== 0 || !crabAsset.requested) {
  throw new Error(`Supplied crab asset did not replace the stand-in: ${JSON.stringify(crabAsset)}`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify(result, null, 2));

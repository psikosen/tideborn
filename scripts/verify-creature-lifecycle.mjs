import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/creature-lifecycle/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); document.querySelector('#start-btn')?.click(); });
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).creatureAssets.loaded.length === 4, { timeout: 15000 });
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

// Founding adults have short first-courtship offsets so the player can witness
// reproduction during the slice. Keep deep predators briefly satiated so this
// lifecycle-focused check cannot lose the newborn family to valid food-web AI
// before the observation frame. Later generations use full species intervals.
await page.evaluate(() => {
  const game = window.__tidebornTest;
  for (const creature of game.deepSeaLife.creatures) {
    if (creature.species === 'orca' || creature.species === 'sixgill-shark') creature.satiatedUntil = game.elapsed + 16;
  }
});
await page.evaluate(() => window.advanceTime(12000));
const firstGeneration = await state();

// Observe a mixed adult/juvenile deep group without allowing the adults to
// switch from ecosystem targets to the player.
await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.player.x = 34;
  game.player.y = -24.5;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.camouflage = true;
  game.inventory.glowKelp = 1;
  game.cameraTarget.set(34, -24.5);
  game.camera.position.x = 34;
  game.camera.position.y = -24.5;
  game.bannerUntil = 0;
  document.querySelector('[data-ui="banner"]')?.classList.remove('show');
  window.advanceTime(180);
});
const sharkView = await state();
const sharkFamily = await page.evaluate(() => {
  const game = window.__tidebornTest;
  return game.deepSeaLife.creatures
    .filter((creature) => creature.alive && creature.species === 'sixgill-shark')
    .map((creature) => ({
      id: creature.id,
      species: creature.species,
      ageYears: creature.life.ageYears,
      lifespanYears: creature.life.lifespanYears,
      lifeStage: game.deepSeaLife.lifecycle.stage(creature.life),
      generation: creature.life.generation,
      parentIds: creature.life.parentIds,
      sizeMeters: 4.35 * game.deepSeaLife.lifecycle.currentScale(creature.life),
    }));
});
await page.waitForTimeout(100);
await page.screenshot({ path: new URL('varied-shark-family.png', outputDir).pathname });

// Return to the reef to see the smaller generation-one fish and anemone buds.
await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.player.x = -2.2;
  game.player.y = 1.4;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.camouflage = false;
  game.inventory.glowKelp = 0;
  game.cameraTarget.set(-2.2, 1.4);
  game.camera.position.x = -2.2;
  game.camera.position.y = 1.4;
  window.advanceTime(180);
});
const reefView = await state();
await page.waitForTimeout(100);
await page.screenshot({ path: new URL('reef-generations.png', outputDir).pathname });

// Advance several compressed ecology years. This must produce natural turnover
// in short-lived fish/colonies while long-lived sharks continue aging normally.
await page.evaluate(() => window.advanceTime(90000));
const turnover = await state();
await writeFile(new URL('states.json', outputDir), JSON.stringify({ firstGeneration, sharkView, sharkFamily, reefView, turnover }, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

const sharks = sharkFamily;
const sharkSizes = sharks.map((shark) => shark.sizeMeters);
if (sharks.length < 3 || Math.max(...sharkSizes) - Math.min(...sharkSizes) < 0.5) {
  throw new Error(`Sharks do not show meaningful individual size variation: ${JSON.stringify(sharkSizes)}`);
}
const juvenileShark = sharks.find((shark) => shark.lifeStage === 'juvenile' && shark.generation >= 1 && shark.parentIds.length === 2);
if (!juvenileShark) throw new Error(`No parented juvenile shark was born: ${JSON.stringify(sharks)}`);
if (!sharks.every((shark) => shark.ageYears >= 0 && shark.lifespanYears >= 55)) throw new Error(`Shark lifespan data missing: ${JSON.stringify(sharks)}`);

const reefFish = reefView.marineLife.fish;
const juvenileFish = reefFish.find((fish) => fish.lifeStage === 'juvenile' && fish.generation >= 1 && fish.parentIds.length === 2);
if (!juvenileFish) throw new Error(`No parented juvenile reef fish was born: ${JSON.stringify(reefFish)}`);
if (Math.max(...reefFish.map((fish) => fish.sizeMeters)) - Math.min(...reefFish.map((fish) => fish.sizeMeters)) < 0.25) {
  throw new Error('Reef fish do not visibly vary in size.');
}
if (!reefView.marineLife.anemones.some((anemone) => anemone.generation >= 1 && anemone.lifeStage === 'juvenile')) {
  throw new Error(`No juvenile anemone bud was produced: ${JSON.stringify(reefView.marineLife.anemones)}`);
}
if (reefView.surfaceWildlife.lifecycle.births < 1 || firstGeneration.deepSeaLife.lifecycle.births < 1 || firstGeneration.marineLife.lifecycle.births < 1) {
  throw new Error('One or more wildlife layers did not reproduce.');
}
if (turnover.deepSeaLife.lifecycle.naturalDeaths < 1 || turnover.marineLife.lifecycle.naturalDeaths < 1 || turnover.surfaceWildlife.lifecycle.naturalDeaths < 1) {
  throw new Error(`Natural lifecycle turnover missing: ${JSON.stringify({ deep: turnover.deepSeaLife.lifecycle, marine: turnover.marineLife.lifecycle, surface: turnover.surfaceWildlife.lifecycle })}`);
}
if (Object.values(turnover.surfaceWildlife.population).some((population) => population < 1)) {
  throw new Error(`A surface breeding population collapsed during the turnover test: ${JSON.stringify(turnover.surfaceWildlife.population)}`);
}
if (turnover.creatureAssets.instances > 30) {
  throw new Error(`Lifecycle pooling did not bound model instances: ${JSON.stringify(turnover.creatureAssets)}`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify({
  sharkSizes,
  juvenileShark,
  marineLifecycle: turnover.marineLife.lifecycle,
  deepLifecycle: turnover.deepSeaLife.lifecycle,
  surfaceLifecycle: turnover.surfaceWildlife.lifecycle,
  populations: {
    deep: turnover.deepSeaLife.activePopulation,
    reefFish: turnover.marineLife.livingFish,
    surface: turnover.surfaceWildlife.population,
  },
  errors,
}, null, 2));

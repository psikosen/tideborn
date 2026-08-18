import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const outputDir = new URL('../output/deep-sea-shoals/', import.meta.url);
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
await page.evaluate(() => window.advanceTime(12000));
const ecology = await state();
async function stageAtSpecies(species, screenshotName) {
  await page.evaluate((targetSpecies) => {
    const game = window.__tidebornTest;
    const fish = game.deepSeaShoals.fish.find((candidate) => candidate.alive && candidate.species === targetSpecies);
    game.player.x = fish.x;
    game.player.y = fish.y;
    game.player.vx = 0;
    game.player.vy = 0;
    game.player.camouflage = true;
    game.inventory.glowKelp = 1;
    game.cameraTarget.set(fish.x, fish.y);
    game.camera.position.x = fish.x;
    game.camera.position.y = fish.y;
    game.bannerUntil = 0;
    document.querySelector('[data-ui="banner"]')?.classList.remove('show');
    window.advanceTime(240);
  }, species);
  await page.evaluate(() => {
    const game = window.__tidebornTest;
    game.bannerUntil = 0;
    game.messageUntil = 0;
    document.querySelector('[data-ui="banner"]')?.classList.remove('show');
    window.advanceTime(16);
  });
  const snapshot = await state();
  await page.screenshot({ path: new URL(screenshotName, outputDir).pathname });
  return snapshot;
}

const twilight = await stageAtSpecies('lanternfish', 'twilight-lanternfish.png');
const hadal = await stageAtSpecies('hadal-snailfish', 'hadal-snailfish.png');

const predation = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const shark = game.deepSeaLife.creatures.find((creature) => creature.alive && creature.species === 'sixgill-shark');
  const fish = game.deepSeaShoals.fish.find((candidate) => candidate.alive && candidate.species === 'lanternfish');
  shark.inkedUntil = 0;
  shark.staggeredUntil = 0;
  fish.x = shark.x + 0.04;
  fish.y = shark.y;
  fish.homeX = fish.x;
  fish.homeY = fish.y;
  game.player.x = shark.x + 6;
  game.player.y = shark.y;
  game.player.camouflage = true;
  game.deepSeaShoals.predatorCooldowns.delete(shark.id);
  // Predation now has a readable capture-and-swallow phase instead of an
  // instantaneous deletion, so let that animation complete.
  window.advanceTime(1100);
  return game.deepSeaShoals.snapshot(game.player.x, game.player.y).foodWeb;
});

const hunt = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const fish = game.deepSeaShoals.fish.find((candidate) => candidate.alive && candidate.species === 'bristlemouth');
  return game.deepSeaShoals.hunt({ x: fish.x - 0.1, y: fish.y, facing: 1 }, false);
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

const results = { coast: coast.deepSeaShoals, ecology: ecology.deepSeaShoals, twilight: twilight.deepSeaShoals, hadal: hadal.deepSeaShoals, predation, hunt, culled: culled.deepSeaShoals, errors };
await writeFile(new URL('states.json', outputDir), JSON.stringify(results, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (coast.deepSeaShoals.livingFish < 100) throw new Error('Deep regional population is too sparse.');
if (coast.deepSeaShoals.visibleFish !== 0 || coast.deepSeaShoals.simulatedFish !== 0) throw new Error('Deep fish were active near the coast.');
if (ecology.deepSeaShoals.lifecycle.births < 4 || ecology.deepSeaShoals.visibleFish !== 0) throw new Error('Offscreen deep-fish breeding did not progress as a regional summary.');
for (const species of ['lanternfish', 'bristlemouth', 'hatchetfish', 'hadal-snailfish']) {
  if (!coast.deepSeaShoals.activePopulation[species]) throw new Error(`Missing deep-fish species: ${species}`);
}
if (twilight.deepSeaShoals.visibleFish < 8 || twilight.deepSeaShoals.simulatedFish < twilight.deepSeaShoals.visibleFish) throw new Error('Twilight shoal did not stream in densely.');
if (!twilight.deepSeaShoals.nearby.every((fish) => fish.terrainClear)) throw new Error('A twilight fish overlaps terrain.');
if (!hadal.deepSeaShoals.nearby.some((fish) => fish.species === 'hadal-snailfish')) throw new Error('Hadal snailfish did not materialize.');
if (!hadal.deepSeaShoals.nearby.every((fish) => fish.terrainClear)) throw new Error('A hadal fish overlaps terrain.');
if (!Object.values(predation.predatorKills).some((kills) => kills > 0)) throw new Error('Deep predator did not consume streamed fish.');
if (!hunt.caught) throw new Error('Player could not hunt deep-sea fish.');
if (culled.deepSeaShoals.visibleFish !== 0 || culled.deepSeaShoals.simulatedFish !== 0 || culled.deepSeaShoals.livingFish < 100) throw new Error('Deep fish population did not cull cleanly offscreen.');
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify(results, null, 2));

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/fish-terrain-density/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); document.querySelector('#start-btn')?.click(); });
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).creatureAssets.loaded.length === 4, { timeout: 20000 });

// Let the starting shoals unpack and find complete-body clearance around the
// procedural reef contour.
await page.evaluate(() => window.advanceTime(1200));
const initial = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const live = game.marineLife.fish.filter((fish) => fish.alive);
  const local = live.filter((fish) => Math.abs(fish.x - game.player.x) <= 16 && Math.abs(fish.y - game.player.y) <= 11);
  const embedded = local
    .filter((fish) => !game.marineLife.terrainCollision.isClear(game.marineLife.fishTerrainBody(fish), game.world))
    .map((fish) => fish.id);
  return {
    livingFish: live.length,
    simulatedFish: local.length,
    deferredFish: live.length - local.length,
    embedded,
    terrainCollision: game.marineLife.terrainCollision.snapshot(),
    creatureAssets: game.creatureAssets.snapshot(),
  };
});

// Put eight fish well inside the sloped seabed. This exercises the recovery
// path used after erosion, collapse, or an unlucky streamed-chunk spawn.
await page.evaluate(() => {
  const game = window.__tidebornTest;
  const fish = game.marineLife.fish.filter((candidate) => candidate.alive).slice(0, 8);
  fish.forEach((candidate, index) => Object.assign(candidate, {
    x: -0.7 + index * 0.2,
    y: -1.15 - (index % 2) * 0.12,
    vx: index % 2 ? 0.42 : -0.42,
    vy: -0.08,
    capturedBy: null,
  }));
  game.player.x = -4;
  game.player.y = 1.7;
  game.player.vx = 0;
  game.player.vy = 0;
  window.advanceTime(650);
  game.bannerUntil = 0;
  game.cameraTarget.set(0, 0.5);
  game.camera.position.x = 0;
  game.camera.position.y = 0.5;
  game.render();
});

const recovered = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const tested = game.marineLife.fish.filter((candidate) => candidate.alive).slice(0, 8);
  return {
    tested: tested.map((fish) => ({
      id: fish.id,
      x: Number(fish.x.toFixed(3)),
      y: Number(fish.y.toFixed(3)),
      clear: game.marineLife.terrainCollision.isClear(game.marineLife.fishTerrainBody(fish), game.world),
    })),
    livingFish: game.marineLife.fish.filter((fish) => fish.alive).length,
    terrainCollision: game.marineLife.terrainCollision.snapshot(),
    state: JSON.parse(window.render_game_to_text()).marineLife,
  };
});
await page.waitForTimeout(100);
await page.screenshot({ path: new URL('dense-reef-clearance.png', outputDir).pathname });

// Run a longer natural school pass and ensure no fish can drift into the live
// matter contour even while body collision repeatedly redistributes the shoal.
await page.evaluate(() => window.advanceTime(5500));
const sustained = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const live = game.marineLife.fish.filter((fish) => fish.alive);
  const embedded = live
    .filter((fish) => !game.marineLife.terrainCollision.isClear(game.marineLife.fishTerrainBody(fish), game.world))
    .map((fish) => fish.id);
  game.cameraTarget.set(3, -0.5);
  game.camera.position.x = 3;
  game.camera.position.y = -0.5;
  game.render();
  return {
    livingFish: live.length,
    embedded,
    terrainCollision: game.marineLife.terrainCollision.snapshot(),
    bodyCollision: game.marineLife.collision.snapshot(),
  };
});
await page.waitForTimeout(100);
await page.screenshot({ path: new URL('dense-reef-sustained.png', outputDir).pathname });

const culling = await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.player.x = 34;
  game.player.y = -24.5;
  game.player.vx = 0;
  game.player.vy = 0;
  window.advanceTime(300);
  const away = game.marineLife.snapshot(game.player.x, game.player.y);
  const visibleDetailedAway = game.marineLife.fish.filter((fish) => fish.alive && fish.shoalInstance === null && fish.visual.visible).length;
  game.player.x = 0;
  game.player.y = 1;
  game.player.vx = 0;
  game.player.vy = 0;
  window.advanceTime(300);
  const returned = game.marineLife.snapshot(game.player.x, game.player.y);
  return {
    away: { livingFish: away.livingFish, visibleFish: away.visibleFish, simulatedFish: away.simulatedFish, visibleDetailed: visibleDetailedAway },
    returned: { livingFish: returned.livingFish, visibleFish: returned.visibleFish, simulatedFish: returned.simulatedFish },
  };
});

const result = { initial, recovered, sustained, culling, errors };
await writeFile(new URL('results.json', outputDir), JSON.stringify(result, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (initial.livingFish < 72) throw new Error(`Reef is not densely populated: ${JSON.stringify(initial)}`);
if (initial.embedded.length) throw new Error(`Initial fish intersect terrain: ${JSON.stringify(initial.embedded)}`);
if (recovered.tested.some((fish) => !fish.clear)) throw new Error(`Forced fish were not rescued: ${JSON.stringify(recovered.tested)}`);
if (recovered.terrainCollision.totalRescues < 8) throw new Error(`Terrain rescue telemetry missed forced intersections: ${JSON.stringify(recovered.terrainCollision)}`);
if (sustained.embedded.length) throw new Error(`Fish entered terrain during sustained schooling: ${JSON.stringify(sustained.embedded)}`);
if (sustained.livingFish < 60) throw new Error(`Dense school collapsed during normal ecology: ${JSON.stringify(sustained)}`);
if (culling.away.livingFish < 60 || culling.away.visibleFish !== 0 || culling.away.simulatedFish !== 0 || culling.away.visibleDetailed !== 0) {
  throw new Error(`Distant reef representatives were not culled: ${JSON.stringify(culling)}`);
}
if (culling.returned.visibleFish < 50) throw new Error(`Local school did not reactivate on return: ${JSON.stringify(culling)}`);
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify(result, null, 2));

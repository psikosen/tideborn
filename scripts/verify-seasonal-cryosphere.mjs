import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const url = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const output = new URL('../output/seasonal-cryosphere/', import.meta.url);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(650);
await page.evaluate(() => {
  localStorage.clear();
  document.querySelector('#start-btn')?.click();
});
await page.waitForTimeout(120);
const temperateSummer = await state();

await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.elapsed = 289.2;
  game.player.x = -53.5;
  game.player.y = 3.0;
  game.player.vx = 0;
  game.player.vy = 0;
  game.cameraTarget.set(-53.5, 3.3);
  game.camera.position.set(-53.5, 3.3, 24);
  window.advanceTime(750);
});
await page.waitForTimeout(220);
const frozenOcean = await state();
await page.screenshot({ path: new URL('ice-current-storm-season.png', output).pathname, fullPage: true });

const physicalIce = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const entries = [...game.cryosphere.ownedIce.values()];
  const nearest = entries.sort((a, b) => {
    const wa = game.world.cellToWorld(a.x, a.y);
    const wb = game.world.cellToWorld(b.x, b.y);
    return Math.abs(wa.x + 53.5) - Math.abs(wb.x + 53.5);
  })[0];
  if (!nearest) return null;
  const world = game.world.cellToWorld(nearest.x, nearest.y);
  return {
    x: world.x,
    y: world.y,
    material: game.world.getCellMaterial(nearest.x, nearest.y),
    solid: game.world.isSolid(world.x, world.y),
  };
});

await page.evaluate(() => {
  const game = window.__tidebornTest;
  const snowCell = [...game.cryosphere.ownedSnow.values()][0];
  if (!snowCell) return;
  const world = game.world.cellToWorld(snowCell.x, snowCell.y);
  game.player.x = world.x;
  game.player.y = world.y + 1.1;
  game.player.vx = 0;
  game.player.vy = 0;
  game.cameraTarget.set(world.x, world.y + 1.2);
  game.camera.position.set(world.x, world.y + 1.2, 24);
  window.advanceTime(650);
});
await page.waitForTimeout(180);
const snowyLand = await state();
const physicalSnow = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const cell = [...game.cryosphere.ownedSnow.values()][0];
  if (!cell) return null;
  const world = game.world.cellToWorld(cell.x, cell.y);
  return {
    x: world.x,
    y: world.y,
    material: game.world.getCellMaterial(cell.x, cell.y),
    solid: game.world.isSolid(world.x, world.y),
  };
});
await page.screenshot({ path: new URL('snow-covered-cold-island.png', output).pathname, fullPage: true });

await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.player.x = -8;
  game.player.y = 3.1;
  game.cameraTarget.set(-8, 3.1);
  game.camera.position.set(-8, 3.1, 24);
  window.advanceTime(650);
});
const temperateStormSeason = await state();

const brokenIce = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const cell = [...game.cryosphere.ownedIce.values()][0];
  if (!cell) return null;
  const world = game.world.cellToWorld(cell.x, cell.y);
  const before = game.cryosphere.snapshot().global.frozenSurfaceCells;
  const dig = game.world.dig(world.x, world.y, 0.12, 1, false);
  window.advanceTime(700);
  return { dig, before, after: game.cryosphere.snapshot().global.frozenSurfaceCells, broken: game.cryosphere.snapshot().global.brokenIceColumns };
});

await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.elapsed = 10;
  game.player.x = -53.5;
  game.player.y = 3.1;
  window.advanceTime(700);
});
const summerMelt = await state();

const results = { temperateSummer, frozenOcean, physicalIce, snowyLand, physicalSnow, temperateStormSeason, brokenIce, summerMelt, errors };
await writeFile(new URL('states.json', output), JSON.stringify(results, null, 2));
await writeFile(new URL('console-errors.json', output), JSON.stringify(errors, null, 2));
await browser.close();

if (temperateSummer.cryosphere.global.frozenSurfaceCells !== 0 || temperateSummer.cryosphere.global.snowCells !== 0) {
  throw new Error(`Late summer unexpectedly began frozen: ${JSON.stringify(temperateSummer.cryosphere)}`);
}
if (frozenOcean.season.id !== 'storm-season'
  || frozenOcean.cryosphere.local.province !== 'ice-current'
  || frozenOcean.cryosphere.local.airTemperatureC >= 0
  || frozenOcean.cryosphere.global.frozenSurfaceCells <= 0
  || frozenOcean.cryosphere.global.snowCells <= 0
  || frozenOcean.cryosphere.local.snowfallIntensity <= 0.1) {
  throw new Error(`Cold province did not freeze and snow: ${JSON.stringify(frozenOcean.cryosphere)}`);
}
if (!physicalIce || physicalIce.material !== 16 || !physicalIce.solid) throw new Error(`Sea ice is not a physical solid cell: ${JSON.stringify(physicalIce)}`);
if (!physicalSnow || physicalSnow.material !== 17 || !physicalSnow.solid) throw new Error(`Snow is not a physical solid cell: ${JSON.stringify(physicalSnow)}`);
if (snowyLand.cryosphere.local.province === 'temperate-current' || !snowyLand.cryosphere.local.snowCovered) {
  throw new Error(`Cold land did not report snow cover: ${JSON.stringify(snowyLand.cryosphere.local)}`);
}
if (temperateStormSeason.cryosphere.local.coldness > 0.08
  || temperateStormSeason.cryosphere.local.surfaceFrozen
  || temperateStormSeason.cryosphere.local.snowfallIntensity > 0.02) {
  throw new Error(`Temperate coast froze during the same season: ${JSON.stringify(temperateStormSeason.cryosphere.local)}`);
}
if (!brokenIce || brokenIce.dig.removed <= 0 || brokenIce.after >= brokenIce.before || brokenIce.broken <= 0) {
  throw new Error(`Broken ice immediately re-froze or resisted digging: ${JSON.stringify(brokenIce)}`);
}
if (summerMelt.cryosphere.global.frozenSurfaceCells !== 0 || summerMelt.cryosphere.global.snowCells !== 0) {
  throw new Error(`Seasonal material did not melt in summer: ${JSON.stringify(summerMelt.cryosphere.global)}`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify({
  coldProvince: frozenOcean.cryosphere,
  physicalIce,
  physicalSnow,
  temperateAtSameTime: temperateStormSeason.cryosphere.local,
  brokenIce,
  summerMelt: summerMelt.cryosphere.global,
  errors,
}, null, 2));

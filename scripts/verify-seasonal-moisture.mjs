import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const url = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const output = new URL('../output/seasonal-moisture/', import.meta.url);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.clear();
  document.querySelector('#start-btn')?.click();
});
await page.waitForTimeout(500);

const comparison = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const sample = (elapsed, options = {}) => game.seasonalMoisture.sample({
    season: game.seasonSystem.sample(elapsed),
    underwater: false,
    exposedToAir: true,
    sheltered: false,
    stormStrength: 0,
    snowfallIntensity: 0,
    touchingSnow: false,
    touchingIce: false,
    ...options,
  });
  return {
    lateSummer: sample(18),
    autumn: sample(166),
    stormRain: sample(273, { stormStrength: 0.9 }),
    winterSnow: sample(309, { snowfallIntensity: 0.65, touchingSnow: true }),
    winterIce: sample(309, { snowfallIntensity: 0.45, touchingIce: true }),
    humidDen: sample(166, { sheltered: true }),
    underwater: sample(18, { underwater: true, exposedToAir: false }),
  };
});

const integration = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const run = (elapsed, storm) => {
    game.elapsed = elapsed;
    game.player.x = -22;
    game.player.y = 9.2;
    game.player.underwater = false;
    game.survival.moisture = 50;
    const before = game.survival.moisture;
    game.updateSurvival(10, storm);
    return { before, after: game.survival.moisture, environment: { ...game.moistureEnvironment } };
  };
  return {
    lateSummer: run(18, 0),
    autumn: run(166, 0),
    stormRain: run(273, 0.9),
  };
});

await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.elapsed = 273;
  game.player.x = -22;
  game.player.y = 9.2;
  game.player.underwater = false;
  game.survival.moisture = 54;
  game.updateSurvival(2, 0.9);
  game.cameraTarget.set(-22, 7.2);
  game.camera.position.set(-22, 7.2, 24);
  game.updateWeather(0.9);
  game.updateUI();
  game.mode = 'paused';
  game.render();
});
await page.waitForTimeout(180);
await page.screenshot({ path: new URL('storm-rain-rehydration.png', output).pathname, fullPage: true });

const winterContact = await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.elapsed = 309;
  const season = game.seasonSystem.sample(game.elapsed);
  game.cryosphere.update({
    elapsed: game.elapsed,
    storm: 0,
    seaLevel: game.world.seaLevel,
    playerX: -53.5,
    playerY: 4.8,
    cameraX: -53.5,
    cameraY: 4.8,
    season,
  });
  const snowCell = [...game.cryosphere.ownedSnow.values()][0];
  if (!snowCell) return null;
  const world = game.world.cellToWorld(snowCell.x, snowCell.y);
  game.player.x = world.x;
  game.player.y = world.y + game.player.radius * 0.92;
  game.player.underwater = false;
  game.survival.moisture = 50;
  const before = game.survival.moisture;
  game.updateSurvival(10, 0);
  game.cameraTarget.set(world.x, world.y + 1.1);
  game.camera.position.set(world.x, world.y + 1.1, 24);
  game.updateWeather(0);
  game.updateUI();
  game.render();
  return { before, after: game.survival.moisture, environment: { ...game.moistureEnvironment }, world };
});
await page.waitForTimeout(180);
await page.screenshot({ path: new URL('winter-snow-moisture.png', output).pathname, fullPage: true });

const ui = await page.evaluate(() => ({
  moistureLabel: document.querySelector('.vital-row.moisture > span')?.textContent,
  trend: document.querySelector('.vital-row.moisture > span')?.dataset.trend,
  title: document.querySelector('.vital-row.moisture')?.title,
  state: JSON.parse(window.render_game_to_text()).seasonalMoisture,
}));
const result = { comparison, integration, winterContact, ui, errors };
await writeFile(new URL('results.json', output), `${JSON.stringify(result, null, 2)}\n`);
await writeFile(new URL('console-errors.json', output), `${JSON.stringify(errors, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(result, null, 2));

if (!(comparison.lateSummer.netRatePerSecond < comparison.autumn.netRatePerSecond && comparison.autumn.netRatePerSecond < 0)) {
  throw new Error('Late summer should dry faster than autumn.');
}
if (comparison.stormRain.netRatePerSecond <= 0 || comparison.winterSnow.netRatePerSecond <= 0) {
  throw new Error('Rain and direct snow contact should restore moisture.');
}
if (!(comparison.humidDen.evaporationPerSecond < comparison.autumn.evaporationPerSecond)) {
  throw new Error('A sheltered humid den should slow evaporation.');
}
if (comparison.underwater.netRatePerSecond !== 5) throw new Error('Underwater saturation rate changed unexpectedly.');
if (!(integration.lateSummer.after < integration.autumn.after && integration.stormRain.after > integration.stormRain.before)) {
  throw new Error('Integrated survival moisture did not follow the seasonal model.');
}
if (!winterContact || winterContact.after <= winterContact.before || winterContact.environment.surfaceContact !== 'snow') {
  throw new Error('Physical snow contact did not rehydrate the octopus.');
}
if (ui.trend !== '↑' || errors.length > 0) throw new Error(`Moisture UI/errors failed: ${JSON.stringify({ ui, errors })}`);

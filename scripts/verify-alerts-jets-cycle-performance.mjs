import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const outputDir = new URL('../output/alerts-jets-performance/', import.meta.url);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(process.env.TIDEBORN_URL ?? 'http://localhost:4173', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); document.querySelector('#start-btn')?.click(); });
await page.waitForTimeout(140);
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

const initial = await state();
const waterBefore = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const fish = game.marineLife.fish.find((candidate) => candidate.alive && !candidate.capturedBy);
  game.player.x = -8.35;
  game.player.y = 3.2;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.facing = 1;
  game.player.jetCharges = 3;
  fish.x = game.player.x + 0.8;
  fish.y = game.player.y;
  fish.vx = 0;
  fish.vy = 0;
  game.cameraTarget.set(game.player.x, game.player.y);
  game.camera.position.x = game.player.x;
  game.camera.position.y = game.player.y;
  window.advanceTime(18);
  return { playerX: game.player.x, fishId: fish.id, fishX: fish.x };
});
await page.keyboard.down('ArrowRight');
await page.keyboard.down('ShiftLeft');
await page.evaluate(() => window.advanceTime(34));
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('ArrowRight');
await page.evaluate(() => window.advanceTime(120));
const waterAfter = await page.evaluate((fishId) => {
  const game = window.__tidebornTest;
  const fish = game.marineLife.fish.find((candidate) => candidate.id === fishId);
  return { playerX: game.player.x, fishX: fish.x, fishVx: fish.vx, lastJetStrength: game.player.lastJetStrength };
}, waterBefore.fishId);

const landBefore = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const targetX = -15;
  let surfaceY = 15.9;
  for (let y = 15.9; y > -4; y -= 0.08) {
    if (game.world.isSolid(targetX, y)) { surfaceY = y; break; }
  }
  game.player.x = targetX;
  game.player.y = surfaceY + 2.4;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.facing = 1;
  game.player.onGround = false;
  game.player.jetCharges = 3;
  game.player.jetCooldown = 0;
  const snake = game.creatures.find((creature) => creature.alive && creature.kind === 'snake');
  snake.x = targetX + 1;
  snake.y = surfaceY + 2.4;
  game.cameraTarget.set(targetX, surfaceY + 1.1);
  game.camera.position.x = targetX;
  game.camera.position.y = surfaceY + 1.1;
  window.advanceTime(18);
  return { playerX: game.player.x, snakeId: snake.id, snakeX: snake.x };
});
await page.keyboard.down('ArrowRight');
await page.keyboard.down('ShiftLeft');
await page.evaluate(() => window.advanceTime(34));
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('ArrowRight');
await page.evaluate(() => window.advanceTime(120));
const landAfter = await page.evaluate((snakeId) => {
  const game = window.__tidebornTest;
  const snake = game.creatures.find((creature) => creature.id === snakeId);
  game.bannerUntil = 0;
  game.updateUI();
  game.render();
  return { playerX: game.player.x, snakeX: snake.x, technique: game.player.technique, lastJetStrength: game.player.lastJetStrength };
}, landBefore.snakeId);
await page.screenshot({ path: new URL('half-strength-land-jet.png', outputDir).pathname });

const orcaState = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const orca = game.deepSeaLife.creatures.find((creature) => creature.alive && creature.species === 'orca');
  orca.inkedUntil = 0;
  orca.staggeredUntil = 0;
  orca.feedingUntil = 0;
  orca.satiatedUntil = 0;
  game.player.x = orca.x + 3;
  game.player.y = orca.y;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.camouflage = false;
  game.inventory.glowKelp = 1;
  game.cameraTarget.set(orca.x, orca.y);
  game.camera.position.x = orca.x;
  game.camera.position.y = orca.y;
  window.advanceTime(260);
  game.bannerUntil = 0;
  game.messageUntil = 0;
  document.querySelector('[data-ui="banner"]')?.classList.remove('show');
  game.updateUI();
  game.render();
  return JSON.parse(window.render_game_to_text());
});
await page.screenshot({ path: new URL('orca-player-alert-waves.png', outputDir).pathname });

const importedState = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const hunter = game.importedDeepFauna.creatures.find((creature) => creature.alive && creature.species === 'midnight-angler');
  hunter.inkedUntil = 0;
  hunter.staggeredUntil = 0;
  hunter.feedingUntil = 0;
  game.player.x = hunter.x + 2.4;
  game.player.y = hunter.y;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.camouflage = false;
  game.cameraTarget.set(hunter.x, hunter.y);
  game.camera.position.x = hunter.x;
  game.camera.position.y = hunter.y;
  window.advanceTime(260);
  game.bannerUntil = 0;
  game.messageUntil = 0;
  document.querySelector('[data-ui="banner"]')?.classList.remove('show');
  game.updateUI();
  game.render();
  return JSON.parse(window.render_game_to_text());
});
await page.screenshot({ path: new URL('deep-fish-player-alert-waves.png', outputDir).pathname });

const result = { initial: { time: initial.time, performance: initial.performance }, waterBefore, waterAfter, landBefore, landAfter, orca: orcaState.deepSeaLife.nearby, imported: importedState.importedDeepFauna.nearby, errors };
await writeFile(new URL('states.json', outputDir), JSON.stringify(result, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (initial.time.dayLengthSeconds !== 90 || initial.time.stormAt !== 243) throw new Error(`Day/storm timing did not expand: ${JSON.stringify(initial.time)}`);
if (initial.performance.drawingBuffer.pixels > initial.performance.drawingBuffer.budget || initial.performance.pixelRatio > 1.5) throw new Error(`Drawing-buffer budget exceeded: ${JSON.stringify(initial.performance)}`);
if (waterAfter.playerX <= waterBefore.playerX + 0.1 || Math.abs(waterAfter.fishX - waterBefore.fishX) < 0.03 || waterAfter.lastJetStrength !== 1) throw new Error(`Water jet failed: ${JSON.stringify({ waterBefore, waterAfter })}`);
if (landAfter.playerX <= landBefore.playerX + 0.2 || Math.abs(landAfter.snakeX - landBefore.snakeX) < 0.015 || landAfter.lastJetStrength !== 0.5 || landAfter.technique !== 'land jet') throw new Error(`Land jet failed: ${JSON.stringify({ landBefore, landAfter })}`);
const alertedOrca = orcaState.deepSeaLife.nearby.find((creature) => creature.species === 'orca');
if (!alertedOrca?.alertWaves || alertedOrca.targetId !== 'player') throw new Error(`Orca alert missing: ${JSON.stringify(alertedOrca)}`);
const alertedHunter = importedState.importedDeepFauna.nearby.find((creature) => creature.species === 'midnight-angler');
if (!alertedHunter?.alertWaves || alertedHunter.targetId !== 'player') throw new Error(`Imported predator alert missing: ${JSON.stringify(alertedHunter)}`);
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ time: initial.time, performance: initial.performance, waterJet: { before: waterBefore, after: waterAfter }, landJet: { before: landBefore, after: landAfter }, orca: alertedOrca, hunter: alertedHunter, errors }, null, 2));

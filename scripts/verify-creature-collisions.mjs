import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/creature-collisions/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); document.querySelector('#start-btn')?.click(); });
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).creatureAssets.loaded.length === 4, { timeout: 15000 });

// Force two differently sized sixgills into the same space. Their homes are
// moved with them so this measures collision separation rather than leash AI.
await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.player.x = 30;
  game.player.y = -26;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.camouflage = true;
  game.inventory.glowKelp = 1;
  const first = game.deepSeaLife.creatures.find((creature) => creature.id === 'sixgill-twilight');
  const second = game.deepSeaLife.creatures.find((creature) => creature.id === 'sixgill-midnight');
  Object.assign(first, { x: 34, y: -26, homeX: 34, homeY: -26, vx: 0, vy: 0, targetId: null, targetKind: null });
  Object.assign(second, { x: 34.02, y: -26, homeX: 34, homeY: -26, vx: 0, vy: 0, targetId: null, targetKind: null });
  window.advanceTime(350);
  game.cameraTarget.set(34, -26);
  game.camera.position.x = 34;
  game.camera.position.y = -26;
  game.render();
});
const deep = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const first = game.deepSeaLife.creatures.find((creature) => creature.id === 'sixgill-twilight');
  const second = game.deepSeaLife.creatures.find((creature) => creature.id === 'sixgill-midnight');
  const firstBody = game.deepSeaLife.collisionBody(first);
  const secondBody = game.deepSeaLife.collisionBody(second);
  return {
    first: { id: first.id, x: first.x, y: first.y, sizeScale: game.deepSeaLife.lifecycle.currentScale(first.life) },
    second: { id: second.id, x: second.x, y: second.y, sizeScale: game.deepSeaLife.lifecycle.currentScale(second.life) },
    contactRatio: game.deepSeaLife.collision.contactRatio(firstBody, secondBody),
    telemetry: game.deepSeaLife.collision.snapshot(),
  };
});
await page.waitForTimeout(80);
await page.screenshot({ path: new URL('deep-sharks-separated.png', outputDir).pathname });

// The octopus is an immovable anchor for fauna resolution. A concealed player
// cannot be bitten during this test, but a shark must still leave its body.
const playerContact = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const shark = game.deepSeaLife.creatures.find((creature) => creature.id === 'sixgill-midnight');
  const other = game.deepSeaLife.creatures.find((creature) => creature.id === 'sixgill-twilight');
  game.player.x = 34;
  game.player.y = -24.5;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.camouflage = true;
  Object.assign(other, { x: 42, y: -35, homeX: 42, homeY: -35, vx: 0, vy: 0 });
  Object.assign(shark, { x: game.player.x + 0.01, y: game.player.y, homeX: game.player.x, homeY: game.player.y, vx: 0, vy: 0 });
  window.advanceTime(220);
  return {
    playerX: game.player.x,
    playerY: game.player.y,
    sharkX: shark.x,
    sharkY: shark.y,
    contactRatio: game.deepSeaLife.collision.contactRatio(
      game.deepSeaLife.collisionBody(shark),
      game.deepSeaLife.playerCollisionBody({ x: game.player.x, y: game.player.y, concealed: true }),
    ),
  };
});

// Stress a compact three-fish school. Every pair must emerge with clearance.
await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.player.x = -4;
  game.player.y = -1;
  game.player.vx = 0;
  game.player.vy = 0;
  const fish = game.marineLife.fish.filter((candidate) => candidate.alive).slice(0, 3);
  fish.forEach((candidate, index) => Object.assign(candidate, {
    x: index * 0.015,
    y: -1,
    vx: 0,
    vy: 0,
    capturedBy: null,
  }));
  window.advanceTime(350);
  game.cameraTarget.set(0, -1);
  game.camera.position.x = 0;
  game.camera.position.y = -1;
  game.render();
});
const reef = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const fish = game.marineLife.fish.filter((candidate) => candidate.alive).slice(0, 3);
  const bodies = fish.map((candidate) => game.marineLife.fishCollisionBody(candidate));
  const pairRatios = [];
  for (let first = 0; first < bodies.length; first += 1) {
    for (let second = first + 1; second < bodies.length; second += 1) {
      pairRatios.push({
        pair: `${bodies[first].id}/${bodies[second].id}`,
        ratio: game.marineLife.collision.contactRatio(bodies[first], bodies[second]),
      });
    }
  }
  return { fish: fish.map(({ id, x, y }) => ({ id, x, y })), pairRatios, telemetry: game.marineLife.collision.snapshot() };
});
await page.waitForTimeout(80);
await page.screenshot({ path: new URL('reef-school-separated.png', outputDir).pathname });

// Surface species share collision layers (ground/air/water), so two snakes
// separate while a bird may pass above them without a false collision.
await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.player.x = -10;
  game.player.y = 5.6;
  game.player.vx = 0;
  game.player.vy = 0;
  const snakes = game.creatures.filter((creature) => creature.alive && creature.kind === 'snake').slice(0, 2);
  snakes.forEach((snake, index) => Object.assign(snake, { x: -18 + index * 0.01, y: 5.6, vx: 0 }));
  window.advanceTime(350);
  game.cameraTarget.set(-18, 5.6);
  game.camera.position.x = -18;
  game.camera.position.y = 5.6;
  game.render();
});
const surface = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const snakes = game.creatures.filter((creature) => creature.alive && creature.kind === 'snake').slice(0, 2);
  const bodies = snakes.map((snake) => {
    const scale = game.surfaceLifecycle.currentScale(snake.life);
    return { id: snake.id, x: snake.x, y: snake.y, radiusX: 0.42 * scale, radiusY: 0.1 * scale };
  });
  return {
    snakes: snakes.map(({ id, x, y }) => ({ id, x, y })),
    contactRatio: game.surfaceCollision.contactRatio(bodies[0], bodies[1]),
    telemetry: game.surfaceCollision.snapshot(),
  };
});
await page.waitForTimeout(80);
await page.screenshot({ path: new URL('surface-snakes-separated.png', outputDir).pathname });

const result = { deep, playerContact, reef, surface, errors };
await writeFile(new URL('results.json', outputDir), JSON.stringify(result, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (deep.contactRatio < 0.98) throw new Error(`Deep sharks remain overlapped: ${JSON.stringify(deep)}`);
if (deep.telemetry.totalResolved < 1) throw new Error(`Deep collision solver recorded no contacts: ${JSON.stringify(deep.telemetry)}`);
if (playerContact.contactRatio < 0.98) throw new Error(`Shark remains inside player: ${JSON.stringify(playerContact)}`);
if (reef.pairRatios.some(({ ratio }) => ratio < 0.96)) throw new Error(`Reef fish remain overlapped: ${JSON.stringify(reef)}`);
if (reef.telemetry.totalResolved < 1) throw new Error(`Reef collision solver recorded no contacts: ${JSON.stringify(reef.telemetry)}`);
if (surface.contactRatio < 0.98) throw new Error(`Surface snakes remain overlapped: ${JSON.stringify(surface)}`);
if (surface.telemetry.totalResolved < 1) throw new Error(`Surface collision solver recorded no contacts: ${JSON.stringify(surface.telemetry)}`);
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify(result, null, 2));

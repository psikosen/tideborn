import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/swept-contact/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.clear();
  document.querySelector('#start-btn')?.click();
});
await page.waitForTimeout(250);

const result = await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.mode = 'paused';
  const world = game.world;
  const player = game.player;
  const solver = player.sweptContact;
  const wallCellX = world.worldToCell(0, 3.5).x;
  const wallBottom = world.worldToCell(0, 1.7).y;
  const wallTop = world.worldToCell(0, 5.7).y;
  for (let y = wallBottom; y <= wallTop; y += 1) world.setNaturalCell(wallCellX, y, 7, 255, 180);
  world.updateTexture(5, 0);

  const body = { radiusX: 0.43, radiusY: 0.36 };
  const endpointWouldMiss = !player.collides(1.2, 3.6, world);
  const direct = solver.move(-1.2, 3.6, 2.4, 0, body, world);
  const directClear = !player.collides(direct.x, direct.y, world);

  const deterministic = [0, 1, 2].map(() => solver.move(-1.2, 3.6, 2.4, 0, body, world));
  const stateHashes = deterministic.map((sample) => [
    sample.x.toFixed(6), sample.y.toFixed(6), sample.normalX.toFixed(6),
    sample.normalY.toFixed(6), sample.timeOfImpact.toFixed(6), sample.queries,
  ].join('|'));

  const diagonal = solver.move(-1.2, 2.5, 2.4, 1.55, body, world);
  const diagonalClear = !player.collides(diagonal.x, diagonal.y, world);
  const attemptedTangent = 1.55;
  const retainedTangentialTravel = Math.max(0, diagonal.y - 2.5) / attemptedTangent;

  // Exercise the actual Octopus integration path at a deliberately excessive
  // 48 m/s so the old endpoint-only test would have landed beyond the wall.
  player.x = -1.2;
  player.y = 3.6;
  player.vx = 48;
  player.vy = 0;
  player.squeezing = false;
  player.moveAndCollide(0.05, world);
  const integrated = {
    x: player.x,
    y: player.y,
    vx: player.vx,
    vy: player.vy,
    clear: !player.collides(player.x, player.y, world),
    contact: player.sweptContactSnapshot,
  };

  player.x = diagonal.x;
  player.y = diagonal.y;
  player.vx = 0;
  player.vy = 0;
  player.group.position.set(player.x, player.y, 2);
  game.cameraTarget.set(-0.2, 3.7);
  game.camera.position.set(-0.2, 3.7, 24);
  game.viewHeight = 6.4;
  game.resize();
  game.render();

  return {
    endpointWouldMiss,
    direct,
    directClear,
    deterministic: new Set(stateHashes).size === 1,
    diagonal,
    diagonalClear,
    retainedTangentialTravel,
    integrated,
    snapshot: solver.snapshot(),
  };
});

await page.waitForTimeout(80);
await page.screenshot({ path: new URL('diagonal-wall-slide.png', outputDir).pathname, fullPage: true });
await writeFile(new URL('result.json', outputDir), JSON.stringify({ result, errors }, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (!result.endpointWouldMiss) throw new Error('Stress setup does not prove endpoint-only tunneling.');
if (!result.direct.collided || !result.directClear || result.direct.timeOfImpact >= 1 || result.direct.x >= -0.3) {
  throw new Error(`High-speed sweep crossed or entered the one-cell wall: ${JSON.stringify(result.direct)}`);
}
if (!result.deterministic) throw new Error('Identical swept-contact runs produced different state.');
if (!result.diagonal.collided || !result.diagonal.slideApplied || !result.diagonalClear || result.retainedTangentialTravel < 0.75) {
  throw new Error(`Glancing contact did not preserve enough wall sliding: ${JSON.stringify(result.diagonal)}`);
}
if (!result.integrated.clear || result.integrated.x >= -0.3 || Math.abs(result.integrated.vx) > 1e-6) {
  throw new Error(`Octopus integration tunneled or retained inward velocity: ${JSON.stringify(result.integrated)}`);
}
if (result.snapshot.startPenetrations !== 0 || result.snapshot.last.queries > 2500) {
  throw new Error(`Unexpected fallback or query explosion: ${JSON.stringify(result.snapshot)}`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ result, errors }, null, 2));

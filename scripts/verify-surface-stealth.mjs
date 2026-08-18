import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/surface-stealth/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.clear();
  document.querySelector('#start-btn')?.click();
});
await page.waitForTimeout(160);

const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const placeOnSurface = async (x) => page.evaluate((targetX) => {
  const game = window.__tidebornTest;
  let surfaceY = 15.9;
  for (let y = 15.9; y > -111.5; y -= 0.0625) {
    if (game.world.isSolid(targetX, y)) {
      surfaceY = y;
      break;
    }
  }
  game.player.x = targetX;
  game.player.y = surfaceY + 0.47;
  game.player.vx = 0;
  game.player.vy = 0;
  game.cameraTarget.set(targetX, surfaceY + 0.9);
  game.camera.position.x = targetX;
  game.camera.position.y = surfaceY + 0.9;
  window.advanceTime(80);
  return surfaceY;
}, x);

// The mountain cap is soil. C must sample that exact microcell palette rather
// than choosing a generic above/below-water tint.
const soilY = await placeOnSurface(-22);
await page.keyboard.press('KeyC');
await page.evaluate(() => window.advanceTime(1600));
await page.waitForTimeout(80);
const soilCamo = await state();
await page.screenshot({ path: new URL('soil-camouflage.png', outputDir).pathname });

// Switch camouflage off, move to the mineral-crusted midnight wall beside a
// sixgill, and hold G. The contact must anchor and conceal without using C.
await page.keyboard.press('KeyC');
await page.evaluate(() => window.advanceTime(250));
const mineralY = await placeOnSurface(36.3);
await page.evaluate(() => {
  window.__tidebornTest.inventory.glowKelp = 1;
});
await page.keyboard.down('KeyG');
await page.evaluate(() => window.advanceTime(500));
const gripStart = await state();
const healthAtGrip = gripStart.survival.health;
await page.keyboard.press('KeyC');
await page.evaluate(() => window.advanceTime(1600));
await page.evaluate(() => window.advanceTime(2800));
await page.waitForTimeout(80);
const gripHeld = await state();
await page.screenshot({ path: new URL('mineral-surface-grip.png', outputDir).pathname });

// Once G is released the nearby shark should reacquire the visible octopus.
await page.keyboard.press('KeyC');
await page.evaluate(() => window.advanceTime(250));
await page.keyboard.up('KeyG');
await page.evaluate(() => window.advanceTime(1400));
const released = await state();
await writeFile(new URL('state.json', outputDir), JSON.stringify({ soilY, mineralY, soilCamo, gripStart, gripHeld, released }, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (!soilCamo.player.camouflage || soilCamo.player.camouflageSurface !== 'soil') {
  throw new Error(`Camouflage did not match soil: ${JSON.stringify(soilCamo.player)}`);
}
if (!gripHeld.player.camouflage || soilCamo.player.camouflageColor === gripHeld.player.camouflageColor) {
  throw new Error('Different terrain materials produced the same camouflage palette.');
}
if (!gripStart.player.gripping || !gripStart.player.concealed || gripStart.player.concealmentSource !== 'surface grip') {
  throw new Error(`G did not establish a concealing surface grip: ${JSON.stringify(gripStart.player)}`);
}
if (gripHeld.survival.health !== healthAtGrip) {
  throw new Error(`Predator damaged a surface-concealed player: ${healthAtGrip} -> ${gripHeld.survival.health}`);
}
if (released.player.gripping || released.player.concealed) {
  throw new Error(`Releasing G did not expose the player: ${JSON.stringify(released.player)}`);
}
const reacquired = released.deepSeaLife.nearby.some((creature) => creature.behavior === 'stalking' || creature.behavior === 'ambushing');
if (!reacquired) throw new Error(`Nearby predator did not reacquire after release: ${JSON.stringify(released.deepSeaLife.nearby)}`);
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify({
  soil: {
    surface: soilCamo.player.camouflageSurface,
    color: soilCamo.player.camouflageColor,
    concealed: soilCamo.player.concealed,
  },
  grip: {
    surface: gripHeld.player.gripSurface,
    source: gripHeld.player.concealmentSource,
    position: { x: gripHeld.player.x, y: gripHeld.player.y },
    health: gripHeld.survival.health,
  },
  releasedPredators: released.deepSeaLife.nearby,
  errors,
}, null, 2));

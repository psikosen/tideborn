import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/terrain-continuity/', import.meta.url);
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
await page.waitForTimeout(180);

const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

// Center the development camera on the old -26 m mountain join. Traversing
// there normally is intentionally slow because the starter den interrupts the
// land route; this hook keeps the visual regression focused on terrain.
await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.player.x = -26;
  game.player.y = 9.5;
  game.player.vx = 0;
  game.player.vy = 0;
  game.cameraTarget.set(-26, 7.4);
  game.camera.position.x = -26;
  game.camera.position.y = 7.4;
  window.advanceTime(34);
});
await page.waitForTimeout(100);

const finalState = await state();
await page.screenshot({ path: new URL('smoothed-mountain.png', outputDir).pathname });
await writeFile(new URL('state.json', outputDir), JSON.stringify(finalState, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (Math.abs(finalState.player.x + 26) > 0.35) throw new Error(`Mountain camera missed the old seam: ${finalState.player.x}`);
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ player: finalState.player, errors }, null, 2));

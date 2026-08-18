import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/shark-food-web/', import.meta.url);
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
const stage = async (x, y) => page.evaluate(({ x, y }) => {
  const game = window.__tidebornTest;
  game.player.x = x;
  game.player.y = y;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.camouflage = false;
  game.inventory.glowKelp = 1;
  game.cameraTarget.set(x, y);
  game.camera.position.x = x;
  game.camera.position.y = y;
  window.advanceTime(120);
}, { x, y });
const nearbyById = (snapshot, id) => snapshot.deepSeaLife.nearby.find((creature) => creature.id === id);

// Let the midnight sixgill acquire the exposed octopus. Its imported body and
// red alert waves must both be visible during this phase.
await stage(34.0, -24.5);
await page.evaluate(() => window.advanceTime(900));
const stalking = await state();
await page.waitForTimeout(80);
await page.screenshot({ path: new URL('shark-stalking-alert.png', outputDir).pathname });

// Camouflage removes the current visual fix, but the shark searches the last
// known location and retains slower red sensory waves.
await page.keyboard.press('KeyC');
await page.evaluate(() => window.advanceTime(900));
const searching = await state();
await page.waitForTimeout(80);
await page.screenshot({ path: new URL('shark-searching-alert.png', outputDir).pathname });

// Become visible, ink at close range, then stay camouflaged. A sixgill keeps
// the coating for half of the live day length; derive waits from text state so
// this food-web regression stays valid when the day/night pacing is retuned.
await page.keyboard.press('KeyC');
await page.evaluate(() => window.advanceTime(120));
await page.keyboard.press('KeyR');
await page.evaluate(() => window.advanceTime(260));
const inked = await state();
await page.waitForTimeout(80);
await page.screenshot({ path: new URL('shark-inked-blind.png', outputDir).pathname });
await page.keyboard.press('KeyC');
const inkedSharkAtStart = nearbyById(inked, 'sixgill-midnight');
const inkDurationSeconds = inkedSharkAtStart?.inkedSeconds ?? inked.time.dayLengthSeconds * 0.5;
await page.evaluate((ms) => window.advanceTime(ms), inkDurationSeconds * 1000 * 0.48);
const halfInk = await state();
await page.evaluate((ms) => window.advanceTime(ms), inkDurationSeconds * 1000 * 0.58);
const inkExpired = await state();
await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.player.x = 34;
  game.player.y = -25.5;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.camouflage = true;
  // Lifecycle reproduction can let this founder feed during the 20-second ink
  // wait. Clear only its test satiation window so the visual regression still
  // captures a natural hunt rather than depending on exact ecosystem timing.
  const founder = game.deepSeaLife.creatures.find((creature) => creature.id === 'sixgill-midnight');
  if (founder) founder.satiatedUntil = 0;
  game.cameraTarget.set(34, -25.5);
  game.camera.position.x = 34;
  game.camera.position.y = -25.5;
  window.advanceTime(120);
});
const hunting = await state();
await page.waitForTimeout(80);
await page.screenshot({ path: new URL('shark-hunts-lanterns.png', outputDir).pathname });

// With the player still concealed, the recovered shark should select and eat
// a lantern school. Give the pursuit enough time to complete and record it.
await page.evaluate(() => window.advanceTime(6500));
const feeding = await state();
await page.waitForTimeout(80);
await page.screenshot({ path: new URL('food-web-after-predation.png', outputDir).pathname });

// A jet can briefly stagger even a much larger shark. Use the untouched abyss
// representative so the assertion cannot depend on the feeding encounter.
// Approach along the same open-water pocket as the shark. The older x=42
// coordinate now belongs to the expanded abyss wall and correctly pushes the
// octopus upward before the jet can reach its target.
await stage(43.15, -69.8);
await page.keyboard.down('ShiftLeft');
await page.evaluate(() => window.advanceTime(38));
await page.keyboard.up('ShiftLeft');
await page.evaluate(() => window.advanceTime(120));
const jetStagger = await state();

await writeFile(new URL('states.json', outputDir), JSON.stringify({ stalking, searching, inked, halfInk, inkExpired, hunting, feeding, jetStagger }, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

const stalkingShark = nearbyById(stalking, 'sixgill-midnight');
if (!stalkingShark || stalkingShark.behavior !== 'stalking' || stalkingShark.targetId !== 'player' || !stalkingShark.alertWaves) {
  throw new Error(`Shark did not enter alert pursuit: ${JSON.stringify(stalkingShark)}`);
}
const searchingShark = nearbyById(searching, 'sixgill-midnight');
if (!searchingShark || searchingShark.behavior !== 'searching' || !searchingShark.alertWaves) {
  throw new Error(`Shark did not search last-known position: ${JSON.stringify(searchingShark)}`);
}
const inkedShark = nearbyById(inked, 'sixgill-midnight');
if (!inkedShark || inkedShark.behavior !== 'blinded' || inkedShark.inkedSeconds < inkDurationSeconds * 0.94 || inkedShark.alertWaves) {
  throw new Error(`Ink did not blind sixgill for half a day: ${JSON.stringify(inkedShark)}`);
}
const halfInkShark = nearbyById(halfInk, 'sixgill-midnight');
if (!halfInkShark || halfInkShark.inkedSeconds < inkDurationSeconds * 0.44) throw new Error(`Shark ink cleared too early: ${JSON.stringify(halfInkShark)}`);
const expiredShark = nearbyById(inkExpired, 'sixgill-midnight');
if (expiredShark && expiredShark.inkedSeconds !== 0) throw new Error(`Shark ink did not expire: ${JSON.stringify(expiredShark)}`);
const huntingShark = nearbyById(hunting, 'sixgill-midnight');
if (!huntingShark || huntingShark.behavior !== 'hunting' || !huntingShark.targetId?.startsWith('lantern-') || !huntingShark.alertWaves) {
  throw new Error(`Recovered shark did not hunt natural prey: ${JSON.stringify(huntingShark)}`);
}
const sharkLanternLink = feeding.deepSeaLife.foodWeb.links.find((link) => link.predator === 'sixgill-shark' && link.prey === 'lantern-school');
if (!sharkLanternLink || sharkLanternLink.kills < 1 || !feeding.deepSeaLife.foodWeb.recentPredation.length) {
  throw new Error(`Shark never completed natural predation: ${JSON.stringify(feeding.deepSeaLife.foodWeb)}`);
}
const staggeredShark = nearbyById(jetStagger, 'sixgill-abyss');
if (!staggeredShark || staggeredShark.behavior !== 'staggered' || staggeredShark.staggeredSeconds <= 0) {
  throw new Error(`Jet did not stagger the abyss shark: ${JSON.stringify(staggeredShark)}`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify({
  stalking: stalkingShark,
  searching: searchingShark,
  inked: inkedShark,
  halfInk: halfInkShark,
  hunting: huntingShark,
  sharkLanternLink,
  recentPredation: feeding.deepSeaLife.foodWeb.recentPredation,
  jetStagger: staggeredShark,
  errors,
}, null, 2));

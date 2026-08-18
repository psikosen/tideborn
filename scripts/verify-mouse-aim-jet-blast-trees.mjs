import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const outputDir = new URL('../output/mouse-aim-jet-blast-trees/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(process.env.TIDEBORN_URL ?? 'http://localhost:4173', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); document.querySelector('#start-btn')?.click(); });
await page.waitForTimeout(180);
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.player.x = -8.35;
  game.player.y = 2.95;
  game.player.vx = 0;
  game.player.vy = 0;
  game.cameraTarget.set(game.player.x, game.player.y);
  game.camera.position.x = game.player.x;
  game.camera.position.y = game.player.y;
  game.bannerUntil = 0;
  document.querySelector('[data-ui="banner"]')?.classList.remove('show');
  window.advanceTime(20);
});
const digBefore = await state();
await page.mouse.move(640, 650);
await page.mouse.down({ button: 'left' });
await page.evaluate(() => window.advanceTime(360));
await page.mouse.up({ button: 'left' });
await page.evaluate(() => window.advanceTime(45));
const digAfter = await state();
await page.screenshot({ path: new URL('mouse-directed-downward-dig.png', outputDir).pathname });

const blastSetup = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const shark = game.deepSeaLife.creatures.find((creature) => creature.alive && creature.species === 'sixgill-shark');
  game.player.x = -8.35;
  game.player.y = 2.95;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.stamina = 100;
  game.player.jetCharges = 3;
  game.player.jetCooldown = 0;
  game.jetBlast.mastery = game.jetBlast.masteryRequired;
  game.jetBlast.cooldownRemaining = 0;
  shark.x = -7.32;
  shark.y = 2.2;
  shark.homeX = shark.x;
  shark.homeY = shark.y;
  shark.vx = 0;
  shark.vy = 0;
  shark.inkedUntil = 0;
  shark.staggeredUntil = 0;
  shark.satiatedUntil = 0;
  shark.attackCooldown = 99;
  game.cameraTarget.set(game.player.x, game.player.y);
  game.camera.position.x = game.player.x;
  game.camera.position.y = game.player.y;
  game.messageUntil = 0;
  game.bannerUntil = 0;
  document.querySelector('[data-ui="banner"]')?.classList.remove('show');
  window.advanceTime(18);
  return {
    sharkId: shark.id,
    excavatedCells: game.world.modifiedCells,
    sharks: game.deepSeaLife.snapshot(game.player.x, game.player.y, 20).activePopulation['sixgill-shark'],
  };
});
await page.mouse.move(820, 500);
await page.mouse.down({ button: 'right' });
await page.evaluate(() => window.advanceTime(34));
await page.mouse.up({ button: 'right' });
await page.evaluate(() => window.advanceTime(70));
const blastAfter = await state();
await page.screenshot({ path: new URL('jet-blast-terrain-and-predator.png', outputDir).pathname });

const islandSamples = await page.evaluate(() => {
  const game = window.__tidebornTest;
  return {
    needleIsland: game.world.isSolid(-58.1, 4.35),
    oceanGap: game.world.isSolid(-53.4, 4.35),
    broadIsland: game.world.isSolid(-47.5, 6.0),
  };
});

await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.player.x = -25;
  game.player.y = 7.6;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.camouflage = true;
  game.cameraTarget.set(-25, 7.1);
  game.camera.position.x = -25;
  game.camera.position.y = 7.1;
  game.messageUntil = 0;
  game.bannerUntil = 0;
  document.querySelector('[data-ui="banner"]')?.classList.remove('show');
  window.advanceTime(32);
  game.updateUI();
  game.render();
});
const forestState = await state();
await page.screenshot({ path: new URL('generated-procedural-forest.png', outputDir).pathname });

const result = { digBefore, digAfter, blastSetup, blastAfter, islandSamples, forestState, errors };
await writeFile(new URL('states.json', outputDir), JSON.stringify(result, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (!digAfter.pointerAim.active || digAfter.pointerAim.directionY > -0.8) throw new Error(`Mouse aim did not point downward: ${JSON.stringify(digAfter.pointerAim)}`);
if (digAfter.den.excavatedCells <= digBefore.den.excavatedCells) throw new Error(`Mouse-directed digging removed no cells: ${digBefore.den.excavatedCells} -> ${digAfter.den.excavatedCells}`);
if (blastAfter.jetBlast.casts !== 1 || blastAfter.player.jetCharges !== 0 || blastAfter.player.stamina > 33) throw new Error(`Jet Blast cost/cast failed: ${JSON.stringify({ blast: blastAfter.jetBlast, player: blastAfter.player })}`);
if (blastAfter.deepSeaLife.activePopulation['sixgill-shark'] >= blastSetup.sharks) throw new Error('The close sixgill shark survived the Jet Blast core.');
if (blastAfter.den.excavatedCells <= blastSetup.excavatedCells + 50) throw new Error(`Jet Blast did not remove a large terrain chunk: ${blastSetup.excavatedCells} -> ${blastAfter.den.excavatedCells}`);
if (!blastAfter.activeVFX.some((effect) => effect.id === 'jetBlast')) throw new Error(`Jet Blast VFX not active: ${JSON.stringify(blastAfter.activeVFX)}`);
if (!islandSamples.needleIsland || islandSamples.oceanGap || !islandSamples.broadIsland) throw new Error(`Actual island-size variation failed: ${JSON.stringify(islandSamples)}`);
if (forestState.landmasses.largestWidth / forestState.landmasses.smallestWidth < 8 || forestState.trees.count < 6 || !forestState.trees.generatedArt || Object.values(forestState.trees.variants).some((count) => count < 1)) throw new Error(`Procedural environment summary failed: ${JSON.stringify({ landmasses: forestState.landmasses, trees: forestState.trees })}`);
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify({
  mouseDig: { before: digBefore.den.excavatedCells, after: digAfter.den.excavatedCells, aim: digAfter.pointerAim },
  jetBlast: {
    cast: blastAfter.jetBlast,
    terrainBefore: blastSetup.excavatedCells,
    terrainAfter: blastAfter.den.excavatedCells,
    sharksBefore: blastSetup.sharks,
    sharksAfter: blastAfter.deepSeaLife.activePopulation['sixgill-shark'],
    activeVFX: blastAfter.activeVFX,
  },
  islandSamples,
  landmasses: forestState.landmasses,
  trees: forestState.trees,
  errors,
}, null, 2));

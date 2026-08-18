import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/predation-propulsion-aggregate-tree/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(90_000);
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function', undefined, { timeout: 90_000 });
await page.evaluate(() => {
  localStorage.clear();
  document.querySelector('#start-btn')?.click();
});
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing', undefined, { timeout: 90_000 });

const treeCollision = await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.__captureRender ??= game.render.bind(game);
  const target = game.amphibiousCrabs.crabs.find((crab) => crab.alive && crab.species === 'coconut-crab');
  const scale = game.amphibiousCrabs.lifecycle.currentScale(target.life);
  const radiusX = 0.5 * scale;
  const radiusY = 0.34 * scale;
  const bodyRadius = Math.max(radiusY * 0.88, radiusX * 0.56);
  let setup = null;
  for (const tree of game.trees.interactionBodies()) {
    for (const side of [-1, 1]) {
      const x = tree.baseX + side * (tree.radius + bodyRadius + 0.02);
      const support = game.amphibiousCrabs.stableSupportAt(x, tree.baseY + radiusY, radiusX, radiusY);
      if (!support) continue;
      setup = { tree, side, x, y: support.center + radiusY };
      break;
    }
    if (setup) break;
  }
  if (!setup) throw new Error('No stable tree-side staging point was found for a coconut crab.');

  // This test targets contact behavior, so keep the cold-loaded 25+ MB crab
  // GLBs out of the capture and exercise the lightweight procedural stand-in.
  game.amphibiousCrabs.ensureAsset = () => {};
  for (const crab of game.amphibiousCrabs.crabs) {
    crab.visual.visible = false;
    if (crab !== target) crab.alive = false;
  }
  target.x = setup.x;
  target.y = setup.y;
  target.homeX = setup.tree.baseX - setup.side * 3;
  target.vx = -setup.side * 0.48;
  target.vy = 0;
  target.direction = -setup.side;
  target.hunger = 100;
  target.feedingUntil = 0;
  target.staggeredUntil = 0;
  target.phase = Math.asin(-1);
  target.grounded = true;
  target.groundY = setup.y - radiusY;
  const contactsBefore = game.amphibiousCrabs.treeContacts;
  game.player.x = setup.x + setup.side * 2.2;
  game.player.y = setup.y + 0.25;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.camouflage = true;
  game.player.gripping = true;
  game.viewHeight = 7;
  game.cameraTarget.set(setup.tree.baseX, setup.tree.baseY + 1.4);
  game.camera.position.set(setup.tree.baseX, setup.tree.baseY + 1.4, 24);
  game.resize();
  window.advanceTime(1450);
  const closest = game.treeInteraction.closestPoint(setup.tree, target.x, target.y);
  const clearance = Math.hypot(closest.dx, closest.dy) - (setup.tree.radius + bodyRadius);
  game.bannerUntil = 0;
  game.messageUntil = 0;
  document.querySelector('[data-ui="banner"]')?.classList.remove('show');
  game.updateUI();
  game.__captureRender();
  // Keep the requestAnimationFrame loop from repeatedly redrawing the same
  // expensive post-processing graph while Playwright reads the framebuffer.
  game.render = () => {};
  return {
    crabId: target.id,
    treeId: setup.tree.id,
    contacts: game.amphibiousCrabs.treeContacts - contactsBefore,
    clearance,
    x: target.x,
    y: target.y,
    treeContact: target.treeContact,
    grounded: target.grounded,
  };
});

const aggregate = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const materialIds = { sand: 1, wetSand: 2, soil: 3, mud: 4, limestone: 6, basalt: 7, crushedShell: 10, mineral: 13 };
  const profiles = Object.fromEntries(Object.entries(materialIds).map(([name, id]) => [name, game.world.excavationProfile(id)]));
  const cell = game.world.worldToCell(8.25, 14.1);
  const before = game.world.getCellMaterial(cell.x, cell.y);
  game.world.setNaturalCell(cell.x, cell.y, materialIds.mineral, 45, 180);
  let attempts = 0;
  let last = null;
  while (game.world.getCellMaterial(cell.x, cell.y) === materialIds.mineral && attempts < 60) {
    last = game.world.dig(8.25, 14.1, game.world.cellSize * 0.55, 0.75, false);
    attempts += 1;
  }
  game.world.clearNaturalCell(cell.x, cell.y, materialIds.mineral);
  return {
    profiles,
    mineralBreakthroughAttempts: attempts,
    removed: game.world.getCellMaterial(cell.x, cell.y) !== materialIds.mineral,
    last,
    replacedMaterial: before,
  };
});

const jetBlast = await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.player.x = -8.35;
  game.player.y = 2.95;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.stamina = 100;
  game.player.jetCharges = 3;
  game.player.jetCooldown = 0;
  game.jetBlast.mastery = game.jetBlast.masteryRequired;
  game.jetBlast.cooldownRemaining = 0;
  game.cameraTarget.set(game.player.x, game.player.y);
  game.camera.position.set(game.player.x, game.player.y, 24);
  game.resize();
  return { x: game.player.x, y: game.player.y };
});
await page.mouse.move(1030, 360);
await page.keyboard.down('KeyK');
await page.evaluate(() => window.advanceTime(34));
await page.keyboard.up('KeyK');
const jetImmediate = await page.evaluate(() => {
  const game = window.__tidebornTest;
  return { vx: game.player.vx, vy: game.player.vy, technique: game.player.technique, casts: game.jetBlast.casts };
});
await page.evaluate(() => window.advanceTime(260));
const jetAfter = await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.bannerUntil = 0;
  document.querySelector('[data-ui="banner"]')?.classList.remove('show');
  game.updateUI();
  game.__captureRender();
  return { x: game.player.x, y: game.player.y, vx: game.player.vx, vy: game.player.vy, technique: game.player.technique };
});

const devouring = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const target = game.survivorOctopi.survivors.find((survivor) => survivor.health > 0);
  target.x = -4.2;
  target.y = 1.8;
  target.vx = 0;
  target.vy = 0;
  target.foodCache = 2;
  target.ageYears = 6;
  target.nextDecision = 99999;
  game.survivorOctopi.devourCooldown = 0;
  game.player.x = target.x - 0.75;
  game.player.y = target.y;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.facing = 1;
  game.survival.hunger = 24;
  game.survival.health = 70;
  game.player.stamina = 100;
  game.cameraTarget.set(target.x, target.y);
  game.camera.position.set(target.x, target.y, 24);
  game.viewHeight = 7;
  game.resize();
  const before = {
    living: game.survivorOctopi.snapshot(game.player.x, game.player.y).simulated,
    hunger: game.survival.hunger,
    health: game.survival.health,
    food: game.inventory.food,
  };
  return { targetId: target.id, targetName: target.name, before };
});
await page.keyboard.press('KeyH');
await page.evaluate(() => window.advanceTime(40));
const devourAfter = await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.bannerUntil = 0;
  document.querySelector('[data-ui="banner"]')?.classList.remove('show');
  game.updateUI();
  game.__captureRender();
  return {
    living: game.survivorOctopi.snapshot(game.player.x, game.player.y).simulated,
    devoured: game.survivorOctopi.snapshot(game.player.x, game.player.y).devoured,
    hunger: game.survival.hunger,
    health: game.survival.health,
    stamina: game.player.stamina,
    food: game.inventory.food,
    message: game.message,
    prompt: document.querySelector('[data-ui="prompt"]')?.textContent ?? '',
  };
});

const result = { treeCollision, aggregate, jetBlast: { start: jetBlast, immediate: jetImmediate, after: jetAfter }, devouring: { ...devouring, after: devourAfter }, errors };
await writeFile(new URL('results.json', outputDir), JSON.stringify(result, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (treeCollision.contacts < 1 || treeCollision.clearance < -0.015) throw new Error(`Crab/tree collision failed: ${JSON.stringify(treeCollision)}`);
for (const name of ['sand', 'wetSand', 'mud', 'crushedShell', 'mineral']) {
  if (aggregate.profiles[name].materialClass !== 'loose-aggregate' || aggregate.profiles[name].strengthMultiplier < 1.25) {
    throw new Error(`Aggregate excavation profile failed for ${name}: ${JSON.stringify(aggregate.profiles[name])}`);
  }
}
if (aggregate.profiles.limestone.strengthMultiplier !== 1 || aggregate.profiles.basalt.strengthMultiplier !== 1) throw new Error(`Rock strength was unintentionally changed: ${JSON.stringify(aggregate.profiles)}`);
if (!aggregate.removed || aggregate.mineralBreakthroughAttempts > 50) throw new Error(`Boosted mineral packet did not break through quickly enough: ${JSON.stringify(aggregate)}`);
if (jetImmediate.casts !== 1 || jetImmediate.vx < 4.5 || jetAfter.x - jetBlast.x < 0.65) throw new Error(`Underwater Jet Blast propulsion failed: ${JSON.stringify({ jetBlast, jetImmediate, jetAfter })}`);
if (devourAfter.living !== devouring.before.living - 1 || devourAfter.devoured < 1 || devourAfter.hunger <= devouring.before.hunger || devourAfter.health <= devouring.before.health || devourAfter.food < devouring.before.food + 2 || !devourAfter.message.includes('PREDATION')) {
  throw new Error(`Rival octopus devouring failed: ${JSON.stringify({ devouring, devourAfter })}`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify(result, null, 2));

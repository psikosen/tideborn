import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const output = new URL('../output/survival-expansion/', import.meta.url);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(process.env.TIDEBORN_URL ?? 'http://localhost:4173', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.clear(); document.querySelector('#start-btn')?.click(); });
await page.waitForTimeout(500);

const tree = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const body = game.trees.interactionBodies()[1];
  const t = 0.48;
  const trunkX = body.baseX + (body.topX - body.baseX) * t;
  const trunkY = body.baseY + (body.topY - body.baseY) * t;
  const tangentX = body.topX - body.baseX;
  const tangentY = body.topY - body.baseY;
  const length = Math.hypot(tangentX, tangentY);
  const normalX = tangentY / length;
  const normalY = -tangentX / length;
  game.player.x = trunkX + normalX * (body.radius + 0.4);
  game.player.y = trunkY + normalY * (body.radius + 0.4);
  game.player.vx = 0;
  game.player.vy = 0;
  game.cameraTarget.set(game.player.x, game.player.y);
  game.camera.position.set(game.player.x, game.player.y, 24);
  game.keys.held.add('KeyG');
  game.keys.held.add('KeyW');
  const startY = game.player.y;
  for (let frame = 0; frame < 50; frame += 1) game.update(1 / 60);
  const climbedY = game.player.y;
  const gripSurface = game.player.gripSurface;
  const gripping = game.player.gripping;
  game.keys.held.clear();
  game.update(1 / 60);

  game.player.x = trunkX;
  game.player.y = trunkY;
  game.player.vx = -1;
  game.player.vy = 0;
  game.update(1 / 60);
  const collisionDistance = Math.hypot(game.player.x - trunkX, game.player.y - trunkY);
  game.player.x = trunkX + normalX * (body.radius + 0.42);
  game.player.y = climbedY;
  game.cameraTarget.set(trunkX, trunkY + 0.5);
  game.camera.position.set(trunkX, trunkY + 0.5, 24);
  game.mode = 'paused';
  game.updateUI();
  game.render();
  return {
    body,
    startY,
    climbedY,
    climbedMeters: climbedY - startY,
    gripping,
    gripSurface,
    collisionDistance,
    interaction: game.treeInteraction.snapshot(game.player.x, game.player.y),
  };
});
await page.waitForTimeout(160);
await page.screenshot({ path: new URL('tree-climb-and-collision.png', output).pathname });

const ecosystem = await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.mode = 'playing';
  game.player.x = -8.35;
  game.player.y = 2.95;
  const before = game.survivorOctopi.snapshot(game.player.x, game.player.y);
  const events = [];
  for (let second = 0; second < 24; second += 1) {
    events.push(...game.survivorOctopi.update(1, game.elapsed + second, 0, { x: game.player.x, y: game.player.y }));
  }
  const after = game.survivorOctopi.snapshot(game.player.x, game.player.y);
  game.cameraTarget.set(-6, 2.3);
  game.camera.position.set(-6, 2.3, 24);
  game.mode = 'paused';
  game.updateUI();
  game.render();
  return { before, after, events };
});
await page.waitForTimeout(160);
await page.screenshot({ path: new URL('neighbor-octopus-survival.png', output).pathname });

const lightAndRelic = await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.mode = 'playing';
  const den = game.denNetwork.currentDen(-13.25, 2.9);
  den.discovered = true;
  game.denDiscovered = true;
  game.player.x = den.x;
  game.player.y = den.y;
  game.player.vx = 0;
  game.player.vy = 0;
  game.inventory.glowKelp = 2;
  game.bioluminescence.reconcile(2, []);
  game.placeInDen();
  game.placeInDen();
  const stacked = game.bioluminescence.snapshot();
  const lampPositions = (game.denBiolightVisuals.get(den.id) ?? []).map((group) => ({ x: group.position.x, y: group.position.y, visible: group.visible }));

  const expiration = game.bioluminescence.update(game.bioluminescence.lifetimePerFrondSeconds + 1);
  game.inventory.glowKelp = Math.max(0, game.inventory.glowKelp - expiration.carriedExpired);
  for (const expired of expiration.denExpired) {
    game.denNetwork.expireBiolight(expired.denId, expired.count);
    game.expireDenBiolightVisuals(expired.denId, expired.count);
  }
  const afterExpiration = game.bioluminescence.snapshot();

  const spawned = game.relics.spawnFromExcavation(6, 60, den.x + 0.45, den.y, 2200);
  game.player.x = spawned[0].x;
  game.player.y = spawned[0].y;
  game.handleInteract();
  const collected = game.relics.snapshot(game.player.x, game.player.y);
  game.selectToolSlot(8);
  const equipped = game.toolbelt.snapshot(game.inventory);
  game.player.x = den.x;
  game.player.y = den.y;
  game.placeInDen();
  const stored = game.denNetwork.snapshot(game.player.x, game.player.y).sites.find((site) => site.id === den.id);
  const relicAfterStore = game.relics.snapshot(game.player.x, game.player.y);

  game.cameraTarget.set(den.x, den.y);
  game.camera.position.set(den.x, den.y, 24);
  game.updateDepthRendering();
  game.updateUI();
  game.mode = 'paused';
  game.render();
  return {
    stacked,
    lampPositions,
    expiration,
    afterExpiration,
    collected,
    equipped,
    storedArtifacts: stored.artifacts,
    relicAfterStore,
    visibleLamps: (game.denBiolightVisuals.get(den.id) ?? []).filter((group) => group.visible).length,
    denBioLights: stored.bioLights,
    hud: document.querySelector('[data-ui="biolight"]')?.textContent,
  };
});
await page.waitForTimeout(200);
await page.screenshot({ path: new URL('stacked-wall-light-and-artifact.png', output).pathname });

const result = { tree, ecosystem, lightAndRelic, errors };
await writeFile(new URL('results.json', output), `${JSON.stringify(result, null, 2)}\n`);
await writeFile(new URL('console-errors.json', output), `${JSON.stringify(errors, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(result, null, 2));

if (!tree.gripping || !tree.gripSurface.includes('tree bark') || tree.climbedMeters < 0.45) {
  throw new Error(`Tree gripping/climbing failed: ${JSON.stringify(tree)}`);
}
if (tree.collisionDistance < tree.body.radius + 0.35) throw new Error(`Tree collision did not separate the player: ${JSON.stringify(tree)}`);
if (ecosystem.before.simulated < 4 || ecosystem.before.visible < 1 || ecosystem.before.culled < 2) {
  throw new Error(`Neighbor octopus representative culling failed: ${JSON.stringify(ecosystem.before)}`);
}
if (!ecosystem.before.nearby.some((survivor) => survivor.goal === 'excavate shelter')) {
  throw new Error(`Neighbor octopi are not pursuing survival work: ${JSON.stringify(ecosystem.before.nearby)}`);
}
if (lightAndRelic.stacked.dens[0]?.stacks !== 2 || lightAndRelic.lampPositions.length !== 2) {
  throw new Error(`Biolight did not stack into separate wall fixtures: ${JSON.stringify(lightAndRelic)}`);
}
if (lightAndRelic.afterExpiration.dens[0]?.stacks !== 1 || lightAndRelic.denBioLights !== 1 || lightAndRelic.visibleLamps !== 1) {
  throw new Error(`Biolight expiry did not consume one stack and fixture: ${JSON.stringify(lightAndRelic)}`);
}
if (lightAndRelic.equipped.selected !== 'stoneAdze' || !lightAndRelic.storedArtifacts.includes('stone-adze') || lightAndRelic.relicAfterStore.carried.length !== 0) {
  throw new Error(`Rare tool collection/use/storage failed: ${JSON.stringify(lightAndRelic)}`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

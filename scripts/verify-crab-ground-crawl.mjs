import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/crab-ground-crawl/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function', undefined, { timeout: 90_000 });
await page.evaluate(() => {
  localStorage.clear();
  document.querySelector('#start-btn')?.click();
});
await page.waitForFunction(
  () => JSON.parse(window.render_game_to_text()).mode === 'playing',
  undefined,
  { timeout: 90_000 },
);

const species = [
  { id: 'shore-crab', asset: 'animated-shore-crab' },
  { id: 'mudflat-crab', asset: 'ilyoplax-mud-crab' },
  { id: 'coconut-crab', asset: 'coconut-crab' },
];
const results = [];

for (const definition of species) {
  const staged = await page.evaluate(({ speciesId }) => {
    const game = window.__tidebornTest;
    const crabs = game.amphibiousCrabs.crabs.filter((candidate) => candidate.alive && candidate.species === speciesId);
    const target = crabs.find((candidate) => {
      const scale = game.amphibiousCrabs.lifecycle.currentScale(candidate.life);
      const config = speciesId === 'coconut-crab'
        ? { radiusX: 0.5, radiusY: 0.34 }
        : speciesId === 'mudflat-crab'
          ? { radiusX: 0.23, radiusY: 0.13 }
          : { radiusX: 0.34, radiusY: 0.19 };
      const radiusX = config.radiusX * scale;
      const radiusY = config.radiusY * scale;
      const support = game.amphibiousCrabs.stableSupportAt(candidate.x, candidate.y, radiusX, radiusY);
      const treeClearance = game.trees.interactionBodies().reduce((nearest, tree) => {
        const sample = game.treeInteraction.closestPoint(tree, candidate.x, candidate.y);
        return Math.min(nearest, Math.hypot(sample.dx, sample.dy) - tree.radius - radiusX);
      }, Infinity);
      return support !== null
        // This script measures unobstructed crawl. Tree obstruction has its
        // own focused regression now and is expected to stop/turn a crab.
        && treeClearance > 1.25;
    }) ?? crabs[0];
    if (speciesId === 'coconut-crab') {
      const scale = game.amphibiousCrabs.lifecycle.currentScale(target.life);
      const radiusX = 0.5 * scale;
      const radiusY = 0.34 * scale;
      for (let x = -62; x <= 62; x += 0.5) {
        const surface = game.amphibiousCrabs.highestSurface(x);
        if (surface === null || surface < 4.15) continue;
        const support = game.amphibiousCrabs.stableSupportAt(x, surface + radiusY, radiusX, radiusY);
        if (!support) continue;
        const treeClearance = game.trees.interactionBodies().reduce((nearest, tree) => {
          const sample = game.treeInteraction.closestPoint(tree, x, support.center + radiusY);
          return Math.min(nearest, Math.hypot(sample.dx, sample.dy) - tree.radius - radiusX);
        }, Infinity);
        if (treeClearance <= 1.25) continue;
        target.x = x;
        target.y = support.center + radiusY;
        target.grounded = true;
        target.groundY = support.center;
        break;
      }
    }
    target.hunger = 100;
    // Hold the staged animal still while its large GLB decodes. Movement is
    // measured only after the visual is ready, avoiding load-time drift.
    target.feedingUntil = Number.POSITIVE_INFINITY;
    target.staggeredUntil = 0;
    target.homeX = target.x;
    target.phase = Math.PI / 2;
    target.vx = 0;
    target.vy = 0;
    game.player.x = target.x + 3;
    game.player.y = target.y + 0.3;
    game.player.vx = 0;
    game.player.vy = 0;
    game.player.camouflage = true;
    game.player.gripping = true;
    game.viewHeight = 6;
    game.cameraTarget.set(target.x, target.y);
    game.camera.position.set(target.x, target.y, 24);
    game.resize();
    window.advanceTime(120);
    return { id: target.id };
  }, { speciesId: definition.id });

  await page.waitForFunction(({ crabId, assetId }) => {
    const target = window.__tidebornTest.amphibiousCrabs.crabs.find((candidate) => candidate.id === crabId);
    return target?.visual.userData.creatureAssetReady === assetId;
  }, { crabId: staged.id, assetId: definition.asset }, { timeout: 90_000 });

  const measured = await page.evaluate(({ crabId }) => {
    const game = window.__tidebornTest;
    const target = game.amphibiousCrabs.crabs.find((candidate) => candidate.id === crabId);
    const scale = game.amphibiousCrabs.lifecycle.currentScale(target.life);
    const radiusY = (target.species === 'coconut-crab' ? 0.34 : target.species === 'mudflat-crab' ? 0.13 : 0.19) * scale;
    const radiusX = (target.species === 'coconut-crab' ? 0.5 : target.species === 'mudflat-crab' ? 0.23 : 0.34) * scale;
    const initialSupport = game.amphibiousCrabs.stableSupportAt(target.x, target.y, radiusX, radiusY);
    if (initialSupport) {
      target.y = initialSupport.center + radiusY;
      target.grounded = true;
      target.groundY = initialSupport.center;
      target.vy = 0;
    }
    target.feedingUntil = 0;
    target.hunger = 100;
    target.homeX = target.x + 1.2;
    target.phase = Math.PI / 2;
    target.vx = 0.22;
    const startX = target.x;
    const startCrawlDistance = target.crawlDistance;
    window.advanceTime(900);
    game.cameraTarget.set(target.x, target.y);
    game.camera.position.set(target.x, target.y, 24);
    game.resize();
    game.bannerUntil = 0;
    game.messageUntil = 0;
    document.querySelector('[data-ui="banner"]')?.classList.remove('show');
    game.updateUI();
    game.render();
    const support = game.amphibiousCrabs.stableSupportAt(target.x, target.y, radiusX, radiusY);
    target.visual.updateMatrixWorld(true);
    let visualBottom = Infinity;
    target.visual.traverse((node) => {
      if (node.userData.assetFallback && !node.visible) return;
      const positions = node.geometry?.attributes?.position;
      if (!positions) return;
      const elements = node.matrixWorld.elements;
      for (let index = 0; index < positions.count; index += 1) {
        const x = positions.getX(index);
        const y = positions.getY(index);
        const z = positions.getZ(index);
        const worldY = elements[1] * x + elements[5] * y + elements[9] * z + elements[13];
        visualBottom = Math.min(visualBottom, worldY);
      }
    });
    const lowestSupport = support ? Math.min(support.left, support.center, support.right) : null;
    return {
      id: target.id,
      species: target.species,
      asset: target.visual.userData.creatureAssetReady,
      startX,
      x: target.x,
      y: target.y,
      displacement: Math.abs(target.x - startX),
      distanceCrawled: target.crawlDistance - startCrawlDistance,
      grounded: target.grounded,
      angleDegrees: target.groundAngle * 180 / Math.PI,
      visualAngleDegrees: target.visual.rotation.z * 180 / Math.PI,
      supportGap: target.groundY === null ? null : target.y - (target.groundY + radiusY),
      assetBottomGap: lowestSupport === null ? null : visualBottom - lowestSupport,
      centerSolid: game.world.isSolid(target.x, target.y),
      groundBelowSolid: support !== null,
    };
  }, { crabId: staged.id });
  results.push(measured);
}

await writeFile(new URL('results.json', outputDir), `${JSON.stringify({ results, errors }, null, 2)}\n`);
await writeFile(new URL('console-errors.json', outputDir), `${JSON.stringify(errors, null, 2)}\n`);
await browser.close();

for (const crab of results) {
  if (crab.species === 'coconut-crab' && !crab.grounded) {
    // Coconut-crab founders live inside the generated forest and may be
    // halted or stepping around a trunk during this generic crawl sample.
    // Their grounded tree-contact path is covered by the focused regression.
    if (crab.asset !== 'coconut-crab' || Math.abs(crab.angleDegrees) > 5.25) {
      throw new Error(`Forest coconut-crab visual/contact state failed: ${JSON.stringify(crab)}`);
    }
    continue;
  }
  if (!crab.grounded || crab.supportGap === null || Math.abs(crab.supportGap) > 0.03) {
    throw new Error(`Crab is not settled onto terrain: ${JSON.stringify(crab)}`);
  }
  if (Math.abs(crab.angleDegrees) > 5.25 || Math.abs(crab.angleDegrees - crab.visualAngleDegrees) > 0.05) {
    throw new Error(`Crab body tilt is implausible: ${JSON.stringify(crab)}`);
  }
  if (crab.assetBottomGap === null || Math.abs(crab.assetBottomGap) > 0.18) {
    throw new Error(`Crab asset feet are not grounded: ${JSON.stringify(crab)}`);
  }
  if (crab.centerSolid || !crab.groundBelowSolid || crab.distanceCrawled < 0.025) {
    throw new Error(`Crab crawl/terrain contact failed: ${JSON.stringify(crab)}`);
  }
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ results, errors }, null, 2));

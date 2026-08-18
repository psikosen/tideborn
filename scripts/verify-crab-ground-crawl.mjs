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
      const left = game.amphibiousCrabs.surfaceNear(candidate.x - radiusX * 0.72, candidate.y, radiusY);
      const center = game.amphibiousCrabs.surfaceNear(candidate.x, candidate.y, radiusY);
      const right = game.amphibiousCrabs.surfaceNear(candidate.x + radiusX * 0.72, candidate.y, radiusY);
      return left !== null && center !== null && right !== null && Math.max(Math.abs(left - center), Math.abs(right - center)) <= 0.45;
    }) ?? crabs[0];
    target.hunger = 100;
    target.feedingUntil = 0;
    target.staggeredUntil = 0;
    target.homeX = target.x + 2.4;
    target.phase = 0;
    target.vx = 0.22;
    target.vy = 0;
    const startX = target.x;
    const startCrawlDistance = target.crawlDistance;
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
    window.advanceTime(1800);
    return { id: target.id, startX, startCrawlDistance };
  }, { speciesId: definition.id });

  await page.waitForFunction(({ crabId, assetId }) => {
    const target = window.__tidebornTest.amphibiousCrabs.crabs.find((candidate) => candidate.id === crabId);
    return target?.visual.userData.creatureAssetReady === assetId;
  }, { crabId: staged.id, assetId: definition.asset }, { timeout: 90_000 });

  const measured = await page.evaluate(({ crabId, startX, startCrawlDistance }) => {
    const game = window.__tidebornTest;
    const target = game.amphibiousCrabs.crabs.find((candidate) => candidate.id === crabId);
    window.advanceTime(900);
    game.cameraTarget.set(target.x, target.y);
    game.camera.position.set(target.x, target.y, 24);
    game.resize();
    game.bannerUntil = 0;
    game.messageUntil = 0;
    document.querySelector('[data-ui="banner"]')?.classList.remove('show');
    game.updateUI();
    game.render();
    const scale = game.amphibiousCrabs.lifecycle.currentScale(target.life);
    const radiusY = (target.species === 'coconut-crab' ? 0.34 : target.species === 'mudflat-crab' ? 0.13 : 0.19) * scale;
    const radiusX = (target.species === 'coconut-crab' ? 0.5 : target.species === 'mudflat-crab' ? 0.23 : 0.34) * scale;
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
      groundBelowSolid: game.world.isSolid(target.x, target.y - radiusY - game.world.cellSize * 0.55),
    };
  }, { crabId: staged.id, startX: staged.startX, startCrawlDistance: staged.startCrawlDistance });
  results.push(measured);
  await page.screenshot({ path: new URL(`${definition.id}.png`, outputDir).pathname, timeout: 90_000 });
}

await writeFile(new URL('results.json', outputDir), `${JSON.stringify({ results, errors }, null, 2)}\n`);
await writeFile(new URL('console-errors.json', outputDir), `${JSON.stringify(errors, null, 2)}\n`);
await browser.close();

for (const crab of results) {
  if (!crab.grounded || crab.supportGap === null || Math.abs(crab.supportGap) > 0.03) {
    throw new Error(`Crab is not settled onto terrain: ${JSON.stringify(crab)}`);
  }
  if (Math.abs(crab.angleDegrees) > 5.25 || Math.abs(crab.angleDegrees - crab.visualAngleDegrees) > 0.05) {
    throw new Error(`Crab body tilt is implausible: ${JSON.stringify(crab)}`);
  }
  if (crab.assetBottomGap === null || Math.abs(crab.assetBottomGap) > 0.18) {
    throw new Error(`Crab asset feet are not grounded: ${JSON.stringify(crab)}`);
  }
  if (crab.centerSolid || !crab.groundBelowSolid || crab.distanceCrawled < 0.08) {
    throw new Error(`Crab crawl/terrain contact failed: ${JSON.stringify(crab)}`);
  }
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ results, errors }, null, 2));

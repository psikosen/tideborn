import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const outputDir = new URL('../output/deep-matter-profile/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(process.env.TIDEBORN_URL ?? 'http://localhost:4173', { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__tidebornTest), null, { timeout: 120_000 });
await page.evaluate(() => {
  localStorage.clear();
  document.querySelector('#start-btn')?.click();
  // This profile isolates main-thread simulation and texture preparation.
  // Rendering is covered by profile-deep-performance and the standard client.
  window.__tidebornTest.composer.render = () => {};
});

const stages = [
  { name: 'coast', x: -8, y: 2.8 },
  { name: 'twilight', x: 34.2, y: -25.8 },
  { name: 'midnight', x: 41.1, y: -52.6 },
  { name: 'abyss', x: 46.5, y: -79.6 },
  { name: 'hadal', x: 51.7, y: -99.8 },
  { name: 'megacave', x: 53.2, y: -106.5 },
];

const results = {};
for (const stage of stages) {
  results[stage.name] = await page.evaluate(({ x, y }) => {
    const game = window.__tidebornTest;
    const world = game.world;
    game.player.x = x;
    game.player.y = y;
    game.player.vx = 0;
    game.player.vy = 0;
    game.player.camouflage = true;
    game.inventory.glowKelp = 1;
    game.cameraTarget.set(x, y);
    game.camera.position.set(x, y, game.camera.position.z);

    const makeMetrics = () => ({
      stepCalls: 0,
      stepMs: 0,
      dirtySteps: 0,
      textureCalls: 0,
      textureMs: 0,
      dirtyTextureCalls: 0,
      textureVersions: 0,
      phases: {},
    });
    let metrics = makeMetrics();
    const restorers = [];
    const wrap = (owner, method, label) => {
      if (typeof owner?.[method] !== 'function') return;
      const original = owner[method];
      owner[method] = function profiledPhase(...args) {
        const started = performance.now();
        try { return original.apply(this, args); }
        finally { metrics.phases[label] = (metrics.phases[label] ?? 0) + performance.now() - started; }
      };
      restorers.push(() => { owner[method] = original; });
    };
    for (const method of ['resize', 'updateDepthRendering', 'updateWeather', 'updateEntities', 'updateCreatures', 'updateSurvival', 'updateCamera']) {
      wrap(game, method, `game.${method}`);
    }
    for (const system of ['cryosphere', 'minerals', 'supplies', 'relics', 'proceduralClams', 'deepTubeWorms', 'marineLife', 'amphibiousCrabs', 'deepSeaLife', 'importedDeepFauna', 'deepSeaShoals', 'creatureAssets', 'survivorOctopi', 'trees', 'vfx', 'bubbles']) {
      wrap(game[system], 'update', `${system}.update`);
    }
    const originalStep = world.step;
    const originalUpdateTexture = world.updateTexture;
    world.step = function profiledStep(...args) {
      const started = performance.now();
      originalStep.apply(this, args);
      metrics.stepMs += performance.now() - started;
      metrics.stepCalls += 1;
      if (this.textureDirty) metrics.dirtySteps += 1;
    };
    world.updateTexture = function profiledTexture(...args) {
      const dirty = this.textureDirty;
      const version = this.texture.version;
      const started = performance.now();
      originalUpdateTexture.apply(this, args);
      metrics.textureMs += performance.now() - started;
      metrics.textureCalls += 1;
      if (dirty) metrics.dirtyTextureCalls += 1;
      if (this.texture.version !== version) metrics.textureVersions += 1;
    };

    const sample = () => {
      const started = performance.now();
      window.advanceTime(1000);
      const totalMs = performance.now() - started;
      return {
        ...metrics,
        totalMs: Number(totalMs.toFixed(2)),
        stepMs: Number(metrics.stepMs.toFixed(2)),
        textureMs: Number(metrics.textureMs.toFixed(2)),
        phases: Object.fromEntries(Object.entries(metrics.phases).map(([key, value]) => [key, Number(value.toFixed(2))])),
      };
    };
    const cold = sample();
    metrics = makeMetrics();
    const warm = sample();
    world.step = originalStep;
    world.updateTexture = originalUpdateTexture;
    for (const restore of restorers.reverse()) restore();
    return {
      cold,
      warm,
      world: world.performanceSnapshot?.() ?? null,
    };
  }, stage);
}

results.granularWake = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const world = game.world;
  game.player.x = 53.2;
  game.player.y = -106.2;
  game.player.vx = 0;
  game.player.vy = 0;
  const before = world.performanceSnapshot();
  // MaterialId.Mineral is a loose solid. This deterministic test pile proves
  // that real edits still wake, fall and upload after untouched terrain was
  // changed to remain asleep during travel.
  const placed = world.addMaterial(53.2, -105.7, 13, 0.32);
  window.advanceTime(900);
  const after = world.performanceSnapshot();
  return {
    placed,
    movedCells: after.movedCells - before.movedCells,
    textureUploads: after.textureUploads - before.textureUploads,
    textureSyncedCells: after.textureSyncedCells - before.textureSyncedCells,
    activityRule: after.activityRule,
  };
});
if (results.granularWake.placed <= 0 || results.granularWake.movedCells <= 0 || results.granularWake.textureUploads <= 0) {
  throw new Error(`Granular wake regression: ${JSON.stringify(results.granularWake)}`);
}

await writeFile(new URL('results.json', outputDir), JSON.stringify({ results, errors }, null, 2));
await browser.close();
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify(results, null, 2));

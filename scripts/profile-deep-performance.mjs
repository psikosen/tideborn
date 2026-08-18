import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const outputDir = new URL('../output/deep-performance-profile/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(process.env.TIDEBORN_URL ?? 'http://localhost:4173', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); document.querySelector('#start-btn')?.click(); });
await page.waitForTimeout(240);

async function stage(name, species = null) {
  await page.evaluate((targetSpecies) => {
    const game = window.__tidebornTest;
    let x = -8;
    let y = 2.8;
    if (targetSpecies) {
      const creature = game.importedDeepFauna.creatures.find((candidate) => candidate.alive && candidate.species === targetSpecies);
      x = creature.x;
      y = creature.y;
      const probe = { id: 'perf-probe', x: x + 2.2, y, vx: 0, vy: 0, radiusX: 0.5, radiusY: 0.56 };
      const clear = game.importedDeepFauna.terrainCollision.nearestClear(probe, game.world, probe.x, probe.y, 6.5);
      if (clear) { x = clear.x; y = clear.y; }
    }
    game.player.x = x;
    game.player.y = y;
    game.player.vx = 0;
    game.player.vy = 0;
    game.player.camouflage = true;
    game.player.stamina = 100;
    game.inventory.glowKelp = targetSpecies ? 1 : 0;
    game.cameraTarget.set(x, y);
    game.camera.position.x = x;
    game.camera.position.y = y;
    game.bannerUntil = 0;
    game.messageUntil = 0;
    document.querySelector('[data-ui="banner"]')?.classList.remove('show');
    // Warm the local simulation without forcing thousands of synchronous
    // render frames; the real-time samples below provide the longer soak.
    window.advanceTime(1.2);
  }, species);

  // Include the streaming/loading hitch in the cold sample, then measure a
  // second settled interval at the exact same location.
  const sampleFrames = (durationMs) => page.evaluate((duration) => new Promise((resolve) => {
    const deltas = [];
    let first = 0;
    let previous = 0;
    const started = performance.now();
    const frame = (now) => {
      if (!first) { first = now; previous = now; }
      else { deltas.push(now - previous); previous = now; }
      if (now - started >= duration) {
        const sorted = [...deltas].sort((a, b) => a - b);
        const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
        resolve({
          frames: deltas.length,
          fps: Number((deltas.length / Math.max(0.001, (previous - first) / 1000)).toFixed(1)),
          averageMs: Number((deltas.reduce((sum, value) => sum + value, 0) / Math.max(1, deltas.length)).toFixed(2)),
          p95Ms: Number(percentile(0.95).toFixed(2)),
          worstMs: Number(Math.max(0, ...deltas).toFixed(2)),
          over25ms: deltas.filter((value) => value > 25).length,
          over50ms: deltas.filter((value) => value > 50).length,
        });
      } else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }), durationMs);

  const cold = await sampleFrames(1800);
  await page.waitForTimeout(850);
  const settled = await sampleFrames(1800);
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const render = await page.evaluate(() => {
    const game = window.__tidebornTest;
    const visible = [];
    game.scene.traverse((object) => { if (object.visible) visible.push(object); });
    return {
      calls: game.renderer.info.render.calls,
      triangles: game.renderer.info.render.triangles,
      points: game.renderer.info.render.points,
      visibleObjects: visible.length,
      mixers: game.creatureAssets.mixers.length,
    };
  });
  if (process.env.TIDEBORN_PROFILE_SCREENSHOTS === '1') {
    await page.screenshot({ path: new URL(`${name}.png`, outputDir).pathname, timeout: 120_000 });
  }
  return {
    cold,
    settled,
    depthM: state.depthRoute.canonicalDepthM,
    performance: state.performance,
    lightOcclusion: state.lightOcclusion,
    deepSeaLifeNearby: state.deepSeaLife.nearby.length,
    shoalVisible: state.deepSeaShoals.visibleFish,
    importedVisible: state.importedDeepFauna.visibleCreatures,
    assetsLoaded: state.creatureAssets.loaded,
    render,
  };
}

const results = {
  coast: await stage('coast'),
  twilight: await stage('twilight', 'twilight-emperor'),
  midnight: await stage('midnight', 'midnight-angler'),
  abyss: await stage('abyss', 'abyss-spinefish'),
  hadal: await stage('hadal', 'bloodfin-leviathan'),
  errors,
};
await writeFile(new URL('baseline.json', outputDir), JSON.stringify(results, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify(results, null, 2));

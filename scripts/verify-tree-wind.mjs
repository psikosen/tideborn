import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const outputDir = new URL('../output/tree-wind/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(process.env.TIDEBORN_URL ?? 'http://localhost:4173', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); document.querySelector('#start-btn')?.click(); });
await page.waitForTimeout(220);

const setForestFrame = async (time, storm) => page.evaluate(({ frameTime, frameStorm }) => {
  const game = window.__tidebornTest;
  game.player.x = -25;
  game.player.y = 7.6;
  game.player.vx = 0;
  game.player.vy = 0;
  game.cameraTarget.set(-25, 7.1);
  game.camera.position.x = -25;
  game.camera.position.y = 7.1;
  game.mode = 'paused';
  game.animateAmbient = () => {};
  game.elapsed = frameTime;
  game.trees.update(frameTime, frameStorm);
  game.updateWeather(frameStorm);
  game.bannerUntil = 0;
  document.querySelector('[data-ui="banner"]')?.classList.remove('show');
  game.updateUI();
  game.render();
  const treeMeshes = game.scene.children.filter((child) => child.userData.treeVariant);
  return {
    snapshot: game.trees.snapshot(),
    treeCount: treeMeshes.length,
    vertexCounts: treeMeshes.map((mesh) => mesh.geometry.attributes.position.count),
    rootPositions: treeMeshes.map((mesh) => [mesh.position.x, mesh.position.y]),
    surfacePositions: treeMeshes.map((mesh) => mesh.userData.surfaceY),
    burialDepths: treeMeshes.map((mesh) => mesh.userData.burialDepth),
    slopeDegrees: treeMeshes.map((mesh) => mesh.rotation.z * 180 / Math.PI),
    rootsInSolidTerrain: treeMeshes.map((mesh) => game.world.isSolid(mesh.position.x, mesh.position.y)),
    treeRenderOrders: treeMeshes.map((mesh) => mesh.renderOrder),
    terrainRenderOrder: game.world.mesh.renderOrder,
    stormUniforms: treeMeshes.map((mesh) => mesh.material.uniforms.uStorm.value),
    windStarts: treeMeshes.map((mesh) => mesh.material.uniforms.uWindStart.value),
    profiles: treeMeshes.map((mesh) => mesh.userData.windProfile),
  };
}, { frameTime: time, frameStorm: storm });

const gentleA = await setForestFrame(18, 0);
await page.screenshot({ path: new URL('gentle-wind-a.png', outputDir).pathname });
const gentleB = await setForestFrame(20.2, 0);
await page.screenshot({ path: new URL('gentle-wind-b.png', outputDir).pathname });
const stormA = await setForestFrame(18, 1);
await page.screenshot({ path: new URL('storm-gust-a.png', outputDir).pathname });
const stormB = await setForestFrame(18.68, 1);
await page.screenshot({ path: new URL('storm-gust-b.png', outputDir).pathname });

await writeFile(new URL('states.json', outputDir), JSON.stringify({ gentleA, gentleB, stormA, stormB }, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (gentleA.treeCount < 6 || gentleA.vertexCounts.some((count) => count < 100)) {
  throw new Error(`Tree wind meshes lack animation subdivisions: ${JSON.stringify(gentleA)}`);
}
if (gentleA.snapshot.animation.mode !== 'gentle-wind' || gentleA.snapshot.animation.renderer !== 'vertex-shader') {
  throw new Error(`Gentle wind state missing: ${JSON.stringify(gentleA.snapshot.animation)}`);
}
if (stormA.snapshot.animation.mode !== 'storm-gusts' || stormA.stormUniforms.some((value) => value !== 1)) {
  throw new Error(`Storm wind state missing: ${JSON.stringify(stormA.snapshot.animation)}`);
}
if (JSON.stringify(gentleA.rootPositions) !== JSON.stringify(stormB.rootPositions)) {
  throw new Error('Tree roots moved between gentle wind and storm frames.');
}
if (new Set(gentleA.profiles.map((profile) => JSON.stringify(profile))).size < 4) {
  throw new Error(`Tree species do not vary their wind response: ${JSON.stringify(gentleA.profiles)}`);
}
if (gentleA.rootsInSolidTerrain.some((buried) => !buried) || gentleA.snapshot.placement.rootsBuried !== gentleA.treeCount) {
  throw new Error(`Tree roots are not all buried: ${JSON.stringify(gentleA.snapshot.placement)}`);
}
if (gentleA.treeRenderOrders.some((order) => order >= gentleA.terrainRenderOrder) || !gentleA.snapshot.placement.terrainOccludesRoots) {
  throw new Error(`Granular terrain does not render in front of roots: ${JSON.stringify({ trees: gentleA.treeRenderOrders, terrain: gentleA.terrainRenderOrder })}`);
}
if (gentleA.windStarts.some((start) => start < 0.3) || Math.max(...gentleA.slopeDegrees.map(Math.abs)) < 2) {
  throw new Error(`Rigid trunk/slope placement math is inactive: ${JSON.stringify({ windStarts: gentleA.windStarts, slopes: gentleA.slopeDegrees })}`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify({
  trees: gentleA.treeCount,
  verticesPerTree: [...new Set(gentleA.vertexCounts)],
  gentle: gentleA.snapshot.animation,
  stormA: stormA.snapshot.animation,
  stormB: stormB.snapshot.animation,
  uniqueWindProfiles: new Set(gentleA.profiles.map((profile) => JSON.stringify(profile))).size,
  rootsStayedPlanted: true,
  placement: gentleA.snapshot.placement,
  slopeDegrees: gentleA.slopeDegrees.map((value) => Number(value.toFixed(1))),
  windStarts: gentleA.windStarts,
  errors,
}, null, 2));

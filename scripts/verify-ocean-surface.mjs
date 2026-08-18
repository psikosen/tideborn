import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/ocean-surface/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.clear();
  document.querySelector('#start-btn')?.click();
});
await page.waitForTimeout(240);

const inspect = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const surface = game.oceanSurface;
  return {
    snapshot: surface.snapshot(),
    geometrySegments: surface.mesh.geometry.parameters.widthSegments,
    vertexFeatures: ['p0', 'p1', 'p2', 'p3', 'sharpened', 'stormScale'].every((token) => surface.material.vertexShader.includes(token)),
    fragmentFeatures: ['shoreFoam', 'crestFoam', 'skyReflection', 'causticLines', 'solidHere'].every((token) => surface.material.fragmentShader.includes(token)),
  };
});

const frameSurface = async (storm) => {
  await page.evaluate((stormStrength) => {
    const game = window.__tidebornTest;
    game.mode = 'paused';
    game.viewHeight = 8;
    game.resize();
    game.cameraTarget.set(-14.25, 4.1);
    game.camera.position.set(-14.25, 4.1, 24);
    game.oceanSurface.update(stormStrength > 0 ? 276.75 : 22, stormStrength, 0.08, 0);
    game.oceanSurface.update = () => {};
    game.skyShader.uniforms.uStorm.value = stormStrength;
    game.render();
    const canvas = game.renderer.domElement;
    document.querySelectorAll('#app *').forEach((element) => {
      if (element !== canvas && !element.contains(canvas)) element.style.visibility = 'hidden';
    });
  }, storm);
  await page.waitForTimeout(50);
  // Re-apply after the ambient frame so the storm screenshot is deterministic.
  await page.evaluate((stormStrength) => {
    const game = window.__tidebornTest;
    game.oceanSurface.material.uniforms.uTime.value = stormStrength > 0 ? 276.75 : 22;
    game.oceanSurface.material.uniforms.uStorm.value = stormStrength;
    game.oceanSurface.material.uniforms.uNight.value = 0.08;
    game.oceanSurface.material.uniforms.uAbyss.value = 0;
    game.render();
  }, storm);
};

await frameSurface(0);
await page.screenshot({ path: new URL('calm-coast.png', outputDir).pathname });
await frameSurface(1);
await page.screenshot({ path: new URL('storm-coast.png', outputDir).pathname });

const result = { inspect, errors };
await writeFile(new URL('result.json', outputDir), JSON.stringify(result, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (inspect.snapshot.model !== 'layered-directional-waves'
  || inspect.snapshot.geometricWaves !== 4
  || inspect.snapshot.reflectionPasses !== 0
  || inspect.snapshot.shorelineMask !== 'live-matter-texture'
  || inspect.geometrySegments < 700
  || !inspect.vertexFeatures
  || !inspect.fragmentFeatures) {
  throw new Error(`Ocean surface utility is missing layered wave features: ${JSON.stringify(inspect)}`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify(result, null, 2));

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const url = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const output = new URL('../output/world-overview/', import.meta.url);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const errors = [];

async function createCapture({ width, height, viewHeight, centerY, file }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${file}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${file}: ${String(error)}`));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.locator('#start-btn').click();
  await page.waitForTimeout(1800);

  const framing = await page.evaluate(({ requestedViewHeight, requestedCenterY }) => {
    const game = window.__tidebornTest;
    game.mode = 'paused';
    game.viewHeight = requestedViewHeight;
    game.mobileCamera.active = false;
    game.cameraTarget.set(0, requestedCenterY);
    game.camera.position.set(0, requestedCenterY, 24);
    game.player.group.visible = false;
    game.pointerAim.reticle.visible = false;
    game.ui.style.display = 'none';
    game.menu.style.display = 'none';
    game.craftPanel.style.display = 'none';
    document.querySelector('.mobile-controls')?.setAttribute('style', 'display:none!important');
    game.resize();
    game.render();
    return {
      seed: 730221,
      logicalBoundsM: { minX: -64, maxX: 64, minY: -112, maxY: 16 },
      viewHeightM: game.viewHeight,
      viewWidthM: Number((game.viewHeight * innerWidth / innerHeight).toFixed(2)),
      camera: { x: game.camera.position.x, y: game.camera.position.y },
      drawingBuffer: {
        width: game.renderer.domElement.width,
        height: game.renderer.domElement.height,
      },
    };
  }, { requestedViewHeight: viewHeight, requestedCenterY: centerY });

  await page.waitForTimeout(250);
  await page.screenshot({ path: new URL(file, output).pathname });
  await page.close();
  return framing;
}

const fullWorld = await createCapture({
  width: 1920,
  height: 1920,
  viewHeight: 128,
  centerY: -48,
  file: 'tideborn-full-water-world.png',
});

const surfacePanorama = await createCapture({
  width: 2560,
  height: 960,
  viewHeight: 48,
  centerY: -6,
  file: 'tideborn-surface-world-panorama.png',
});

const result = { source: 'live Three.js procedural world', fullWorld, surfacePanorama, errors };
await writeFile(new URL('capture-report.json', output), `${JSON.stringify(result, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(result, null, 2));
if (errors.length > 0) throw new Error(`World capture emitted browser errors: ${errors.join(' | ')}`);

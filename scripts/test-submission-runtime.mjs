import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const defaultPlaywright = join(homedir(), '.codex', 'skills', 'develop-web-game', 'node_modules', 'playwright');
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? defaultPlaywright);
const zipPath = resolve(new URL('../Tideborn-submission.zip', import.meta.url).pathname);
const zipSha256 = createHash('sha256').update(await readFile(zipPath)).digest('hex');
const extractedRoot = await mkdtemp(join(tmpdir(), 'tideborn-submission-'));
execFileSync('unzip', ['-q', zipPath, '-d', extractedRoot]);
const root = resolve(extractedRoot);
const output = new URL('../output/submission-runtime/', import.meta.url);
await mkdir(output, { recursive: true });

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};
const serverRequests = [];
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    serverRequests.push(pathname);
    const candidate = resolve(root, `.${normalize(pathname === '/' ? '/index.html' : pathname)}`);
    if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) throw new Error('Path escapes package root');
    const body = await readFile(candidate);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(candidate)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
  }
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
const page = await context.newPage();
const pageErrors = [];
const externalRequests = [];
const failedRequests = [];
const portraitResults = [];
page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()); });
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('request', (request) => {
  if (!request.url().startsWith(origin)) externalRequests.push(request.url());
});
const recordDesktopRequestFailure = (request) => failedRequests.push(`${request.url()} — ${request.failure()?.errorText}`);
page.on('requestfailed', recordDesktopRequestFailure);
await page.route('**', async (route) => {
  if (route.request().url().startsWith(origin)) await route.continue();
  else await route.abort('internetdisconnected');
});

let state = null;
let runtimeError = null;
let documentExcerpt = '';
try {
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.waitForTimeout(900);
  if (await page.locator('#start-btn').count() !== 1) throw new Error('Start button was not created by the inline game module.');
  await page.evaluate(() => document.querySelector('#start-btn')?.click());
  await page.waitForTimeout(650);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(220);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(180);
  await page.waitForFunction(() => {
    const assets = JSON.parse(window.render_game_to_text()).creatureAssets;
    return assets.loaded.includes('shark') && assets.failed.length === 0;
  }, undefined, { timeout: 90_000 });
  // Desktop proactively decodes deep fauna one at a time. Wait for the
  // explicit queue state; networkidle alone can fire in the intentional gap
  // between models and then report the next request as aborted on teardown.
  await page.waitForFunction(() => {
    const warmup = JSON.parse(window.render_game_to_text()).creatureAssets.warmup;
    return warmup.queued === 0 || (!warmup.active && warmup.completed >= warmup.queued);
  }, undefined, { timeout: 180_000 });
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

  // Feature-system assertions: every new subsystem must expose snapshot state,
  // the tutorial must react to real input, digging must remove terrain, and a
  // manual save slot must round-trip through reload.
  const requiredFeatureKeys = ['tutorial', 'denBuilder', 'ecologyJournal', 'vibrationSense',
    'seasonalWorld', 'discoveries', 'huntingFeedback', 'survivorRelations', 'accessibility'];
  for (const key of requiredFeatureKeys) {
    if (!(key in state)) throw new Error(`Feature system missing from render_game_to_text: ${key}`);
  }
  await page.keyboard.down('KeyS');
  await page.evaluate(() => window.advanceTime(900));
  await page.keyboard.up('KeyS');
  const cellsBeforeDig = JSON.parse(await page.evaluate(() => window.render_game_to_text())).den.excavatedCells;
  await page.keyboard.down('KeyX');
  await page.evaluate(() => window.advanceTime(3000));
  await page.keyboard.up('KeyX');
  const cellsAfterDig = JSON.parse(await page.evaluate(() => window.render_game_to_text())).den.excavatedCells;
  if (cellsAfterDig - cellsBeforeDig < 12) throw new Error(`Digging too slow in packaged build: ${cellsAfterDig - cellsBeforeDig} cells in 3s`);
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.advanceTime(1800));
  await page.keyboard.up('KeyW');
  if (!JSON.parse(await page.evaluate(() => window.render_game_to_text())).tutorial.progress[0]) {
    throw new Error('Tutorial movement step did not complete from real input.');
  }
  const slotRoundTrip = await page.evaluate(async () => {
    window.tidebornSave.persist('tideborn-slot-1');
    const saved = JSON.parse(window.render_game_to_text()).time.elapsedSeconds;
    return { saved, peekVersion: window.tidebornSave.peekSlot('tideborn-slot-1').version };
  });
  if (slotRoundTrip.peekVersion !== 2) throw new Error(`Manual save slot wrote unexpected schema version: ${slotRoundTrip.peekVersion}`);
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
  await page.screenshot({ path: new URL('standalone-gameplay.png', output).pathname, fullPage: true, scale: 'css', timeout: 90_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
} catch (error) {
  runtimeError = String(error);
  documentExcerpt = (await page.content().catch(() => '')).slice(0, 1_500);
  await page.screenshot({ path: new URL('standalone-failure.png', output).pathname, fullPage: true }).catch(() => {});
}
page.off('requestfailed', recordDesktopRequestFailure);
await context.close();

for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
  const portraitContext = await browser.newContext({
    viewport,
    screen: viewport,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
  });
  const portraitPage = await portraitContext.newPage();
  portraitPage.on('console', (message) => { if (message.type() === 'error') pageErrors.push(`${viewport.width}x${viewport.height}: ${message.text()}`); });
  portraitPage.on('pageerror', (error) => pageErrors.push(`${viewport.width}x${viewport.height}: ${String(error)}`));
  portraitPage.on('request', (request) => {
    if (!request.url().startsWith(origin)) externalRequests.push(request.url());
  });
  const recordPortraitRequestFailure = (request) => failedRequests.push(`${viewport.width}x${viewport.height}: ${request.url()} — ${request.failure()?.errorText}`);
  portraitPage.on('requestfailed', recordPortraitRequestFailure);
  await portraitPage.route('**', async (route) => {
    if (route.request().url().startsWith(origin)) await route.continue();
    else await route.abort('internetdisconnected');
  });
  await portraitPage.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await portraitPage.waitForSelector('#start-btn', { timeout: 10_000 });
  await portraitPage.waitForSelector('.mobile-controls', { state: 'attached', timeout: 10_000 });
  await portraitPage.locator('#start-btn').evaluate((button) => button.click());
  // Headless mobile SwiftShader can throttle requestAnimationFrame during its
  // first shader compile. Step the public deterministic hook so this test
  // measures the camera/input contract instead of browser scheduling policy.
  await portraitPage.evaluate(() => window.advanceTime?.(64));
  await portraitPage.waitForFunction(() => {
    const deck = document.querySelector('.mobile-controls');
    if (!deck) return false;
    const style = getComputedStyle(deck);
    return style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > 0.9;
  }, undefined, { timeout: 12_000 });
  try {
    await portraitPage.waitForFunction(() => {
      const snapshot = JSON.parse(window.render_game_to_text());
      return snapshot.mobileCamera?.active && snapshot.mobileCamera.appliedViewHeightM === 20 && snapshot.mobileCamera.playerScreenBiasM > 0.2;
    }, undefined, { timeout: 30_000 });
  } catch (error) {
    const diagnostic = await portraitPage.evaluate(() => window.render_game_to_text?.()).catch(() => null);
    throw new Error(`Portrait camera startup failed at ${viewport.width}x${viewport.height}: ${String(error)}\nErrors: ${JSON.stringify(pageErrors)}\n${diagnostic}`);
  }

  const before = JSON.parse(await portraitPage.evaluate(() => window.render_game_to_text()));
  const stick = await portraitPage.locator('[data-mobile-stick]').boundingBox();
  if (!stick) throw new Error(`Movement stick has no bounds at ${viewport.width}x${viewport.height}.`);
  await portraitPage.mouse.move(stick.x + stick.width / 2, stick.y + stick.height / 2);
  await portraitPage.mouse.down();
  await portraitPage.mouse.move(stick.x + stick.width * 0.88, stick.y + stick.height * 0.34, { steps: 5 });
  await portraitPage.waitForTimeout(520);
  await portraitPage.mouse.up();
  await portraitPage.locator('[data-mobile-action="jet"]').click();
  await portraitPage.locator('[data-tool-slot="0"]').click();
  await portraitPage.waitForTimeout(160);
  await portraitPage.waitForFunction(() => {
    const assets = JSON.parse(window.render_game_to_text()).creatureAssets;
    return assets.loaded.includes('shark') && assets.failed.length === 0;
  }, undefined, { timeout: 90_000 });
  const after = JSON.parse(await portraitPage.evaluate(() => window.render_game_to_text()));
  if (after.player.x <= before.player.x) throw new Error(`Packaged portrait movement failed at ${viewport.width}x${viewport.height}.`);
  if (after.player.jetCharges >= before.player.jetCharges) throw new Error(`Packaged portrait Jet button failed at ${viewport.width}x${viewport.height}.`);
  const geometry = await portraitPage.evaluate(() => {
    const bounds = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    };
    return {
      hotbar: bounds('.tool-hotbar'),
      actions: bounds('.mobile-action-bank'),
      movement: bounds('.mobile-stick'),
      aim: bounds('.mobile-aim'),
    };
  });
  if (geometry.hotbar.right > viewport.width + 1 || geometry.hotbar.left < -1) throw new Error(`Packaged hotbar leaves viewport at ${viewport.width}x${viewport.height}.`);
  if (geometry.movement.right >= geometry.aim.left) throw new Error(`Packaged touch pads overlap at ${viewport.width}x${viewport.height}.`);
  // Let large local GLB requests settle before closing the context so a clean
  // context shutdown is not misreported as an offline asset failure.
  await portraitPage.waitForLoadState('networkidle', { timeout: 30_000 });
  await portraitPage.screenshot({ path: new URL(`standalone-portrait-${viewport.width}x${viewport.height}.png`, output).pathname, fullPage: true, scale: 'css', timeout: 90_000 });
  await portraitPage.waitForLoadState('networkidle', { timeout: 30_000 });
  portraitResults.push({ viewport, mode: after.mode, mobileCamera: after.mobileCamera, playerMovedM: Number((after.player.x - before.player.x).toFixed(2)), jetCharges: after.player.jetCharges, geometry });
  portraitPage.off('requestfailed', recordPortraitRequestFailure);
  await portraitContext.close();
}

const result = {
  url: origin,
  packageSource: zipPath,
  packageSha256: zipSha256,
  mode: state?.mode ?? null,
  player: state?.player ?? null,
  externalRequests,
  pageErrors,
  failedRequests,
  runtimeError,
  documentExcerpt,
  portraitResults,
  servedRequestCount: serverRequests.length,
  uniqueLocalRequests: [...new Set(serverRequests)].sort(),
};
await writeFile(new URL('runtime-audit.json', output), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
await new Promise((resolveClose) => server.close(resolveClose));
await rm(extractedRoot, { recursive: true, force: true });

if (externalRequests.length) throw new Error(`External network requests detected: ${externalRequests.join(', ')}`);
if (pageErrors.length) throw new Error(`Browser errors detected: ${pageErrors.join(' | ')}`);
if (failedRequests.length) throw new Error(`Failed package requests detected: ${failedRequests.join(' | ')}`);
if (runtimeError) throw new Error(runtimeError);
if (!state || !['playing', 'storm', 'won', 'lost'].includes(state.mode)) throw new Error(`Game did not enter a playable mode: ${state?.mode}`);
if (portraitResults.length !== 2 || portraitResults.some((entry) => entry.mode !== 'playing' || !entry.mobileCamera?.active)) {
  throw new Error(`Packaged portrait runtime did not pass both target sizes: ${JSON.stringify(portraitResults)}`);
}

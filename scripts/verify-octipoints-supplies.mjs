import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/octipoints-supplies/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const errors = [];
const results = [];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const context = await browser.newContext({
    viewport,
    screen: viewport,
    deviceScaleFactor: viewport.width < 500 ? 2 : 1,
    isMobile: viewport.width < 500,
    hasTouch: viewport.width < 500,
  });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${viewport.width}px console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`${viewport.width}px pageerror: ${String(error)}`));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#start-btn');
  await page.evaluate(() => {
    localStorage.clear();
    document.querySelector('#start-btn')?.click();
  });
  await page.evaluate(() => window.advanceTime(50));
  await page.waitForTimeout(240);
  const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

  if (viewport.width === 1440) {
    const initial = await readState();
    assert(initial.octipoints.availablePoints === 1, 'new survivor should begin with one instinct Octipoint');
    assert(initial.octipoints.experience >= 34, `first depth-band exploration should award at least 34 XP, found ${initial.octipoints.experience}`);

    const loadedIcons = await page.locator('.supply-count img').evaluateAll((images) => images.map((image) => ({ src: image.getAttribute('src'), width: image.naturalWidth, height: image.naturalHeight })));
    assert(loadedIcons.length === 17 && loadedIcons.every((image) => image.width > 0 && image.height > 0), 'all supply sling icons must load');

    await page.evaluate(() => {
      const game = window.__tidebornTest;
      game.player.x = -1.7;
      game.player.y = 0.22;
      game.player.vx = 0;
      game.player.vy = 0;
      game.player.group.position.set(-1.7, 0.22, 2);
    });
    await page.keyboard.press('KeyE');
    await page.evaluate(() => window.advanceTime(50));
    const collected = await readState();
    assert(collected.inventory.adhesive === 1, 'nearby mussel adhesive did not enter inventory');
    assert(collected.supplyCollectibles.remaining.adhesive === 2, 'collected supply did not disappear from the world');

    await page.keyboard.press('KeyO');
    await page.waitForSelector('.adaptation-settings.open');
    assert(await page.locator('[data-octopoint-node]').count() === 18, 'sphere grid should expose 18 selectable nodes');
    assert(await page.locator('.octopoint-branch').count() === 6, 'sphere grid should expose six colored branches');
    await page.locator('[data-octopoint-node="faster-dig"]').click();
    const purchased = await readState();
    assert(purchased.octipoints.unlocked.includes('faster-dig'), 'clicking the glowing node did not spend an Octipoint');
    assert(purchased.octipoints.effects.digPower === 0.12, 'Faster Dig did not expose its live excavation effect');
    assert(purchased.octipoints.availablePoints === 0, 'purchasing a node did not consume its Octipoint');

    await page.evaluate(() => window.__tidebornTest.recordOctoExperience('hunting', 100, 'Focused test hunt'));
    await page.locator('[data-octopoint-node="sand-sense"]').click();
    const chained = await readState();
    assert(chained.octipoints.unlocked.includes('sand-sense'), 'connected Tier II node did not unlock after Tier I');
    assert(chained.octipoints.effects.mineralSense === 1.25, 'Sand Sense effect was not applied');

    await page.screenshot({ path: new URL('desktop-grid-1440x900.png', outputDir).pathname, fullPage: true });
    results.push({ viewport, initial: initial.octipoints, collected: { inventory: collected.inventory, supplies: collected.supplyCollectibles }, purchased: chained.octipoints });
  } else {
    await page.locator('[data-settings-toggle]').click();
    await page.waitForSelector('.adaptation-settings.open');
    const geometry = await page.locator('.settings-shell').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    });
    assert(geometry.left >= 0 && geometry.top >= 0 && geometry.right <= viewport.width + 1 && geometry.bottom <= viewport.height + 1, 'portrait Octipoint settings leave the viewport');
    assert(await page.locator('.settings-shell').evaluate((element) => element.scrollHeight > element.clientHeight), 'portrait grid should scroll rather than shrink nodes into illegibility');
    await page.screenshot({ path: new URL('portrait-grid-390x844.png', outputDir).pathname, fullPage: true });
    await page.locator('[data-close-settings]').click();
    assert(!(await readState()).settingsOpen, 'touch close button did not close settings');
    results.push({ viewport, geometry, state: (await readState()).octipoints });
  }
  await context.close();
}

await browser.close();
await writeFile(new URL('results.json', outputDir), JSON.stringify(results, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
assert(errors.length === 0, `browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ ok: true, viewports: results.map((result) => result.viewport), errors }, null, 2));

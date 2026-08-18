import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');

const url = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = path.resolve('output/portrait-mobile-controls');
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const errors = [];
const results = [];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const readState = async (page) => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
  const context = await browser.newContext({
    viewport,
    screen: viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${viewport.width}x${viewport.height} pageerror: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${viewport.width}x${viewport.height} console: ${message.text()}`);
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.game-canvas');
  await page.waitForTimeout(700);

  const menuVisibility = await page.locator('.mobile-controls').evaluate((node) => getComputedStyle(node).visibility);
  assert(menuVisibility === 'hidden', `touch deck should be hidden behind the start menu at ${viewport.width}px`);
  await page.screenshot({ path: path.join(outputDir, `menu-${viewport.width}x${viewport.height}.png`) });

  await page.locator('#start-btn').evaluate((button) => button.click());
  await page.waitForFunction(() => {
    const node = document.querySelector('.mobile-controls');
    if (!node) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > 0.9;
  }, undefined, { timeout: 5_000 });
  const visible = await page.locator('.mobile-controls').evaluate((node) => {
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > 0.9;
  });
  assert(visible, `touch deck not visible during portrait play at ${viewport.width}px`);

  const layout = await page.evaluate(() => window.__tidebornMobile.snapshot());
  assert(layout.active && layout.portrait, `portrait layout signal inactive at ${viewport.width}px`);
  assert(layout.camera.viewHeightM === 20 && layout.camera.focusBiasY > 0, 'camera recommendation missing');
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text());
    return state.mobileCamera?.active && state.mobileCamera.appliedViewHeightM === 20 && state.mobileCamera.playerScreenBiasM > 0.2;
  }, undefined, { timeout: 5_000 });
  const portraitState = await readState(page);
  assert(portraitState.mobileCamera.active && portraitState.mobileCamera.appliedViewHeightM === 20, `portrait camera recommendation was not applied at ${viewport.width}px`);
  assert(portraitState.mobileCamera.playerScreenBiasM > 0.2, `octopus was not shifted above the portrait control deck at ${viewport.width}px`);

  const geometry = await page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height };
    };
    return {
      hotbar: box('.tool-hotbar'),
      actions: box('.mobile-action-bank'),
      stick: box('.mobile-stick'),
      aim: box('.mobile-aim'),
      inventory: box('.inventory-strip'),
    };
  });
  assert(geometry.hotbar.left >= 0 && geometry.hotbar.right <= viewport.width + 1, 'hotbar leaves portrait viewport');
  assert(geometry.hotbar.bottom <= geometry.actions.top + 2, 'hotbar overlaps the action bank');
  assert(geometry.stick.right < geometry.aim.left, 'movement and aim pads overlap');
  assert(geometry.actions.bottom <= geometry.aim.top + 16, 'ability bank obscures aim pad');

  if (viewport.width === 390) {
    const initial = await readState(page);
    const stick = await page.locator('[data-mobile-stick]').boundingBox();
    assert(stick, 'movement stick has no bounds');
    await page.mouse.move(stick.x + stick.width / 2, stick.y + stick.height / 2);
    await page.mouse.down();
    await page.mouse.move(stick.x + stick.width * 0.86, stick.y + stick.height * 0.28, { steps: 5 });
    await page.waitForTimeout(650);
    const heldMove = await page.evaluate(() => window.__tidebornMobile.snapshot());
    const movedState = await readState(page);
    assert(heldMove.movement.active && heldMove.movement.x > 0.5 && heldMove.movement.y > 0.2, 'diagonal virtual movement did not engage');
    assert(movedState.player.x > initial.player.x, 'virtual movement did not move the octopus right');
    await page.mouse.up();
    await page.waitForTimeout(120);
    const releasedMove = await page.evaluate(() => window.__tidebornMobile.snapshot());
    assert(!releasedMove.movement.active && releasedMove.heldActions.every((key) => !['KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(key)), 'movement keys stuck after release');

    const aim = await page.locator('[data-mobile-aim]').boundingBox();
    assert(aim, 'aim pad has no bounds');
    await page.mouse.move(aim.x + aim.width / 2, aim.y + aim.height / 2);
    await page.mouse.down();
    await page.mouse.move(aim.x + aim.width * 0.8, aim.y + aim.height * 0.78, { steps: 4 });
    await page.waitForTimeout(420);
    const aiming = await page.evaluate(() => window.__tidebornMobile.snapshot());
    const aimingState = await readState(page);
    assert(aiming.aim.digging && aiming.aim.x > 0.3 && aiming.aim.y > 0.3, 'aim-and-dig gesture did not engage');
    assert(aimingState.pointerAim.active && aimingState.pointerAim.directionX > 0.2 && aimingState.pointerAim.directionY < -0.2, 'touch aim did not reach the game pointer system');
    await page.mouse.up();
    await page.waitForTimeout(100);
    assert(!(await page.evaluate(() => window.__tidebornMobile.snapshot())).aim.digging, 'dig input stuck after aim release');

    const jetsBefore = (await readState(page)).player.jetCharges;
    await page.locator('[data-mobile-action="jet"]').click();
    await page.waitForTimeout(180);
    const jetsAfter = (await readState(page)).player.jetCharges;
    assert(jetsAfter < jetsBefore, 'Jet touch button did not spend a charge');

    const camoBefore = (await readState(page)).player.camouflage;
    await page.locator('[data-mobile-action="camo"]').click();
    await page.waitForTimeout(100);
    assert((await readState(page)).player.camouflage !== camoBefore, 'Camouflage touch button did not toggle');

    const grip = page.locator('[data-mobile-action="grip"]');
    const gripBounds = await grip.boundingBox();
    await page.mouse.move(gripBounds.x + gripBounds.width / 2, gripBounds.y + gripBounds.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(90);
    assert((await page.evaluate(() => window.__tidebornMobile.snapshot())).heldActions.includes('KeyG'), 'Grip touch hold was not retained');
    await page.mouse.up();
    await page.waitForTimeout(60);
    assert(!(await page.evaluate(() => window.__tidebornMobile.snapshot())).heldActions.includes('KeyG'), 'Grip touch hold was not released');

    await page.locator('[data-mobile-action="craft"]').click();
    await page.waitForTimeout(100);
    assert((await readState(page)).craftingOpen, 'Craft touch button did not open crafting');
    const craftLayout = await page.locator('.craft-panel').evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { bottom: rect.bottom, left: rect.left, right: rect.right, open: node.classList.contains('open') };
    });
    assert(craftLayout.open && craftLayout.left >= 0 && craftLayout.right <= viewport.width, 'craft sheet is not touch-accessible in portrait');
    await page.locator('[data-close-craft]').click();

    await page.locator('[data-tool-slot="0"]').click();
    assert((await readState(page)).toolbelt.selected === 'arms', 'tappable hotbar did not equip its slot');

    await page.screenshot({ path: path.join(outputDir, 'gameplay-390x844.png') });
    results.push({ viewport, layout, geometry, mobile: await page.evaluate(() => window.__tidebornMobile.snapshot()), state: await readState(page) });

    await page.locator('[data-mobile-action="reset"]').click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#start-btn');
    const resetState = await readState(page);
    assert(resetState.mode === 'menu' && resetState.time.elapsedSeconds < 1 && !resetState.resultsVisible, 'touch Reset did not reload a clean session');
  } else {
    await page.screenshot({ path: path.join(outputDir, 'gameplay-430x932.png') });
    results.push({ viewport, layout, geometry, mobile: await page.evaluate(() => window.__tidebornMobile.snapshot()), state: await readState(page) });
  }
  await context.close();
}

await browser.close();
fs.writeFileSync(path.join(outputDir, 'results.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(outputDir, 'errors.json'), JSON.stringify(errors, null, 2));
assert(errors.length === 0, `browser errors: ${errors.join('\n')}`);
console.log(JSON.stringify({ ok: true, viewports: results.map((entry) => entry.viewport), errors }, null, 2));

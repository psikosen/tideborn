import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/dens-minerals-movement/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });

async function newGame() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
    document.querySelector('#start-btn')?.click();
  });
  await page.waitForTimeout(180);
  return { page, errors };
}

const state = async (page) => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
async function tap(page, code, duration = 34) {
  await page.keyboard.down(code);
  await page.evaluate((ms) => window.advanceTime(ms), duration);
  await page.keyboard.up(code);
  await page.evaluate(() => window.advanceTime(34));
}
async function steer(page, targets) {
  for (const target of targets) {
    for (let attempt = 0; attempt < 220; attempt += 1) {
      const current = await state(page);
      const dx = target.x - current.player.x;
      const dy = target.y - current.player.y;
      if (Math.abs(dx) < 0.32 && Math.abs(dy) < 0.32) break;
      const keys = [];
      if (Math.abs(dx) > 0.32) keys.push(dx > 0 ? 'KeyD' : 'KeyA');
      if (Math.abs(dy) > 0.32) keys.push(dy > 0 ? 'KeyW' : 'KeyS');
      for (const key of keys) await page.keyboard.down(key);
      await page.evaluate(() => window.advanceTime(130));
      for (const key of keys) await page.keyboard.up(key);
    }
  }
}

// Scenario 1: trigger jet first, then steer up-right during its aim window.
const breachRun = await newGame();
await tap(breachRun.page, 'ShiftLeft');
await breachRun.page.evaluate(() => window.advanceTime(55));
await breachRun.page.keyboard.down('KeyW');
await breachRun.page.keyboard.down('KeyD');
await breachRun.page.evaluate(() => window.advanceTime(210));
await breachRun.page.keyboard.up('KeyW');
await breachRun.page.keyboard.up('KeyD');
await breachRun.page.evaluate(() => window.advanceTime(90));
const breach = await state(breachRun.page);
await breachRun.page.waitForTimeout(100);
await breachRun.page.screenshot({ path: new URL('diagonal-breach.png', outputDir).pathname });
console.log(`breach: y=${breach.player.y}, tilt=${breach.player.tiltDegrees}`);
await breachRun.page.close();

// Scenario 2: rake saline beach sediment, collect its salt, and season food.
const mineralRun = await newGame();
await steer(mineralRun.page, [{ x: -7.85, y: 2.62 }]);
await mineralRun.page.keyboard.down('KeyX');
let mineralDrop = null;
for (let pass = 0; pass < 18; pass += 1) {
  await mineralRun.page.evaluate(() => window.advanceTime(330));
  const current = await state(mineralRun.page);
  if (current.nearbyMinerals.length > 0) {
    mineralDrop = current;
    break;
  }
}
await mineralRun.page.keyboard.up('KeyX');
await mineralRun.page.waitForTimeout(100);
await mineralRun.page.screenshot({ path: new URL('salt-drop.png', outputDir).pathname });
await tap(mineralRun.page, 'KeyE');
const collected = await state(mineralRun.page);
await tap(mineralRun.page, 'KeyY');
const seasoned = await state(mineralRun.page);
await mineralRun.page.waitForTimeout(100);
await mineralRun.page.screenshot({ path: new URL('seasoned-food.png', outputDir).pathname });
console.log(`mineral: ${mineralDrop?.nearbyMinerals?.[0]?.mineral ?? 'none'}, seasoned=${seasoned.inventory.seasonedFood ?? 0}`);
await mineralRun.page.close();

// Scenario 3: discover the shore den, traverse to the generated trench chamber, and claim den two.
const denRun = await newGame();
await steer(denRun.page, [
  { x: -9.6, y: 2.55 },
  { x: -11.6, y: 2.6 },
  { x: -13.0, y: 2.9 },
]);
const firstDen = await state(denRun.page);
await steer(denRun.page, [
  { x: -10.0, y: 3.0 },
  { x: -2.0, y: 3.1 },
  { x: 5.0, y: 0.1 },
  { x: 8.8, y: -2.8 },
  { x: 10.0, y: -4.3 },
  { x: 11.1, y: -5.8 },
  { x: 11.8, y: -6.35 },
]);
const beforeClaim = await state(denRun.page);
await tap(denRun.page, 'KeyN');
const secondDen = await state(denRun.page);
await denRun.page.waitForTimeout(120);
await denRun.page.screenshot({ path: new URL('second-den-claimed.png', outputDir).pathname });
console.log(`dens: ${secondDen.den.count}, active=${secondDen.den.active ?? 'none'}`);

const allErrors = {
  breach: breachRun.errors,
  mineral: mineralRun.errors,
  den: denRun.errors,
};
await writeFile(new URL('states.json', outputDir), JSON.stringify({ breach, mineralDrop, collected, seasoned, firstDen, beforeClaim, secondDen }, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(allErrors, null, 2));
await denRun.page.close();
await browser.close();

if (breach.player.underwater || breach.player.y <= 4.05) throw new Error(`Jet did not breach: ${JSON.stringify(breach.player)}`);
if (Math.abs(breach.player.tiltDegrees) < 8) throw new Error(`Swim tilt was not visible: ${breach.player.tiltDegrees} degrees.`);
if (!mineralDrop || mineralDrop.nearbyMinerals[0]?.mineral !== 'salt') throw new Error('Clay did not release a collectible salt crystal.');
if (collected.inventory.salt !== 1) throw new Error('Salt pickup did not enter inventory.');
if (seasoned.inventory.seasonedFood !== 1 || seasoned.inventory.salt) throw new Error('Salt did not convert fresh food into seasoned food.');
if (firstDen.den.count !== 1) throw new Error(`Starter den was not discovered: ${firstDen.den.count}.`);
if (secondDen.den.count !== 2) throw new Error(`Second den was not claimed: ${secondDen.prompt}`);
if (Object.values(allErrors).some((errors) => errors.length)) throw new Error(`Browser errors: ${JSON.stringify(allErrors)}`);

console.log(JSON.stringify({
  breach: breach.player,
  mineralDrop: mineralDrop.nearbyMinerals,
  collected: collected.inventory,
  seasoned: seasoned.inventory,
  dens: secondDen.den,
  errors: allErrors,
}, null, 2));

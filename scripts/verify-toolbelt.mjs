import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/toolbelt/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
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

const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
async function tap(code, duration = 34) {
  await page.keyboard.down(code);
  await page.evaluate((ms) => window.advanceTime(ms), duration);
  await page.keyboard.up(code);
  await page.evaluate(() => window.advanceTime(34));
}
async function steer(targets) {
  for (const target of targets) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const current = await state();
      const dx = target.x - current.player.x;
      const dy = target.y - current.player.y;
      if (Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2) break;
      const keys = [];
      if (Math.abs(dx) > 0.2) keys.push(dx > 0 ? 'KeyD' : 'KeyA');
      if (Math.abs(dy) > 0.2) keys.push(dy > 0 ? 'KeyW' : 'KeyS');
      for (const key of keys) await page.keyboard.down(key);
      await page.evaluate(() => window.advanceTime(100));
      for (const key of keys) await page.keyboard.up(key);
    }
  }
}

// Gather two nearby stones through normal gameplay and craft the first tool.
await steer([{ x: -7.9, y: 2.66 }]);
await tap('KeyE');
await steer([{ x: -9.2, y: 3.22 }]);
await tap('KeyE');
const gathered = await state();
if (gathered.inventory.stone !== 2) throw new Error(`Expected two stones, found ${gathered.inventory.stone ?? 0}.`);

await tap('KeyI');
await page.locator('.recipe').filter({ hasText: 'Stone wedge' }).click();
await page.evaluate(() => window.advanceTime(50));
await tap('KeyI');
const crafted = await state();
if (!crafted.toolbelt.available.includes('stoneWedge')) throw new Error('Crafted wedge did not appear on the toolbelt.');

// Tab must cycle from arms to the newly owned wedge.
await tap('Tab');
const tabSelected = await state();
if (tabSelected.toolbelt.selected !== 'stoneWedge') throw new Error(`Tab selected ${tabSelected.toolbelt.selected}, not stoneWedge.`);
await page.waitForTimeout(100);
await page.screenshot({ path: new URL('wedge-selected-by-tab.png', outputDir).pathname });

// Direct number selection returns to arms, and clicking slot 5 re-equips the wedge.
await tap('Digit1');
const armsSelected = await state();
if (armsSelected.toolbelt.selected !== 'arms') throw new Error('Digit1 did not select bare arms.');
await page.locator('[data-tool-slot="4"]').click();
await page.evaluate(() => window.advanceTime(50));
const clickSelected = await state();
if (clickSelected.toolbelt.selected !== 'stoneWedge') throw new Error('Clicking slot 5 did not select the stone wedge.');

// Equipped wedge changes the physical shellfish interaction from crushing to prying.
await steer([{ x: -10.1, y: 3.24 }]);
await tap('KeyE');
const pried = await state();
if (!pried.prompt.includes('pry the scallop cleanly')) throw new Error(`Wedge did not control interaction: ${pried.prompt}`);
if (pried.inventory.largeShell !== 1) throw new Error('Prying did not preserve an intact shell.');
await page.waitForTimeout(100);
await page.screenshot({ path: new URL('wedge-pry-result.png', outputDir).pathname });

await writeFile(new URL('states.json', outputDir), JSON.stringify({ gathered, crafted, tabSelected, armsSelected, clickSelected, pried }, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({
  crafted: crafted.toolbelt,
  tabSelected: tabSelected.toolbelt,
  armsSelected: armsSelected.toolbelt,
  clickSelected: clickSelected.toolbelt,
  pryResult: { prompt: pried.prompt, largeShell: pried.inventory.largeShell },
  errors,
}, null, 2));

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/world-wrap/', import.meta.url);
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
let seamBefore = null;
await page.keyboard.down('KeyD');
for (let step = 0; step < 24; step += 1) {
  await page.evaluate(() => window.advanceTime(2000));
  const checkpoint = await state();
  if (!seamBefore && checkpoint.player.x > 55) {
    seamBefore = checkpoint;
    await page.waitForTimeout(100);
    await page.screenshot({ path: new URL('before-seam.png', outputDir).pathname });
  }
  if (checkpoint.planetBelt.revolutions >= 1) break;
}
await page.keyboard.up('KeyD');
await page.waitForTimeout(150);
const wrapped = await state();
await page.screenshot({ path: new URL('after-seam.png', outputDir).pathname });
await writeFile(new URL('state.json', outputDir), JSON.stringify({ seamBefore, wrapped }, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (!seamBefore || wrapped.planetBelt.revolutions < 1) throw new Error('Planetary seam was not crossed.');
console.log(JSON.stringify({
  before: { player: seamBefore.player, planetBelt: seamBefore.planetBelt },
  after: { player: wrapped.player, planetBelt: wrapped.planetBelt },
  errors,
}, null, 2));

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const names = [
  'deep_sea_fish_3dsm4.glb',
  'manta_ray_birostris_animated.glb',
  'fishe.glb',
  'sculptjanuary01-beast_deep_sea.glb',
  'cartoon_angler_fish_animated.glb',
  'bloodfin_leviathan_-_fish.glb',
  'terrible_cyan_fish.glb',
];
const outputDir = new URL('../output/new-asset-audit/', import.meta.url);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
const states = {};
for (const name of names) {
  const assetUrl = `/@fs/${path.join(root, 'assets', name)}`;
  const url = `http://localhost:4173/asset-preview.html?asset=${encodeURIComponent(assetUrl)}&turn=-1.05&tilt=0.08`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).loaded, { timeout: 60000 });
  await page.evaluate(() => window.advanceTime(850));
  states[name] = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.screenshot({ path: new URL(`${name.replace('.glb', '')}.png`, outputDir).pathname });
}
await writeFile(new URL('states.json', outputDir), JSON.stringify(states, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();
if (errors.length) throw new Error(errors.join(' | '));
console.log(JSON.stringify(Object.fromEntries(Object.entries(states).map(([name, state]) => [name, { animations: state.animations, meshes: state.meshes.length, sourceSize: state.sourceSize }])) , null, 2));

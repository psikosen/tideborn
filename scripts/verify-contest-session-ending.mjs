import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const baseUrl = process.env.TIDEBORN_URL ?? 'http://localhost:4173';
const outputDir = new URL('../output/contest-session-ending/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
async function cleanStart() {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
    document.querySelector('#start-btn')?.click();
  });
  await page.waitForTimeout(80);
}

await cleanStart();
const seasonalStart = await state();
await page.evaluate(() => {
  const game = window.__tidebornTest;
  const den = game.denNetwork.sites[0];
  den.discovered = true;
  den.braces = 1;
  den.mineralReinforcement = 1;
  den.storage = 1;
  den.curtains = 1;
  den.foodStored = 2;
  game.denDiscovered = true;
  game.inventory.food = 1;
  game.world.modifiedCells = 42;
  game.elapsed = 308.18;
  window.advanceTime(160);
});
const soloWin = await state();
await page.screenshot({ path: new URL('solo-winter-win-430x932.png', outputDir).pathname, fullPage: true });

await page.click('[data-play-again]');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(90);
const restarted = await state();

await cleanStart();
await page.evaluate(() => {
  const game = window.__tidebornTest;
  const template = game.denNetwork.sites[0];
  template.discovered = true;
  for (let index = 2; index <= 7; index += 1) {
    game.denNetwork.sites.push({
      ...template,
      id: `test-den-${index}`,
      name: `Belt den ${index}`,
      x: template.x + index * 4,
      y: template.y - index,
      destroyed: false,
    });
  }
  game.denDiscovered = true;
  game.world.modifiedCells = 2;
  game.elapsed = 308.18;
  window.advanceTime(160);
});
const networkWin = await state();

await page.setViewportSize({ width: 390, height: 844 });
await cleanStart();
await page.evaluate(() => {
  const game = window.__tidebornTest;
  const den = game.denNetwork.sites[0];
  den.discovered = true;
  game.denDiscovered = true;
  game.world.modifiedCells = 5;
  game.inventory.food = 1;
  game.elapsed = 308.18;
  window.advanceTime(160);
});
const collapseLoss = await state();
await page.screenshot({ path: new URL('den-collapse-loss-390x844.png', outputDir).pathname, fullPage: true });

await cleanStart();
await page.evaluate(() => {
  const game = window.__tidebornTest;
  game.survival.health = 0;
  window.advanceTime(34);
});
const deathLoss = await state();

const results = { seasonalStart, soloWin, restarted, networkWin, collapseLoss, deathLoss, errors };
await writeFile(new URL('states.json', outputDir), JSON.stringify(results, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (seasonalStart.season.id !== 'late-summer' || seasonalStart.contestSession.status !== 'active') {
  throw new Error(`Season did not begin in late summer: ${JSON.stringify(seasonalStart.season)}`);
}
if (soloWin.mode !== 'won' || soloWin.contestSession.result?.reason !== 'winter-fortress' || !soloWin.resultsVisible || soloWin.season.id !== 'winter') {
  throw new Error(`Solo den route did not end in a winter win: ${JSON.stringify(soloWin.contestSession)}`);
}
if (restarted.mode !== 'menu' || restarted.contestSession.status !== 'active' || restarted.time.elapsedSeconds > 1 || restarted.resultsVisible) {
  throw new Error(`Play Again did not start a clean session: ${JSON.stringify({ mode: restarted.mode, time: restarted.time, session: restarted.contestSession, results: restarted.resultsVisible })}`);
}
if (networkWin.mode !== 'won' || networkWin.contestSession.result?.reason !== 'seven-den-network' || networkWin.contestSession.result?.densFound !== 7) {
  throw new Error(`Seven-den route did not win: ${JSON.stringify(networkWin.contestSession)}`);
}
if (collapseLoss.mode !== 'lost' || collapseLoss.contestSession.result?.reason !== 'den-collapse' || collapseLoss.den.viable !== 0 || !collapseLoss.resultsVisible) {
  throw new Error(`Catastrophic den loss did not end the session: ${JSON.stringify({ session: collapseLoss.contestSession, den: collapseLoss.den })}`);
}
if (deathLoss.mode !== 'lost' || deathLoss.contestSession.result?.reason !== 'death' || !deathLoss.resultsVisible) {
  throw new Error(`Death did not end the session: ${JSON.stringify(deathLoss.contestSession)}`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify({
  season: seasonalStart.season,
  solo: soloWin.contestSession.result,
  restart: { mode: restarted.mode, elapsedSeconds: restarted.time.elapsedSeconds },
  network: networkWin.contestSession.result,
  collapse: collapseLoss.contestSession.result,
  death: deathLoss.contestSession.result,
  errors,
}, null, 2));

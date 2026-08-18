import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const outputDir = new URL('../output/predation-performance/', import.meta.url);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(process.env.TIDEBORN_URL ?? 'http://localhost:4173', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); document.querySelector('#start-btn')?.click(); });
await page.waitForTimeout(120);

const setup = await page.evaluate(() => {
  const game = window.__tidebornTest;
  const predator = game.importedDeepFauna.creatures.find((creature) => creature.alive && creature.species === 'midnight-angler');
  const prey = game.deepSeaShoals.fish.find((fish) => fish.alive && fish.species === 'bristlemouth');
  for (const candidate of game.deepSeaShoals.fish) {
    if (candidate === prey || !candidate.alive || Math.hypot(candidate.x - prey.x, candidate.y - prey.y) > 3) continue;
    candidate.x = prey.x - 4.2;
    candidate.y = prey.y + (candidate.phase % 1) * 0.8;
    candidate.homeX = candidate.x;
    candidate.homeY = candidate.y;
  }
  predator.x = prey.x + 0.08;
  predator.y = prey.y;
  predator.homeX = predator.x;
  predator.homeY = predator.y;
  predator.vx = 0;
  predator.vy = 0;
  predator.inkedUntil = 0;
  predator.staggeredUntil = 0;
  predator.feedingUntil = 0;
  game.player.x = prey.x + 6.6;
  game.player.y = prey.y;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.camouflage = true;
  game.inventory.glowKelp = 1;
  game.cameraTarget.set(prey.x, prey.y);
  game.camera.position.x = prey.x;
  game.camera.position.y = prey.y;
  game.bannerUntil = 0;
  game.messageUntil = 0;
  document.querySelector('[data-ui="banner"]')?.classList.remove('show');
  game.deepSeaShoals.predatorCooldowns.delete(predator.id);
  window.advanceTime(140);
  return { predatorId: predator.id, preyId: prey.id };
});

const read = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const captureStart = await read();
await page.screenshot({ path: new URL('fish-caught-before-swallow.png', outputDir).pathname });
await page.evaluate(() => window.advanceTime(380));
const captureMid = await read();
await page.screenshot({ path: new URL('visible-capture-sequence.png', outputDir).pathname });
await page.evaluate(() => window.advanceTime(760));
const feeding = await read();
await page.screenshot({ path: new URL('predator-feeding-vfx.png', outputDir).pathname });

const result = { setup, captureStart: captureStart.deepSeaShoals, captureMid: captureMid.deepSeaShoals, feeding: { shoals: feeding.deepSeaShoals, fauna: feeding.importedDeepFauna, activeVfx: feeding.activeVfx }, errors };
await writeFile(new URL('states.json', outputDir), JSON.stringify(result, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (!captureStart.deepSeaShoals.nearby.some((fish) => fish.id === setup.preyId && fish.behavior === 'captured')) throw new Error('Prey did not enter the visible capture phase.');
if (!captureMid.deepSeaShoals.nearby.some((fish) => fish.id === setup.preyId && fish.behavior === 'captured')) throw new Error('Capture phase was too short to read.');
if (!Object.values(feeding.deepSeaShoals.foodWeb.predatorKills).some((kills) => kills > 0)) throw new Error('The capture did not complete as predation.');
const collision = captureMid.deepSeaShoals.bodyCollision;
if (collision.broadphase !== 'spatial-hash' || collision.candidatePairsThisStep >= collision.naivePairsThisStep) throw new Error(`Shoal broadphase did not reduce candidates: ${JSON.stringify(collision)}`);
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ predator: setup.predatorId, prey: setup.preyId, collision, kills: feeding.deepSeaShoals.foodWeb.predatorKills, errors }, null, 2));

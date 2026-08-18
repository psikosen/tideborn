import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIDEBORN_PLAYWRIGHT ?? 'playwright');
const outputDir = new URL('../output/octopus-arm-trailing/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(process.env.TIDEBORN_URL ?? 'http://localhost:4173', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); document.querySelector('#start-btn')?.click(); });
await page.waitForTimeout(180);

const resetInOpenWater = async () => page.evaluate(() => {
  const game = window.__tidebornTest;
  game.player.x = 10;
  game.player.y = 0;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.facing = 1;
  game.player.stamina = 100;
  game.player.jetCharges = 3;
  game.player.jetCooldown = 0;
  game.player.braced = false;
  game.player.gripping = false;
  game.player.camouflage = false;
  game.cameraTarget.set(10, 0);
  game.camera.position.x = 10;
  game.camera.position.y = 0;
  game.bannerUntil = 0;
  game.messageUntil = 0;
  document.querySelector('[data-ui="banner"]')?.classList.remove('show');
  window.advanceTime(34);
});
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const tipCenters = async () => page.evaluate(() => {
  const game = window.__tidebornTest;
  return game.player.armMeshes.map((mesh) => {
    const position = mesh.geometry.attributes.position;
    const index = position.count - 2;
    return {
      x: Number(((position.getX(index) + position.getX(index + 1)) * 0.5).toFixed(3)),
      y: Number(((position.getY(index) + position.getY(index + 1)) * 0.5).toFixed(3)),
    };
  });
});

await resetInOpenWater();
await page.keyboard.down('ArrowRight');
await page.evaluate(() => window.advanceTime(1050));
const rightState = await state();
const rightTips = await tipCenters();
await page.screenshot({ path: new URL('swim-right-arms-trail-left.png', outputDir).pathname });
await page.keyboard.up('ArrowRight');

await resetInOpenWater();
await page.keyboard.down('ArrowLeft');
await page.keyboard.down('ArrowUp');
await page.evaluate(() => window.advanceTime(1050));
const diagonalState = await state();
const diagonalTips = await tipCenters();
await page.screenshot({ path: new URL('swim-up-left-arms-trail-down-right.png', outputDir).pathname });
await page.keyboard.up('ArrowLeft');
await page.keyboard.up('ArrowUp');

await resetInOpenWater();
await page.keyboard.down('ArrowRight');
await page.keyboard.down('ShiftLeft');
await page.evaluate(() => window.advanceTime(45));
await page.keyboard.up('ShiftLeft');
await page.evaluate(() => window.advanceTime(145));
const jetState = await state();
const jetTips = await tipCenters();
await page.screenshot({ path: new URL('jet-streamlined-arm-wake.png', outputDir).pathname });
await page.keyboard.up('ArrowRight');

const oppositeDot = (snapshot) => {
  const speed = Math.hypot(snapshot.player.vx, snapshot.player.vy) || 1;
  return (snapshot.player.armTrail.worldDirection.x * snapshot.player.vx
    + snapshot.player.armTrail.worldDirection.y * snapshot.player.vy) / speed;
};
const results = {
  right: { player: rightState.player, tips: rightTips, oppositeDot: oppositeDot(rightState) },
  diagonal: { player: diagonalState.player, tips: diagonalTips, oppositeDot: oppositeDot(diagonalState) },
  jet: { player: jetState.player, tips: jetTips, oppositeDot: oppositeDot(jetState) },
  errors,
};
await writeFile(new URL('states.json', outputDir), JSON.stringify(results, null, 2));
await writeFile(new URL('console-errors.json', outputDir), JSON.stringify(errors, null, 2));
await browser.close();

if (rightState.player.armTrail.mode !== 'streaming' || rightState.player.armTrail.strength < 0.72 || results.right.oppositeDot > -0.82) {
  throw new Error(`Rightward arm trail failed: ${JSON.stringify(results.right)}`);
}
if (diagonalState.player.armTrail.mode !== 'streaming' || diagonalState.player.armTrail.strength < 0.72 || results.diagonal.oppositeDot > -0.8) {
  throw new Error(`Diagonal arm trail failed: ${JSON.stringify(results.diagonal)}`);
}
if (jetState.player.armTrail.mode !== 'jet-streamlined' || jetState.player.armTrail.strength < 0.82 || results.jet.oppositeDot > -0.8) {
  throw new Error(`Jet arm streamlining failed: ${JSON.stringify(results.jet)}`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);

console.log(JSON.stringify({
  right: { velocity: [rightState.player.vx, rightState.player.vy], trail: rightState.player.armTrail, oppositeDot: Number(results.right.oppositeDot.toFixed(3)) },
  diagonal: { velocity: [diagonalState.player.vx, diagonalState.player.vy], trail: diagonalState.player.armTrail, oppositeDot: Number(results.diagonal.oppositeDot.toFixed(3)) },
  jet: { velocity: [jetState.player.vx, jetState.player.vy], trail: jetState.player.armTrail, oppositeDot: Number(results.jet.oppositeDot.toFixed(3)) },
  errors,
}, null, 2));

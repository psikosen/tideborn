import { DepthAccessSystem } from './game/DepthAccessSystem';
import { planetBeltTerrainHeight } from './game/PlanetBeltProfile';
import { PlanetScaleSystem, TIDEBORN_PLANET } from './game/PlanetScale';
import { BASE_SEA_LEVEL, PLANET_SEED, WORLD_MIN_X, WORLD_WIDTH, mulberry32 } from './game/data';

const root = document.querySelector<HTMLDivElement>('#slice');
if (!root) throw new Error('Missing slice root');
const canvas = document.createElement('canvas');
root.appendChild(canvas);
const context = canvas.getContext('2d')!;

const planetScale = new PlanetScaleSystem();
const interior = planetScale.interior.snapshot(TIDEBORN_PLANET.maximumOceanDepthM, TIDEBORN_PLANET.maximumNavigableDepthM);
const depthAccess = new DepthAccessSystem(planetScale);
const profileSegments = 1440;

function draw(): void {
  const ratio = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(innerWidth * ratio);
  canvas.height = Math.round(innerHeight * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const width = innerWidth;
  const height = innerHeight;
  const centerX = width * 0.5;
  const centerY = height * 0.54;
  const radius = Math.min(width, height) * 0.37;
  const shellBase = radius - Math.max(58, radius * 0.13);
  const rng = mulberry32(PLANET_SEED + 1301);

  const background = context.createRadialGradient(centerX, centerY, radius * 0.2, centerX, centerY, radius * 1.7);
  background.addColorStop(0, '#102c32');
  background.addColorStop(0.62, '#04131b');
  background.addColorStop(1, '#01070d');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.fillStyle = 'rgba(194,225,229,.62)';
  for (let index = 0; index < 620; index += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const size = rng() < 0.93 ? 0.45 + rng() * 0.8 : 1.2 + rng() * 1.2;
    context.globalAlpha = 0.18 + rng() * 0.72;
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  const halo = context.createRadialGradient(centerX, centerY, radius * 0.88, centerX, centerY, radius * 1.1);
  halo.addColorStop(0, 'rgba(34,167,162,0)');
  halo.addColorStop(0.74, 'rgba(49,202,193,.08)');
  halo.addColorStop(1, 'rgba(49,202,193,0)');
  context.fillStyle = halo;
  context.beginPath();
  context.arc(centerX, centerY, radius * 1.12, 0, Math.PI * 2);
  context.fill();

  const radiusFraction = (id: string) => (interior.layers.find((layer) => layer.id === id)?.outerRadiusPercent ?? 0) / 100;
  drawLayer(radius * radiusFraction('abyssal-cave-shell'), '#04131e', '#0a3c5d');
  drawLayer(radius * radiusFraction('upper-mantle'), '#3b2929', '#735044');
  drawLayer(radius * radiusFraction('lower-mantle'), '#53282a', '#a84632');
  drawLayer(radius * radiusFraction('outer-core'), '#8a3929', '#ed8a32');
  drawLayer(radius * radiusFraction('inner-core'), '#f3a84a', '#fff0a0');

  context.strokeStyle = 'rgba(255,226,173,.24)';
  context.lineWidth = 1;
  for (const scale of ['inner-core', 'outer-core', 'lower-mantle', 'upper-mantle', 'abyssal-cave-shell'].map(radiusFraction)) {
    context.beginPath();
    context.arc(centerX, centerY, radius * scale, 0, Math.PI * 2);
    context.stroke();
  }

  let maximumDepth = { depthM: 0, angle: 0, floorRadius: radius };
  for (let segment = 0; segment < profileSegments; segment += 1) {
    const t0 = segment / profileSegments;
    const t1 = (segment + 1) / profileSegments;
    const angle0 = t0 * Math.PI * 2 - Math.PI * 0.5;
    const angle1 = t1 * Math.PI * 2 - Math.PI * 0.5;
    const x0 = WORLD_MIN_X + t0 * WORLD_WIDTH;
    const x1 = WORLD_MIN_X + t1 * WORLD_WIDTH;
    const height0 = planetBeltTerrainHeight(x0);
    const height1 = planetBeltTerrainHeight(x1);
    const height = (height0 + height1) * 0.5;
    if (height >= BASE_SEA_LEVEL) {
      const elevation = Math.max(0, height - BASE_SEA_LEVEL);
      const surface0 = radius + elevation * 2.8;
      const surface1 = radius + Math.max(0, height1 - BASE_SEA_LEVEL) * 2.8;
      drawAnnularQuad(angle0, angle1, shellBase, shellBase, surface0 - 5, surface1 - 5, '#75675d');
      const coastal = elevation < 0.65;
      const alpine = elevation > 3.5;
      drawAnnularQuad(
        angle0, angle1, surface0 - 5, surface1 - 5, surface0, surface1,
        alpine ? '#dce6e1' : coastal ? '#cdb98b' : '#416d55',
      );
    } else {
      const canonical0 = depthAccess.sample(x0, height0, BASE_SEA_LEVEL, false).canonicalDepthM;
      const canonical1 = depthAccess.sample(x1, height1, BASE_SEA_LEVEL, false).canonicalDepthM;
      const depth0 = 5 + 78 * Math.pow(Math.min(1, canonical0 / TIDEBORN_PLANET.maximumOceanDepthM), 0.62);
      const depth1 = 5 + 78 * Math.pow(Math.min(1, canonical1 / TIDEBORN_PLANET.maximumOceanDepthM), 0.62);
      const floor0 = radius - depth0;
      const floor1 = radius - depth1;
      const averageCanonical = (canonical0 + canonical1) * 0.5;
      if (averageCanonical > maximumDepth.depthM) maximumDepth = { depthM: averageCanonical, angle: (angle0 + angle1) * 0.5, floorRadius: (floor0 + floor1) * 0.5 };
      drawAnnularQuad(angle0, angle1, shellBase, shellBase, floor0, floor1, averageCanonical > 6000 ? '#26343a' : '#606b68');
      const depthMix = Math.min(1, averageCanonical / TIDEBORN_PLANET.maximumOceanDepthM);
      const water = mixHex('#31aeb3', '#041b35', Math.pow(depthMix, 0.42));
      drawAnnularQuad(angle0, angle1, floor0, floor1, radius, radius, water);
    }
  }

  context.strokeStyle = 'rgba(138,249,236,.78)';
  context.lineWidth = 1.4;
  context.beginPath();
  for (let segment = 0; segment <= profileSegments; segment += 1) {
    const t = segment / profileSegments;
    const x = WORLD_MIN_X + t * WORLD_WIDTH;
    if (planetBeltTerrainHeight(x) >= BASE_SEA_LEVEL) continue;
    const angle = t * Math.PI * 2 - Math.PI * 0.5;
    const px = centerX + Math.cos(angle) * radius;
    const py = centerY + Math.sin(angle) * radius;
    if (segment === 0 || planetBeltTerrainHeight(x - WORLD_WIDTH / profileSegments) >= BASE_SEA_LEVEL) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.stroke();

  context.strokeStyle = 'rgba(85,222,210,.42)';
  context.lineWidth = 3;
  context.beginPath();
  context.arc(centerX, centerY, radius + 17, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = 'rgba(85,222,210,.12)';
  context.lineWidth = 10;
  context.beginPath();
  context.arc(centerX, centerY, radius + 22, 0, Math.PI * 2);
  context.stroke();

  const titleSize = Math.max(24, Math.min(42, width * 0.023));
  context.textAlign = 'center';
  context.fillStyle = '#e9f4e9';
  context.font = `700 ${titleSize}px Georgia, serif`;
  context.fillText('PELAGOS-730 · EQUATORIAL PLANET SLICE', centerX, height * 0.066);
  context.fillStyle = 'rgba(194,231,219,.68)';
  context.font = `500 ${Math.max(11, titleSize * 0.34)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  context.fillText(`SEED ${PLANET_SEED} · ${TIDEBORN_PLANET.radiusKm.toLocaleString()} KM RADIUS · ${TIDEBORN_PLANET.oceanCoverage * 100}% OCEAN`, centerX, height * 0.091);

  label('SOLID INNER CORE', centerX, centerY + radius * 0.04, '#fff0ae');
  label('LIQUID OUTER CORE', centerX, centerY + radius * 0.31, '#ffd08d');
  label('LOWER MANTLE · HALF DEPTH', centerX, centerY + radius * 0.59, '#efb09d');
  label('UPPER MANTLE', centerX, centerY + radius * 0.75, '#d9c6bb');
  label('966 KM ABYSSAL OCEAN + MEGACAVES', centerX, centerY + radius * 0.91, '#8de3e7');

  const trenchX = centerX + Math.cos(maximumDepth.angle) * maximumDepth.floorRadius;
  const trenchY = centerY + Math.sin(maximumDepth.angle) * maximumDepth.floorRadius;
  const side = Math.cos(maximumDepth.angle) >= 0 ? 1 : -1;
  const calloutX = centerX + side * radius * 0.78;
  const calloutY = centerY + Math.sin(maximumDepth.angle) * radius * 0.54;
  context.strokeStyle = 'rgba(117,255,227,.62)';
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(trenchX, trenchY);
  context.lineTo(calloutX, calloutY);
  context.stroke();
  context.textAlign = side > 0 ? 'left' : 'right';
  context.fillStyle = '#98f4e4';
  context.font = `700 ${Math.max(11, radius * 0.02)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  context.fillText('HADAL DESCENT', calloutX + side * 7, calloutY - 5);
  context.fillStyle = 'rgba(205,236,228,.7)';
  context.font = `500 ${Math.max(9, radius * 0.015)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  context.fillText(`${(maximumDepth.depthM / 1000).toFixed(1)} KM CURRENT ROUTE`, calloutX + side * 7, calloutY + 13);

  context.textAlign = 'center';
  context.fillStyle = 'rgba(215,237,229,.74)';
  context.font = `500 ${Math.max(10, width * 0.007)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  const trueDepthPixels = radius * (TIDEBORN_PLANET.maximumOceanDepthM / 1000) / TIDEBORN_PLANET.radiusKm;
  const caveShellPixels = radius * interior.habitableShell.thicknessKm / TIDEBORN_PLANET.radiusKm;
  context.fillText(
    `TRUE SCALE: ${TIDEBORN_PLANET.maximumOceanDepthM / 1000} KM OPEN TRENCH = ${trueDepthPixels.toFixed(1)} PX · ${interior.habitableShell.thicknessKm} KM WATER-ROCK CAVE SHELL = ${caveShellPixels.toFixed(1)} PX`,
    centerX,
    height * 0.965,
  );
  context.fillStyle = 'rgba(146,209,197,.58)';
  context.fillText('SURFACE RELIEF AND OCEAN DEPTH ARE EXAGGERATED IN THE OUTER RING SO THE PLAYABLE ROUTE REMAINS VISIBLE', centerX, height * 0.982);

  const state = {
    seed: PLANET_SEED,
    renderer: 'Canvas2D circular equatorial cutaway using the live gameplay belt profile',
    planetRadiusKm: TIDEBORN_PLANET.radiusKm,
    oceanCoveragePercent: TIDEBORN_PLANET.oceanCoverage * 100,
    maximumOceanDepthKm: TIDEBORN_PLANET.maximumOceanDepthM / 1000,
    maximumNavigableDepthKm: TIDEBORN_PLANET.maximumNavigableDepthM / 1000,
    currentRouteMaximumKm: Number((maximumDepth.depthM / 1000).toFixed(1)),
    trueMaximumOceanPixels: Number(trueDepthPixels.toFixed(2)),
    trueAbyssalCaveShellPixels: Number(caveShellPixels.toFixed(2)),
    surfaceShellExaggerated: true,
    planetaryCore: interior.core,
    interiorLayers: interior.layers,
    profileSegments,
  };
  (window as unknown as { __tidebornSlice?: typeof state; __tidebornSliceReady?: boolean }).__tidebornSlice = state;
  (window as unknown as { __tidebornSlice?: typeof state; __tidebornSliceReady?: boolean }).__tidebornSliceReady = true;

  function drawLayer(layerRadius: number, innerColor: string, outerColor: string): void {
    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, layerRadius);
    gradient.addColorStop(0, innerColor);
    gradient.addColorStop(1, outerColor);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(centerX, centerY, layerRadius, 0, Math.PI * 2);
    context.fill();
  }

  function drawAnnularQuad(
    angle0: number, angle1: number,
    inner0: number, inner1: number,
    outer0: number, outer1: number,
    fill: string,
  ): void {
    context.fillStyle = fill;
    context.beginPath();
    context.moveTo(centerX + Math.cos(angle0) * inner0, centerY + Math.sin(angle0) * inner0);
    context.lineTo(centerX + Math.cos(angle0) * outer0, centerY + Math.sin(angle0) * outer0);
    context.lineTo(centerX + Math.cos(angle1) * outer1, centerY + Math.sin(angle1) * outer1);
    context.lineTo(centerX + Math.cos(angle1) * inner1, centerY + Math.sin(angle1) * inner1);
    context.closePath();
    context.fill();
  }

  function label(text: string, x: number, y: number, color: string): void {
    context.textAlign = 'center';
    context.fillStyle = color;
    context.font = `700 ${Math.max(9, radius * 0.017)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
    context.fillText(text, x, y);
  }
}

function mixHex(a: string, b: string, amount: number): string {
  const parse = (value: string) => [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
  const aa = parse(a);
  const bb = parse(b);
  const channels = aa.map((value, index) => Math.round(value + (bb[index] - value) * amount));
  return `rgb(${channels[0]},${channels[1]},${channels[2]})`;
}

draw();
window.addEventListener('resize', draw);

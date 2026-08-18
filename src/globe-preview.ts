import * as THREE from 'three';
import { PLANET_SEED, mulberry32 } from './game/data';
import { TIDEBORN_PLANET } from './game/PlanetScale';

const root = document.querySelector<HTMLDivElement>('#globe');
if (!root) throw new Error('Missing globe root');

const TEXTURE_WIDTH = 1536;
const TEXTURE_HEIGHT = 768;
const OCEAN_COVERAGE = TIDEBORN_PLANET.oceanCoverage;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (value: number) => value * value * (3 - 2 * value);

function hash3(x: number, y: number, z: number, salt = 0): number {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647);
  value ^= PLANET_SEED + Math.imul(salt, 1274126177);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function noise3(x: number, y: number, z: number, salt = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const fz = smooth(z - iz);
  const sample = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz, salt);
  const x00 = lerp(sample(0, 0, 0), sample(1, 0, 0), fx);
  const x10 = lerp(sample(0, 1, 0), sample(1, 1, 0), fx);
  const x01 = lerp(sample(0, 0, 1), sample(1, 0, 1), fx);
  const x11 = lerp(sample(0, 1, 1), sample(1, 1, 1), fx);
  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
}

function fbm(x: number, y: number, z: number, salt = 0, octaves = 5): number {
  let sum = 0;
  let amplitude = 0.55;
  let frequency = 1;
  let normalizer = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += noise3(x * frequency, y * frequency, z * frequency, salt + octave * 19) * amplitude;
    normalizer += amplitude;
    frequency *= 2.03;
    amplitude *= 0.49;
  }
  return sum / normalizer;
}

function angularDistance(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function mixColor(a: readonly number[], b: readonly number[], amount: number): [number, number, number] {
  return [
    lerp(a[0], b[0], amount),
    lerp(a[1], b[1], amount),
    lerp(a[2], b[2], amount),
  ];
}

function buildPlanetTextures(): {
  color: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  clouds: THREE.CanvasTexture;
  landPercent: number;
} {
  const count = TEXTURE_WIDTH * TEXTURE_HEIGHT;
  const heights = new Float32Array(count);
  const latitudes = new Float32Array(count);
  for (let y = 0; y < TEXTURE_HEIGHT; y += 1) {
    const latitude = (0.5 - (y + 0.5) / TEXTURE_HEIGHT) * Math.PI;
    const cosLatitude = Math.cos(latitude);
    for (let x = 0; x < TEXTURE_WIDTH; x += 1) {
      const longitude = ((x + 0.5) / TEXTURE_WIDTH - 0.5) * Math.PI * 2;
      const px = cosLatitude * Math.cos(longitude);
      const py = Math.sin(latitude);
      const pz = cosLatitude * Math.sin(longitude);
      const broad = fbm(px * 1.17 + 7.4, py * 1.17 - 2.6, pz * 1.17 + 4.1, 31, 5);
      const shelves = fbm(px * 2.85 - 3.1, py * 2.85 + 5.7, pz * 2.85 - 8.2, 89, 4);
      const islandNoise = fbm(px * 6.4 + 12.7, py * 6.4 - 1.4, pz * 6.4 + 6.8, 151, 3);
      const equatorialBelt = Math.exp(-Math.pow(latitude / 0.31, 2));
      const mainBeltLand = Math.exp(-Math.pow(angularDistance(longitude, -0.72) / 0.62, 2)) * equatorialBelt;
      const remoteArchipelago = Math.exp(-Math.pow(angularDistance(longitude, -2.52) / 0.34, 2))
        * Math.exp(-Math.pow((latitude + 0.08) / 0.24, 2));
      const volcanicArc = Math.exp(-Math.pow(angularDistance(longitude, 1.85) / 0.2, 2))
        * Math.exp(-Math.pow((latitude - 0.38) / 0.46, 2));
      const index = x + y * TEXTURE_WIDTH;
      heights[index] = broad * 0.57 + shelves * 0.25 + islandNoise * 0.12
        + mainBeltLand * 0.19 + remoteArchipelago * 0.13 + volcanicArc * 0.08;
      latitudes[index] = latitude;
    }
  }

  const ordered = Array.from(heights).sort((a, b) => a - b);
  const seaLevel = ordered[Math.floor(ordered.length * OCEAN_COVERAGE)];
  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  const cloudCanvas = document.createElement('canvas');
  for (const canvas of [colorCanvas, bumpCanvas, roughCanvas, cloudCanvas]) {
    canvas.width = TEXTURE_WIDTH;
    canvas.height = TEXTURE_HEIGHT;
  }
  const colorContext = colorCanvas.getContext('2d', { willReadFrequently: false })!;
  const bumpContext = bumpCanvas.getContext('2d', { willReadFrequently: false })!;
  const roughContext = roughCanvas.getContext('2d', { willReadFrequently: false })!;
  const cloudContext = cloudCanvas.getContext('2d', { willReadFrequently: false })!;
  const colorData = colorContext.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const bumpData = bumpContext.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const roughData = roughContext.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const cloudData = cloudContext.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  let landPixels = 0;

  const deepOcean = [3, 24, 47] as const;
  const ocean = [8, 63, 82] as const;
  const shelf = [23, 111, 118] as const;
  const sand = [191, 166, 118] as const;
  const coastalGreen = [50, 91, 69] as const;
  const forest = [28, 66, 55] as const;
  const rock = [103, 91, 83] as const;
  const snow = [218, 233, 229] as const;

  for (let y = 0; y < TEXTURE_HEIGHT; y += 1) {
    const latitude = latitudes[y * TEXTURE_WIDTH];
    const polar = clamp01((Math.abs(latitude) - 0.93) / 0.44);
    const cosLatitude = Math.cos(latitude);
    for (let x = 0; x < TEXTURE_WIDTH; x += 1) {
      const index = x + y * TEXTURE_WIDTH;
      const offset = index * 4;
      const longitude = ((x + 0.5) / TEXTURE_WIDTH - 0.5) * Math.PI * 2;
      const height = heights[index];
      const land = height >= seaLevel;
      if (land) landPixels += 1;
      const px = cosLatitude * Math.cos(longitude);
      const py = Math.sin(latitude);
      const pz = cosLatitude * Math.sin(longitude);
      const localDetail = noise3(px * 24 + 3, py * 24 - 4, pz * 24 + 8, 271);
      let color: [number, number, number];
      let bumpValue: number;
      let roughnessValue: number;

      if (!land) {
        const depth = clamp01((seaLevel - height) / 0.22);
        color = depth < 0.28
          ? mixColor(shelf, ocean, depth / 0.28)
          : mixColor(ocean, deepOcean, (depth - 0.28) / 0.72);
        const current = Math.sin(longitude * 8 + latitude * 13 + localDetail * 3) * 0.5 + 0.5;
        color = mixColor(color, [24, 103, 112], current * 0.08);
        const packIce = clamp01(polar * 1.32 + noise3(px * 15, py * 15, pz * 15, 307) * 0.28 - 0.38);
        color = mixColor(color, [190, 224, 222], packIce * 0.88);
        bumpValue = 98 + (1 - depth) * 22 + packIce * 44;
        roughnessValue = 52 + packIce * 150;
      } else {
        const elevation = clamp01((height - seaLevel) / 0.18);
        const moisture = fbm(px * 5 - 9, py * 5 + 2, pz * 5 + 5, 331, 4);
        if (elevation < 0.08) color = mixColor(sand, coastalGreen, elevation / 0.08);
        else if (elevation < 0.54) color = mixColor(coastalGreen, moisture > 0.48 ? forest : rock, (elevation - 0.08) / 0.46);
        else color = mixColor(rock, snow, clamp01((elevation - 0.54) / 0.4 + polar * 0.8));
        const frost = clamp01(polar * 1.18 + elevation * 0.52 - 0.72);
        color = mixColor(color, snow, frost);
        bumpValue = 132 + elevation * 118;
        roughnessValue = 190 + localDetail * 46;
      }

      const grain = 0.92 + localDetail * 0.13;
      colorData.data[offset] = Math.round(color[0] * grain);
      colorData.data[offset + 1] = Math.round(color[1] * grain);
      colorData.data[offset + 2] = Math.round(color[2] * grain);
      colorData.data[offset + 3] = 255;
      bumpData.data[offset] = bumpValue;
      bumpData.data[offset + 1] = bumpValue;
      bumpData.data[offset + 2] = bumpValue;
      bumpData.data[offset + 3] = 255;
      roughData.data[offset] = roughnessValue;
      roughData.data[offset + 1] = roughnessValue;
      roughData.data[offset + 2] = roughnessValue;
      roughData.data[offset + 3] = 255;

      const cloudNoise = fbm(px * 4.7 + 18.2, py * 3.6 - 1.8, pz * 4.7 + 2.1, 419, 5);
      const bands = Math.sin(latitude * 12 + noise3(px * 6, py * 6, pz * 6, 457) * 4) * 0.06;
      const cloud = clamp01((cloudNoise + bands - 0.545) / 0.18);
      cloudData.data[offset] = 220;
      cloudData.data[offset + 1] = 238;
      cloudData.data[offset + 2] = 235;
      cloudData.data[offset + 3] = Math.round(cloud * 188);
    }
  }

  colorContext.putImageData(colorData, 0, 0);
  bumpContext.putImageData(bumpData, 0, 0);
  roughContext.putImageData(roughData, 0, 0);
  cloudContext.putImageData(cloudData, 0, 0);
  const texture = (canvas: HTMLCanvasElement, colorSpace: THREE.ColorSpace = THREE.NoColorSpace) => {
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = colorSpace;
    result.wrapS = THREE.RepeatWrapping;
    result.anisotropy = 8;
    return result;
  };
  return {
    color: texture(colorCanvas, THREE.SRGBColorSpace),
    bump: texture(bumpCanvas),
    roughness: texture(roughCanvas),
    clouds: texture(cloudCanvas, THREE.SRGBColorSpace),
    landPercent: Number((landPixels / count * 100).toFixed(1)),
  };
}

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#01070d');
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0.03, 3.7);

const starRng = mulberry32(PLANET_SEED + 901);
const starPositions = new Float32Array(3200 * 3);
for (let index = 0; index < 3200; index += 1) {
  const radius = 12 + starRng() * 18;
  const theta = starRng() * Math.PI * 2;
  const z = starRng() * 2 - 1;
  const planar = Math.sqrt(1 - z * z);
  starPositions[index * 3] = Math.cos(theta) * planar * radius;
  starPositions[index * 3 + 1] = z * radius;
  starPositions[index * 3 + 2] = Math.sin(theta) * planar * radius;
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({
  color: '#bcd6dc', size: 0.018, transparent: true, opacity: 0.72, depthWrite: false,
})));

const textures = buildPlanetTextures();
const planet = new THREE.Group();
planet.rotation.z = -0.19;
scene.add(planet);
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(1, 256, 160),
  new THREE.MeshStandardMaterial({
    map: textures.color,
    bumpMap: textures.bump,
    bumpScale: 0.026,
    roughnessMap: textures.roughness,
    roughness: 0.82,
    metalness: 0.03,
  }),
);
planet.add(globe);
const cloudSphere = new THREE.Mesh(
  new THREE.SphereGeometry(1.018, 192, 128),
  new THREE.MeshPhongMaterial({
    map: textures.clouds,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.NormalBlending,
  }),
);
cloudSphere.rotation.y = 0.08;
planet.add(cloudSphere);

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(1.09, 128, 96),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color('#69d7d1') } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorld);
        float rim = pow(1.0 - abs(dot(vNormal, viewDirection)), 2.8);
        gl_FragColor = vec4(uColor, rim * 0.52);
      }
    `,
  }),
);
planet.add(atmosphere);

scene.add(new THREE.HemisphereLight('#76aab2', '#01040a', 0.62));
const sun = new THREE.DirectionalLight('#fff2d2', 4.6);
sun.position.set(-3.5, 2.4, 4.8);
scene.add(sun);
const oceanFill = new THREE.DirectionalLight('#238a9e', 0.75);
oceanFill.position.set(3, -2, 1);
scene.add(oceanFill);

let baseRotation = -0.58;
planet.rotation.y = baseRotation;
const render = () => renderer.render(scene, camera);
render();

const api = {
  seed: PLANET_SEED,
  oceanCoveragePercent: Number((100 - textures.landPercent).toFixed(1)),
  landCoveragePercent: textures.landPercent,
  setRotation: (radians: number) => {
    baseRotation = radians;
    planet.rotation.y = radians;
    cloudSphere.rotation.y = 0.08;
    render();
  },
  snapshot: () => ({
    seed: PLANET_SEED,
    oceanCoveragePercent: Number((100 - textures.landPercent).toFixed(1)),
    landCoveragePercent: textures.landPercent,
    rotationRadians: Number(baseRotation.toFixed(3)),
    texture: { width: TEXTURE_WIDTH, height: TEXTURE_HEIGHT },
    renderer: 'Three.js sphere + deterministic 3D-noise climate textures',
  }),
};
(window as unknown as { __tidebornGlobe?: typeof api; __tidebornGlobeReady?: boolean }).__tidebornGlobe = api;
(window as unknown as { __tidebornGlobe?: typeof api; __tidebornGlobeReady?: boolean }).__tidebornGlobeReady = true;

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  render();
});

let last = performance.now();
function animate(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  cloudSphere.rotation.y += dt * 0.006;
  render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

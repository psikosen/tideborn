import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const query = new URLSearchParams(location.search);
const asset = query.get('asset') ?? './assets/models/reef-fish-low-poly.glb';
const label = document.querySelector<HTMLElement>('#label')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#061016');
scene.fog = new THREE.Fog('#061016', 9, 17);
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 0.2, 8.1);
scene.add(new THREE.HemisphereLight('#adfff0', '#071012', 2.2));
const key = new THREE.DirectionalLight('#d8fff7', 4.5);
key.position.set(4, 6, 8);
scene.add(key);
const rim = new THREE.DirectionalLight('#377dff', 3.2);
rim.position.set(-5, 2, -5);
scene.add(rim);

const stage = new THREE.Group();
scene.add(stage);
let mixer: THREE.AnimationMixer | undefined;
let elapsed = 0;
let state: Record<string, unknown> = { asset, loaded: false };

new GLTFLoader().load(asset, (gltf) => {
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(model);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  const longest = Math.max(sourceSize.x, sourceSize.y, sourceSize.z, 0.0001);
  const scale = 4.3 / longest;
  model.scale.setScalar(scale);
  model.position.set(-sourceCenter.x * scale, -sourceCenter.y * scale, -sourceCenter.z * scale);
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.frustumCulled = false;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.roughness = Math.max(0.45, material.roughness);
        material.metalness = Math.min(0.1, material.metalness);
      }
    }
  });
  stage.add(model);
  if (gltf.animations[0]) {
    mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(gltf.animations[0]).play();
  }
  const meshes: Array<{ name: string; vertices: number }> = [];
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    meshes.push({ name: node.name, vertices: node.geometry.attributes.position?.count ?? 0 });
  });
  state = {
    asset,
    loaded: true,
    sourceSize: { x: sourceSize.x, y: sourceSize.y, z: sourceSize.z },
    animations: gltf.animations.map((clip) => clip.name),
    meshes,
  };
  label.textContent = `${asset.split('/').pop()} · ${meshes.length} mesh${meshes.length === 1 ? '' : 'es'} · ${gltf.animations.length} animation${gltf.animations.length === 1 ? '' : 's'}`;
}, undefined, (error) => {
  state = { asset, loaded: false, error: String(error) };
  label.textContent = `Failed: ${String(error)}`;
});

function render(dt: number): void {
  elapsed += dt;
  mixer?.update(dt);
  stage.rotation.y = elapsed * 0.22 + Number(query.get('turn') ?? 0);
  stage.rotation.x = Number(query.get('tilt') ?? 0);
  renderer.render(scene, camera);
}

let previous = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  render(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

(window as unknown as { render_game_to_text: () => string }).render_game_to_text = () => JSON.stringify(state);
(window as unknown as { advanceTime: (ms: number) => void }).advanceTime = (ms: number) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let index = 0; index < steps; index += 1) render(1 / 60);
};

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
});

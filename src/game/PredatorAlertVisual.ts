import * as THREE from 'three';

export type PredatorAlertMode = 'none' | 'spotted' | 'searching';

const ALERT_NAME = 'predator-alert-waves';
const alertTexture = new THREE.TextureLoader().load('./assets/ui/predator-teeth.png');
alertTexture.colorSpace = THREE.SRGBColorSpace;
alertTexture.minFilter = THREE.LinearFilter;
alertTexture.magFilter = THREE.LinearFilter;
alertTexture.generateMipmaps = false;

let alertIntensity = 1;

export function setPredatorAlertIntensity(value: number): void {
  alertIntensity = Math.max(0, Math.min(1, value));
}

/**
 * Shared, low-object-count awareness cue for any predator visual, including
 * procedural fallbacks and asynchronously attached GLBs.
 */
export function attachPredatorAlertVisual(anchor: THREE.Group, radius: number, z = 0.9): void {
  if (anchor.getObjectByName(ALERT_NAME)) return;
  const alert = new THREE.Group();
  alert.name = ALERT_NAME;
  alert.userData.radius = radius;
  // Predator awareness is a player-facing sensory cue. Render it above the
  // pitch-black depth mask so an unseen animal can still telegraph danger.
  alert.position.z = Math.max(z, 7.25);
  alert.visible = false;
  for (let index = 0; index < 3; index += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: '#ff3347', transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    });
    const wave = new THREE.Mesh(new THREE.RingGeometry(radius * 0.92, radius, 36), material);
    wave.userData.alertWave = index;
    wave.renderOrder = 62;
    alert.add(wave);
  }
  const beacon = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 0.66, radius * 0.66),
    new THREE.MeshBasicMaterial({
      map: alertTexture,
      color: '#fff1e6',
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    }),
  );
  beacon.position.y = radius * 0.88;
  beacon.userData.alertBeacon = true;
  beacon.userData.alertIcon = 'predator-teeth';
  beacon.renderOrder = 63;
  alert.add(beacon);
  anchor.add(alert);
}

export function updatePredatorAlertVisual(anchor: THREE.Group, elapsed: number, mode: PredatorAlertMode, phase = 0): void {
  const alert = anchor.getObjectByName(ALERT_NAME) as THREE.Group | undefined;
  if (!alert) return;
  alert.visible = mode !== 'none' && alertIntensity > 0.01;
  if (!alert.visible) return;
  const searching = mode === 'searching';
  for (const child of alert.children) {
    if (child.userData.alertBeacon) {
      child.scale.setScalar(0.88 + Math.sin(elapsed * (searching ? 4.5 : 8.5) + phase) * 0.16);
      const beaconMaterial = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      beaconMaterial.color.set(searching ? '#ffd0a0' : '#fff4eb');
      beaconMaterial.opacity = (searching ? 0.72 : 0.98) * alertIntensity;
      continue;
    }
    const index = child.userData.alertWave as number;
    const cycle = (elapsed * (searching ? 0.68 : 1.16) + index / 3 + phase * 0.05) % 1;
    child.scale.setScalar(1 + cycle * (searching ? 2.1 : 2.7));
    const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
    material.color.set(searching ? '#ff9b42' : '#ff3048');
    material.opacity = (1 - cycle) * (searching ? 0.42 : 0.76) * alertIntensity;
  }
}

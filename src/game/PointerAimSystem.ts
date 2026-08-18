import * as THREE from 'three';

export interface PointerAimSnapshot {
  active: boolean;
  worldX: number;
  worldY: number;
  directionX: number;
  directionY: number;
  digX: number;
  digY: number;
}

/**
 * Converts browser pointer coordinates into the side-view world plane and owns
 * the small sucker/tool contact reticle. Keeping this outside Octopus means the
 * same aim source can later drive tools, thrown objects, and ability patterns.
 */
export class PointerAimSystem {
  private world = new THREE.Vector2();
  private direction = new THREE.Vector2(1, 0);
  private active = false;
  private normalizedX = 0.5;
  private normalizedY = 0.5;
  readonly reticle = new THREE.Group();

  constructor(scene: THREE.Scene) {
    const material = new THREE.MeshBasicMaterial({
      color: '#b8fff0', transparent: true, opacity: 0.78,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.125, 18), material);
    const horizontal = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.018), material);
    const vertical = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.34), material);
    this.reticle.add(ring, horizontal, vertical);
    this.reticle.position.z = 5.6;
    this.reticle.renderOrder = 40;
    this.reticle.visible = false;
    scene.add(this.reticle);
  }

  updateFromClient(clientX: number, clientY: number, rect: DOMRect, camera: THREE.OrthographicCamera): void {
    if (rect.width <= 0 || rect.height <= 0) return;
    this.normalizedX = (clientX - rect.left) / rect.width;
    this.normalizedY = (clientY - rect.top) / rect.height;
    this.syncCamera(camera);
    this.active = true;
  }

  syncCamera(camera: THREE.OrthographicCamera): void {
    this.world.set(
      camera.position.x + camera.left + this.normalizedX * (camera.right - camera.left),
      camera.position.y + camera.top - this.normalizedY * (camera.top - camera.bottom),
    );
  }

  directionFrom(x: number, y: number, fallbackFacing = 1): THREE.Vector2 {
    if (!this.active) return this.direction.set(fallbackFacing || 1, -0.04).normalize();
    this.direction.set(this.world.x - x, this.world.y - y);
    if (this.direction.lengthSq() < 0.0025) this.direction.set(fallbackFacing || 1, -0.04);
    return this.direction.normalize();
  }

  updateVisual(x: number, y: number, fallbackFacing: number, time: number, visible: boolean, camera: THREE.OrthographicCamera): void {
    this.syncCamera(camera);
    const direction = this.directionFrom(x, y, fallbackFacing);
    this.reticle.position.set(x + direction.x * 0.84, y + direction.y * 0.84, 5.6);
    const pulse = 0.88 + Math.sin(time * 7.5) * 0.08;
    this.reticle.scale.setScalar(pulse);
    this.reticle.visible = this.active && visible;
  }

  snapshot(x: number, y: number, fallbackFacing: number): PointerAimSnapshot {
    const direction = this.directionFrom(x, y, fallbackFacing);
    return {
      active: this.active,
      worldX: Number(this.world.x.toFixed(2)),
      worldY: Number(this.world.y.toFixed(2)),
      directionX: Number(direction.x.toFixed(3)),
      directionY: Number(direction.y.toFixed(3)),
      digX: Number((x + direction.x * 0.72).toFixed(2)),
      digY: Number((y + direction.y * 0.72).toFixed(2)),
    };
  }
}

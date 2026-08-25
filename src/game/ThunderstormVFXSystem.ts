import * as THREE from 'three';

export interface ThunderstormFrame {
  elapsed: number;
  stormStrength: number;
  cameraX: number;
  cameraY: number;
  viewWidth: number;
  viewHeight: number;
  seaLevel: number;
  depthM: number;
}

export interface ThunderEvent {
  kind: 'thunder';
  strength: number;
  distanceM: number;
  near: boolean;
}

export interface ThunderstormSnapshot {
  active: boolean;
  phase: 'idle' | 'leader' | 'return-stroke' | 'afterglow';
  stormStrength: number;
  flash: number;
  strikeCount: number;
  thunderCount: number;
  nearStrikes: number;
  branchCount: number;
  nextStrikeInSeconds: number;
  thunderDelaySeconds: number;
  surfaceVisibility: number;
  lastStrike: null | { x: number; startY: number; endY: number; distanceM: number; near: boolean };
}

const cloudVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const cloudFragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uStorm;
  uniform float uFlash;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
  }

  void main() {
    vec2 p = vec2(vUv.x * 7.2 + uTime * 0.018, vUv.y * 3.1);
    float billow = noise(p) * 0.54 + noise(p * 2.15 + 7.0) * 0.29 + noise(p * 4.1 - 3.0) * 0.17;
    float ceiling = smoothstep(0.04, 0.24, vUv.y) * smoothstep(1.0, 0.42, vUv.y);
    float density = smoothstep(0.35, 0.72, billow + (1.0 - vUv.y) * 0.27) * ceiling;
    vec3 charcoal = mix(vec3(0.035, 0.105, 0.13), vec3(0.10, 0.19, 0.21), billow);
    vec3 charged = vec3(0.55, 0.82, 0.88) * uFlash * (0.35 + billow * 0.8);
    gl_FragColor = vec4(charcoal + charged, density * uStorm * 0.93);
  }
`;

const boltVertex = /* glsl */ `
  attribute float aEnergy;
  varying float vEnergy;
  void main() {
    vEnergy = aEnergy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const boltFragment = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  varying float vEnergy;
  void main() {
    vec3 outer = vec3(0.32, 0.77, 1.0);
    vec3 core = vec3(0.94, 1.0, 1.0);
    gl_FragColor = vec4(mix(outer, core, vEnergy), uOpacity * (0.42 + vEnergy * 0.58));
  }
`;

interface StrikeState {
  startedAt: number;
  intensity: number;
  x: number;
  startY: number;
  endY: number;
  near: boolean;
  distanceM: number;
  branches: number;
}

/** Camera-local surface thunderstorm VFX with deterministic scheduling. */
export class ThunderstormVFXSystem {
  private readonly clouds: THREE.Mesh;
  private readonly cloudMaterial: THREE.ShaderMaterial;
  private readonly bolt: THREE.Mesh;
  private readonly boltMaterial: THREE.ShaderMaterial;
  private readonly impactRing: THREE.Mesh;
  private readonly impactGlow: THREE.Mesh;
  private readonly screenFlash: THREE.Mesh;
  private readonly screenFlashMaterial: THREE.MeshBasicMaterial;
  private readonly strikeLight: THREE.PointLight;
  private strike: StrikeState | null = null;
  private nextStrikeAt = Number.POSITIVE_INFINITY;
  private pendingThunders: Array<{ at: number; event: ThunderEvent }> = [];
  private lastElapsed = 0;
  private stormStrength = 0;
  private flash = 0;
  private strikeCount = 0;
  private thunderCount = 0;
  private nearStrikes = 0;
  private branchCount = 0;
  private surfaceVisibility = 1;
  private lastStrike: ThunderstormSnapshot['lastStrike'] = null;

  constructor(private readonly scene: THREE.Scene, private readonly rng: () => number) {
    this.cloudMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uStorm: { value: 0 }, uFlash: { value: 0 } },
      vertexShader: cloudVertex,
      fragmentShader: cloudFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(36, 7.2, 1, 1), this.cloudMaterial);
    this.clouds.position.z = -17.2;
    this.clouds.renderOrder = -9;
    this.clouds.visible = false;
    this.scene.add(this.clouds);

    this.boltMaterial = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: boltVertex,
      fragmentShader: boltFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.bolt = new THREE.Mesh(new THREE.BufferGeometry(), this.boltMaterial);
    this.bolt.position.z = 7.45;
    this.bolt.renderOrder = 46;
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    this.scene.add(this.bolt);

    const haloMaterial = new THREE.MeshBasicMaterial({ color: '#b9f5ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    this.impactRing = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 36), haloMaterial);
    this.impactRing.position.z = 7.4;
    this.impactRing.renderOrder = 47;
    this.impactRing.visible = false;
    this.scene.add(this.impactRing);
    this.impactGlow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), haloMaterial.clone());
    this.impactGlow.position.z = 7.35;
    this.impactGlow.renderOrder = 46;
    this.impactGlow.visible = false;
    this.scene.add(this.impactGlow);

    this.screenFlashMaterial = new THREE.MeshBasicMaterial({ color: '#bcecff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    this.screenFlash = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.screenFlashMaterial);
    this.screenFlash.position.z = 8.7;
    this.screenFlash.renderOrder = 49;
    this.screenFlash.frustumCulled = false;
    this.screenFlash.visible = false;
    this.scene.add(this.screenFlash);

    this.strikeLight = new THREE.PointLight('#c9f6ff', 0, 32, 1.4);
    this.strikeLight.position.z = 7.2;
    this.scene.add(this.strikeLight);
  }

  update(frame: ThunderstormFrame): ThunderEvent[] {
    this.lastElapsed = frame.elapsed;
    this.stormStrength = THREE.MathUtils.clamp(frame.stormStrength, 0, 1);
    this.surfaceVisibility = THREE.MathUtils.clamp(1 - frame.depthM / 42, 0, 1);
    const events: ThunderEvent[] = [];
    this.updateClouds(frame);

    if (this.stormStrength < 0.34) {
      this.nextStrikeAt = Number.POSITIVE_INFINITY;
    } else {
      if (!Number.isFinite(this.nextStrikeAt)) this.nextStrikeAt = frame.elapsed + this.strikeDelay();
      if (frame.elapsed >= this.nextStrikeAt) {
        this.triggerStrike(frame, this.rng() < 0.44 + this.stormStrength * 0.3);
        this.nextStrikeAt = frame.elapsed + this.strikeDelay();
      }
    }

    for (let index = this.pendingThunders.length - 1; index >= 0; index -= 1) {
      const pending = this.pendingThunders[index];
      if (frame.elapsed < pending.at) continue;
      this.thunderCount += 1;
      events.push(pending.event);
      this.pendingThunders.splice(index, 1);
    }
    this.updateStrike(frame);
    return events;
  }

  forceStrike(frame: ThunderstormFrame, near = true): void {
    this.lastElapsed = frame.elapsed;
    this.stormStrength = Math.max(0.8, frame.stormStrength);
    this.surfaceVisibility = THREE.MathUtils.clamp(1 - frame.depthM / 42, 0, 1);
    this.updateClouds(frame);
    this.triggerStrike(frame, near);
    this.updateStrike(frame);
  }

  snapshot(): ThunderstormSnapshot {
    const age = this.strike ? Math.max(0, this.lastElapsed - this.strike.startedAt) : 999;
    const phase: ThunderstormSnapshot['phase'] = !this.strike || age >= 0.72
      ? 'idle'
      : age < 0.065 ? 'leader'
      : age < 0.25 ? 'return-stroke' : 'afterglow';
    return {
      active: Boolean(this.strike && age < 0.72),
      phase,
      stormStrength: Number(this.stormStrength.toFixed(2)),
      flash: Number(this.flash.toFixed(2)),
      strikeCount: this.strikeCount,
      thunderCount: this.thunderCount,
      nearStrikes: this.nearStrikes,
      branchCount: this.branchCount,
      nextStrikeInSeconds: Number((Number.isFinite(this.nextStrikeAt) ? Math.max(0, this.nextStrikeAt - this.lastElapsed) : -1).toFixed(2)),
      thunderDelaySeconds: Number((this.pendingThunders.length
        ? Math.max(0, Math.min(...this.pendingThunders.map((pending) => pending.at)) - this.lastElapsed)
        : -1).toFixed(2)),
      surfaceVisibility: Number(this.surfaceVisibility.toFixed(2)),
      lastStrike: this.lastStrike,
    };
  }

  private strikeDelay(): number {
    const minimum = THREE.MathUtils.lerp(8.5, 2.2, this.stormStrength);
    const spread = THREE.MathUtils.lerp(8, 3.4, this.stormStrength);
    return minimum + this.rng() * spread;
  }

  private triggerStrike(frame: ThunderstormFrame, near: boolean): void {
    const distanceM = near ? 38 + this.rng() * 130 : 260 + this.rng() * 720;
    const intensity = (near ? 1 : 0.58) * (0.78 + this.stormStrength * 0.34);
    const x = frame.cameraX + (this.rng() - 0.5) * frame.viewWidth * (near ? 0.52 : 0.85);
    const startY = frame.seaLevel + frame.viewHeight * (0.43 + this.rng() * 0.12);
    const endY = frame.seaLevel + (near ? 0.02 : 1.2 + this.rng() * 1.1);
    const branches = near ? 4 + Math.floor(this.rng() * 3) : 2 + Math.floor(this.rng() * 3);
    this.strike = { startedAt: frame.elapsed, intensity, x, startY, endY, near, distanceM, branches };
    this.strikeCount += 1;
    if (near) this.nearStrikes += 1;
    this.branchCount = branches;
    this.pendingThunders.push({
      at: frame.elapsed + Math.max(0.16, distanceM / 343),
      event: { kind: 'thunder', strength: intensity, distanceM, near },
    });
    this.lastStrike = {
      x: Number(x.toFixed(2)), startY: Number(startY.toFixed(2)), endY: Number(endY.toFixed(2)),
      distanceM: Number(distanceM.toFixed(1)), near,
    };
    this.rebuildBolt(this.strike);
  }

  private updateClouds(frame: ThunderstormFrame): void {
    const visible = this.stormStrength > 0.05 && this.surfaceVisibility > 0.01;
    this.clouds.visible = visible;
    this.clouds.position.set(frame.cameraX, frame.seaLevel + frame.viewHeight * 0.41, -17.2);
    this.clouds.scale.set(Math.max(1, frame.viewWidth / 36 * 1.18), Math.max(1, frame.viewHeight / 18), 1);
    this.cloudMaterial.uniforms.uTime.value = frame.elapsed;
    this.cloudMaterial.uniforms.uStorm.value = this.stormStrength * this.surfaceVisibility;
    this.cloudMaterial.uniforms.uFlash.value = this.flash * this.surfaceVisibility;
  }

  private updateStrike(frame: ThunderstormFrame): void {
    if (!this.strike) return this.hideStrike();
    const age = frame.elapsed - this.strike.startedAt;
    if (age >= 0.72) {
      this.hideStrike();
      this.strike = null;
      return;
    }
    const strokeA = Math.max(0, 1 - Math.abs(age - 0.045) / 0.045);
    const strokeB = Math.max(0, 1 - Math.abs(age - 0.145) / 0.038);
    const strokeC = Math.max(0, 1 - Math.abs(age - 0.225) / 0.024) * 0.55;
    const afterglow = age > 0.24 ? Math.max(0, 1 - (age - 0.24) / 0.48) * 0.2 : 0;
    this.flash = Math.min(1, Math.max(strokeA, strokeB * 0.82, strokeC, afterglow) * this.strike.intensity * this.surfaceVisibility);
    this.bolt.visible = this.flash > 0.025;
    this.boltMaterial.uniforms.uOpacity.value = Math.min(1, this.flash * 1.35);
    this.impactRing.visible = this.bolt.visible && this.strike.near;
    this.impactGlow.visible = this.impactRing.visible;
    const impactPulse = 0.7 + age * 5.2;
    this.impactRing.position.set(this.strike.x, this.strike.endY, 7.4);
    this.impactRing.scale.setScalar(impactPulse);
    (this.impactRing.material as THREE.MeshBasicMaterial).opacity = Math.min(0.9, this.flash);
    this.impactGlow.position.set(this.strike.x, this.strike.endY, 7.35);
    this.impactGlow.scale.set(1.1 + age * 3.4, 0.35 + age * 0.55, 1);
    (this.impactGlow.material as THREE.MeshBasicMaterial).opacity = this.flash * 0.45;
    this.screenFlash.visible = this.flash > 0.015;
    this.screenFlash.position.set(frame.cameraX, frame.cameraY, 8.7);
    this.screenFlash.scale.set(frame.viewWidth * 0.5, frame.viewHeight * 0.5, 1);
    this.screenFlashMaterial.opacity = this.flash * (this.strike.near ? 0.16 : 0.075);
    this.strikeLight.position.set(this.strike.x, this.strike.endY + 2.2, 7.2);
    this.strikeLight.intensity = this.flash * (this.strike.near ? 17 : 8);
    this.cloudMaterial.uniforms.uFlash.value = this.flash;
  }

  private hideStrike(): void {
    this.flash = 0;
    this.bolt.visible = false;
    this.impactRing.visible = false;
    this.impactGlow.visible = false;
    this.screenFlash.visible = false;
    this.strikeLight.intensity = 0;
    this.boltMaterial.uniforms.uOpacity.value = 0;
    this.screenFlashMaterial.opacity = 0;
    this.cloudMaterial.uniforms.uFlash.value = 0;
  }

  private rebuildBolt(strike: StrikeState): void {
    const vertices: number[] = [];
    const energies: number[] = [];
    const addSegment = (ax: number, ay: number, bx: number, by: number, width: number, energy: number): void => {
      const dx = bx - ax;
      const dy = by - ay;
      const inverseLength = 1 / Math.max(0.001, Math.hypot(dx, dy));
      const nx = -dy * inverseLength * width;
      const ny = dx * inverseLength * width;
      vertices.push(
        ax + nx, ay + ny, 0, ax - nx, ay - ny, 0, bx + nx, by + ny, 0,
        ax - nx, ay - ny, 0, bx - nx, by - ny, 0, bx + nx, by + ny, 0,
      );
      energies.push(energy, energy, 1, energy, energy, 1);
    };

    const nodes: Array<{ x: number; y: number }> = [{ x: strike.x, y: strike.startY }];
    const steps = strike.near ? 12 : 9;
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const taper = Math.sin(t * Math.PI);
      const jitter = step === steps ? 0 : (this.rng() - 0.5) * (0.52 + taper * 0.54);
      nodes.push({ x: strike.x + jitter, y: THREE.MathUtils.lerp(strike.startY, strike.endY, t) });
    }
    for (let index = 1; index < nodes.length; index += 1) {
      addSegment(nodes[index - 1].x, nodes[index - 1].y, nodes[index].x, nodes[index].y, strike.near ? 0.035 : 0.022, 0.82);
    }
    for (let branch = 0; branch < strike.branches; branch += 1) {
      const rootIndex = 2 + Math.floor(this.rng() * (nodes.length - 4));
      let previous = nodes[rootIndex];
      const direction = this.rng() < 0.5 ? -1 : 1;
      const branchSteps = 2 + Math.floor(this.rng() * 3);
      for (let step = 1; step <= branchSteps; step += 1) {
        const next = {
          x: previous.x + direction * (0.28 + this.rng() * 0.38),
          y: previous.y - (0.34 + this.rng() * 0.42),
        };
        addSegment(previous.x, previous.y, next.x, next.y, 0.018, 0.35);
        previous = next;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('aEnergy', new THREE.Float32BufferAttribute(energies, 1));
    geometry.computeBoundingSphere();
    this.bolt.geometry.dispose();
    this.bolt.geometry = geometry;
  }
}

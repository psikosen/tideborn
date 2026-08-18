import * as THREE from 'three';

export type TechniqueVFXId = 'jet' | 'jetBlast' | 'ink' | 'twist' | 'dig' | 'hunt' | 'feeding' | 'vent' | 'bioPulse';
type EffectPattern = 'linear' | 'radial';
type ParticleMotion = 'trail' | 'burst' | 'cloud' | 'rise';

export interface TechniqueVFXDefinition {
  id: TechniqueVFXId;
  pattern: EffectPattern;
  range: number;
  width: number;
  travel: number;
  impact: number;
  fade: number;
  color: string;
  accent: string;
  particles: number;
  particleMotion: ParticleMotion;
  additive: boolean;
  z: number;
}

export const TECHNIQUE_VFX_DEFINITIONS: Readonly<Record<TechniqueVFXId, TechniqueVFXDefinition>> = {
  jet: {
    id: 'jet', pattern: 'linear', range: 4.2, width: 0.92, travel: 0.18, impact: 0.12, fade: 0.34,
    color: '#83f1dd', accent: '#e3fff4', particles: 48, particleMotion: 'trail', additive: true, z: 3.2,
  },
  jetBlast: {
    id: 'jetBlast', pattern: 'linear', range: 6.6, width: 2.75, travel: 0.16, impact: 0.24, fade: 0.68,
    color: '#4bd8d0', accent: '#f1fff0', particles: 128, particleMotion: 'trail', additive: true, z: 3.55,
  },
  ink: {
    id: 'ink', pattern: 'radial', range: 2.65, width: 2.65, travel: 0.34, impact: 0.8, fade: 3.1,
    color: '#15132e', accent: '#755aa8', particles: 92, particleMotion: 'cloud', additive: false, z: 3.45,
  },
  twist: {
    id: 'twist', pattern: 'radial', range: 1.25, width: 1.25, travel: 0.16, impact: 0.16, fade: 0.52,
    color: '#ff8d6f', accent: '#ffe2b3', particles: 30, particleMotion: 'burst', additive: true, z: 3.3,
  },
  dig: {
    id: 'dig', pattern: 'radial', range: 0.82, width: 0.82, travel: 0.08, impact: 0.12, fade: 0.42,
    color: '#a78b62', accent: '#e9d59d', particles: 24, particleMotion: 'burst', additive: false, z: 3.15,
  },
  hunt: {
    id: 'hunt', pattern: 'linear', range: 2.35, width: 0.62, travel: 0.14, impact: 0.12, fade: 0.4,
    color: '#f0a56d', accent: '#b9f3cf', particles: 34, particleMotion: 'trail', additive: true, z: 3.35,
  },
  feeding: {
    id: 'feeding', pattern: 'radial', range: 1.15, width: 1.15, travel: 0.14, impact: 0.36, fade: 1.08,
    color: '#b51f3d', accent: '#caffea', particles: 40, particleMotion: 'burst', additive: true, z: 3.38,
  },
  vent: {
    id: 'vent', pattern: 'linear', range: 5.1, width: 1.8, travel: 1.4, impact: 0.5, fade: 2.8,
    color: '#163c3b', accent: '#68e6b1', particles: 86, particleMotion: 'rise', additive: true, z: 2.15,
  },
  bioPulse: {
    id: 'bioPulse', pattern: 'radial', range: 1.35, width: 1.35, travel: 0.52, impact: 0.18, fade: 1.1,
    color: '#3ca98e', accent: '#8be0c9', particles: 22, particleMotion: 'burst', additive: true, z: 2.25,
  },
};

const effectVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const effectFragment = /* glsl */ `
  precision highp float;
  uniform float uAge;
  uniform float uProgress;
  uniform float uFade;
  uniform float uPattern;
  uniform float uDark;
  uniform vec3 uColor;
  uniform vec3 uAccent;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 p = vUv - 0.5;
    float alpha = 0.0;
    float energy = 0.0;
    float noise = hash(floor(vUv * vec2(48.0, 24.0)) + floor(uAge * 11.0));

    if (uPattern < 0.5) {
      float edge = 1.0 - smoothstep(0.18, 0.49, abs(p.y));
      float revealed = 1.0 - smoothstep(uProgress, uProgress + 0.035, vUv.x);
      float tail = smoothstep(0.0, 0.17, vUv.x);
      float head = 1.0 - smoothstep(0.0, 0.13, abs(vUv.x - uProgress));
      float chevrons = pow(max(0.0, sin((vUv.x * 11.0 - uAge * 7.0) * 6.2831 - abs(p.y) * 7.0)), 7.0);
      alpha = edge * revealed * tail * (0.18 + chevrons * 0.26 + head * 0.78);
      energy = head + chevrons * 0.65;
    } else {
      float r = length(p) * 2.0;
      float wave = 1.0 - smoothstep(0.025, 0.13, abs(r - uProgress));
      float echo = 1.0 - smoothstep(0.02, 0.08, abs(r - fract(uProgress * 1.5) * 0.72));
      float spokes = pow(max(0.0, sin(atan(p.y, p.x) * 8.0 - uAge * 7.0)), 9.0);
      float core = 1.0 - smoothstep(0.0, 1.0, r);
      if (uDark > 0.5) {
        alpha = core * (0.28 + noise * 0.22) * smoothstep(0.0, 0.32, uProgress);
        alpha += wave * 0.16;
        energy = noise * 0.18;
      } else {
        alpha = wave * 0.72 + echo * 0.24 + spokes * core * 0.16;
        energy = wave + spokes * 0.4;
      }
    }

    alpha *= uFade;
    if (alpha < 0.008) discard;
    vec3 color = mix(uColor, uAccent, clamp(energy, 0.0, 1.0));
    if (uDark < 0.5) color *= 1.0 + energy * 0.48;
    gl_FragColor = vec4(color, alpha);
  }
`;

const particleVertex = /* glsl */ `
  precision highp float;
  attribute vec4 aSeed;
  attribute vec3 aVelocity;
  attribute float aSize;
  uniform float uAge;
  uniform float uLifetime;
  uniform float uMotion;
  varying float vLife;
  varying float vSeed;

  void main() {
    float delay = aSeed.x * min(0.48, uLifetime * 0.22);
    float t = clamp((uAge - delay) / max(0.001, uLifetime - delay), 0.0, 1.0);
    vec3 pos = position + aVelocity * t;
    float wobble = sin(aSeed.y * 31.0 + t * (5.0 + aSeed.z * 8.0));
    if (uMotion > 2.5) {
      pos.x += wobble * (0.12 + t * 0.42);
      pos.y += t * t * (0.5 + aSeed.w * 1.4);
    } else if (uMotion > 1.5) {
      pos.x += wobble * t * 0.38;
      pos.y += sin(aSeed.z * 19.0 + t * 4.0) * t * 0.22;
    } else if (uMotion < 0.5) {
      pos.x -= t * t * (0.5 + aSeed.w * 1.5);
      pos.y += wobble * t * 0.16;
    } else {
      pos.y -= t * t * 0.32;
    }
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float envelope = smoothstep(0.0, 0.09, t) * (1.0 - smoothstep(0.66, 1.0, t));
    gl_PointSize = max(0.0, aSize * envelope * (300.0 / max(1.0, -mvPosition.z)));
    gl_Position = projectionMatrix * mvPosition;
    vLife = t;
    vSeed = aSeed.y;
  }
`;

const particleFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform float uDark;
  varying float vLife;
  varying float vSeed;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p) * 2.0;
    float soft = 1.0 - smoothstep(0.38, 1.0, r);
    float ring = 1.0 - smoothstep(0.04, 0.16, abs(r - 0.64));
    float alpha = soft * (1.0 - smoothstep(0.58, 1.0, vLife));
    if (uDark < 0.5) alpha = max(alpha * 0.7, ring * 0.38) * (0.7 + vSeed * 0.3);
    vec3 color = mix(uColor, uAccent, (1.0 - vLife) * (0.35 + ring * 0.65));
    if (uDark < 0.5) color *= 1.05 + ring * 0.58;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

interface VFXInstance {
  definition: TechniqueVFXDefinition;
  group: THREE.Group;
  field: THREE.Mesh;
  particles: THREE.Points;
  fieldMaterial: THREE.ShaderMaterial;
  particleMaterial: THREE.ShaderMaterial;
  age: number;
  active: boolean;
  phase: 'travel' | 'impact' | 'fade' | 'done';
}

export class TechniqueVFXSystem {
  private readonly scene: THREE.Scene;
  private readonly pools = new Map<TechniqueVFXId, VFXInstance[]>();
  private readonly active: VFXInstance[] = [];
  private readonly rng: () => number;

  constructor(scene: THREE.Scene, seed = 1) {
    this.scene = scene;
    let state = seed >>> 0;
    this.rng = () => {
      state += 0x6d2b79f5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  cast(id: TechniqueVFXId, origin: THREE.Vector3, direction = new THREE.Vector2(1, 0)): void {
    const definition = TECHNIQUE_VFX_DEFINITIONS[id];
    const pool = this.pools.get(id) ?? [];
    if (!this.pools.has(id)) this.pools.set(id, pool);
    let instance = pool.find((candidate) => !candidate.active);
    if (!instance) {
      if (pool.length >= 5) {
        instance = pool.reduce((oldest, candidate) => candidate.age > oldest.age ? candidate : oldest, pool[0]);
        const activeIndex = this.active.indexOf(instance);
        if (activeIndex >= 0) this.active.splice(activeIndex, 1);
      } else {
        instance = this.createInstance(definition);
        pool.push(instance);
      }
    }
    const len = Math.hypot(direction.x, direction.y) || 1;
    const dx = direction.x / len;
    const dy = direction.y / len;
    instance.age = 0;
    instance.active = true;
    instance.phase = 'travel';
    instance.group.visible = true;
    instance.group.position.copy(origin);
    instance.group.rotation.z = definition.pattern === 'linear' ? Math.atan2(dy, dx) : 0;
    if (definition.pattern === 'linear') {
      instance.field.position.set(definition.range * 0.5, 0, 0);
      instance.field.scale.set(definition.range, definition.width, 1);
    } else {
      instance.field.position.set(0, 0, 0);
      instance.field.scale.setScalar(definition.range * 2);
    }
    instance.fieldMaterial.uniforms.uAge.value = 0;
    instance.fieldMaterial.uniforms.uProgress.value = 0;
    instance.fieldMaterial.uniforms.uFade.value = 1;
    instance.particleMaterial.uniforms.uAge.value = 0;
    if (!this.active.includes(instance)) this.active.push(instance);
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const instance = this.active[i];
      const cfg = instance.definition;
      instance.age += dt;
      const travelEnd = cfg.travel;
      const impactEnd = travelEnd + cfg.impact;
      const total = impactEnd + cfg.fade;
      let progress = 1;
      let fade = 1;
      if (instance.age < travelEnd) {
        instance.phase = 'travel';
        progress = smoothstep01(instance.age / Math.max(0.001, travelEnd));
      } else if (instance.age < impactEnd) {
        instance.phase = 'impact';
        progress = 1;
      } else if (instance.age < total) {
        instance.phase = 'fade';
        fade = 1 - smoothstep01((instance.age - impactEnd) / Math.max(0.001, cfg.fade));
      } else {
        instance.phase = 'done';
        instance.active = false;
        instance.group.visible = false;
        this.active.splice(i, 1);
        continue;
      }
      instance.fieldMaterial.uniforms.uAge.value = instance.age;
      instance.fieldMaterial.uniforms.uProgress.value = progress;
      instance.fieldMaterial.uniforms.uFade.value = fade;
      instance.particleMaterial.uniforms.uAge.value = instance.age;
    }
  }

  describeActive(): Array<{ id: TechniqueVFXId; phase: string; age: number }> {
    return this.active.map((instance) => ({ id: instance.definition.id, phase: instance.phase, age: Number(instance.age.toFixed(2)) }));
  }

  private createInstance(definition: TechniqueVFXDefinition): VFXInstance {
    const group = new THREE.Group();
    group.name = `TechniqueVFX:${definition.id}`;
    group.visible = false;
    const fieldMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uAge: { value: 0 },
        uProgress: { value: 0 },
        uFade: { value: 1 },
        uPattern: { value: definition.pattern === 'linear' ? 0 : 1 },
        uDark: { value: definition.id === 'ink' ? 1 : 0 },
        uColor: { value: new THREE.Color(definition.color) },
        uAccent: { value: new THREE.Color(definition.accent) },
      },
      vertexShader: effectVertex,
      fragmentShader: effectFragment,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: definition.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const field = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fieldMaterial);
    field.position.z = definition.z;
    field.renderOrder = definition.additive ? 14 : 13;
    group.add(field);

    const positions = new Float32Array(definition.particles * 3);
    const seeds = new Float32Array(definition.particles * 4);
    const velocities = new Float32Array(definition.particles * 3);
    const sizes = new Float32Array(definition.particles);
    const motion = motionIndex(definition.particleMotion);
    for (let i = 0; i < definition.particles; i += 1) {
      const p = i * 3;
      const s = i * 4;
      const angle = this.rng() * Math.PI * 2;
      const radial = 0.24 + this.rng() * definition.range * (definition.pattern === 'linear' ? 0.22 : 0.55);
      if (definition.particleMotion === 'trail') {
        positions[p] = this.rng() * definition.range * 0.86;
        positions[p + 1] = (this.rng() - 0.5) * definition.width * 0.46;
        velocities[p] = -0.5 - this.rng() * 1.7;
        velocities[p + 1] = (this.rng() - 0.5) * 0.9;
      } else if (definition.particleMotion === 'rise') {
        positions[p] = (this.rng() - 0.5) * definition.width * 0.32;
        positions[p + 1] = this.rng() * definition.range * 0.24;
        velocities[p] = (this.rng() - 0.5) * 0.55;
        velocities[p + 1] = 1.4 + this.rng() * definition.range * 0.72;
      } else {
        positions[p] = Math.cos(angle) * radial * 0.16;
        positions[p + 1] = Math.sin(angle) * radial * 0.16;
        const speed = definition.particleMotion === 'cloud' ? 0.8 + this.rng() * 1.3 : 1.4 + this.rng() * definition.range * 1.8;
        velocities[p] = Math.cos(angle) * speed;
        velocities[p + 1] = Math.sin(angle) * speed;
      }
      positions[p + 2] = definition.z + 0.03 + this.rng() * 0.25;
      seeds[s] = this.rng(); seeds[s + 1] = this.rng(); seeds[s + 2] = this.rng(); seeds[s + 3] = this.rng();
      sizes[i] = definition.particleMotion === 'cloud'
        ? 1.1 + this.rng() * 1.8
        : definition.particleMotion === 'rise'
          ? 0.65 + this.rng() * 1.1
          : 0.45 + this.rng() * 0.9;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    particleGeometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
    particleGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const lifetime = definition.travel + definition.impact + definition.fade;
    const particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uAge: { value: 0 },
        uLifetime: { value: lifetime },
        uMotion: { value: motion },
        uDark: { value: definition.id === 'ink' ? 1 : 0 },
        uColor: { value: new THREE.Color(definition.color) },
        uAccent: { value: new THREE.Color(definition.accent) },
      },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: definition.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.frustumCulled = false;
    particles.renderOrder = definition.additive ? 15 : 13;
    group.add(particles);
    this.scene.add(group);
    return { definition, group, field, particles, fieldMaterial, particleMaterial, age: 0, active: false, phase: 'done' };
  }
}

function motionIndex(motion: ParticleMotion): number {
  return { trail: 0, burst: 1, cloud: 2, rise: 3 }[motion];
}

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

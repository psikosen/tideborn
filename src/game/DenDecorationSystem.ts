import * as THREE from 'three';
import type { DenSite } from './DenNetworkSystem';

export type DenDecorationKind = 'brace' | 'storage' | 'curtain' | 'bowl' | 'mineral' | 'bioLight';

interface DecorationRecord {
  denId: string;
  kind: DenDecorationKind;
  group: THREE.Group;
  baseY: number;
  phase: number;
  curtainMaterials?: THREE.ShaderMaterial[];
}

export interface DenDecorationSnapshot {
  habitats: number;
  placements: number;
  animated: number;
  counts: Record<DenDecorationKind, number>;
  storedFoodItems: number;
  style: string;
}

const curtainVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uStorm;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float freeEnd = smoothstep(0.2, 1.0, 1.0 - uv.y);
    float sway = sin(uTime * (1.25 + uStorm * 2.5) + uPhase + uv.y * 3.4) * (0.045 + uStorm * 0.13);
    p.x += sway * freeEnd;
    p.z += cos(uTime * 1.1 + uPhase + uv.y * 4.0) * 0.025 * freeEnd;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const curtainFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  void main() {
    float vein = pow(abs(sin(vUv.x * 22.0 + vUv.y * 6.0)), 12.0);
    vec3 root = vec3(0.10, 0.29, 0.20);
    vec3 tip = vec3(0.24, 0.53, 0.34);
    vec3 color = mix(tip, root, vUv.y) + vein * vec3(0.08, 0.10, 0.045);
    float edge = smoothstep(0.0, 0.09, vUv.x) * smoothstep(1.0, 0.91, vUv.x);
    gl_FragColor = vec4(color, 0.9 * edge);
  }
`;

/** Builds persistent, animated den furnishings without coupling them to save logic. */
export class DenDecorationSystem {
  private readonly records: DecorationRecord[] = [];
  private readonly habitats = new Map<string, THREE.Group>();
  private readonly foodByDen = new Map<string, THREE.Group>();
  private storedFoodItems = 0;

  constructor(private readonly scene: THREE.Scene) {}

  ensureHabitat(den: DenSite): void {
    if (this.habitats.has(den.id)) return;
    const group = new THREE.Group();
    group.name = `den-habitat-${den.id}`;
    const mat = new THREE.Mesh(
      new THREE.CircleGeometry(Math.min(1.25, den.radius * 0.48), 36),
      new THREE.MeshBasicMaterial({ color: '#4e342a', transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide }),
    );
    mat.scale.y = 0.25;
    mat.position.y = -0.86;
    mat.renderOrder = 21;
    group.add(mat);

    const mosaicMaterial = new THREE.MeshStandardMaterial({ color: '#c5a77a', roughness: 0.82 });
    for (let index = 0; index < 11; index += 1) {
      const angle = Math.PI * 0.08 + index / 10 * Math.PI * 0.84;
      const radius = Math.min(1.12, den.radius * 0.43);
      const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.075 + (index % 3) * 0.012, 0), mosaicMaterial);
      pebble.position.set(Math.cos(angle) * radius, -0.88 + Math.sin(angle) * 0.13, 0.05 + index * 0.002);
      pebble.scale.y = 0.48;
      pebble.rotation.z = index * 1.17;
      group.add(pebble);
    }

    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(Math.min(1.22, den.radius * 0.47), 0.025, 6, 36, Math.PI),
      new THREE.MeshBasicMaterial({ color: '#d1b27e', transparent: true, opacity: 0.3, depthWrite: false }),
    );
    arch.rotation.z = 0;
    arch.position.y = -0.42;
    arch.scale.y = 0.72;
    group.add(arch);
    group.position.set(den.x, den.y, 2.48);
    this.habitats.set(den.id, group);
    this.scene.add(group);
  }

  place(kind: DenDecorationKind, count: number, den: DenSite): THREE.Group {
    this.ensureHabitat(den);
    const group = kind === 'brace' ? this.buildBrace()
      : kind === 'storage' ? this.buildStorage()
      : kind === 'curtain' ? this.buildCurtain()
      : kind === 'bowl' ? this.buildBowl()
      : kind === 'mineral' ? this.buildMineralReinforcement()
      : this.buildBiolight();
    const side = count % 2 === 0 ? 1 : -1;
    const tier = Math.floor(Math.max(0, count - 1) / 2);
    if (kind === 'brace') {
      const braceSlots = [-0.82, 0.82, 0];
      group.position.set(den.x + braceSlots[(count - 1) % braceSlots.length], den.y - 0.22 + Math.floor((count - 1) / braceSlots.length) * 0.12, 2.76);
    }
    else if (kind === 'storage') group.position.set(den.x - 0.82 + ((count - 1) % 2) * 1.5, den.y + 0.42 - tier * 0.3, 2.86);
    else if (kind === 'curtain') group.position.set(den.x + side * Math.min(1.72, den.radius * 0.68), den.y - 0.18, 2.82);
    else if (kind === 'bowl') group.position.set(den.x - 0.65 + ((count - 1) % 4) * 0.43, den.y - 0.83 + tier * 0.18, 2.9);
    else if (kind === 'mineral') group.position.set(den.x + side * (0.82 + tier * 0.18), den.y - 0.73 + (count % 3) * 0.18, 2.84);
    else group.position.set(den.x + side * Math.min(1.02, den.radius * 0.42), den.y + 0.42 - tier * 0.48, 3.04);
    group.name = `den-${den.id}-${kind}-${count}`;
    group.userData.denId = den.id;
    group.userData.denDecoration = kind;
    const curtainMaterials = kind === 'curtain'
      ? (group.userData.curtainMaterials as THREE.ShaderMaterial[] | undefined)
      : undefined;
    this.records.push({ denId: den.id, kind, group, baseY: group.position.y, phase: count * 1.71, curtainMaterials });
    this.scene.add(group);
    return group;
  }

  update(elapsed: number, stormStrength: number): void {
    for (const record of this.records) {
      if (!record.group.visible) continue;
      if (record.curtainMaterials) {
        for (const material of record.curtainMaterials) {
          material.uniforms.uTime.value = elapsed;
          material.uniforms.uStorm.value = THREE.MathUtils.clamp(stormStrength, 0, 1);
        }
      }
      if (record.kind === 'storage') {
        record.group.position.y = record.baseY + Math.sin(elapsed * 1.35 + record.phase) * 0.018;
        record.group.rotation.z = Math.sin(elapsed * 1.1 + record.phase) * 0.018 * (1 + stormStrength * 2);
      }
    }
  }

  showStoredFood(den: DenSite): void {
    let cache = this.foodByDen.get(den.id);
    if (!cache) {
      cache = new THREE.Group();
      cache.name = `den-food-cache-${den.id}`;
      cache.position.set(den.x - 0.82, den.y + 0.26, 3.02);
      this.foodByDen.set(den.id, cache);
      this.scene.add(cache);
    }
    const index = Math.min(7, den.foodStored - 1);
    if (index < 0 || cache.children.length > index) return;
    const food = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 7),
      new THREE.MeshStandardMaterial({ color: index % 2 ? '#d89564' : '#e5b06f', roughness: 0.72 }),
    );
    food.scale.set(1.18, 0.55, 0.72);
    food.position.set((index % 4) * 0.16 - 0.24, -Math.floor(index / 4) * 0.12, 0.02 + index * 0.004);
    cache.add(food);
    this.storedFoodItems += 1;
  }

  snapshot(): DenDecorationSnapshot {
    const counts: Record<DenDecorationKind, number> = { brace: 0, storage: 0, curtain: 0, bowl: 0, mineral: 0, bioLight: 0 };
    for (const record of this.records) counts[record.kind] += 1;
    return {
      habitats: this.habitats.size,
      placements: this.records.length,
      animated: this.records.filter((record) => record.kind === 'curtain' || record.kind === 'storage').length,
      counts,
      storedFoodItems: this.storedFoodItems,
      style: 'shell mosaic floor, lashed structural braces, woven slings, swaying kelp, ribbed bowls, pressed mineral wallwork',
    };
  }

  private buildBrace(): THREE.Group {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#795238', roughness: 0.95 });
    const rope = new THREE.MeshStandardMaterial({ color: '#c1a162', roughness: 1 });
    const stone = new THREE.MeshStandardMaterial({ color: '#665d53', roughness: 0.93 });
    const beam = (height: number, radius: number): THREE.Mesh => new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.82, radius, height, 8), wood);
    const left = beam(1.5, 0.075);
    const right = beam(1.5, 0.075);
    const top = beam(1.65, 0.07);
    const diagonal = beam(1.65, 0.045);
    left.position.x = -0.7;
    right.position.x = 0.7;
    top.rotation.z = Math.PI / 2;
    top.position.y = 0.74;
    diagonal.rotation.z = -1.05;
    diagonal.position.y = 0.04;
    group.add(left, right, top, diagonal);
    for (const x of [-0.7, 0.7]) {
      const lashing = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 18), rope);
      lashing.position.set(x, 0.7, 0.05);
      group.add(lashing);
      const footing = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), stone);
      footing.position.set(x, -0.72, 0.02);
      footing.scale.y = 0.65;
      group.add(footing);
    }
    return group;
  }

  private buildStorage(): THREE.Group {
    const group = new THREE.Group();
    const fiber = new THREE.LineBasicMaterial({ color: '#c6a76c', transparent: true, opacity: 0.95 });
    const sling = new THREE.Mesh(
      new THREE.SphereGeometry(0.39, 18, 8, 0, Math.PI * 2, Math.PI * 0.47, Math.PI * 0.52),
      new THREE.MeshStandardMaterial({ color: '#806e45', wireframe: true, roughness: 1 }),
    );
    sling.scale.y = 0.55;
    sling.position.y = -0.08;
    group.add(sling);
    for (const side of [-1, 1]) {
      const rope = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(side * 0.42, 0.55, 0), new THREE.Vector3(side * 0.3, 0.1, 0.02), new THREE.Vector3(side * 0.18, -0.19, 0.04),
        ]), fiber,
      );
      group.add(rope);
      const knot = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 5, 13), new THREE.MeshStandardMaterial({ color: '#c6a76c', roughness: 1 }));
      knot.position.set(side * 0.42, 0.53, 0.02);
      group.add(knot);
    }
    return group;
  }

  private buildCurtain(): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPhase: { value: 0 }, uStorm: { value: 0 } },
      vertexShader: curtainVertex,
      fragmentShader: curtainFragment,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    for (let index = 0; index < 7; index += 1) {
      const strandMaterial = material.clone();
      strandMaterial.uniforms.uPhase.value = index * 0.71;
      const strand = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 1.36, 2, 9), strandMaterial);
      strand.position.set((index - 3) * 0.105, -0.18 - (index % 2) * 0.07, index * 0.006);
      group.add(strand);
    }
    // A visible braided header makes the curtain read as constructed decor.
    const header = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.82, 6), new THREE.MeshStandardMaterial({ color: '#b89a5d', roughness: 1 }));
    header.rotation.z = Math.PI / 2;
    header.position.y = 0.51;
    group.add(header);
    // Store every material; update() also finds clones through this array.
    group.userData.curtainMaterials = group.children.filter((child) => child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial).map((child) => (child as THREE.Mesh).material);
    return group;
  }

  private buildBowl(): THREE.Group {
    const group = new THREE.Group();
    const shell = new THREE.MeshStandardMaterial({ color: '#d2a57a', roughness: 0.52, side: THREE.DoubleSide });
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 9, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shell);
    bowl.scale.y = 0.5;
    group.add(bowl);
    for (let index = -2; index <= 2; index += 1) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.18 + Math.abs(index) * 0.018, 0.01, 5, 14, Math.PI), new THREE.MeshBasicMaterial({ color: '#f0cf9d' }));
      rib.scale.y = 0.46;
      rib.position.set(index * 0.025, 0.005, 0.08 + Math.abs(index) * 0.004);
      group.add(rib);
    }
    return group;
  }

  private buildMineralReinforcement(): THREE.Group {
    const group = new THREE.Group();
    const mortar = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.22, 0.08), new THREE.MeshStandardMaterial({ color: '#4d4140', roughness: 0.96 }));
    mortar.position.z = -0.04;
    group.add(mortar);
    const iron = new THREE.MeshStandardMaterial({ color: '#9a513d', roughness: 0.72, metalness: 0.3 });
    for (let index = 0; index < 6; index += 1) {
      const nodule = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13 + (index % 2) * 0.018, 0), iron);
      nodule.position.set((index - 2.5) * 0.19, (index % 2 ? 0.055 : -0.04), index * 0.008);
      nodule.scale.y = 0.72;
      nodule.rotation.z = index * 0.73;
      group.add(nodule);
    }
    return group;
  }

  private buildBiolight(): THREE.Group {
    const group = new THREE.Group();
    const stemMaterial = new THREE.MeshStandardMaterial({ color: '#255f4e', roughness: 0.82, emissive: '#174f40', emissiveIntensity: 0.42 });
    const bulbMaterial = new THREE.MeshBasicMaterial({ color: '#82efd0', transparent: true, opacity: 0.86, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    for (let index = 0; index < 5; index += 1) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.46 + index * 0.035, 6), stemMaterial);
      stem.position.set((index - 2) * 0.11, -0.19 - (index % 2) * 0.05, 0);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.068 + (index % 2) * 0.014, 10, 8), bulbMaterial);
      bulb.position.set(stem.position.x, stem.position.y - 0.23, 0.08);
      bulb.renderOrder = 55;
      group.add(stem, bulb);
    }
    const root = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.43, 28), new THREE.MeshBasicMaterial({ color: '#75e4c3', transparent: true, opacity: 0.48, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    root.position.z = -0.03;
    group.add(root);
    const lamp = new THREE.PointLight('#62d6b4', 0.68, 4.2, 1.8);
    lamp.position.set(0, -0.2, 1.2);
    group.add(lamp);
    return group;
  }
}

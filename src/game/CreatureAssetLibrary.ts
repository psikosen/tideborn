import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildOriginalCreatureModel, type OriginalCreatureKind } from './OriginalCreatureModels';

export type CreatureAssetId =
  | 'clownfish'
  | 'reef-fish'
  | 'shark'
  | 'orca'
  | 'twilight-emperor'
  | 'abyss-manta'
  | 'midnight-angler'
  | 'abyss-spinefish'
  | 'hadal-stalker'
  | 'bloodfin-leviathan'
  | 'cyan-abyss-hunter'
  | 'animated-shore-crab'
  | 'coconut-crab'
  | 'ilyoplax-mud-crab'
  | 'survivor-octopus';

interface CreatureAssetDefinition {
  url?: string;
  original?: OriginalCreatureKind;
  targetLength: number;
  rotateY: number;
  rotateX?: number;
  rotateZ?: number;
  animationNames?: string[];
  animationSpeed?: number;
  emissiveColor?: string;
  emissiveIntensity?: number;
  groundClearance?: number;
}

export interface CreatureAssetSnapshot {
  assetMode: 'full-glb' | 'contest-safe';
  requested: CreatureAssetId[];
  loaded: CreatureAssetId[];
  failed: CreatureAssetId[];
  original: CreatureAssetId[];
  instances: number;
  animatedInstances: number;
  staticMeshesBeforeMerge: number;
  staticMeshesAfterMerge: number;
}

// The normal/local game uses the user's detailed creature GLBs. The contest
// packager defines this flag so files with unresolved Sketchfab redistribution
// terms are replaced without silently degrading the development build.
const CONTEST_SAFE_CREATURES = (import.meta as ImportMeta & { env: Record<string, string | undefined> })
  .env.VITE_CONTEST_SAFE_CREATURES === '1';

interface PreparedCreatureAsset {
  template: THREE.Group;
  clip?: THREE.AnimationClip;
}

const DEFINITIONS: Record<CreatureAssetId, CreatureAssetDefinition> = {
  clownfish: {
    url: './assets/models/clownfish-animated.glb',
    original: 'clownfish',
    targetLength: 0.64,
    rotateY: 0,
    animationNames: ['swim', 'swim_right', 'idle'],
    animationSpeed: 1.15,
  },
  'reef-fish': {
    url: './assets/models/reef-fish-low-poly.glb',
    original: 'reef-fish',
    targetLength: 0.68,
    rotateY: 0,
  },
  shark: {
    url: './assets/models/shark-animated.glb',
    targetLength: 4.35,
    rotateY: Math.PI / 2,
    animationNames: ['shark_swim'],
    animationSpeed: 1.05,
  },
  orca: {
    url: './assets/models/orca-low-poly.glb',
    original: 'orca',
    targetLength: 4.9,
    // The supplied GLB's nose-to-tail axis is Z. Turn it into the XY
    // gameplay plane so the animal reads as a side silhouette, then let the
    // creature anchor's X scale mirror it for left/right swimming.
    rotateY: Math.PI / 2,
  },
  'twilight-emperor': {
    url: './assets/models/deep/twilight-emperor.glb',
    targetLength: 0.92,
    rotateY: 0,
    animationNames: ['Take 001'],
    animationSpeed: 0.72,
    emissiveColor: '#18484e',
    emissiveIntensity: 0.1,
  },
  'abyss-manta': {
    original: 'abyss-manta',
    targetLength: 3.6,
    rotateY: 0,
    animationNames: ['Swimming'],
    animationSpeed: 0.68,
    emissiveColor: '#173344',
    emissiveIntensity: 0.08,
  },
  'midnight-angler': {
    url: './assets/models/deep/midnight-angler.glb',
    targetLength: 1.55,
    rotateY: 0,
    animationNames: ['material.011Action'],
    animationSpeed: 0.82,
    emissiveColor: '#285a58',
    emissiveIntensity: 0.12,
  },
  'abyss-spinefish': {
    url: './assets/models/deep/abyss-spinefish.glb',
    targetLength: 2.5,
    rotateY: -0.86,
    emissiveColor: '#123e72',
    emissiveIntensity: 0.16,
  },
  'hadal-stalker': {
    url: './assets/models/deep/hadal-stalker.glb',
    targetLength: 1.9,
    rotateY: -0.42,
    rotateZ: Math.PI / 2,
    emissiveColor: '#4d5338',
    emissiveIntensity: 0.08,
  },
  'bloodfin-leviathan': {
    url: './assets/models/deep/bloodfin-leviathan.glb',
    targetLength: 7.4,
    rotateY: Math.PI / 2,
    emissiveColor: '#591019',
    emissiveIntensity: 0.12,
  },
  'cyan-abyss-hunter': {
    original: 'cyan-abyss-hunter',
    targetLength: 3.3,
    rotateY: 0,
    emissiveColor: '#164b51',
    emissiveIntensity: 0.1,
  },
  'animated-shore-crab': {
    url: './assets/models/crabs/animated-shore-crab.glb',
    original: 'animated-shore-crab',
    targetLength: 0.78,
    rotateY: 0,
    animationNames: ['Scene'],
    animationSpeed: 1.1,
    groundClearance: 0.19,
  },
  'coconut-crab': {
    url: './assets/models/crabs/coconut-crab.glb',
    original: 'coconut-crab',
    targetLength: 1.28,
    rotateY: 0,
    groundClearance: 0.34,
  },
  'ilyoplax-mud-crab': {
    url: './assets/models/crabs/ilyoplax-mud-crab.glb',
    original: 'ilyoplax-mud-crab',
    targetLength: 0.46,
    rotateY: 0,
    groundClearance: 0.13,
  },
  'survivor-octopus': {
    original: 'survivor-octopus',
    targetLength: 0.72,
    rotateY: 0,
  },
};

/**
 * Shared, lazy GLB cache for nearby creature representatives. Active systems
 * keep their procedural fallback until an asset resolves, so slow loading or
 * a missing optional model never blocks simulation or AI.
 */
export class CreatureAssetLibrary {
  private loader = new GLTFLoader();
  private cache = new Map<CreatureAssetId, Promise<PreparedCreatureAsset>>();
  private requested = new Set<CreatureAssetId>();
  private loaded = new Set<CreatureAssetId>();
  private failed = new Set<CreatureAssetId>();
  private original = new Set<CreatureAssetId>();
  private mixers: Array<{ mixer: THREE.AnimationMixer; anchor: THREE.Group }> = [];
  private instances = 0;
  private staticMeshesBeforeMerge = 0;
  private staticMeshesAfterMerge = 0;

  preload(ids: readonly CreatureAssetId[]): void {
    for (const id of ids) void this.loadPrepared(id).catch(() => undefined);
  }

  attach(id: CreatureAssetId, anchor: THREE.Group): void {
    this.requested.add(id);
    const definition = DEFINITIONS[id];
    void this.loadPrepared(id).then((prepared) => {
      if (anchor.userData.creatureAssetReady) return;
      const model = cloneSkeleton(prepared.template) as THREE.Group;
      model.name = `asset-${id}`;
      model.userData.creatureAsset = id;
      for (const child of anchor.children) {
        if (child.userData.assetFallback) child.visible = false;
      }
      anchor.add(model);
      anchor.userData.creatureAssetReady = id;
      this.instances += 1;

      const clip = prepared.clip;
      if (clip) {
        const mixer = new THREE.AnimationMixer(model);
        const action = mixer.clipAction(clip);
        action.timeScale = definition.animationSpeed ?? 1;
        action.play();
        this.mixers.push({ mixer, anchor });
      }
    }).catch(() => {
      this.failed.add(id);
    });
  }

  update(dt: number): void {
    for (const entry of this.mixers) if (entry.anchor.visible) entry.mixer.update(dt);
  }

  snapshot(): CreatureAssetSnapshot {
    return {
      assetMode: CONTEST_SAFE_CREATURES ? 'contest-safe' : 'full-glb',
      requested: [...this.requested],
      loaded: [...this.loaded],
      failed: [...this.failed],
      original: [...this.original],
      instances: this.instances,
      animatedInstances: this.mixers.length,
      staticMeshesBeforeMerge: this.staticMeshesBeforeMerge,
      staticMeshesAfterMerge: this.staticMeshesAfterMerge,
    };
  }

  private loadPrepared(id: CreatureAssetId): Promise<PreparedCreatureAsset> {
    let pending = this.cache.get(id);
    if (pending) return pending;
    const definition = DEFINITIONS[id];
    const useOriginal = Boolean(definition.original && (!definition.url || CONTEST_SAFE_CREATURES));
    const source = useOriginal
      ? Promise.resolve({ scene: buildOriginalCreatureModel(definition.original!), animations: [] as THREE.AnimationClip[] })
      : definition.url
        ? this.loader.loadAsync(definition.url)
        : Promise.reject(new Error(`Creature asset ${id} has no source.`));
    pending = source.then((gltf) => {
      const clip = this.pickAnimation(gltf.animations, definition.animationNames);
      const source = cloneSkeleton(gltf.scene);
      const preparedSource = clip ? source : this.mergeStaticModel(source);
      const template = this.normalizedModel(preparedSource, definition);
      template.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.castShadow = false;
        node.receiveShadow = true;
        node.frustumCulled = true;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          material.roughness = Math.max(0.48, material.roughness);
          material.metalness = Math.min(0.08, material.metalness);
          if (definition.emissiveColor) {
            material.emissive.lerp(new THREE.Color(definition.emissiveColor), 0.72);
            material.emissiveIntensity = Math.max(material.emissiveIntensity, definition.emissiveIntensity ?? 0.08);
          }
        }
      });
      if (useOriginal) this.original.add(id);
      this.loaded.add(id);
      return { template, clip };
    }).catch((error) => {
      this.failed.add(id);
      throw error;
    });
    this.cache.set(id, pending);
    return pending;
  }

  private mergeStaticModel(source: THREE.Object3D): THREE.Object3D {
    source.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    let unsupported = false;
    source.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      if (node instanceof THREE.SkinnedMesh || Array.isArray(node.material) || Object.keys(node.geometry.morphAttributes).length > 0) {
        unsupported = true;
        return;
      }
      meshes.push(node);
    });
    this.staticMeshesBeforeMerge += meshes.length;
    if (unsupported || meshes.length < 8) {
      this.staticMeshesAfterMerge += meshes.length;
      return source;
    }

    const buckets = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
    for (const mesh of meshes) {
      const material = mesh.material as THREE.Material;
      const attributes = Object.keys(mesh.geometry.attributes).sort().join(',');
      const key = `${material.uuid}|${attributes}|${mesh.geometry.index ? 'indexed' : 'plain'}`;
      const bucket: { material: THREE.Material; geometries: THREE.BufferGeometry[] } = buckets.get(key) ?? { material, geometries: [] };
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);
      bucket.geometries.push(geometry);
      buckets.set(key, bucket);
    }

    const flattened = new THREE.Group();
    for (const bucket of buckets.values()) {
      const geometry = bucket.geometries.length === 1 ? bucket.geometries[0] : mergeGeometries(bucket.geometries, false);
      if (!geometry) {
        this.staticMeshesAfterMerge += meshes.length;
        return source;
      }
      flattened.add(new THREE.Mesh(geometry, bucket.material));
    }
    this.staticMeshesAfterMerge += flattened.children.length;
    return flattened;
  }

  private normalizedModel(source: THREE.Object3D, definition: CreatureAssetDefinition): THREE.Group {
    source.rotation.x = definition.rotateX ?? 0;
    source.rotation.y = definition.rotateY;
    source.rotation.z = definition.rotateZ ?? 0;
    source.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(source);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z, 0.0001);
    const scale = definition.targetLength / longest;
    source.scale.setScalar(scale);
    source.position.set(
      -center.x * scale,
      definition.groundClearance === undefined
        ? -center.y * scale
        : -bounds.min.y * scale - definition.groundClearance,
      -center.z * scale,
    );

    const stage = new THREE.Group();
    stage.add(source);
    return stage;
  }

  private pickAnimation(clips: THREE.AnimationClip[], preferred: string[] | undefined): THREE.AnimationClip | undefined {
    if (!clips.length) return undefined;
    if (!preferred?.length) return clips[0];
    for (const name of preferred) {
      const exact = clips.find((clip) => clip.name.toLowerCase() === name.toLowerCase());
      if (exact) return exact;
      const partial = clips.find((clip) => clip.name.toLowerCase().includes(name.toLowerCase()));
      if (partial) return partial;
    }
    return clips[0];
  }
}

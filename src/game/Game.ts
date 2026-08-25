import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { MatterWorld } from './MatterWorld';
import { MarineLifeSystem } from './MarineLifeSystem';
import { DeepSeaLifeSystem } from './DeepSeaLifeSystem';
import { DeepSeaShoalSystem } from './DeepSeaShoalSystem';
import { DeepAssetFaunaSystem } from './DeepAssetFaunaSystem';
import { DenNetworkSystem, DenSite } from './DenNetworkSystem';
import { MINERAL_DEFINITIONS, MineralResourceSystem } from './MineralResourceSystem';
import { OccludedLightState, OccludedLightSystem } from './OccludedLightSystem';
import { InputState, Octopus } from './Octopus';
import { DepthAccessSystem, DepthRouteState } from './DepthAccessSystem';
import { DepthPerformanceSystem } from './DepthPerformanceSystem';
import { PLANET_DEPTH_BANDS, PlanetScaleSystem } from './PlanetScale';
import { PlanetBeltTraversalSystem } from './PlanetBeltTraversalSystem';
import { TOOL_DEFINITIONS, ToolbeltSystem, type ToolId } from './ToolbeltSystem';
import { TechniqueVFXSystem } from './VFXSystem';
import { CreatureAssetLibrary } from './CreatureAssetLibrary';
import { BiologicalSex, CreatureLifecycleSystem, LifeHistory } from './CreatureLifecycleSystem';
import { CreatureCollisionBody, CreatureCollisionSystem } from './CreatureCollisionSystem';
import { PointerAimSystem } from './PointerAimSystem';
import { JetBlastSystem } from './JetBlastSystem';
import { ProceduralLandmassSystem } from './ProceduralLandmassSystem';
import { ProceduralTreeSystem } from './ProceduralTreeSystem';
import { TreeInteractionSystem } from './TreeInteractionSystem';
import { SurvivorOctopusSystem } from './SurvivorOctopusSystem';
import { BioluminescenceSystem } from './BioluminescenceSystem';
import { RareRelicSystem, type RelicDefinition } from './RareRelicSystem';
import { ProceduralClamSystem } from './ProceduralClamSystem';
import { DeepTubeWormSystem, type TubeWormSprayEvent } from './DeepTubeWormSystem';
import { AmphibiousCrabSystem, type CrabPreyField } from './AmphibiousCrabSystem';
import { SeasonSystem } from './SeasonSystem';
import { SeasonalCryosphereSystem } from './SeasonalCryosphereSystem';
import { SeasonalMoistureState, SeasonalMoistureSystem } from './SeasonalMoistureSystem';
import { ContestResult, ContestSessionInput, ContestSessionSystem } from './ContestSessionSystem';
import { OCTIPOINT_BRANCHES, OCTIPOINT_NODES, OctipointActivity, OctipointSystem } from './OctipointSystem';
import { SupplyCollectibleSystem } from './SupplyCollectibleSystem';
import { BubbleShaderSystem } from './BubbleShaderSystem';
import { OceanSurfaceSystem } from './OceanSurfaceSystem';
import { ToolUseVisualSystem, type ToolUseAction } from './ToolUseVisualSystem';
import { DenDecorationSystem, type DenDecorationKind } from './DenDecorationSystem';
import { ThunderstormVFXSystem } from './ThunderstormVFXSystem';
import { WorldMapSystem } from './WorldMapSystem';
import { GameAudioSystem } from './GameAudioSystem';
import { SaveLoadSystem, AUTOSAVE_SLOT } from './SaveLoadSystem';
import { DenBuilderSystem } from './DenBuilderSystem';
import { EcologyJournal } from './EcologyJournal';
import { VibrationSenseSystem } from './VibrationSenseSystem';
import { HuntingFeedbackSystem } from './HuntingFeedbackSystem';
import { SurvivorRelationsSystem } from './SurvivorRelationsSystem';
import { SeasonalWorldEffectsSystem } from './SeasonalWorldEffectsSystem';
import { DiscoveryLoreSystem } from './DiscoveryLoreSystem';
import { OnboardingTutorialSystem } from './OnboardingTutorialSystem';
import { AccessibilitySettingsSystem } from './AccessibilitySettingsSystem';
import { setPredatorAlertIntensity } from './PredatorAlertVisual';
import {
  BASE_SEA_LEVEL,
  CreatureState,
  SurfaceCreatureKind,
  EMPTY_INVENTORY,
  Inventory,
  MATERIAL_NAMES,
  MaterialId,
  HADAL_VENT_X,
  HADAL_VENT_Y,
  PLANET_SEED,
  RECIPES,
  Recipe,
  ResourceKey,
  WorldEntity,
  WORLD_HEIGHT,
  WORLD_MAX_X,
  WORLD_MAX_Y,
  WORLD_MIN_X,
  WORLD_MIN_Y,
  WORLD_WIDTH,
  clamp,
  mulberry32,
} from './data';

type GameMode = 'menu' | 'playing' | 'paused' | 'won' | 'lost';

function buttonStyle(disabled: boolean): Partial<CSSStyleDeclaration> {
  return {
    background: disabled ? 'rgba(30,44,48,.6)' : 'rgba(15,64,58,.9)',
    border: '1px solid rgba(125,238,216,.4)',
    borderRadius: '7px',
    color: disabled ? '#5d7570' : '#dff5ec',
    font: 'inherit',
    fontSize: '10px',
    padding: '4px 8px',
    cursor: disabled ? 'default' : 'pointer',
  };
}

interface SurvivalState {
  health: number;
  hunger: number;
  moisture: number;
  temperature: number;
  pressure: number;
}

interface EcosystemState {
  kelpCover: number;
  shellfish: number;
  smallFish: number;
  birds: number;
  snakes: number;
  sedimentStability: number;
}

const DAY_LENGTH = 90;
const STORM_WARNING = DAY_LENGTH * 2.4;
const STORM_START = DAY_LENGTH * 2.7;
const STORM_PEAK = DAY_LENGTH * 3.075;
const STORM_END = DAY_LENGTH * 3.425;
const FIXED_DT = 1 / 60;
const MAX_RENDER_PIXELS = 2560 * 1440;
const NORMAL_DIG_POWER_MULTIPLIER = 2.2;
const DIG_RADIUS_MULTIPLIER = 1.3;
const KELP_REGROWTH_DAYS = 2.5;

const SUPPLY_HUD_ITEMS: Array<{ key: ResourceKey; label: string; icon: string }> = [
  { key: 'food', label: 'Fresh food', icon: './assets/resources/food.png' },
  { key: 'seasonedFood', label: 'Salt-cured food', icon: './assets/resources/seasoned-food.png' },
  { key: 'tubeWormMeat', label: 'Tube-worm meat', icon: './assets/resources/tube-worm-meat.png' },
  { key: 'ventTonic', label: 'Restorative vent tonic', icon: './assets/resources/vent-tonic.png' },
  { key: 'glowKelp', label: 'Bioluminescent seaweed', icon: './assets/tool-icons/glow-kelp.png' },
  { key: 'kelp', label: 'Edible kelp', icon: './assets/resources/kelp.png' },
  { key: 'fibers', label: 'Plant fibers', icon: './assets/resources/fibers.png' },
  { key: 'cord', label: 'Fiber cord', icon: './assets/resources/cord.png' },
  { key: 'rope', label: 'Braided rope', icon: './assets/resources/rope.png' },
  { key: 'largeShell', label: 'Intact shell', icon: './assets/resources/large-shell.png' },
  { key: 'wood', label: 'Driftwood', icon: './assets/resources/wood.png' },
  { key: 'bone', label: 'Bone', icon: './assets/resources/bone.png' },
  { key: 'stone', label: 'Shaped stone', icon: './assets/resources/stone.png' },
  { key: 'shellFragments', label: 'Carapace and shell fragments', icon: './assets/resources/crab-carapace.png' },
  { key: 'sponge', label: 'Filter sponge', icon: './assets/resources/sponge.png' },
  { key: 'adhesive', label: 'Mussel bio-adhesive', icon: './assets/resources/adhesive.png' },
  { key: 'pumice', label: 'Vent pumice', icon: './assets/resources/pumice.png' },
];

const CRAFT_RESOURCE_FALLBACK_ICONS: Partial<Record<ResourceKey, string>> = {
  sharpShell: './assets/resources/large-shell.png',
  shellFragments: './assets/resources/crab-carapace.png',
  storageSling: './assets/resources/rope.png',
  kelpCurtain: './assets/resources/kelp.png',
  tunnelBrace: './assets/resources/wood.png',
  shellBowl: './assets/resources/large-shell.png',
};

const SURFACE_LIFE_HISTORIES: Record<SurfaceCreatureKind, LifeHistory> = {
  bird: { lifespanYears: [8, 18], maturityYears: [1, 2], adultScale: [0.72, 1.34], breedingIntervalYears: [0.8, 1.5], broodSize: [1, 2], maxPopulation: 9 },
  caterpillar: { lifespanYears: [3, 6], maturityYears: [0.08, 0.18], adultScale: [0.65, 1.4], breedingIntervalYears: [0.18, 0.35], broodSize: [1, 3], maxPopulation: 12 },
  snake: { lifespanYears: [12, 25], maturityYears: [2, 4], adultScale: [0.72, 1.4], breedingIntervalYears: [1.5, 3], broodSize: [1, 2], maxPopulation: 6 },
  jelly: { lifespanYears: [1, 4], maturityYears: [0.2, 0.6], adultScale: [0.64, 1.42], breedingIntervalYears: [0.4, 0.9], broodSize: [1, 2], maxPopulation: 5, asexual: true },
};

const darknessVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const darknessFragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uDarkness;
  uniform float uCaveDarkness;
  uniform float uBiolight;
  uniform float uLightRadius;
  uniform float uHaloRadius;
  uniform float uLightStrength;
  uniform float uStableBiolight;
  uniform float uOcclusionTexel;
  uniform vec2 uLightCenter;
  uniform vec2 uWorldSize;
  uniform sampler2D uOcclusion;
  varying vec2 vUv;
  void main() {
    vec2 worldDelta = (vUv - uLightCenter) * uWorldSize;
    float distanceToLight = length(worldDelta);
    float angle = atan(worldDelta.y, worldDelta.x);
    float rayUv = fract(angle / 6.28318530718 + 0.5);
    float reachA = texture2D(uOcclusion, vec2(rayUv, 0.5)).r;
    float reachB = texture2D(uOcclusion, vec2(rayUv + uOcclusionTexel, 0.5)).r;
    float reachC = texture2D(uOcclusion, vec2(rayUv - uOcclusionTexel, 0.5)).r;
    float rayReach = (reachA * 0.58 + reachB * 0.21 + reachC * 0.21) * uLightRadius;
    float lineOfSight = 1.0 - smoothstep(rayReach - 0.24, rayReach + 0.11, distanceToLight);
    float halo = 1.0 - smoothstep(0.18, uHaloRadius, distanceToLight);
    float rayGrain = 0.91 + 0.09 * sin(angle * 41.0 + sin(angle * 7.0 - uTime * 0.42) * 2.4);
    float pulse = mix(0.94 + sin(uTime * 2.1) * 0.035, 1.0, uStableBiolight);
    rayGrain = mix(rayGrain, 0.975, uStableBiolight);
    float relief = halo * lineOfSight * rayGrain * pulse * uBiolight * uLightStrength;
    float livingEdge = exp(-abs(distanceToLight - min(rayReach, uHaloRadius * 0.9)) * 3.2) * lineOfSight;
    float darkness = max(uDarkness, uCaveDarkness);
    float alpha = darkness * (0.9985 - relief);
    vec3 tint = vec3(0.0);
    tint += vec3(0.004, 0.072, 0.055) * livingEdge * uBiolight * darkness * uLightStrength;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(tint, clamp(alpha, 0.0, 0.999));
  }
`;

const skyVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = /* glsl */ `
  precision highp float;
  uniform float uNight;
  uniform float uStorm;
  varying vec2 vUv;
  void main() {
    vec3 dayTop = vec3(0.25, 0.62, 0.65);
    vec3 dayBottom = vec3(0.76, 0.82, 0.65);
    vec3 nightTop = vec3(0.018, 0.045, 0.085);
    vec3 nightBottom = vec3(0.065, 0.12, 0.16);
    vec3 day = mix(dayBottom, dayTop, smoothstep(0.05, 1.0, vUv.y));
    vec3 night = mix(nightBottom, nightTop, vUv.y);
    vec3 color = mix(day, night, uNight);
    vec3 storm = mix(vec3(0.15,0.22,0.23), vec3(0.035,0.07,0.09), vUv.y);
    color = mix(color, storm, uStorm * 0.82);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const vegetationVertex = /* glsl */ `
  uniform float uTime;
  uniform float uStorm;
  uniform float uPhase;
  varying vec2 vUv;
  varying float vBend;
  void main() {
    vUv = uv;
    vec3 pos = position;
    float current = sin(uTime * (1.35 + uStorm * 2.4) + uPhase + uv.y * 4.8);
    float flutter = sin(uTime * 3.1 + uPhase * 1.7 + uv.y * 11.0) * 0.22;
    pos.x += (current + flutter) * uv.y * uv.y * (0.07 + uStorm * 0.16);
    pos.z += sin(uTime * 1.1 + uPhase + uv.y * 3.0) * uv.y * 0.025;
    vBend = current;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const vegetationFragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uRootColor;
  uniform vec3 uTipColor;
  varying vec2 vUv;
  varying float vBend;
  void main() {
    float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(0.0, 0.18, 1.0 - vUv.x);
    float vein = pow(max(0.0, sin(vUv.y * 45.0 + vUv.x * 7.0)), 12.0);
    float caustic = pow(max(0.0, sin(vUv.y * 31.0 - uTime * 2.0 + vBend)), 10.0);
    vec3 color = mix(uRootColor, uTipColor, smoothstep(0.0, 1.0, vUv.y));
    color *= 0.78 + edge * 0.28;
    color += vein * vec3(0.025, 0.12, 0.06) + caustic * vec3(0.07, 0.22, 0.15);
    gl_FragColor = vec4(color, 0.88 + edge * 0.12);
  }
`;

export class TidebornGame {
  private root: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private sunLight!: THREE.DirectionalLight;
  private renderPixelRatio = 1;
  private world = new MatterWorld();
  private landmasses = new ProceduralLandmassSystem(PLANET_SEED + 507);
  private planetScale = new PlanetScaleSystem();
  private beltTraversal = new PlanetBeltTraversalSystem();
  private depthAccess = new DepthAccessSystem(this.planetScale);
  private depthPerformance = new DepthPerformanceSystem();
  private depthState: DepthRouteState = this.depthAccess.sample(-8.35, 2.95, BASE_SEA_LEVEL, false);
  private occludedLight = new OccludedLightSystem();
  private lightOcclusionState: OccludedLightState = {
    skyVisibility: 1,
    averageReachM: 7.25,
    minimumReachM: 7.25,
    blockedRayPercent: 0,
  };
  private player = new Octopus();
  private pointerAim!: PointerAimSystem;
  private jetBlast = new JetBlastSystem();
  private trees!: ProceduralTreeSystem;
  private treeInteraction = new TreeInteractionSystem();
  private survivorOctopi!: SurvivorOctopusSystem;
  private bioluminescence = new BioluminescenceSystem(DAY_LENGTH * 0.72);
  private relics!: RareRelicSystem;
  private proceduralClams!: ProceduralClamSystem;
  private deepTubeWorms!: DeepTubeWormSystem;
  private amphibiousCrabs!: AmphibiousCrabSystem;
  private vfx!: TechniqueVFXSystem;
  private toolUseVisuals!: ToolUseVisualSystem;
  private denDecorations!: DenDecorationSystem;
  private denBuilder!: DenBuilderSystem;
  private saveLoad!: SaveLoadSystem;
  private ecologyJournal = new EcologyJournal();
  private vibrationSense!: VibrationSenseSystem;
  private vibrationSpeedFactor = 1;
  private lastFrameDt = 1 / 60;
  private huntingFeedback!: HuntingFeedbackSystem;
  private survivorRelations!: SurvivorRelationsSystem;
  private seasonalWorld!: SeasonalWorldEffectsSystem;
  private discoveries!: DiscoveryLoreSystem;
  private tutorial = new OnboardingTutorialSystem();
  private accessibility!: AccessibilitySettingsSystem;
  private lastJetPulseElapsed = -99;
  private lastBirdPhase: 'present' | 'leaving' | 'gone' | 'returning' = 'present';
  private ecoSampleAccumulator = 0;
  private lastBiteWindow: { id: string; px: number; py: number; t: number } | null = null;
  private cameraShakePhase = 0;
  private regrowthQueue: Array<{ id: string; dueAt: number }> = [];
  private denMarkerGroups = new Map<string, THREE.Group>();
  private beginPendingFromMenu = false;

  private hasAutosave(): boolean {
    try {
      const raw = localStorage.getItem(AUTOSAVE_SLOT);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { sections?: { core?: unknown } };
      return Boolean(parsed?.sections?.core);
    } catch {
      return false;
    }
  }
  private ecoBaseline: EcosystemState = { kelpCover: 100, shellfish: 320, smallFish: 740, birds: 22, snakes: 5, sedimentStability: 100 };
  private thunderstorm!: ThunderstormVFXSystem;
  private creatureAssets = new CreatureAssetLibrary();
  private marineLife!: MarineLifeSystem;
  private deepSeaLife!: DeepSeaLifeSystem;
  private deepSeaShoals!: DeepSeaShoalSystem;
  private importedDeepFauna!: DeepAssetFaunaSystem;
  private minerals!: MineralResourceSystem;
  private supplies!: SupplyCollectibleSystem;
  private mode: GameMode = 'menu';
  private keys: InputState = { held: new Set(), pressed: new Set() };
  private elapsed = 0;
  private realLast = performance.now();
  private matterAccumulator = 0;
  private inventory: Inventory = { ...EMPTY_INVENTORY };
  private toolbelt = new ToolbeltSystem();
  private denNetwork = new DenNetworkSystem();
  private worldMap = new WorldMapSystem();
  private seasonSystem = new SeasonSystem(DAY_LENGTH, STORM_END);
  private seasonalMoisture = new SeasonalMoistureSystem();
  private moistureEnvironment: SeasonalMoistureState = this.seasonalMoisture.sample({
    season: this.seasonSystem.sample(0), underwater: true, exposedToAir: false,
    sheltered: false, stormStrength: 0, snowfallIntensity: 0,
    touchingSnow: false, touchingIce: false,
  });
  private cryosphere!: SeasonalCryosphereSystem;
  private contestSession = new ContestSessionSystem();
  private octipoints = new OctipointSystem();
  private survival: SurvivalState = { health: 100, hunger: 86, moisture: 93, temperature: 18, pressure: 1 };
  private ecosystem: EcosystemState = { kelpCover: 100, shellfish: 320, smallFish: 740, birds: 22, snakes: 5, sedimentStability: 100 };
  private entities: WorldEntity[] = [];
  private entityVisuals = new Map<string, THREE.Object3D>();
  private creatures: CreatureState[] = [];
  private creatureVisuals = new Map<string, THREE.Object3D>();
  private surfaceJetImpulses = new Map<string, THREE.Vector2>();
  private surfaceLifecycle!: CreatureLifecycleSystem<SurfaceCreatureKind>;
  private surfaceCollision = new CreatureCollisionSystem();
  private nextSurfaceBreedingCheck = 0;
  private surfaceBirthSequence = 0;
  private heldEntity: string | null = null;
  private craftOpen = false;
  private atlasOpen = false;
  private settingsOpen = false;
  private resumeAfterSettings = false;
  private denDiscovered = false;
  private ventDiscovered = false;
  private firstStormPulse = false;
  private endingShown = false;
  private firstWinterPassed = false;
  private lastSeasonBannerId: string | null = null;
  private message = '';
  private messageUntil = 0;
  private bannerUntil = 0;
  private nextAutosave = 10;
  private nextVentPulse = 0;
  private nextBiolightPulse = 0;
  private nextDepthWarning = 0;
  private nextSurvivalExperience = 30;
  private excavatedCellsForExperience = 0;
  private abyssEntered = false;
  private rng = mulberry32(PLANET_SEED + 99);
  private sound = new GameAudioSystem();
  private ui!: HTMLElement;
  private menu!: HTMLElement;
  private craftPanel!: HTMLElement;
  private atlasPanel!: HTMLElement;
  private settingsPanel!: HTMLElement;
  private hotbar!: HTMLElement;
  private hotbarSignature = '';
  private rain!: THREE.Points;
  private bubbles!: BubbleShaderSystem;
  private skyShader!: THREE.ShaderMaterial;
  private oceanSurface!: OceanSurfaceSystem;
  private darknessMaterial!: THREE.ShaderMaterial;
  private darknessMesh!: THREE.Mesh;
  private carriedBiolight!: THREE.Group;
  private carriedBiolightLamp!: THREE.PointLight;
  private denBiolightVisuals = new Map<string, THREE.Group[]>();
  private sun!: THREE.Mesh;
  private moon!: THREE.Mesh;
  private cameraTarget = new THREE.Vector2(-8, 2.8);
  private viewHeight = 18;
  private mobileCamera = {
    active: false,
    viewHeightM: 18,
    focusBiasY: 0,
    controlOcclusion: 0,
  };
  private debugFastTime = false;
  private bloomPass!: UnrealBloomPass;
  private renderWidth = 0;
  private renderHeight = 0;
  private reducedBloom = false;
  private uiAccumulator = 0;
  private readonly shallowFogColor = new THREE.Color('#08252c');
  private readonly abyssFogColor = new THREE.Color('#000000');
  private readonly burstGeometry = new THREE.CircleGeometry(0.05, 6);
  private readonly burstMaterials = new Map<string, THREE.MeshBasicMaterial>();

  constructor(root: HTMLElement) {
    this.root = root;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    // The final ratio is selected in resize() from a fixed drawing-buffer budget.
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    root.appendChild(this.renderer.domElement);

    this.camera = new THREE.OrthographicCamera(-10, 10, 9, -9, 0.1, 100);
    this.camera.position.set(-8, 2.8, 24);
    this.camera.lookAt(-8, 2.8, 0);
    this.scene.fog = new THREE.FogExp2('#08252c', 0.008);
    this.buildScene();
    this.thunderstorm = new ThunderstormVFXSystem(this.scene, this.rng);
    this.pointerAim = new PointerAimSystem(this.scene);
    this.trees = new ProceduralTreeSystem(this.scene, this.world, PLANET_SEED + 911);
    this.treeInteraction.setBodies(this.trees.interactionBodies());
    this.survivorOctopi = new SurvivorOctopusSystem(this.scene, this.world, this.creatureAssets);
    this.survivorRelations = new SurvivorRelationsSystem();
    this.cryosphere = new SeasonalCryosphereSystem(this.scene, this.world, PLANET_SEED + 5081);
    this.seasonalWorld = new SeasonalWorldEffectsSystem(this.scene);
    this.vfx = new TechniqueVFXSystem(this.scene, PLANET_SEED + 418);
    this.toolUseVisuals = new ToolUseVisualSystem(this.scene);
    this.denDecorations = new DenDecorationSystem(this.scene);
    this.minerals = new MineralResourceSystem(this.scene, this.rng);
    this.supplies = new SupplyCollectibleSystem(this.scene);
    this.relics = new RareRelicSystem(this.scene, this.rng);
    this.discoveries = new DiscoveryLoreSystem(this.scene, (x: number, y: number) => this.world.getMaterial(x, y));
    this.huntingFeedback = new HuntingFeedbackSystem(this.scene);
    this.proceduralClams = new ProceduralClamSystem(this.scene, this.world, PLANET_SEED + 6329);
    this.deepTubeWorms = new DeepTubeWormSystem(this.scene, PLANET_SEED + 7733);
    this.amphibiousCrabs = new AmphibiousCrabSystem(
      this.scene,
      mulberry32(PLANET_SEED + 9017),
      this.creatureAssets,
      this.world,
    );
    this.buildWorldEntities();
    this.marineLife = new MarineLifeSystem(this.scene, this.rng, this.creatureAssets, this.world);
    this.deepSeaLife = new DeepSeaLifeSystem(this.scene, this.rng, this.creatureAssets);
    this.deepSeaShoals = new DeepSeaShoalSystem(this.scene, mulberry32(PLANET_SEED + 2407), this.world);
    this.importedDeepFauna = new DeepAssetFaunaSystem(this.scene, mulberry32(PLANET_SEED + 3181), this.creatureAssets, this.world);
    this.surfaceLifecycle = new CreatureLifecycleSystem(this.rng, SURFACE_LIFE_HISTORIES);
    this.buildCreatures();
    this.setupPostProcessing();
    this.buildUI();
    this.vibrationSense = new VibrationSenseSystem(this.scene, (x: number, y: number) => this.world.getMaterial(x, y));
    this.denBuilder = new DenBuilderSystem(this.scene, (x: number, y: number) => this.world.getMaterial(x, y), this.ui);
    this.accessibility = new AccessibilitySettingsSystem(this.root);
    this.accessibility.apply();
    this.accessibility.subscribe((settings) => setPredatorAlertIntensity(settings.predatorAlertIntensity));
    setPredatorAlertIntensity(this.accessibility.get('predatorAlertIntensity'));
    this.huntingFeedback.attachUiRoot(this.ui);
    this.survivorRelations.attachUiRoot(this.ui);
    this.survivorRelations.setActionHandlers({
      trade: (id) => {
        const result = this.survivorRelations.acceptTrade(id, 'food');
        if (!result.accepted || !result.gainedItem) {
          this.setMessage(result.detail);
          return;
        }
        if (this.inventory.food < 1) {
          this.setMessage('You have no fresh food to seal the trade.');
          return;
        }
        this.inventory.food -= 1;
        this.inventory[result.gainedItem] += result.gainedQty ?? 1;
        this.recordOctoExperience('foraging', 12, 'Traded food with a neighboring octopus');
        this.setMessage(`${result.detail} [E] nearby to gather more.`);
      },
      gift: (id) => {
        if (this.inventory.food < 1) {
          this.setMessage('You have no fresh food to give.');
          return;
        }
        this.inventory.food -= 1;
        const result = this.survivorRelations.offerFoodGift(id);
        this.setMessage(result.detail);
      },
      mate: (id) => {
        const result = this.survivorRelations.tryMate(id);
        if (result.accepted) this.recordOctoExperience('survival', 40, 'Bonded with a survivor octopus');
        this.setMessage(result.detail);
      },
    });
    this.tutorial.attachUiRoot(this.ui);
    this.tutorial.setSeaLevel(BASE_SEA_LEVEL);
    this.setupSaveLoad();
    this.load();
    this.worldMap.visit(this.player.x, this.player.y);
    this.refreshWorldMap();
    this.bindInput();
    this.resize();
    this.updateUI();
    this.render();
    this.warmupRenderTiers();

    // Decode large deep-fauna assets sequentially while the player is still
    // at the title/coast, rather than hitching on each depth-band crossing.
    // Full local desktop builds trade spare memory for a hitch-free descent,
    // so every deep model is queued here. Coarse-pointer/mobile and
    // contest-safe sessions keep models lazy so the title screen does not
    // decode every specimen into a constrained budget.
    if (!window.matchMedia('(pointer: coarse)').matches) {
      this.creatureAssets.preloadStaggered([
        'twilight-emperor', 'midnight-angler', 'abyss-spinefish', 'hadal-stalker',
        'cyan-abyss-hunter', 'abyss-manta', 'bloodfin-leviathan',
      ]);
    }

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('fullscreenchange', () => this.resize());

    (window as unknown as { render_game_to_text: () => string }).render_game_to_text = () => this.renderGameToText();
    (window as unknown as { advanceTime: (ms: number) => void }).advanceTime = (ms: number) => this.advanceTime(ms);
    (window as unknown as { tidebornSave: SaveLoadSystem }).tidebornSave = this.saveLoad;
    (window as unknown as { tidebornDev: unknown }).tidebornDev = {
      teleport: (x: number, y: number) => {
        this.player.x = x;
        this.player.y = y;
        this.player.vx = 0;
        this.player.vy = 0;
        this.cameraTarget.set(x, y);
        this.worldMap.visit(x, y);
      },
      grant: (resource: ResourceKey, count: number) => {
        this.inventory[resource] += count;
      },
      jumpToSecondSpring: () => {
        this.elapsed = Math.max(this.elapsed, this.seasonSystem.secondSpringAtSeconds - 1.5);
      },
    };
  }

  private warmupRenderTiers(): void {
    const width = Math.max(8, this.root.clientWidth || 8);
    const height = Math.max(8, this.root.clientHeight || 8);
    const originalRatio = this.renderer.getPixelRatio();
    for (const ratio of [Math.min(window.devicePixelRatio, 1.5), 1.25, 1]) {
      if (Math.abs(ratio - originalRatio) < 0.01) continue;
      this.renderer.setPixelRatio(ratio);
      this.composer.setPixelRatio(ratio);
      this.composer.setSize(width, height);
      this.composer.render();
    }
    this.resize();
  }

  private setupSaveLoad(): void {
    this.saveLoad = new SaveLoadSystem({
      getElapsedSeconds: () => this.elapsed,
      getDayNumber: () => Math.floor(Math.max(0, this.elapsed) / DAY_LENGTH),
      getPlaytimeSeconds: () => this.elapsed,
    });
    this.saveLoad.register('core', {
      save: () => ({
        elapsed: this.elapsed,
        player: { x: this.player.x, y: this.player.y },
        inventory: { ...this.inventory },
        gathered: this.entities.filter((entity) => entity.gathered).map((entity) => entity.id),
        survival: { ...this.survival },
      }),
      load: (data) => {
        const section = data as {
          elapsed?: unknown; player?: { x?: unknown; y?: unknown }; inventory?: unknown;
          gathered?: unknown; survival?: Partial<SurvivalState>;
        };
        if (typeof section.elapsed === 'number' && Number.isFinite(section.elapsed)) {
          this.elapsed = section.elapsed;
          this.nextAutosave = this.elapsed + 10;
        }
        if (typeof section.player?.x === 'number' && typeof section.player?.y === 'number') {
          this.player.x = section.player.x;
          this.player.y = section.player.y;
          this.cameraTarget.set(this.player.x, this.player.y);
        }
        if (section.inventory && typeof section.inventory === 'object') {
          const saved = Object.fromEntries(
            Object.entries(section.inventory as Record<string, unknown>).filter(([, value]) => typeof value === 'number'),
          ) as Partial<Inventory>;
          this.inventory = { ...EMPTY_INVENTORY, ...saved };
        }
        if (Array.isArray(section.gathered)) {
          const ids = new Set(section.gathered.filter((id): id is string => typeof id === 'string'));
          for (const entity of this.entities) if (ids.has(entity.id)) entity.gathered = true;
        }
        if (section.survival && typeof section.survival === 'object') {
          for (const [key, value] of Object.entries(section.survival)) {
            if (typeof value === 'number') this.survival[key as keyof SurvivalState] = clamp(value, 0, key === 'pressure' ? 400 : 100);
          }
        }
      },
    });
    this.saveLoad.register('ecosystem', {
      save: () => ({ ...this.ecosystem }),
      load: (data) => {
        const section = data as Record<string, unknown>;
        if (typeof section !== 'object' || section === null) return;
        for (const key of Object.keys(this.ecosystem) as Array<keyof EcosystemState>) {
          const value = section[key];
          if (typeof value === 'number' && Number.isFinite(value)) this.ecosystem[key] = clamp(value, 0, key === 'smallFish' || key === 'shellfish' ? 2000 : 100);
        }
      },
    });
    this.saveLoad.register('progression', {
      save: () => ({
        jetBlastMastery: this.jetBlast.mastery,
        equippedTool: this.toolbelt.snapshot(this.inventory).selected,
      }),
      load: (data) => {
        const section = data as { jetBlastMastery?: unknown; equippedTool?: unknown };
        if (typeof section.jetBlastMastery === 'number') {
          this.jetBlast.mastery = clamp(section.jetBlastMastery, 0, this.jetBlast.masteryRequired);
        }
        if (typeof section.equippedTool === 'string' && TOOL_DEFINITIONS.some((definition) => definition.id === section.equippedTool)) {
          this.toolbelt.select(section.equippedTool as ToolId, this.inventory);
        }
      },
    });
    this.saveLoad.register('octipoints', {
      save: () => this.octipoints.serialize(),
      load: (data) => this.octipoints.deserialize(data),
    });
    this.saveLoad.register('map', {
      save: () => this.worldMap.serialize(),
      load: (data) => this.worldMap.deserialize(data),
    });
    this.saveLoad.register('dens', {
      save: () => this.denNetwork.serializeState(),
      load: (data) => this.denNetwork.deserializeState(data),
    });
    this.saveLoad.register('excavation', {
      save: () => this.world.serializeModifiedCells(),
      load: (data) => this.world.importModifiedCells(data),
    });
    this.saveLoad.register('regrowth', {
      save: () => ({ queue: this.regrowthQueue }),
      load: (data) => {
        const section = data as { queue?: unknown };
        if (!Array.isArray(section.queue)) return;
        this.regrowthQueue = section.queue
          .filter((entry): entry is { id: string; dueAt: number } => {
            const candidate = entry as { id?: unknown; dueAt?: unknown };
            return typeof candidate.id === 'string' && typeof candidate.dueAt === 'number';
          });
      },
    });
    this.saveLoad.register('groundDrops', {
      save: () => ({
        minerals: this.minerals.serializeDrops(),
        relics: this.relics.serializeDrops(),
        collectedSupplies: this.supplies.serializeCollected(),
      }),
      load: (data) => {
        const section = data as { minerals?: unknown; relics?: unknown; collectedSupplies?: unknown };
        if (Array.isArray(section.minerals)) this.minerals.deserializeDrops(section.minerals);
        if (section.relics) this.relics.deserializeDrops(section.relics);
        if (Array.isArray(section.collectedSupplies)) this.supplies.deserializeCollected(section.collectedSupplies);
      },
    });
    this.saveLoad.register('denBuilder', {
      save: () => this.denBuilder.serialize(),
      load: (data) => this.denBuilder.deserialize(typeof data === 'string' ? data : null),
    });
    this.saveLoad.register('ecologyJournal', {
      save: () => this.ecologyJournal.serialize(),
      load: (data) => this.ecologyJournal.deserialize(data),
    });
    this.saveLoad.register('huntingFeedback', {
      save: () => this.huntingFeedback.serialize(),
      load: (data) => this.huntingFeedback.deserialize(data),
    });
    this.saveLoad.register('survivorRelations', {
      save: () => this.survivorRelations.serialize(),
      load: (data) => this.survivorRelations.deserialize(data),
    });
    this.saveLoad.register('vibrationSense', {
      save: () => this.vibrationSense.serialize(),
      load: (data) => this.vibrationSense.deserialize(data),
    });
    this.saveLoad.register('seasonalWorld', {
      save: () => this.seasonalWorld.serialize(),
      load: (data) => this.seasonalWorld.deserialize(data),
    });
    this.saveLoad.register('discoveries', {
      save: () => this.discoveries.serialize(),
      load: (data) => this.discoveries.deserialize(data),
    });
    this.saveLoad.register('tutorial', {
      save: () => this.tutorial.serialize(),
      load: (data) => this.tutorial.deserialize(data),
    });
  }

  private load(): void {
    const result = this.saveLoad.restore(AUTOSAVE_SLOT);
    if (!result.ok) return;
    this.tutorial.setSeaLevel(BASE_SEA_LEVEL);
    this.worldMap.visit(this.player.x, this.player.y);
    this.refreshWorldMap();
  }

  startLoop(): void {
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.realLast) / 1000);
      this.realLast = now;
      if (this.mode === 'playing') {
        this.update(dt);
      } else {
        this.animateAmbient(dt);
      }
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  applyMobileCameraLayout(layout: {
    active: boolean;
    camera: { viewHeightM: number; focusBiasY: number; controlOcclusion: number };
  }): void {
    this.mobileCamera = {
      active: layout.active,
      viewHeightM: layout.camera.viewHeightM,
      focusBiasY: layout.camera.focusBiasY,
      controlOcclusion: layout.camera.controlOcclusion,
    };
    this.viewHeight = layout.active ? layout.camera.viewHeightM : 18;
    this.resize();
    this.syncMobileControlsVisibility();
  }

  private buildScene(): void {
    const ambient = new THREE.HemisphereLight('#d7f5dd', '#0b2930', 1.35);
    this.scene.add(ambient);
    this.sunLight = new THREE.DirectionalLight('#fff1cd', 2.3);
    this.sunLight.position.set(-8, 15, 12);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.left = -18;
    this.sunLight.shadow.camera.right = 18;
    this.sunLight.shadow.camera.top = 18;
    this.sunLight.shadow.camera.bottom = -18;
    this.scene.add(this.sunLight);

    this.skyShader = new THREE.ShaderMaterial({
      uniforms: { uNight: { value: 0 }, uStorm: { value: 0 } },
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_WIDTH * 3, 46), this.skyShader);
    sky.position.set(0, 6, -28);
    sky.renderOrder = -20;
    this.scene.add(sky);

    this.sun = new THREE.Mesh(new THREE.CircleGeometry(1.65, 48), new THREE.MeshBasicMaterial({ color: '#f9dda1', transparent: true, opacity: 0.9 }));
    this.sun.position.set(-14, 12, -25);
    this.scene.add(this.sun);
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(0.82, 40), new THREE.MeshBasicMaterial({ color: '#d7ecdf', transparent: true, opacity: 0 }));
    this.moon.position.set(11, 12.5, -24.8);
    this.scene.add(this.moon);

    this.addParallaxLand();
    this.scene.add(this.world.mesh);
    for (const offset of [-WORLD_WIDTH, WORLD_WIDTH]) {
      const seamTerrain = this.world.mesh.clone();
      seamTerrain.position.x = offset;
      seamTerrain.userData.planetarySeamCopy = true;
      this.scene.add(seamTerrain);
    }

    this.oceanSurface = new OceanSurfaceSystem(this.scene, this.world.texture);

    this.createAtmospherics();
    this.scene.add(this.player.group);
    this.buildDepthLighting();

    const ventLight = new THREE.PointLight('#ff633c', 2.7, 8, 1.6);
    ventLight.position.set(HADAL_VENT_X, HADAL_VENT_Y - 1.8, 4);
    this.scene.add(ventLight);
    const glowLight = new THREE.PointLight('#6bffca', 1.3, 6, 1.7);
    glowLight.position.set(46, -89, 4);
    this.scene.add(glowLight);
  }

  private buildDepthLighting(): void {
    this.darknessMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDarkness: { value: 0 },
        uCaveDarkness: { value: 0 },
        uBiolight: { value: 0 },
        uLightRadius: { value: this.occludedLight.maxRadiusM },
        uHaloRadius: { value: 6.25 },
        uLightStrength: { value: 0.82 },
        uStableBiolight: { value: 0 },
        uOcclusionTexel: { value: 1 / this.occludedLight.rayCount },
        uLightCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uWorldSize: { value: new THREE.Vector2(40, 24) },
        uOcclusion: { value: this.occludedLight.maskTexture },
      },
      vertexShader: darknessVertex,
      fragmentShader: darknessFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });
    this.darknessMesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), this.darknessMaterial);
    this.darknessMesh.position.set(this.camera.position.x, this.camera.position.y, 9);
    this.darknessMesh.renderOrder = 50;
    this.darknessMesh.frustumCulled = false;
    this.scene.add(this.darknessMesh);

    this.carriedBiolight = new THREE.Group();
    for (let i = 0; i < 7; i += 1) {
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.028 + (i % 3) * 0.009, 9, 7),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? '#72ffd2' : '#67bfff',
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      bulb.position.set(-0.3 + i * 0.09, -0.34 + Math.sin(i * 1.7) * 0.06, 0.75);
      bulb.userData.phase = i * 0.83;
      this.carriedBiolight.add(bulb);
    }
    this.carriedBiolightLamp = new THREE.PointLight('#64ffd0', 0, 6.5, 1.5);
    this.carriedBiolightLamp.position.set(0, -0.12, 3.5);
    this.player.group.add(this.carriedBiolight, this.carriedBiolightLamp);
    this.carriedBiolight.visible = false;
  }

  private setupPostProcessing(): void {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.root.clientWidth, this.root.clientHeight), 0.24, 0.32, 0.94);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  private addParallaxLand(): void {
    const mountainMat = new THREE.MeshBasicMaterial({ color: '#244f4b' });
    const distantMat = new THREE.MeshBasicMaterial({ color: '#39706a', transparent: true, opacity: 0.78 });
    const mountainLayer = this.landmasses.createLayer(2.85, 1, 0.6);
    const mountain = this.shapeMesh(mountainLayer.points, mountainMat, -21);
    mountain.position.x = -1.4;
    this.scene.add(mountain);
    const distantLayer = this.landmasses.createLayer(3.05, 0.58, 2.25);
    const distant = this.shapeMesh(distantLayer.points, distantMat, -20);
    distant.position.x = 3.6;
    this.scene.add(distant);

    for (let i = 0; i < 6; i += 1) {
      const cloud = new THREE.Group();
      const cloudMat = new THREE.MeshBasicMaterial({ color: '#dce8d2', transparent: true, opacity: 0.46 });
      for (let p = 0; p < 4; p += 1) {
        const puff = new THREE.Mesh(new THREE.CircleGeometry(0.65 + this.rng() * 0.4, 20), cloudMat);
        puff.position.set(p * 0.62, Math.sin(p) * 0.12, 0);
        puff.scale.y = 0.52;
        cloud.add(puff);
      }
      cloud.position.set(-27 + i * 11, 9 + this.rng() * 4, -18 - i * 0.1);
      cloud.userData.speed = 0.15 + this.rng() * 0.12;
      cloud.name = 'cloud';
      this.scene.add(cloud);
    }
  }

  private shapeMesh(points: number[][], material: THREE.Material, z: number): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    mesh.position.z = z;
    return mesh;
  }

  private createAtmospherics(): void {
    const rainPositions = new Float32Array(420 * 3);
    for (let i = 0; i < 420; i += 1) {
      rainPositions[i * 3] = (this.rng() - 0.5) * 38;
      rainPositions[i * 3 + 1] = (this.rng() - 0.1) * 22;
      rainPositions[i * 3 + 2] = 8 + this.rng() * 4;
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    this.rain = new THREE.Points(rainGeometry, new THREE.PointsMaterial({ color: '#a4e9e7', size: 0.055, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.renderOrder = 20;
    this.scene.add(this.rain);

    this.bubbles = new BubbleShaderSystem(
      this.scene,
      this.rng,
      WORLD_MIN_X,
      WORLD_WIDTH,
      WORLD_MIN_Y,
      BASE_SEA_LEVEL,
    );
  }

  private buildWorldEntities(): void {
    this.entities = [
      { id: 'kelp-a', kind: 'kelp', x: -7.2, y: 2.15, gathered: false, health: 1 },
      { id: 'kelp-b', kind: 'kelp', x: -5.1, y: 1.55, gathered: false, health: 1 },
      { id: 'kelp-c', kind: 'kelp', x: -2.7, y: 0.83, gathered: false, health: 1 },
      { id: 'kelp-d', kind: 'kelp', x: 0.2, y: 0.08, gathered: false, health: 1 },
      { id: 'kelp-e', kind: 'kelp', x: 3.4, y: -0.83, gathered: false, health: 1 },
      { id: 'bush-a', kind: 'bush', x: -9.4, y: 2.88, gathered: false },
      { id: 'scallop-a', kind: 'scallop', x: -6.1, y: 1.94, gathered: false },
      { id: 'scallop-b', kind: 'scallop', x: -3.6, y: 1.22, gathered: false },
      { id: 'scallop-c', kind: 'scallop', x: 1.5, y: -0.12, gathered: false },
      { id: 'scallop-d', kind: 'scallop', x: -10.1, y: 3.24, gathered: false },
      { id: 'stone-a', kind: 'stone', x: -9.2, y: 3.22, gathered: false },
      { id: 'stone-b', kind: 'stone', x: -7.9, y: 2.66, gathered: false },
      { id: 'stone-c', kind: 'stone', x: -4.4, y: 1.72, gathered: false },
      { id: 'wood-a', kind: 'wood', x: -11.2, y: 4.05, gathered: false },
      { id: 'wood-b', kind: 'wood', x: -8.7, y: 3.05, gathered: false },
      { id: 'wood-c', kind: 'wood', x: -5.8, y: 2.13, gathered: false },
      { id: 'bone-a', kind: 'bone', x: 4.7, y: -1.2, gathered: false },
      { id: 'glow-a', kind: 'glow', x: 9.0, y: -2.8, gathered: false },
      { id: 'glow-b', kind: 'glow', x: 31.0, y: -20.4, gathered: false },
      { id: 'glow-c', kind: 'glow', x: 40.0, y: -48.2, gathered: false },
      { id: 'glow-d', kind: 'glow', x: 46.0, y: -89.4, gathered: false },
      { id: 'vent-a', kind: 'vent', x: HADAL_VENT_X, y: HADAL_VENT_Y, gathered: false },
    ];
    for (const entity of this.entities) {
      const visual = this.createEntityVisual(entity);
      visual.position.set(entity.x, entity.y, entity.kind === 'glow' || entity.kind === 'vent' ? 2.2 : 1.75);
      visual.userData.entityId = entity.id;
      this.entityVisuals.set(entity.id, visual);
      this.scene.add(visual);
    }
  }

  private createEntityVisual(entity: WorldEntity): THREE.Object3D {
    const group = new THREE.Group();
    if (entity.kind === 'kelp' || entity.kind === 'bush') {
      const strands = entity.kind === 'kelp' ? 6 : 9;
      for (let i = 0; i < strands; i += 1) {
        const height = entity.kind === 'kelp' ? 1.2 + this.rng() * 1.15 : 0.65 + this.rng() * 0.45;
        const geo = new THREE.PlaneGeometry(0.08 + this.rng() * 0.07, height, 1, 8);
        const mat = new THREE.ShaderMaterial({
          uniforms: {
            uTime: { value: 0 },
            uStorm: { value: 0 },
            uPhase: { value: this.rng() * 9 },
            uRootColor: { value: new THREE.Color(entity.kind === 'kelp' ? '#174f3e' : '#285d43') },
            uTipColor: { value: new THREE.Color(entity.kind === 'kelp' ? (i % 2 ? '#65bd72' : '#3b9362') : '#62a96b') },
          },
          vertexShader: vegetationVertex,
          fragmentShader: vegetationFragment,
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: true,
        });
        const strand = new THREE.Mesh(geo, mat);
        strand.position.set((i - strands / 2) * 0.09, height / 2 - 0.04, i * 0.018);
        strand.rotation.z = (this.rng() - 0.5) * 0.35;
        strand.userData.phase = this.rng() * 10;
        group.add(strand);
      }
      const root = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: '#725234', roughness: 1 }));
      root.scale.y = 0.45;
      group.add(root);
    } else if (entity.kind === 'scallop') {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e9bc88', roughness: 0.64 }));
      shell.rotation.x = Math.PI / 2;
      shell.scale.set(1.25, 0.46, 0.82);
      group.add(shell);
      for (let i = -2; i <= 2; i += 1) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.23, 0.02), new THREE.MeshBasicMaterial({ color: '#bd8067' }));
        rib.rotation.z = i * 0.19;
        rib.position.y = 0.05;
        group.add(rib);
      }
    } else if (entity.kind === 'stone') {
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: '#717974', roughness: 0.95 }));
      stone.scale.set(1.3, 0.72, 0.75);
      stone.rotation.z = this.rng() * 2;
      group.add(stone);
    } else if (entity.kind === 'wood') {
      const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.85, 7), new THREE.MeshStandardMaterial({ color: '#765337', roughness: 1 }));
      wood.rotation.z = Math.PI / 2 + 0.35;
      group.add(wood);
    } else if (entity.kind === 'bone') {
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.55, 8), new THREE.MeshStandardMaterial({ color: '#d9d3b4', roughness: 0.7 }));
      bone.rotation.z = 1.1;
      group.add(bone);
    } else if (entity.kind === 'glow') {
      for (let i = 0; i < 9; i += 1) {
        const phase = this.rng() * 8;
        const height = 0.55 + this.rng() * 0.75;
        const points = Array.from({ length: 7 }, (_, p) => {
          const t = p / 6;
          return new THREE.Vector3((i - 4) * 0.075 + Math.sin(t * 3.4 + phase) * t * 0.08, t * height, (i % 3) * 0.018);
        });
        const frond = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: i % 2 ? '#50d8b3' : '#477db3', transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending }),
        );
        frond.userData.phase = phase;
        frond.userData.glowFrond = true;
        group.add(frond);
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.045 + this.rng() * 0.035, 10, 8),
          new THREE.MeshBasicMaterial({ color: i % 2 ? '#7dffd7' : '#79bfff', transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        bulb.position.copy(points[points.length - 1]);
        bulb.userData.phase = phase;
        bulb.userData.glowBulb = true;
        group.add(bulb);
      }
      const root = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 7), new THREE.MeshStandardMaterial({ color: '#173f38', emissive: '#0b4c3d', emissiveIntensity: 0.8, roughness: 0.9 }));
      root.scale.y = 0.38;
      group.add(root);
    } else if (entity.kind === 'vent') {
      const chimneyMaterial = new THREE.MeshStandardMaterial({ color: '#172323', roughness: 0.97, metalness: 0.12 });
      const mineralMaterial = new THREE.MeshStandardMaterial({ color: '#31534c', roughness: 0.78, emissive: '#0b2c26', emissiveIntensity: 0.7 });
      const chimneys = [
        { x: 0, y: -1.35, h: 3.35, top: 0.22, base: 0.58 },
        { x: -0.62, y: -1.82, h: 2.25, top: 0.15, base: 0.42 },
        { x: 0.58, y: -1.95, h: 1.85, top: 0.13, base: 0.36 },
      ];
      for (let i = 0; i < chimneys.length; i += 1) {
        const spec = chimneys[i];
        const chimney = new THREE.Mesh(new THREE.CylinderGeometry(spec.top, spec.base, spec.h, 8), i === 0 ? chimneyMaterial : mineralMaterial);
        chimney.position.set(spec.x, spec.y, i * -0.05);
        chimney.rotation.z = (i - 1) * 0.05;
        group.add(chimney);
        const aperture = new THREE.Mesh(
          new THREE.RingGeometry(spec.top * 0.42, spec.top * 1.08, 18),
          new THREE.MeshBasicMaterial({ color: i === 0 ? '#9affc9' : '#ff7b48', transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        aperture.position.set(spec.x, spec.y + spec.h * 0.5, 0.18);
        aperture.userData.aperture = true;
        aperture.userData.phase = i * 1.9;
        aperture.renderOrder = 12;
        group.add(aperture);
      }
      // Tube organisms and mineral fans make the vent a habitat, not only a hazard.
      for (let i = 0; i < 14; i += 1) {
        const angle = (i / 14) * Math.PI * 2;
        const radius = 0.72 + this.rng() * 1.05;
        const height = 0.22 + this.rng() * 0.58;
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.035, height, 7), new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? '#b95868' : '#725b80', emissive: i % 3 === 0 ? '#4b101f' : '#241833', emissiveIntensity: 0.5 }));
        tube.position.set(Math.cos(angle) * radius, -2.82 + height * 0.5, Math.sin(angle) * 0.16);
        tube.rotation.z = -Math.cos(angle) * 0.28;
        group.add(tube);
        const crown = new THREE.Mesh(new THREE.SphereGeometry(0.045 + this.rng() * 0.025, 9, 7), new THREE.MeshBasicMaterial({ color: i % 2 ? '#ff89ad' : '#8df6cf' }));
        crown.position.set(tube.position.x - Math.cos(angle) * height * 0.14, tube.position.y + height * 0.5, tube.position.z + 0.08);
        crown.userData.lifeGlow = true;
        crown.userData.phase = i * 0.77;
        group.add(crown);
      }
    }
    return group;
  }

  private buildCreatures(): void {
    for (let i = 0; i < 4; i += 1) {
      this.spawnSurfaceCreature(`bird-${i}`, 'bird', -25 + this.rng() * 18, 7 + this.rng() * 5, { initialAdult: true, sex: i % 2 ? 'male' : 'female' });
    }
    for (let i = 0; i < 4; i += 1) {
      this.spawnSurfaceCreature(`caterpillar-${i}`, 'caterpillar', -23 + i * 2.1, 5.25 + (i % 2) * 0.2, { initialAdult: true, sex: i % 2 ? 'male' : 'female' });
    }
    this.spawnSurfaceCreature('snake-0', 'snake', -21, 5.9, { initialAdult: true, sex: 'female' });
    this.spawnSurfaceCreature('snake-1', 'snake', -14.8, 5.35, { initialAdult: true, sex: 'male' });
    this.spawnSurfaceCreature('jelly-0', 'jelly', 9.2, -4.8, { initialAdult: true, sex: 'colony' });
  }

  private spawnSurfaceCreature(
    id: string,
    kind: SurfaceCreatureKind,
    x: number,
    y: number,
    lifeOptions: { initialAdult?: boolean; generation?: number; parentIds?: string[]; sex?: BiologicalSex } = {},
  ): CreatureState {
    const retired = !lifeOptions.initialAdult ? this.creatures.find((creature) => !creature.alive && creature.kind === kind) : undefined;
    if (retired) {
      const oldId = retired.id;
      const visual = this.creatureVisuals.get(oldId)!;
      this.creatureVisuals.delete(oldId);
      retired.id = id;
      retired.x = x;
      retired.y = y;
      retired.vx = kind === 'bird' ? 0.35 + this.rng() * 0.3 : kind === 'jelly' ? -0.08 : 0.1;
      retired.phase = this.rng() * 10;
      retired.alive = true;
      retired.life = this.surfaceLifecycle.create(kind, lifeOptions);
      visual.position.set(x, y, 1.8);
      visual.visible = true;
      this.creatureVisuals.set(id, visual);
      return retired;
    }
    const visual = new THREE.Group();
    if (kind === 'bird') {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.27, 0, 0), new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(0.27, 0, 0)]);
      visual.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#172d2f' })));
    } else if (kind === 'caterpillar') {
      for (let segment = 0; segment < 6; segment += 1) {
        const body = new THREE.Mesh(new THREE.CircleGeometry(0.055 + (segment % 2) * 0.008, 10), new THREE.MeshBasicMaterial({ color: segment % 2 ? '#77923f' : '#a4b85a' }));
        body.position.x = segment * 0.075;
        body.position.y = Math.sin(segment * 1.2) * 0.012;
        visual.add(body);
      }
    } else if (kind === 'snake') {
      const lineGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 12 }, (_, i) => new THREE.Vector3(i * 0.07, Math.sin(i * 1.4) * 0.05, 0)));
      visual.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#a2a34f' })));
    } else {
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#b783d7', transparent: true, opacity: 0.55 }));
      bell.rotation.x = Math.PI;
      visual.add(bell);
      for (let i = -2; i <= 2; i += 1) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(i * 0.08, 0, 0), new THREE.Vector3(i * 0.09, -0.65 - this.rng() * 0.25, 0)]), new THREE.LineBasicMaterial({ color: '#c69be0', transparent: true, opacity: 0.5 }));
        visual.add(line);
      }
    }
    const creature: CreatureState = {
      id,
      kind,
      x,
      y,
      vx: kind === 'bird' ? 0.35 + this.rng() * 0.3 : kind === 'jelly' ? -0.08 : 0.1,
      phase: this.rng() * 10,
      alive: true,
      life: this.surfaceLifecycle.create(kind, lifeOptions),
    };
    visual.position.set(x, y, 1.8);
    this.creatures.push(creature);
    this.creatureVisuals.set(id, visual);
    this.scene.add(visual);
    return creature;
  }

  private buildUI(): void {
    const scale = this.planetScale.state(0);
    this.ui = document.createElement('div');
    this.ui.className = 'ui-layer';
    this.ui.innerHTML = `
      <div class="topbar" data-ui="hud">
        <div class="vitals panel">
          ${this.vitalTemplate('health', 'Health')}
          ${this.vitalTemplate('hunger', 'Hunger')}
          ${this.vitalTemplate('stamina', 'Stamina')}
          ${this.vitalTemplate('moisture', 'Moisture')}
        </div>
        <div class="mission panel">
          <div class="eyebrow"><span class="weather-dot"></span><span data-ui="weather">Clear coast</span></div>
          <strong data-ui="day">Day one · Morning</strong>
          <small data-ui="mission">Prepare one winter den or link seven shelters before the storm.</small>
          <small data-ui="season">Late summer · winter in 3.4 days</small>
        </div>
        <div class="objectives panel">
          <h2>Winter preparation</h2>
          <div class="objective" data-objective="den"><i></i><span>Find the sheltered den</span></div>
          <div class="objective" data-objective="dig"><i></i><span>Excavate a large chamber</span></div>
          <div class="objective" data-objective="storage"><i></i><span>Hang a storage sling</span></div>
          <div class="objective" data-objective="brace"><i></i><span>Add 2 structural supports</span></div>
          <div class="objective" data-objective="food"><i></i><span>Keep 3 winter meals</span></div>
          <div class="objective" data-objective="fixture"><i></i><span>Add curtain, bowl, or living lamp</span></div>
        </div>
      </div>
      <div class="depth-gauge panel" data-ui="hud">
        <small>PLANET DEPTH</small><strong data-ui="depth">1.1 m</strong>
        <div class="depth-line"><i class="depth-pin"></i></div><small><span data-ui="depth-band">COAST</span><br>PRESSURE <span data-ui="pressure">1.0</span> ATM</small>
      </div>
      <div class="inventory-strip panel" data-ui="hud">
        <span>SUPPLY SLING</span>
        <div class="supply-row">${this.supplyHudTemplate()}</div>
      </div>
      <div class="mineral-pouch panel" data-ui="hud">
        <span>MINERAL POUCH</span>
        <div>${MINERAL_DEFINITIONS.map((mineral) => `<div class="mineral-count" title="${mineral.label} · ${mineral.use}"><img src="${mineral.icon}" alt=""><b data-inv="${mineral.id}">0</b></div>`).join('')}</div>
      </div>
      <div class="tool-hotbar" data-ui="hud">
        <div class="hotbar-readout"><span>ON DECK</span><b data-hotbar-label>BARE ARMS</b><kbd>TAB · SWITCH</kbd><button data-craft-toggle aria-label="Open crafting menu" aria-expanded="false"><span>CRAFT</span><kbd>I</kbd></button></div>
        <div class="hotbar-slots" role="toolbar" aria-label="Tool belt"></div>
      </div>
      <div class="technique panel" data-ui="hud"><div class="eyebrow">CURRENT TECHNIQUE</div><strong data-ui="technique">swim</strong><span data-ui="tool">bare arms · I craft</span><em data-ui="octipoints">O · OCTIPOINTS 1 · 0/140 XP</em><em data-ui="den">DEN NETWORK · 0 FOUND</em><em data-ui="biolight">DEEP LIGHT · NONE</em><em data-ui="stealth">G · GRIP + HIDE · C · CAMO</em><em data-ui="jet">SHIFT · JETS 3/3</em><em data-ui="blast">RMB / K · JET BLAST 0%</em><em data-ui="hunt">H · HUNT READY</em><em data-ui="ink">R · INK READY</em></div>
      <button class="settings-toggle panel" data-settings-toggle aria-label="Open settings and Octipoint grid"><span>◉</span><b data-octopoint-badge>1</b><small>O · ADAPT</small></button>
      <button class="map-toggle panel" data-map-toggle aria-label="Open fog-of-war world map" aria-expanded="false"><span>⌖</span><small>M · MAP</small></button>
      <div class="prompt panel" data-ui="prompt"></div>
      <div class="banner" data-ui="banner"><div class="eyebrow">TIDEBORN</div><h3></h3><p></p></div>
      <div class="pause-chip panel" data-ui="pause">PAUSED · PRESS ESC</div>
      <section data-ui="travel" aria-hidden="true" style="display:none;position:absolute;left:50%;top:16%;transform:translateX(-50%);z-index:60;flex-direction:column;gap:8px;width:min(340px,calc(100vw - 28px));padding:14px 16px;background:rgba(4,20,24,.92);border:1px solid rgba(125,238,216,.4);border-radius:12px;pointer-events:auto;box-shadow:0 18px 50px rgba(0,0,0,.5);">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <b style="letter-spacing:.12em;font-size:11px;color:#9df2dd;">DEN NETWORK TRAVEL</b>
          <button type="button" data-travel-close aria-label="Close travel panel" style="background:none;border:none;color:#cfe9e2;font-size:16px;cursor:pointer;">×</button>
        </div>
        <div data-travel-list style="display:flex;flex-direction:column;gap:6px;"></div>
        <button type="button" data-travel-sleep style="margin-top:2px;background:rgba(15,64,58,.9);border:1px solid rgba(125,238,216,.45);border-radius:8px;color:#dff5ec;font:inherit;font-size:11px;padding:7px;cursor:pointer;">Sleep here instead</button>
        <small style="opacity:.62;font-size:9.5px;">Travel spends stored food from this den. T opens and closes.</small>
      </section>
      <section data-ui="record" aria-hidden="true" style="display:none;position:absolute;left:50%;top:14%;transform:translateX(-50%);z-index:60;flex-direction:column;gap:8px;width:min(360px,calc(100vw - 28px));max-height:70vh;overflow:auto;padding:14px 16px;background:rgba(4,20,24,.94);border:1px solid rgba(125,238,216,.4);border-radius:12px;pointer-events:auto;box-shadow:0 18px 50px rgba(0,0,0,.5);">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <b style="letter-spacing:.12em;font-size:11px;color:#9df2dd;">EXPEDITION RECORD</b>
          <button type="button" data-record-close aria-label="Close record panel" style="background:none;border:none;color:#cfe9e2;font-size:16px;cursor:pointer;">×</button>
        </div>
        <div data-record-list style="display:flex;flex-direction:column;gap:7px;"></div>
        <small style="opacity:.62;font-size:9.5px;">Autosave writes every ten seconds. Manual slots survive New Game.</small>
      </section>
      <section class="results-screen" data-ui="results" aria-hidden="true" style="display:none;position:absolute;inset:0;z-index:80;align-items:center;justify-content:center;padding:22px;background:rgba(0,8,11,.86);pointer-events:auto;">
        <div class="results-card panel" style="width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 40px);overflow:auto;padding:clamp(22px,5vw,42px);text-align:center;border:1px solid rgba(125,238,216,.42);box-shadow:0 30px 90px rgba(0,0,0,.62);">
          <div class="eyebrow" data-results-outcome>FIRST WINTER</div>
          <h2 data-results-title style="margin:.45rem 0;font-size:clamp(30px,7vw,54px);line-height:1;">Winter-ready</h2>
          <p data-results-subtitle style="margin:.75rem auto 1.25rem;max-width:42ch;line-height:1.5;"></p>
          <div data-results-summary style="display:grid;gap:8px;margin:0 auto 1.4rem;max-width:410px;"></div>
          <button data-play-again aria-label="Play Tideborn again" style="min-width:210px;min-height:58px;padding:14px 28px;border-radius:999px;font:inherit;font-weight:800;letter-spacing:.08em;cursor:pointer;pointer-events:auto;touch-action:manipulation;">PLAY AGAIN</button>
        </div>
      </section>
      <aside class="planet-atlas panel" data-ui="atlas" aria-label="Fog-of-war world map" aria-hidden="true">
        <div class="atlas-head"><div><div class="eyebrow">PELAGOS-730 · WRAPPED PLANETARY BELT</div><h2>Exploration map</h2><p>Whole-world 2D slice · longitude wraps at both edges</p></div><button data-close-atlas aria-label="Close world map">×</button></div>
        <div class="world-map-shell">
          <canvas data-world-map width="900" height="460" aria-label="Explored world map with fog of war, player position, and den markers">Your browser does not support the exploration map.</canvas>
          <div class="world-map-key" aria-hidden="true"><span><i class="map-key-player"></i>YOU</span><span><i class="map-key-den"></i>DEN</span><span><i class="map-key-fog"></i>UNKNOWN</span></div>
        </div>
        <div class="world-map-readout">
          <div><b data-map-progress>0% CHARTED</b><small data-map-cells>0 / 4096 MAP SECTORS</small></div>
          <div><b data-map-location>COASTAL SHELF</b><small data-map-coordinates>0 KM LONGITUDE · 0 M DEPTH</small></div>
          <div><b data-map-den-count>0 DENS MARKED</b><small>Only discovered shelters are recorded</small></div>
        </div>
        <div class="world-map-dens" data-map-dens><span>No dens marked yet. Enter or claim a sheltered chamber.</span></div>
        <div class="planet-compare">
          <div><b>${scale.planet.radiusKm.toLocaleString()} km</b><small>radius · ${scale.comparison.earthRadius} Earth</small></div>
          <div><b>${scale.planet.circumferenceKm.toLocaleString()} km</b><small>equatorial belt</small></div>
          <div><b>${scale.planet.oceanCoveragePercent}%</b><small>ocean coverage</small></div>
          <div><b>${scale.planet.maximumNavigableDepthKm} km</b><small>deep-ocean cave limit</small></div>
        </div>
        <p>Smaller than Earth, but its radius is almost three times the Moon's. Broad oceans and deeper trenches give it roughly ${scale.comparison.earthOceanVolumeEstimate}× Earth's ocean volume.</p>
        <div class="core-profile">
          <i aria-hidden="true"></i>
          <span><b>${scale.planetInterior.habitableShell.thicknessKm.toLocaleString()} km abyssal ocean + megacaves</b><small>The crust is 21 km and the lower mantle is 945 km—both half their old thickness. The reclaimed 966 km is a speculative high-pressure water-rock habitat; the core still begins ${scale.planetInterior.core.beginsAtDepthKm.toLocaleString()} km down.</small></span>
        </div>
        <div class="depth-bands">
          ${PLANET_DEPTH_BANDS.map((band) => `<div><i style="--band:${Math.max(8, Math.log10(Math.max(10, band.maxDepthM)) / Math.log10(scale.planet.maximumNavigableDepthKm * 1000) * 100)}%"></i><span><b>${band.name}</b><small>${band.minDepthM.toLocaleString()}–${band.maxDepthM.toLocaleString()} m · ${band.light}</small></span></div>`).join('')}
        </div>
        <div class="scale-foot">ACTIVE FIELD ${scale.activeSimulation.widthM} × ${scale.activeSimulation.heightM} M · ${scale.activeSimulation.cellSizeCm} CM CELLS<br>TARGET MODIFIED TERRAIN · ${scale.activeSimulation.targetCellSizeCm} CM CELLS · ${scale.activeSimulation.targetChunkM} M CHUNKS</div>
      </aside>
      <section class="adaptation-settings" data-ui="settings" aria-hidden="true">
        <div class="settings-shell panel">
          <header class="settings-head">
            <div><div class="eyebrow">SETTINGS · LIVING ADAPTATION</div><h2>Octipoint Sphere</h2><p>Survive, hunt, explore, craft, excavate, and repair dens to turn experience into selectable Octipoints.</p></div>
            <button data-close-settings aria-label="Close settings">×</button>
          </header>
          <div class="settings-options" aria-label="Display settings">
            <label><input type="checkbox" data-setting="reduced-bloom"> Reduced bloom</label>
            <label><input type="checkbox" data-setting="large-supplies"> Large supply icons</label>
            <label><input type="checkbox" data-setting="mute-audio"> Mute audio</label>
            <label class="music-volume">Music <input type="range" min="0" max="100" value="55" data-setting="music-volume" aria-label="Music volume"></label>
            <button type="button" data-next-music>Next track</button>
            <span data-now-playing>NOW PLAYING · waiting for the water</span>
          </div>
          <div class="octopoint-progress">
            <div><strong data-settings-points>1</strong><span>OCTIPOINTS</span></div>
            <div class="octopoint-xp"><span><b data-settings-xp>0</b> / <b data-settings-xp-next>140</b> SURVIVAL XP</span><i><b data-settings-xp-bar></b></i></div>
            <div class="octopoint-activity" data-settings-activity>Instinct awakens · one point ready</div>
          </div>
          <div class="octopoint-grid" data-octopoint-grid>${this.octopointGridTemplate()}</div>
          <p class="settings-foot">Tier II and III nodes unlock along each connected branch. Selected nodes immediately change the live simulation.</p>
        </div>
      </section>
    `;
    this.root.appendChild(this.ui);

    this.menu = document.createElement('div');
    this.menu.className = 'menu';
    this.menu.innerHTML = `
      <div class="menu-card">
        <section class="menu-copy">
          <div class="logo-mark"><i></i> PLANETARY SURVIVAL PROTOTYPE</div>
          <h1>Tide<span>born</span></h1>
          <p class="menu-tagline">You are small. The living planet is not. Gather with eight arms, excavate a den network, and survive two winters until the second spring.</p>
          <div class="menu-actions" style="display:flex;flex-wrap:wrap;gap:9px;align-items:center;margin-bottom:10px;">
            <button class="start-button" id="start-btn" style="margin:0;">Enter the water</button>
            <button class="menu-secondary-button" id="continue-btn"${this.hasAutosave() ? '' : ' disabled style="opacity:.45;cursor:default;"'}>Continue</button>
            <button class="menu-secondary-button" id="record-btn">Load ▸</button>
            <button class="menu-secondary-button" id="settings-btn">Settings</button>
          </div>
          <span class="seed">${this.hasAutosave() ? `AUTOSAVE FOUND · DAY ${(JSON.parse(localStorage.getItem('tideborn-autosave') ?? '{}')?.dayNumber ?? 0) + 1}` : 'NO AUTOSAVE'} · BELT 03 · SEED ${PLANET_SEED}</span>
        </section>
        <aside class="menu-controls">
          <h2>Octopus techniques</h2>
          ${this.controlTemplate('WASD', 'crawl · swim · climb')}
          ${this.controlTemplate('SHIFT', '3-charge jet chain')}
          ${this.controlTemplate('RMB / K', 'learned Jet Blast · mouse aimed')}
          ${this.controlTemplate('R', 'ink burst concealment')}
          ${this.controlTemplate('H', 'pounce · hunt fish, crabs, or rival octopi')}
          ${this.controlTemplate('SPACE', 'lunge · corkscrew')}
          ${this.controlTemplate('E', 'grab · gather · pry')}
          ${this.controlTemplate('E → X / LMB', 'grip then peel clams · cut vent worms')}
          ${this.controlTemplate('B + Q', 'brace · twist')}
          ${this.controlTemplate('Hold X / LMB', 'dig toward mouse / slowly fracture')}
          ${this.controlTemplate('TAB / 1–9', 'switch equipped tool')}
          ${this.controlTemplate('N', 'claim any large sheltered chamber')}
          ${this.controlTemplate('Hold G + W/S / C', 'grip or climb trees · adaptive camouflage')}
          ${this.controlTemplate('J / Y', 'mineral reinforce · season food')}
          ${this.controlTemplate('Z / U / V', 'eat · use vent tonic · place gear or light')}
          ${this.controlTemplate('I', 'crafting')}
          ${this.controlTemplate('T', 'sleep inside a den')}
          ${this.controlTemplate('M', 'fog-of-war world map · den markers')}
          ${this.controlTemplate('O', 'settings · Octipoint Sphere')}
          ${this.controlTemplate('F', 'fullscreen')}
        </aside>
      </div>`;
    this.root.appendChild(this.menu);

    this.craftPanel = document.createElement('aside');
    this.craftPanel.className = 'craft-panel panel';
    this.craftPanel.setAttribute('aria-label', 'Crafting menu');
    this.craftPanel.setAttribute('aria-hidden', 'true');
    this.craftPanel.innerHTML = `<div class="craft-head"><div><div class="eyebrow">EIGHT-ARM FABRICATION</div><h2>Crafting</h2><p data-craft-summary>Checking your supply sling…</p></div><button data-close-craft aria-label="Close crafting menu">×</button></div><div class="craft-help">Choose a lit recipe. Missing materials stay visible so you know what to forage.</div><div class="recipe-list"></div>`;
    this.root.appendChild(this.craftPanel);
    this.atlasPanel = this.ui.querySelector<HTMLElement>('[data-ui="atlas"]')!;
    this.settingsPanel = this.ui.querySelector<HTMLElement>('[data-ui="settings"]')!;
    this.hotbar = this.ui.querySelector<HTMLElement>('.tool-hotbar')!;

    this.menu.querySelector('#start-btn')?.addEventListener('click', () => this.begin());
    this.menu.querySelector('#continue-btn')?.addEventListener('click', (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      if (button.disabled) return;
      if (this.restoreMidGame(AUTOSAVE_SLOT).ok) {
        this.begin();
        this.setMessage(`Autosave restored · day ${Math.floor(this.elapsed / DAY_LENGTH) + 1}. Welcome back to the water.`);
      } else {
        button.textContent = 'No autosave';
        button.disabled = true;
      }
    });
    this.menu.querySelector('#record-btn')?.addEventListener('click', () => {
      this.beginPendingFromMenu = true;
      this.toggleRecordPanel(true);
    });
    this.menu.querySelector('#settings-btn')?.addEventListener('click', () => {
      this.accessibility.toggle(true);
    });
    this.craftPanel.querySelector('[data-close-craft]')?.addEventListener('click', () => this.toggleCraft(false));
    this.ui.querySelector('[data-craft-toggle]')?.addEventListener('click', () => this.toggleCraft());
    this.hotbar.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tool-slot]');
      if (!button) return;
      this.selectToolSlot(Number(button.dataset.toolSlot));
    });
    this.ui.querySelector('[data-play-again]')?.addEventListener('click', () => this.reset());
    this.ui.querySelector('[data-settings-toggle]')?.addEventListener('click', () => this.toggleSettings());
    this.ui.querySelector('[data-travel-close]')?.addEventListener('click', () => this.toggleTravelPanel(false));
    this.ui.querySelector('[data-travel-sleep]')?.addEventListener('click', () => {
      this.toggleTravelPanel(false);
      this.sleep();
    });
    this.ui.querySelector('[data-record-close]')?.addEventListener('click', () => this.toggleRecordPanel(false));
    const pauseChip = this.ui.querySelector<HTMLElement>('[data-ui="pause"]');
    if (pauseChip) {
      pauseChip.style.pointerEvents = 'auto';
      pauseChip.style.cursor = 'pointer';
      pauseChip.addEventListener('click', () => this.toggleRecordPanel());
    }
    this.ui.querySelector('[data-map-toggle]')?.addEventListener('click', () => this.toggleAtlas());
    this.atlasPanel.querySelector('[data-close-atlas]')?.addEventListener('click', () => this.toggleAtlas(false));
    this.settingsPanel.querySelector('[data-close-settings]')?.addEventListener('click', () => this.toggleSettings(false));
    this.settingsPanel.addEventListener('click', (event) => {
      const nodeButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-octopoint-node]');
      if (nodeButton) this.purchaseOctipoint(nodeButton.dataset.octopointNode!);
    });
    this.settingsPanel.querySelector<HTMLInputElement>('[data-setting="reduced-bloom"]')?.addEventListener('change', (event) => {
      this.reducedBloom = (event.target as HTMLInputElement).checked;
      this.bloomPass.strength = this.reducedBloom ? 0.08 : 0.24;
    });
    this.settingsPanel.querySelector<HTMLInputElement>('[data-setting="large-supplies"]')?.addEventListener('change', (event) => {
      this.root.classList.toggle('large-supply-icons', (event.target as HTMLInputElement).checked);
    });
    this.settingsPanel.querySelector<HTMLInputElement>('[data-setting="mute-audio"]')?.addEventListener('change', (event) => {
      this.sound.setMuted((event.target as HTMLInputElement).checked);
    });
    this.settingsPanel.querySelector<HTMLInputElement>('[data-setting="music-volume"]')?.addEventListener('input', (event) => {
      this.sound.setMusicVolume(Number((event.target as HTMLInputElement).value) / 100);
    });
    this.settingsPanel.querySelector<HTMLButtonElement>('[data-next-music]')?.addEventListener('click', () => {
      this.sound.nextMusic();
      this.updateUI();
    });
    this.refreshHotbar(true);
    this.updateOctipointUI();
  }

  private vitalTemplate(kind: string, name: string): string {
    return `<div class="vital-row ${kind}"><span>${name}</span><span class="bar"><i style="--value:100%"></i></span><b data-vital="${kind}">100</b></div>`;
  }

  private controlTemplate(key: string, action: string): string {
    return `<div class="control-row"><b>${key}</b><span>${action}</span></div>`;
  }

  private supplyHudTemplate(): string {
    return SUPPLY_HUD_ITEMS.map((item) => `<div class="supply-count" title="${item.label}"><img src="${item.icon}" alt=""><b data-inv="${item.key}">0</b><small>${item.label}</small></div>`).join('');
  }

  private octopointGridTemplate(): string {
    const branchHtml = OCTIPOINT_BRANCHES.map((branch) => {
      const nodes = OCTIPOINT_NODES.filter((node) => node.branch === branch.id).map((node) => `
        <button class="octopoint-node" data-octopoint-node="${node.id}" data-tier="${node.tier}">
          <span>${node.icon}</span><b>${node.name}</b><small>${node.description}</small><em>${node.cost} OP</em>
        </button>`).join('');
      return `<article class="octopoint-branch branch-${branch.id}" style="--branch:${branch.color}" data-branch="${branch.id}"><header><span>${branch.icon}</span><div><b>${branch.label}</b><small>${branch.motto}</small></div></header><div class="octopoint-track">${nodes}</div></article>`;
    }).join('');
    return `${branchHtml}<div class="octopoint-core"><span>◉</span><b>TIDEBORN</b><small>OCTOPUS SKILLS<br>& ABILITIES</small></div>`;
  }

  private bindInput(): void {
    window.addEventListener('keydown', (event) => {
      const blocked = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'];
      if (blocked.includes(event.code)) event.preventDefault();
      if (!this.keys.held.has(event.code)) this.keys.pressed.add(event.code);
      this.keys.held.add(event.code);
      if (event.code === 'Enter' && this.mode === 'menu') this.begin();
      if (event.code === 'F10' && this.mode !== 'menu') this.reset();
      if (event.code === 'KeyF') this.toggleFullscreen();
      if (event.code === 'KeyI' && this.mode !== 'menu') this.toggleCraft();
      if (event.code === 'KeyM' && this.mode !== 'menu') this.toggleAtlas();
      if (event.code === 'KeyO' && this.mode !== 'menu' && this.mode !== 'won' && this.mode !== 'lost') this.toggleSettings();
      if (event.code === 'KeyL' && this.mode !== 'menu') this.denBuilder.toggle();
      if (event.code === 'Digit9' && this.mode !== 'menu') this.denBuilder.cyclePreview();
      if (event.code === 'Digit0' && this.mode !== 'menu') this.discoveries.toggle();
      if (event.code === 'KeyP' && this.mode !== 'menu') this.ecologyJournal.toggle();
      if (event.code === 'Escape' && !document.fullscreenElement && this.mode !== 'menu') {
        const travelPanel = this.ui.querySelector<HTMLElement>('[data-ui="travel"]');
        const recordPanel = this.ui.querySelector<HTMLElement>('[data-ui="record"]');
        if (travelPanel && travelPanel.style.display === 'flex') this.toggleTravelPanel(false);
        else if (recordPanel && recordPanel.style.display === 'flex') this.toggleRecordPanel(false);
        else if (this.settingsOpen) this.toggleSettings(false);
        else if (this.atlasOpen) this.toggleAtlas(false);
        else if (this.craftOpen) this.toggleCraft(false);
        else this.togglePause();
      }
      if ((this.mode === 'won' || this.mode === 'lost') && event.code === 'Enter') this.reset();
    });
    window.addEventListener('keyup', (event) => this.keys.held.delete(event.code));
    const canvas = this.renderer.domElement;
    const aim = (event: PointerEvent) => this.pointerAim.updateFromClient(
      event.clientX, event.clientY, canvas.getBoundingClientRect(), this.camera,
    );
    canvas.addEventListener('pointermove', aim);
    canvas.addEventListener('pointerdown', (event) => {
      aim(event);
      if (event.button === 0) {
        this.keys.pressed.add('MouseLeft');
        this.keys.held.add('MouseLeft');
      } else if (event.button === 2) {
        this.keys.pressed.add('MouseRight');
        this.keys.held.add('MouseRight');
      }
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('pointerup', (event) => {
      if (event.button === 0) this.keys.held.delete('MouseLeft');
      if (event.button === 2) this.keys.held.delete('MouseRight');
    });
    window.addEventListener('blur', () => this.keys.held.clear());
  }

  private begin(): void {
    this.mode = 'playing';
    this.beginPendingFromMenu = false;
    this.tutorial.begin(this.elapsed);
    const travelPanel = this.ui.querySelector<HTMLElement>('[data-ui="travel"]');
    if (travelPanel) travelPanel.style.display = 'none';
    const recordPanel = this.ui.querySelector<HTMLElement>('[data-ui="record"]');
    if (recordPanel) recordPanel.style.display = 'none';
    this.menu.classList.add('hidden');
    this.syncMobileControlsVisibility();
    this.sound.start();
    this.showBanner('Day one', 'Find food. Discover the den. Learn what your arms can do.', 4.5);
    this.message = this.mobileCamera.active
      ? 'Use MOVE · nearby resources reveal GRAB and USE actions'
      : 'Move with WASD · nearby resources will reveal an interaction';
    this.messageUntil = this.elapsed + 8;
  }

  private togglePause(): void {
    if (this.mode === 'playing') this.mode = 'paused';
    else if (this.mode === 'paused') this.mode = 'playing';
    const pause = this.ui.querySelector<HTMLElement>('[data-ui="pause"]');
    if (pause) pause.style.display = this.mode === 'paused' ? 'block' : 'none';
    this.syncMobileControlsVisibility();
  }

  private toggleCraft(force?: boolean): void {
    this.craftOpen = force ?? !this.craftOpen;
    if (this.craftOpen) this.tutorial.notify('craft-opened');
    if (this.craftOpen && this.settingsOpen) this.toggleSettings(false);
    if (this.craftOpen && this.atlasOpen) this.toggleAtlas(false);
    this.craftPanel.classList.toggle('open', this.craftOpen);
    this.craftPanel.setAttribute('aria-hidden', String(!this.craftOpen));
    const craftToggle = this.ui.querySelector<HTMLButtonElement>('[data-craft-toggle]');
    craftToggle?.setAttribute('aria-expanded', String(this.craftOpen));
    craftToggle?.classList.toggle('open', this.craftOpen);
    this.syncMobileControlsVisibility();
    this.refreshRecipes();
    if (this.craftOpen) this.sound.play('craftStart');
  }

  private toggleAtlas(force?: boolean): void {
    this.atlasOpen = force ?? !this.atlasOpen;
    if (this.atlasOpen && this.settingsOpen) this.toggleSettings(false);
    if (this.atlasOpen && this.craftOpen) this.toggleCraft(false);
    this.atlasPanel.classList.toggle('open', this.atlasOpen);
    this.atlasPanel.setAttribute('aria-hidden', String(!this.atlasOpen));
    const mapToggle = this.ui.querySelector<HTMLButtonElement>('[data-map-toggle]');
    mapToggle?.setAttribute('aria-expanded', String(this.atlasOpen));
    mapToggle?.classList.toggle('open', this.atlasOpen);
    if (this.atlasOpen) this.refreshWorldMap();
    this.syncMobileControlsVisibility();
  }

  private refreshWorldMap(): void {
    const canvas = this.atlasPanel?.querySelector<HTMLCanvasElement>('[data-world-map]');
    if (!canvas) return;
    const dens = this.denNetwork.snapshot(this.player.x, this.player.y).sites;
    const belt = this.beltTraversal.state(this.player.x, this.planetScale);
    this.worldMap.render({
      canvas,
      world: this.world,
      seaLevel: this.world.seaLevel,
      player: {
        x: this.player.x,
        y: this.player.y,
        canonicalDepthM: this.depthState.canonicalDepthM,
        depthBand: this.depthState.band,
      },
      longitudeKm: belt.longitudeKm,
      dens,
    });
    const snapshot = this.worldMap.snapshot(dens);
    const setText = (selector: string, value: string): void => {
      const element = this.atlasPanel.querySelector<HTMLElement>(selector);
      if (element) element.textContent = value;
    };
    setText('[data-map-progress]', `${snapshot.exploredPercent.toFixed(1)}% CHARTED`);
    setText('[data-map-cells]', `${snapshot.grid.exploredCells} / ${snapshot.grid.totalCells} MAP SECTORS`);
    setText('[data-map-location]', this.depthState.band.toUpperCase());
    const depthLabel = this.depthState.canonicalDepthM >= 1000
      ? `${(this.depthState.canonicalDepthM / 1000).toFixed(1)} KM DEPTH`
      : `${Math.round(this.depthState.canonicalDepthM)} M DEPTH`;
    setText('[data-map-coordinates]', `${belt.longitudeKm.toLocaleString()} KM LONGITUDE · ${depthLabel}`);
    setText('[data-map-den-count]', `${dens.length} ${dens.length === 1 ? 'DEN' : 'DENS'} MARKED`);
    const denList = this.atlasPanel.querySelector<HTMLElement>('[data-map-dens]');
    if (denList) {
      if (dens.length === 0) {
        const empty = document.createElement('span');
        empty.textContent = 'No dens marked yet. Enter or claim a sheltered chamber.';
        denList.replaceChildren(empty);
      } else {
        denList.replaceChildren(...dens.map((den) => {
          const marker = document.createElement('div');
          marker.className = `world-map-den-entry${den.destroyed ? ' lost' : ''}`;
          const denBelt = this.beltTraversal.state(den.x, this.planetScale);
          const denDepth = this.depthAccess.sample(den.x, den.y, this.world.seaLevel, true);
          marker.innerHTML = `<i></i><span><b>${den.name}</b><small>${denBelt.longitudeKm.toLocaleString()} km · ${denDepth.band}${den.destroyed ? ' · lost' : ''}</small></span>`;
          return marker;
        }));
      }
    }
  }

  private toggleSettings(force?: boolean): void {
    const next = force ?? !this.settingsOpen;
    if (next === this.settingsOpen) return;
    if (next) {
      if (this.craftOpen) this.toggleCraft(false);
      if (this.atlasOpen) this.toggleAtlas(false);
      this.resumeAfterSettings = this.mode === 'playing';
      if (this.mode === 'playing') this.mode = 'paused';
    } else if (this.resumeAfterSettings && this.mode === 'paused') {
      this.mode = 'playing';
      this.resumeAfterSettings = false;
    }
    this.settingsOpen = next;
    this.settingsPanel.classList.toggle('open', next);
    this.settingsPanel.setAttribute('aria-hidden', String(!next));
    this.sound.play(next ? 'settingsOpen' : 'settingsClose');
    this.syncMobileControlsVisibility();
    this.updateOctipointUI();
  }

  private syncMobileControlsVisibility(): void {
    const controls = this.root.querySelector<HTMLElement>('.mobile-controls');
    if (!controls || !this.mobileCamera.active) return;
    const sessionVisible = this.mode === 'playing' || this.mode === 'paused';
    const obscured = this.craftOpen || this.settingsOpen || this.atlasOpen;
    controls.style.visibility = sessionVisible && !this.atlasOpen ? 'visible' : 'hidden';
    controls.style.opacity = sessionVisible ? (obscured ? '0.1' : '1') : '0';
    controls.setAttribute('aria-hidden', String(!sessionVisible || obscured));
  }

  private toggleFullscreen(): void {
    if (!document.fullscreenElement) this.root.requestFullscreen().catch(() => undefined);
    else document.exitFullscreen().catch(() => undefined);
  }

  private handleToolSelectionInput(): void {
    if (this.keys.pressed.has('Tab')) {
      const selected = this.toolbelt.cycle(this.inventory);
      this.sound.play('toolEquip');
      this.setMessage(`Equipped ${selected.label}. ${selected.use}`);
      this.refreshHotbar(true);
      return;
    }
    for (let index = 0; index < TOOL_DEFINITIONS.length; index += 1) {
      if (this.keys.pressed.has(`Digit${index + 1}`) || this.keys.pressed.has(`Numpad${index + 1}`)) {
        this.selectToolSlot(index);
        return;
      }
    }
  }

  private selectToolSlot(index: number): void {
    const selected = this.toolbelt.selectSlot(index, this.inventory);
    if (!selected) {
      const missing = TOOL_DEFINITIONS[index];
      if (missing) this.setMessage(`${missing.label} is not on deck yet. Craft or discover it first.`);
      return;
    }
    this.setMessage(`Equipped ${selected.label}. ${selected.use}`);
    this.sound.play('toolEquip');
    this.refreshHotbar(true);
  }

  private refreshHotbar(force = false): void {
    if (!this.hotbar) return;
    const selected = this.toolbelt.selectedDefinition(this.inventory);
    const signature = TOOL_DEFINITIONS.map((definition) => {
      const count = definition.resource ? this.inventory[definition.resource] : 1;
      return `${definition.id}:${count}`;
    }).join('|') + `|selected:${selected.id}`;
    if (!force && signature === this.hotbarSignature) return;
    this.hotbarSignature = signature;
    const label = this.hotbar.querySelector<HTMLElement>('[data-hotbar-label]');
    if (label) label.textContent = selected.label.toUpperCase();
    const slots = this.hotbar.querySelector<HTMLElement>('.hotbar-slots');
    if (!slots) return;
    slots.innerHTML = TOOL_DEFINITIONS.map((definition, index) => {
      const owned = this.toolbelt.isOwned(definition.id, this.inventory);
      const active = selected.id === definition.id;
      const count = definition.resource ? this.inventory[definition.resource] : 1;
      return `<button class="tool-slot${active ? ' selected' : ''}${owned ? '' : ' locked'}" data-tool-slot="${index}" ${owned ? '' : 'disabled'} aria-label="${owned ? `Equip ${definition.label}` : `${definition.label}, not crafted`}" aria-pressed="${active}">
        <span class="slot-number">${index + 1}</span>
        ${owned ? `<img src="${definition.icon}" alt=""><span class="tool-tooltip"><b>${definition.label}</b><small>${definition.use}</small></span>${count > 1 ? `<em>${count}</em>` : ''}` : '<i class="empty-slot"></i>'}
      </button>`;
    }).join('');
  }

  private recordOctoExperience(activity: OctipointActivity, xp: number, detail: string, uniqueKey?: string): void {
    const award = uniqueKey
      ? this.octipoints.recordUnique(uniqueKey, activity, xp, detail)
      : this.octipoints.recordActivity(activity, xp, detail);
    if (!award.accepted) return;
    this.updateOctipointUI();
    if (award.pointsGained > 0) {
      this.sound.play('octipointEarned');
      this.ui.querySelector('[data-settings-toggle]')?.classList.add('octipoint-earned');
      this.showBanner('Octipoint earned', `${detail} · Select a glowing connected ability in Settings [O].`, 4.8);
    }
  }

  private purchaseOctipoint(nodeId: string): void {
    const result = this.octipoints.purchase(nodeId);
    if (!result.purchased) {
      this.sound.play('gridDenied');
      const reason = result.reason === 'prerequisite'
        ? 'Follow the connected Tier I → II → III path first.'
        : result.reason === 'points'
          ? 'Keep surviving and acting in the world to earn another Octipoint.'
          : 'That adaptation is already part of your body.';
      this.setMessage(reason);
      return;
    }
    this.sound.play('gridNodeActivated');
    this.setMessage(`${result.node!.name} adapted. ${result.node!.description}.`);
    this.updateOctipointUI();
  }

  private updateOctipointUI(): void {
    if (!this.ui) return;
    const snapshot = this.octipoints.snapshot();
    const setText = (selector: string, value: string): void => {
      const element = this.ui.querySelector<HTMLElement>(selector);
      if (element) element.textContent = value;
    };
    setText('[data-ui="octipoints"]', `O · OCTIPOINTS ${snapshot.availablePoints} · ${snapshot.experience}/${snapshot.experienceToNext} XP`);
    setText('[data-octopoint-badge]', String(snapshot.availablePoints));
    setText('[data-settings-points]', String(snapshot.availablePoints));
    setText('[data-settings-xp]', String(snapshot.experience));
    setText('[data-settings-xp-next]', String(snapshot.experienceToNext));
    const xpBar = this.ui.querySelector<HTMLElement>('[data-settings-xp-bar]');
    if (xpBar) xpBar.style.width = `${snapshot.experience / snapshot.experienceToNext * 100}%`;
    const latest = snapshot.activity[0];
    setText('[data-settings-activity]', latest ? `+${latest.xp} XP · ${latest.detail}` : 'Instinct awakens · one point ready');
    const toggle = this.ui.querySelector<HTMLElement>('[data-settings-toggle]');
    toggle?.classList.toggle('ready', snapshot.availablePoints > 0);
    if (snapshot.availablePoints === 0) toggle?.classList.remove('octipoint-earned');
    for (const node of OCTIPOINT_NODES) {
      const button = this.settingsPanel?.querySelector<HTMLButtonElement>(`[data-octopoint-node="${node.id}"]`);
      if (!button) continue;
      const owned = this.octipoints.owns(node.id);
      const prerequisiteMet = !node.prerequisite || this.octipoints.owns(node.prerequisite);
      const available = this.octipoints.canPurchase(node.id);
      button.classList.toggle('owned', owned);
      button.classList.toggle('available', available);
      button.classList.toggle('locked', !owned && !prerequisiteMet);
      button.classList.toggle('needs-points', !owned && prerequisiteMet && !available);
      button.setAttribute('aria-pressed', String(owned));
      button.setAttribute('aria-label', `${node.name}. ${node.description}. ${owned ? 'Adapted' : available ? 'Available for one Octipoint' : 'Locked'}`);
      const cost = button.querySelector<HTMLElement>('em');
      if (cost) cost.textContent = owned ? 'ADAPTED' : `${node.cost} OP`;
    }
  }

  private update(dt: number): void {
    this.elapsed += dt * (this.debugFastTime ? 4 : 1);
    if (this.elapsed >= this.nextSurvivalExperience) {
      this.recordOctoExperience('survival', 12, 'Time alive teaches the body');
      this.nextSurvivalExperience += 30;
    }
    const storm = this.stormStrength();
    this.jetBlast.update(dt);
    this.world.seaLevel = BASE_SEA_LEVEL + storm * 1.15;
    this.oceanSurface.setSeaLevel(this.world.seaLevel);
    const season = this.seasonSystem.sample(this.elapsed);
    this.cryosphere.update({
      elapsed: this.elapsed,
      storm,
      seaLevel: this.world.seaLevel,
      playerX: this.player.x,
      playerY: this.player.y,
      cameraX: this.cameraTarget.x,
      cameraY: this.cameraTarget.y,
      season,
    });
    const activeDenForSeason = this.denNetwork.currentDen(this.player.x, this.player.y);
    const heaterCount = activeDenForSeason?.artifacts.filter((artifact) => artifact === 'thermal-core').length ?? 0;
    this.seasonalWorld.update(dt, this.elapsed, {
      season,
      cryoLocal: this.cryosphere.snapshot().local,
      playerY: this.player.y,
      inDen: Boolean(activeDenForSeason),
      denInsulation01: clamp(
        (activeDenForSeason?.curtains ?? 0) * 0.34
        + (activeDenForSeason?.braces ?? 0) * 0.12
        + (activeDenForSeason?.mineralReinforcement ?? 0) * 0.08
        + (activeDenForSeason?.bowls ?? 0) * 0.1
        + heaterCount * 0.3,
        0, 1,
      ),
    });
    if (this.seasonalWorld.migrationState.surfaceBirds !== this.lastBirdPhase) {
      this.lastBirdPhase = this.seasonalWorld.migrationState.surfaceBirds;
      if (this.lastBirdPhase === 'leaving' || this.lastBirdPhase === 'returning') {
        this.showBanner(this.lastBirdPhase === 'leaving' ? 'The flocks depart' : 'Scouts return', this.seasonalWorld.migrationBanner, 4.6);
      }
    }

    this.handleToolSelectionInput();
    const previousPlayerX = this.player.x;
    const treeGrip = this.keys.held.has('KeyG')
      ? this.treeInteraction.sampleGrip(this.player.x, this.player.y)
      : null;
    const events = this.player.update(dt, this.keys, this.world, this.world.seaLevel, this.elapsed, treeGrip);
    this.lastFrameDt = dt;
    this.tutorial.setSeaLevel(this.world.seaLevel);
    this.tutorial.notify('moved', Math.hypot(this.player.vx, this.player.vy) * dt);
    if (this.player.y < this.world.seaLevel - 0.5) this.tutorial.notify('dived', this.player.y);
    this.tutorial.update(this.elapsed);
    if (this.vibrationSpeedFactor < 1 && this.player.underwater && !this.player.gripping) {
      const blindDrag = Math.pow(this.vibrationSpeedFactor, dt * 2.35);
      this.player.vx *= blindDrag;
      this.player.vy *= blindDrag;
    }
    const treeCollision = this.treeInteraction.resolve(this.player.x, this.player.y, this.player.radius);
    if (treeCollision.collided) {
      this.player.x = treeCollision.x;
      this.player.y = treeCollision.y;
      const intoTree = this.player.vx * treeCollision.normalX + this.player.vy * treeCollision.normalY;
      if (intoTree < 0) {
        this.player.vx -= treeCollision.normalX * intoTree;
        this.player.vy -= treeCollision.normalY * intoTree;
      }
      if (treeCollision.normalY > 0.52) this.player.onGround = true;
      this.player.group.position.set(this.player.x, this.player.y, 2);
    }
    if (this.beltTraversal.update(previousPlayerX, this.player.x)) {
      this.cameraTarget.set(this.player.x, this.player.y);
      this.camera.position.x = this.player.x;
      this.setMessage(`PLANETARY WRAP · Longitude seam crossed. Revolution ${Math.abs(this.beltTraversal.state(this.player.x, this.planetScale).revolutions)}.`);
    }
    this.worldMap.visit(this.player.x, this.player.y);
    this.bioluminescence.reconcile(this.inventory.glowKelp, this.denNetwork.biolightCounts());
    const biolightUpdate = this.bioluminescence.update(dt * (this.debugFastTime ? 4 : 1));
    if (biolightUpdate.carriedExpired > 0) {
      this.inventory.glowKelp = Math.max(0, this.inventory.glowKelp - biolightUpdate.carriedExpired);
      if (!this.bioluminescence.hasCarried()) this.setMessage('The carried seaweed fades. Find another sparse luminous colony or travel by touch.');
    }
    for (const expired of biolightUpdate.denExpired) {
      this.denNetwork.expireBiolight(expired.denId, expired.count);
      this.expireDenBiolightVisuals(expired.denId, expired.count);
    }
    const hasBiolight = this.hasLocalBiolight();
    const attemptedDepth = this.depthAccess.sample(this.player.x, this.player.y, this.world.seaLevel, hasBiolight);
    if (attemptedDepth.requiresBiolight && !hasBiolight && this.elapsed >= this.nextDepthWarning) {
      this.setMessage('BLACK WATER · You can descend, but no light returns. Find bioluminescent seaweed or navigate by touch.');
      this.nextDepthWarning = this.elapsed + 3.5;
    }
    this.depthState = attemptedDepth;
    this.sound.updateEnvironment(this.depthState.canonicalDepthM, this.player.underwater, {
      stormStrength: storm,
      winter: season.id === 'winter',
    });
    const depthBand = this.planetScale.state(this.depthState.canonicalDepthM).currentDepth.band;
    this.recordOctoExperience('exploration', 34, `First entry into the ${depthBand}`, `depth-band:${depthBand}`);
    if (events.jet) {
      this.lastJetPulseElapsed = this.elapsed;
      const learnedJetBlast = this.jetBlast.trainJet(this.player.lastJetStrength);
      this.sound.pulse('jet');
      const direction = this.player.lastJetDirection.clone();
      const jetMultiplier = 1 + this.octipoints.effect('jetForce');
      const strength = this.player.lastJetStrength * jetMultiplier;
      const addedBodyForce = this.player.lastJetStrength * (jetMultiplier - 1) * 2.8;
      this.player.vx += direction.x * addedBodyForce;
      this.player.vy += direction.y * addedBodyForce;
      this.player.stamina = clamp(this.player.stamina + this.octipoints.effect('jetRecovery'), 0, 100);
      this.spawnBurst(this.player.x - direction.x * 0.4, this.player.y - direction.y * 0.25, '#b8eee5');
      const pushed = this.marineLife.applyJet(this.player.x, this.player.y, direction, strength)
        + this.deepSeaLife.applyJet(this.player.x, this.player.y, direction, this.elapsed, strength)
        + this.deepSeaShoals.applyJet(this.player.x, this.player.y, direction, this.elapsed, strength)
        + this.importedDeepFauna.applyJet(this.player.x, this.player.y, direction, this.elapsed, strength)
        + this.amphibiousCrabs.applyJet(this.player.x, this.player.y, direction, this.elapsed, strength)
        + this.applySurfaceJet(this.player.x, this.player.y, direction, strength);
      // The body accelerates along `direction`; expelled water travels out of
      // the siphon in the opposite direction.
      this.vfx.cast('jet', new THREE.Vector3(this.player.x, this.player.y, 0), direction.clone().multiplyScalar(-1));
      if (pushed > 0) this.setMessage(`JET WASH · ${pushed} nearby animal${pushed === 1 ? '' : 's'} pushed back${strength < 1 ? ' by the weaker land burst' : ''}.`);
      if (learnedJetBlast) {
        this.showBanner('Technique learned', 'Jet Blast mastered · aim with the mouse and right-click or press K underwater.', 5.2);
        this.setMessage('JET BLAST LEARNED · Fill all three chambers and 70 stamina, then RMB or K to release it.');
      }
    }
    if (events.ink) {
      this.sound.pulse('ink');
      this.vfx.cast('ink', new THREE.Vector3(this.player.x, this.player.y, 0));
      const blindnessDuration = DAY_LENGTH * 0.5 * (1 + this.octipoints.effect('inkDuration'));
      const inkedPredators = this.deepSeaLife.applyInk(this.player.x, this.player.y, 4.4, this.elapsed, blindnessDuration)
        + this.importedDeepFauna.applyInk(this.player.x, this.player.y, 4.4, this.elapsed, blindnessDuration);
      this.setMessage(inkedPredators > 0
        ? `Ink coats ${inkedPredators} predator${inkedPredators === 1 ? '' : 's'}. Sixgill eyes stay blinded for half a day.`
        : 'Ink blooms through the current. Predators lose your silhouette for four seconds.');
    }
    if (events.braceChanged && this.player.braced && !this.player.canBrace(this.world)) {
      this.player.braced = false;
      this.setMessage('Nothing solid is within sucker reach.');
    }
    if (events.braceChanged && this.player.braced) {
      this.sound.play('brace');
      this.tutorial.notify('braced');
    }
    if (events.camouflageChanged) {
      this.sound.play(this.player.camouflage ? 'camouflageOn' : 'camouflageOff');
      this.setMessage(this.player.camouflage
        ? `Chromatophores matching ${this.player.camouflageSurface}. Stay slow and let the pattern settle.`
        : 'Camouflage released. Natural mantle color returning.');
    }
    if (events.gripStarted) {
      this.sound.play('gripLock');
      this.setMessage(`Suckers locked to ${this.player.gripSurface ?? 'the surface'}. Motion stopped; predators lose your silhouette.`);
    } else if (events.gripFailed) {
      this.setMessage('Grip failed · no floor, wall, or ceiling is within sucker reach.');
    } else if (events.gripReleased) {
      this.sound.play('grabRelease');
      this.setMessage('Surface grip released. You are visible to hunting predators again.', 2.4);
    }
    if (events.dig && !this.handleHeldOrganismDig()) this.handleDig();
    if (this.keys.pressed.has('MouseRight') || this.keys.pressed.has('KeyK')) this.handleJetBlast();
    if (events.interact) this.handleInteract();
    if (events.twist) this.handleTwist();
    if (this.keys.pressed.has('KeyH')) this.handleFishHunt();
    if (events.eat) this.eat();
    if (this.keys.pressed.has('KeyU')) this.useVentTonic();
    if (events.place) this.placeInDen();
    if (events.sleep) this.handleSleepInput();
    if (this.keys.pressed.has('KeyN')) this.claimDen();
    if (this.keys.pressed.has('KeyJ')) this.reinforceDenWithMinerals();
    if (this.keys.pressed.has('KeyY')) this.seasonFood();

    this.matterAccumulator += dt;
    if (this.matterAccumulator >= 1 / 30) {
      this.world.step(this.player.x, this.player.y, storm);
      this.matterAccumulator %= 1 / 30;
    }
    this.updateSurvival(dt, storm);
    this.updateWeather(storm);
    this.updateEntities(dt, storm);
    this.minerals.update(this.elapsed);
    this.supplies.update(this.elapsed);
    this.relics.update(this.elapsed);
    this.discoveries.update(this.elapsed, this.player.x, this.player.y);
    this.proceduralClams.update(this.elapsed, this.player.x, this.player.y);
    const wormEvents = this.deepTubeWorms.update(dt, this.elapsed, this.player.x, this.player.y, this.hasLocalBiolight());
    for (const event of wormEvents) this.applyTubeWormSpray(event);
    const ecoBefore = { ...this.ecosystem };
    const marineEvents = this.marineLife.update(dt, this.elapsed, storm, {
      x: this.player.x,
      y: this.player.y,
      facing: this.player.facing,
      concealed: this.player.concealed,
    });
    for (const event of marineEvents) {
      if (event.kind === 'anemone-catch') {
        this.ecosystem.smallFish = Math.max(0, this.ecosystem.smallFish - 1);
        this.spawnBurst(event.x, event.y, '#f3a6a1');
        this.huntingFeedback.ingestPredatorEvent({ id: 'anemone-colony', species: 'anemone', kind: 'feeding', x: event.x, y: event.y });
        if (Math.hypot(event.x - this.player.x, event.y - this.player.y) < 5 && this.messageUntil <= this.elapsed) {
          this.setMessage('An anemone closes around a fish. The reef is hunting too.');
        }
      } else if (event.kind === 'fish-birth') {
        this.ecosystem.smallFish += 1;
        this.spawnBurst(event.x, event.y, '#8df6cf');
        if (Math.hypot(event.x - this.player.x, event.y - this.player.y) < 5 && this.messageUntil <= this.elapsed) {
          this.setMessage(`REEF NURSERY · Generation ${event.generation ?? 1} juvenile fish join the school.`);
        }
      } else if (event.kind === 'anemone-bud') {
        this.spawnBurst(event.x, event.y, '#ef9ddc');
        if (Math.hypot(event.x - this.player.x, event.y - this.player.y) < 5 && this.messageUntil <= this.elapsed) {
          this.setMessage('ANEMONE BUD · A well-fed colony establishes a young clone nearby.');
        }
      } else if (event.kind === 'natural-death' && event.species === 'reef-fish') {
        this.ecosystem.smallFish = Math.max(0, this.ecosystem.smallFish - 1);
      }
    }
    const crabPrey: CrabPreyField[] = [
      ...this.marineLife.preyField().map((fish) => ({ ...fish, kind: 'fish' as const })),
      ...this.proceduralClams.preyField().map((clam) => ({ id: clam.id, x: clam.x, y: clam.y, kind: 'clam' as const })),
    ];
    const crabEvents = this.amphibiousCrabs.update(dt, this.elapsed, {
      x: this.player.x, y: this.player.y, vx: this.player.vx, concealed: this.player.concealed,
    }, crabPrey);
    for (const event of crabEvents) {
      if (event.kind === 'predation') {
        const consumed = event.preyKind === 'fish'
          ? this.marineLife.consumeByPredator(event.preyId)
          : this.proceduralClams.consumeByPredator(event.preyId);
        if (!consumed) continue;
        if (event.preyKind === 'fish') this.ecosystem.smallFish = Math.max(0, this.ecosystem.smallFish - 1);
        else this.ecosystem.shellfish = Math.max(0, this.ecosystem.shellfish - 1);
        this.vfx.cast('feeding', new THREE.Vector3(event.x, event.y, 3.22));
        this.huntingFeedback.ingestPredatorEvent({ id: String(event.crabId ?? event.species), species: String(event.species), kind: 'feeding', x: event.x, y: event.y });
        if (Math.hypot(event.x - this.player.x, event.y - this.player.y) < 7 && this.messageUntil <= this.elapsed) {
          this.setMessage(`${event.species.replaceAll('-', ' ').toUpperCase()} FEEDS · It ${event.preyKind === 'clam' ? 'cracks a clam' : 'ambushes a low-swimming fish'}; the coastal food web shifts.`);
        }
      } else if (event.kind === 'pinch') {
        this.survival.health = clamp(this.survival.health - event.damage, 0, 100);
        this.player.vx += event.knockbackX;
        this.spawnBurst(event.x, event.y, '#a84b36');
        this.huntingFeedback.ingestPredatorEvent({ id: String(event.crabId ?? event.species), species: String(event.species), kind: 'attacked', x: event.x, y: event.y });
        this.huntingFeedback.ingestPredatorEvent({ id: String(event.crabId ?? event.species), species: String(event.species), kind: 'hit', x: event.x, y: event.y, amount: clamp(event.damage / 30, 0.05, 0.5) });
        this.lastBiteWindow = { id: String(event.crabId ?? event.species), px: event.x, py: event.y, t: this.elapsed };
        this.setMessage(`COCONUT CRAB PINCH · −${event.damage} health. Jet wash, camouflage, or keep clear of its claws.`);
      } else if (Math.hypot(event.x - this.player.x, event.y - this.player.y) < 7 && this.messageUntil <= this.elapsed) {
        this.spawnBurst(event.x, event.y, event.kind === 'birth' ? '#e6c185' : '#6f665c');
        this.setMessage(event.kind === 'birth'
          ? `CRAB BROOD · A generation ${event.generation} ${event.species.replaceAll('-', ' ')} joins the shore.`
          : `CRAB LIFE CYCLE · An old ${event.species.replaceAll('-', ' ')} returns nutrients to the coast.`);
      }
    }
    const shoalPrey = this.deepSeaShoals.preyField(this.player.x, this.player.y, 26);
    const deepEvents = this.deepSeaLife.update(dt, this.elapsed, {
      x: this.player.x,
      y: this.player.y,
      concealed: this.player.concealed,
      movementNoise: Math.hypot(this.player.vx, this.player.vy),
    }, shoalPrey);
    const importedDeepEvents = this.importedDeepFauna.update(dt, this.elapsed, {
      x: this.player.x,
      y: this.player.y,
      concealed: this.player.concealed,
    }, shoalPrey);
    const deepShoalEvents = this.deepSeaShoals.update(dt, this.elapsed, {
      x: this.player.x,
      y: this.player.y,
      concealed: this.player.concealed,
    }, [...this.deepSeaLife.predatorField(), ...this.importedDeepFauna.predatorField()]);
    this.creatureAssets.update(dt);
    for (const event of deepEvents) {
      if (event.kind === 'birth' || event.kind === 'natural-death') {
        this.spawnBurst(event.x, event.y, event.kind === 'birth' ? '#8df6cf' : '#687873');
        if (Math.hypot(event.x - this.player.x, event.y - this.player.y) < 7 && this.messageUntil <= this.elapsed) {
          const name = event.species.replaceAll('-', ' ');
          this.setMessage(event.kind === 'birth'
            ? `NEW GENERATION · A juvenile ${name} enters the food web.`
            : `LIFE CYCLE · An old ${name} dies naturally; its nutrients remain in the ecosystem.`);
        }
        continue;
      }
      if (event.kind === 'predation') {
        this.vfx.cast('feeding', new THREE.Vector3(event.x, event.y, 3.38));
        this.huntingFeedback.ingestPredatorEvent({ id: event.predatorId, species: event.predatorSpecies, kind: 'feeding', x: event.x, y: event.y });
        if (Math.hypot(event.x - this.player.x, event.y - this.player.y) < 8 && this.messageUntil <= this.elapsed) {
          const predator = event.predatorSpecies === 'orca' ? 'An orca' : event.predatorSpecies === 'sixgill-shark' ? 'A sixgill shark' : 'A gulper eel';
          const prey = event.preySpecies === 'sixgill-shark' ? 'a shark' : 'a lantern-fish school';
          this.setMessage(`${predator} consumes ${prey}. The deep food web shifts even when you are not the prey.`);
        }
        continue;
      }
      if (event.kind !== 'predator-bite') continue;
      this.survival.health = clamp(this.survival.health - event.damage, 0, 100);
      this.player.vx += event.knockbackX;
      this.player.vy += event.knockbackY;
      this.spawnBurst(event.x, event.y, '#8e2732');
      this.huntingFeedback.ingestPredatorEvent({ id: event.predatorId, species: event.species, kind: 'attacked', x: event.x, y: event.y });
      this.huntingFeedback.ingestPredatorEvent({ id: event.predatorId, species: event.species, kind: 'hit', x: event.x, y: event.y, amount: clamp(event.damage / 40, 0.05, 0.5) });
      this.lastBiteWindow = { id: event.predatorId, px: event.x, py: event.y, t: this.elapsed };
      const predator = event.species === 'orca' ? 'A pelagic orca' : event.species === 'sixgill-shark' ? 'A deep sixgill shark' : 'A gulper eel';
      this.setMessage(`${predator} strikes from the black water · −${event.damage} health. Grip a surface, ink, jet, or camouflage to break pursuit.`);
    }
    for (const event of importedDeepEvents) {
      if (event.kind === 'birth' || event.kind === 'natural-death') {
        if (Math.hypot(event.x - this.player.x, event.y - this.player.y) < 9) {
          this.spawnBurst(event.x, event.y, event.kind === 'birth' ? '#7be5d0' : '#53616b');
          if (this.messageUntil <= this.elapsed) this.setMessage(event.kind === 'birth'
            ? `DEEP BROOD · A juvenile ${event.species.replaceAll('-', ' ')} enters the habitat.`
            : `DEEP CYCLE · An old ${event.species.replaceAll('-', ' ')} returns its nutrients.`);
        }
        continue;
      }
      if (event.kind !== 'predator-bite') continue;
      this.survival.health = clamp(this.survival.health - event.damage, 0, 100);
      this.player.vx += event.knockbackX;
      this.player.vy += event.knockbackY;
      this.spawnBurst(event.x, event.y, '#9c2635');
      const importedId = typeof event.creatureId === 'string' ? event.creatureId : `imported-${event.species}`;
      this.huntingFeedback.ingestPredatorEvent({ id: importedId, species: event.species, kind: 'attacked', x: event.x, y: event.y });
      this.huntingFeedback.ingestPredatorEvent({ id: importedId, species: event.species, kind: 'hit', x: event.x, y: event.y, amount: clamp(event.damage / 40, 0.05, 0.5) });
      this.lastBiteWindow = { id: importedId, px: event.x, py: event.y, t: this.elapsed };
      this.setMessage(`${event.species.replaceAll('-', ' ').toUpperCase()} STRIKE · −${event.damage} health. Break its pursuit with ink, grip, camouflage, or chained jets.`);
    }
    for (const event of deepShoalEvents) {
      if (event.kind === 'birth') this.ecosystem.smallFish += 1;
      else this.ecosystem.smallFish = Math.max(0, this.ecosystem.smallFish - 1);
      if (event.kind === 'predation' && event.predatorId) {
        this.deepSeaLife.onShoalPredation(event.predatorId, this.elapsed);
        this.importedDeepFauna.onShoalPredation(event.predatorId, this.elapsed);
      }
      if (Math.hypot(event.x - this.player.x, event.y - this.player.y) > 10) continue;
      if (event.kind === 'predation') this.vfx.cast('feeding', new THREE.Vector3(event.x, event.y, 3.38));
      else this.spawnBurst(event.x, event.y, event.kind === 'birth' ? '#74f3d1' : '#586c75');
      if (event.kind === 'predation' && this.messageUntil <= this.elapsed) {
        const predator = event.predatorSpecies?.replaceAll('-', ' ') ?? 'deep predator';
        this.setMessage(`${predator.toUpperCase()} FEEDS · It catches and swallows a ${event.fishSpecies.replaceAll('-', ' ')}.`);
      }
    }
    this.huntingFeedback.update(dt, {
      px: this.player.x,
      py: this.player.y,
      darkness: this.depthState.darkness,
      camouflaged: this.player.concealed,
      jetRecent: this.elapsed - this.lastJetPulseElapsed < 1.2,
      predators: [
        ...this.deepSeaLife.snapshot(this.player.x, this.player.y).nearby
          .filter((entry) => entry.threat)
          .map((entry) => ({ id: entry.id, species: String(entry.species), x: Number(entry.x), y: Number(entry.y) })),
        ...this.importedDeepFauna.snapshot(this.player.x, this.player.y).nearby
          .filter((entry) => entry.threat)
          .map((entry) => ({ id: entry.id, species: String(entry.species), x: Number(entry.x), y: Number(entry.y) })),
        ...this.amphibiousCrabs.snapshot(this.player.x, this.player.y).nearby
          .filter((entry) => (entry as { behavior?: unknown }).behavior === 'pinching')
          .map((entry) => ({ id: String((entry as { id?: unknown }).id ?? 'crab'), species: String((entry as { species?: unknown }).species ?? 'crab'), x: Number(entry.x), y: Number(entry.y) })),
      ],
    });
    if (this.lastBiteWindow && this.elapsed - this.lastBiteWindow.t < 0.45) {
      if (this.huntingFeedback.noteDodge(this.lastBiteWindow.id, this.player.x, this.player.y, this.lastBiteWindow.px, this.lastBiteWindow.py, this.player.vx, this.player.vy)) {
        this.player.stamina = clamp(this.player.stamina + 3, 0, 100);
        this.setMessage('DODGED · You slipped the strike. Stamina surges back.');
        this.lastBiteWindow = null;
      }
    } else if (this.lastBiteWindow && this.elapsed - this.lastBiteWindow.t >= 0.45) {
      this.lastBiteWindow = null;
    }
    this.huntingFeedback.resetDaily(this.elapsed);
    this.updateCreatures(dt, storm);
    const survivorEvents = this.survivorOctopi.update(dt, this.elapsed, storm, { x: this.player.x, y: this.player.y });
    for (const event of survivorEvents) {
      const nearby = Math.hypot(event.x - this.player.x, event.y - this.player.y) < 8;
      if (event.kind === 'hunted') {
        this.ecosystem.smallFish = Math.max(0, this.ecosystem.smallFish - 1);
        this.vfx.cast('feeding', new THREE.Vector3(event.x, event.y, 3.2));
        if (nearby && this.messageUntil <= this.elapsed) this.setMessage('Another octopus closes eight arms around a fish and carries food toward its shelter.');
      } else if (event.kind === 'foraged') {
        this.ecosystem.kelpCover = Math.max(0, this.ecosystem.kelpCover - 0.15);
        if (nearby && this.messageUntil <= this.elapsed) this.setMessage('A neighboring octopus harvests carefully, leaving the holdfast alive.');
      } else if (event.kind === 'excavated' || event.kind === 'reinforced') {
        this.vfx.cast('dig', new THREE.Vector3(event.x, event.y, 0), new THREE.Vector2(1, 0));
        if (nearby && this.messageUntil <= this.elapsed) this.setMessage(`A neighboring octopus ${event.kind === 'excavated' ? 'scrapes out a shelter chamber' : 'presses loose stone into its den wall'}.`);
      } else if (event.kind === 'birth') {
        this.vfx.cast('bioPulse', new THREE.Vector3(event.x, event.y, 2.8));
        if (nearby) this.setMessage('A juvenile octopus emerges from a neighboring protected shelter.');
      }
    }
    const stormIncomingDays = season.id === 'storm-season' ? season.daysUntilWinter : null;
    const relationEvents = this.survivorRelations.update(dt, {
      px: this.player.x,
      py: this.player.y,
      elapsed: this.elapsed,
      storm,
      survivors: this.survivorOctopi.snapshot(this.player.x, this.player.y).nearby.map((entry) => ({
        id: String(entry.id),
        name: String(entry.name),
        x: Number(entry.x),
        y: Number(entry.y),
        distance: Number(entry.distance),
        hunger: typeof (entry as { hunger?: unknown }).hunger === 'number' ? Number((entry as { hunger?: number }).hunger) : undefined,
        ageYears: typeof (entry as { ageYears?: unknown }).ageYears === 'number' ? Number((entry as { ageYears?: number }).ageYears) : undefined,
      })),
      playerFoodCount: this.inventory.food,
      playerDenIds: this.denNetwork.snapshot(this.player.x, this.player.y).sites.filter((site) => site.discovered && !site.destroyed).map((site) => site.id),
      museumDens: Math.min(3, this.denNetwork.serializeState().filter((site) => !site.destroyed && site.artifacts.includes('museum-fossil')).length),
      stormIncomingDays,
    });
    for (const relationEvent of relationEvents) {
      if (relationEvent.type === 'turn-predator' || relationEvent.type === 'food-theft') this.setMessage(relationEvent.detail);
      else if (this.messageUntil <= this.elapsed) this.setMessage(relationEvent.detail);
    }
    this.ecoSampleAccumulator += dt;
    if (this.ecoSampleAccumulator >= 0.5) {
      this.ecoSampleAccumulator = 0;
      const entries = this.ecologyJournal.observeEcosystem(this.ecoBaseline, this.ecosystem, this.elapsed);
      if (entries.length > 0 && this.messageUntil <= this.elapsed) {
        this.setMessage(`ECOLOGY · ${entries[0].title} [P]`);
      }
      this.ecoBaseline = { ...this.ecosystem };
    }
    this.processRegrowth();
    this.trees.update(this.elapsed, storm);
    this.toolUseVisuals.update(this.elapsed, this.player);
    this.denDecorations.update(this.elapsed, storm);
    const denTotals = this.denNetwork.totals();
    this.denBuilder.update(dt, {
      px: this.player.x,
      py: this.player.y,
      braces: denTotals.braces,
      lamps: denTotals.bioLights,
      foodStored: denTotals.foodStored,
    });
    this.vfx.update(dt);
    this.checkDiscoveries();
    this.checkTimeline();
    this.updateCamera(dt);
    this.updateDepthRendering();
    this.pointerAim.updateVisual(this.player.x, this.player.y, this.player.facing, this.elapsed, this.mode === 'playing' && !this.craftOpen && !this.atlasOpen, this.camera);
    this.uiAccumulator += dt;
    if (this.uiAccumulator >= 0.1) {
      this.uiAccumulator %= 0.1;
      this.updateUI();
    }
    this.keys.pressed.clear();

    if (this.elapsed > this.nextAutosave) {
      this.save();
      this.nextAutosave = this.elapsed + 10;
    }
  }

  private animateAmbient(dt: number): void {
    this.elapsed += dt * 0.12;
    this.updateEntities(dt, 0);
    this.minerals.update(this.elapsed);
    this.relics.update(this.elapsed);
    this.marineLife.update(dt, this.elapsed, 0, {
      x: this.player.x,
      y: this.player.y,
      facing: this.player.facing,
      concealed: this.player.concealed,
    });
    this.amphibiousCrabs.update(dt, this.elapsed, {
      x: this.player.x, y: this.player.y, vx: this.player.vx, concealed: this.player.concealed,
    }, [
      ...this.marineLife.preyField().map((fish) => ({ ...fish, kind: 'fish' as const })),
      ...this.proceduralClams.preyField().map((clam) => ({ id: clam.id, x: clam.x, y: clam.y, kind: 'clam' as const })),
    ]);
    const shoalPrey = this.deepSeaShoals.preyField(this.player.x, this.player.y, 26);
    this.deepSeaLife.update(dt, this.elapsed, {
      x: this.player.x,
      y: this.player.y,
      concealed: this.player.concealed,
      movementNoise: Math.hypot(this.player.vx, this.player.vy),
    }, shoalPrey);
    this.importedDeepFauna.update(dt, this.elapsed, {
      x: this.player.x,
      y: this.player.y,
      concealed: this.player.concealed,
    }, shoalPrey);
    this.deepSeaShoals.update(dt, this.elapsed, {
      x: this.player.x,
      y: this.player.y,
      concealed: this.player.concealed,
    }, [...this.deepSeaLife.predatorField(), ...this.importedDeepFauna.predatorField()]);
    this.creatureAssets.update(dt);
    this.updateCreatures(dt, 0);
    this.survivorOctopi.update(dt, this.elapsed, 0, { x: this.player.x, y: this.player.y });
    this.trees.update(this.elapsed, 0);
    this.toolUseVisuals.update(this.elapsed, this.player);
    this.denDecorations.update(this.elapsed, 0);
    this.pointerAim.updateVisual(this.player.x, this.player.y, this.player.facing, this.elapsed, false, this.camera);
    this.vfx.update(dt);
    this.oceanSurface.update(this.elapsed, 0, 0, 0);
    this.bubbles.update(this.elapsed, this.renderer.domElement.height, this.viewHeight, 1);
    this.world.updateTexture(this.elapsed, 0);
  }

  private handleFishHunt(): void {
    const hasNet = this.toolbelt.isEquipped('net', this.inventory);
    const huntEfficiency = 1 - this.octipoints.effect('huntEfficiency');
    const survivorTarget = this.survivorOctopi.nearest(this.player.x, this.player.y, 1.62, this.player.facing);
    if (survivorTarget) {
      const requiredStamina = 22 * huntEfficiency;
      if (this.player.stamina < requiredStamina) {
        this.setMessage(`${survivorTarget.name} tears free. Devouring another octopus needs 22 stamina and a close forward grip.`);
        return;
      }
      const result = this.survivorOctopi.devour({
        x: this.player.x,
        y: this.player.y,
        facing: this.player.facing,
      }, this.elapsed);
      if (result.reason === 'cooldown') {
        this.setMessage(`Your beak and arms need ${result.cooldownRemaining.toFixed(1)} seconds before another conspecific strike.`);
        return;
      }
      if (result.caught && result.x !== undefined && result.y !== undefined) {
        const direction = new THREE.Vector2(result.x - this.player.x, result.y - this.player.y);
        if (direction.lengthSq() < 0.01) direction.set(this.player.facing, 0);
        direction.normalize();
        this.player.vx += direction.x * 2.7;
        this.player.vy += direction.y * 2.7;
        this.player.stamina = clamp(this.player.stamina - result.staminaCost * huntEfficiency, 0, 100);
        this.player.technique = 'conspecific grapple';
        this.player.techniqueTimer = 0.78;
        this.survival.hunger = clamp(this.survival.hunger + result.nutrition, 0, 100);
        this.survival.health = clamp(this.survival.health + result.healthRestore, 0, 100);
        this.inventory.food += Math.max(0, Math.round(result.cachedFood * this.seasonalWorld.foodScarcityFactor));
        this.vfx.cast('hunt', new THREE.Vector3(this.player.x, this.player.y, 0), direction);
        this.vfx.cast('feeding', new THREE.Vector3(result.x, result.y, 3.25));
        this.spawnBurst(result.x, result.y, '#8f3040');
        this.sound.pulse('hunt');
        this.recordOctoExperience('hunting', 54, `Devoured rival octopus ${result.name}`);
        const betrayal = this.survivorRelations.betray(String(result.survivorId ?? result.name), result.name);
        if (this.messageUntil <= this.elapsed || betrayal.turnedPredator) {
          this.setMessage(`CONSPECIFIC PREDATION WITNESSED · ${betrayal.detail}${betrayal.turnedPredator ? ` ${result.name} now hunts you.` : ''}`);
        }
        this.tutorial.notify('hunted');
        const cacheNotice = result.cachedFood > 0 ? ` Its shelter sling yields ${result.cachedFood} stored food.` : '';
        this.setMessage(`CONSPECIFIC PREDATION · Eight arms overpower ${result.name}. +${result.nutrition} hunger, +${result.healthRestore} health.${cacheNotice}`);
      }
      return;
    }
    const crabTarget = this.amphibiousCrabs.nearest(this.player.x, this.player.y, hasNet ? 2.45 : 1.48);
    if (crabTarget) {
      const crabResult = this.amphibiousCrabs.hunt({ x: this.player.x, y: this.player.y, facing: this.player.facing }, hasNet);
      const crabStaminaCost = crabResult.staminaCost * (1 - this.octipoints.effect('huntEfficiency'));
      if (crabResult.reason === 'cooldown') {
        this.setMessage(`Your arms need ${crabResult.cooldownRemaining.toFixed(1)} seconds before another pounce.`);
        return;
      }
      if (this.player.stamina < crabStaminaCost) {
        this.setMessage('Too exhausted to pin the crab without meeting its claws.');
        return;
      }
      if (crabResult.caught && crabResult.x !== undefined && crabResult.y !== undefined) {
        this.player.stamina = clamp(this.player.stamina - crabStaminaCost, 0, 100);
        this.player.technique = hasNet ? 'crab net' : 'crab grapple';
        this.player.techniqueTimer = 0.62;
        this.inventory.food += Math.max(1, Math.round(crabResult.foodYield * this.seasonalWorld.foodScarcityFactor));
        this.inventory.shellFragments += 1;
        this.vfx.cast('hunt', new THREE.Vector3(this.player.x, this.player.y, 0), new THREE.Vector2(crabResult.x - this.player.x, crabResult.y - this.player.y));
        this.spawnBurst(crabResult.x, crabResult.y, '#dc885e');
        this.sound.pulse('hunt');
        this.huntingFeedback.markRemains(crabResult.x, crabResult.y, 'crab');
        this.recordOctoExperience('hunting', 30, `Hunted ${crabResult.label}`);
        this.tutorial.notify('hunted');
        this.setMessage(`${hasNet ? 'The net pins' : 'Eight arms overpower'} ${crabResult.label}. +${crabResult.foodYield} food, +1 carapace fragment`);
      }
      return;
    }
    if (!this.player.underwater) {
      this.setMessage('No crab is within reach; fish hunting requires water around the mantle.');
      return;
    }
    const requiredStamina = (hasNet ? 8 : 12) * huntEfficiency;
    if (this.player.stamina < requiredStamina) {
      this.setMessage('Too exhausted to pounce. Brace or drift until your arms recover.');
      return;
    }
    const inDeepHabitat = this.player.y < -14;
    const result = inDeepHabitat
      ? this.deepSeaShoals.hunt({ x: this.player.x, y: this.player.y, facing: this.player.facing }, hasNet)
      : this.marineLife.hunt({
        x: this.player.x,
        y: this.player.y,
        facing: this.player.facing,
        concealed: this.player.concealed,
      }, hasNet);
    if (result.reason === 'cooldown') {
      this.setMessage(`Your arms need ${result.cooldownRemaining.toFixed(1)} seconds before another pounce.`);
      return;
    }
    this.player.stamina = clamp(this.player.stamina - result.staminaCost * huntEfficiency, 0, 100);
    this.player.technique = hasNet ? 'net sweep' : 'fish pounce';
    this.player.techniqueTimer = 0.55;
    if (!result.caught || result.x === undefined || result.y === undefined) {
      this.player.vx += this.player.facing * 1.2;
      this.setMessage(`The school scatters beyond your ${hasNet ? 'net' : 'suckers'}. Close the distance and pounce again.`);
      return;
    }
    const direction = new THREE.Vector2(result.x - this.player.x, result.y - this.player.y);
    if (direction.lengthSq() < 0.01) direction.set(this.player.facing, 0);
    this.player.vx += direction.clone().normalize().x * 2.4;
    this.player.vy += direction.clone().normalize().y * 2.4;
    this.player.stamina = clamp(this.player.stamina, 0, 100);
    this.inventory.food += 1;
    this.ecosystem.smallFish = Math.max(0, this.ecosystem.smallFish - 1);
    this.vfx.cast('hunt', new THREE.Vector3(this.player.x, this.player.y, 0), direction);
    this.spawnBurst(result.x, result.y, hasNet ? '#9cf0d1' : '#f0ad79');
    this.sound.pulse('hunt');
    this.huntingFeedback.markRemains(result.x, result.y, 'fish');
    this.recordOctoExperience('hunting', inDeepHabitat ? 34 : 26, `Hunted ${inDeepHabitat ? 'a deep-sea fish' : 'a reef fish'}`);
    this.tutorial.notify('hunted');
    this.setMessage(`${hasNet ? 'The net folds around' : 'Eight arms close on'} ${result.fishId}. +1 fresh fish`);
  }

  private animateToolUse(action: ToolUseAction, direction: THREE.Vector2, toolId?: ToolId, label?: string): void {
    const selected = this.toolbelt.selectedDefinition(this.inventory);
    const id = toolId ?? selected.id;
    const toolLabel = label ?? TOOL_DEFINITIONS.find((definition) => definition.id === id)?.label ?? selected.label;
    this.player.performToolUse(action, direction, toolLabel.toLowerCase());
    this.toolUseVisuals.play(id, action, this.elapsed, direction);
  }

  private handleDig(): void {
    if (this.player.stamina < 5) {
      this.setMessage('Too exhausted to dig. Rest or brace.');
      return;
    }
    const activeTool = this.toolbelt.selectedDefinition(this.inventory);
    if (!activeTool.dig) {
      this.setMessage(`${activeTool.label} is not shaped for excavation. Switch to bare arms, a shell spade, or a stone hammer.`);
      return;
    }
    const toolStrength = activeTool.dig.strength;
    const effectiveStrength = toolStrength * NORMAL_DIG_POWER_MULTIPLIER
      * (this.player.braced ? 1.25 : 1)
      * (1 + this.octipoints.effect('digPower'));
    const radius = activeTool.dig.radius * (1 + this.octipoints.effect('digRadius'));
    this.pointerAim.syncCamera(this.camera);
    const aimState = this.pointerAim.snapshot(this.player.x, this.player.y, this.player.facing);
    const aimDirection = new THREE.Vector2(aimState.directionX, aimState.directionY).normalize();
    if (Math.abs(aimDirection.x) > 0.08) this.player.facing = Math.sign(aimDirection.x);
    this.animateToolUse('dig', aimDirection, activeTool.id, activeTool.label);
    let point = this.player.digPoint(aimDirection);
    const digRadius = radius * DIG_RADIUS_MULTIPLIER;
    let result = this.world.dig(point.x, point.y, digRadius, effectiveStrength);
    // If the forward arms meet open water, naturally rake down toward the substrate.
    if (result.removed === 0 && !result.blocked && !aimState.active) {
      point = { x: this.player.x + this.player.facing * 0.34, y: this.player.y - 0.64 };
      result = this.world.dig(point.x, point.y, digRadius, effectiveStrength);
    }
    const learnedJetBlast = this.jetBlast.trainExcavation(result.removed, result.chipped);
    if (result.removed > 0) {
      this.excavatedCellsForExperience += result.removed;
      if (this.excavatedCellsForExperience >= 120) {
        this.excavatedCellsForExperience -= 120;
        this.recordOctoExperience('excavation', 18, 'Excavated and learned from 120 microcells');
      }
      this.tutorial.notify('dug');
      this.discoveries.notifyDig(point.x, point.y);
      const cost = Math.max(2.4, result.removed * 0.11) * (this.player.braced ? 0.68 : 1);
      this.player.stamina = clamp(this.player.stamina - cost, 0, 100);
      const mineralDrops = this.minerals.spawnFromExcavation(result.material, result.removed, point.x, point.y, this.depthState.canonicalDepthM);
      const relicDrops = this.relics.spawnFromExcavation(result.material, result.removed, point.x, point.y, this.depthState.canonicalDepthM);
      this.sound.dig(activeTool.id, result.material);
      this.vfx.cast('dig', new THREE.Vector3(point.x, point.y, 0), aimDirection);
      this.spawnBurst(point.x, point.y, result.material === MaterialId.Sand ? '#d7bb80' : '#8c8872');
      const mineralNotice = mineralDrops.length
        ? ` ${mineralDrops.map((drop) => this.minerals.definition(drop.mineral).label).join(' and ')} broke loose—collect with E.`
        : '';
      const relicNotice = relicDrops.length
        ? ` RARE FIND · ${this.relics.definition(relicDrops[0].relic).label} emerged from the sediment.`
        : '';
      this.setMessage(`${activeTool.label} displaced ${result.removed} microcells of ${MATERIAL_NAMES[result.material]}.${mineralNotice}${relicNotice}`);
    } else if (result.chipped > 0) {
      const cost = 3.4 * (this.player.braced ? 0.72 : 1);
      this.player.stamina = clamp(this.player.stamina - cost, 0, 100);
      this.sound.dig(activeTool.id, result.material);
      this.vfx.cast('dig', new THREE.Vector3(point.x, point.y, 0), aimDirection);
      this.spawnBurst(point.x, point.y, '#72594f');
      const action = activeTool.id === 'arms' ? 'slowly fracture' : 'slowly fractures';
      this.setMessage(`${activeTool.label} ${action} ${MATERIAL_NAMES[result.material]} · ${Math.round(result.fractureProgress * 100)}%. Hold X to keep scraping.`);
    } else if (result.blocked) {
      this.setMessage(`${MATERIAL_NAMES[result.material]} cannot be fractured with this grip. Shape something stronger.`);
    } else {
      this.setMessage('Reach a diggable surface with your forward arms.');
    }
    if (learnedJetBlast) {
      this.showBanner('Technique learned', 'Jet Blast mastered · aim with the mouse and right-click or press K underwater.', 5.2);
      this.setMessage('JET BLAST LEARNED · Fill all three chambers and 70 stamina, then RMB or K to release it.');
    }
  }

  private handleHeldOrganismDig(): boolean {
    const clam = this.proceduralClams.held();
    const worm = this.deepTubeWorms.held();
    if (!clam && !worm) return false;
    if (this.player.stamina < 4) {
      this.setMessage('Your arms tremble. Rest before forcing the grip farther.');
      return true;
    }
    const tool = this.toolbelt.selectedDefinition(this.inventory);
    const clamForce: Record<string, number> = {
      arms: 0.24, shellBlade: 0.28, shellSpade: 0.34, stoneHammer: 0.42, stoneWedge: 0.58, stoneAdze: 0.48, boneHook: 0.4,
    };
    const wormDamage: Record<string, number> = {
      arms: 1, shellBlade: 2, shellSpade: 1, stoneHammer: 2, stoneWedge: 2, stoneAdze: 2, boneHook: 1,
    };
    if (clam) {
      this.animateToolUse('pry', new THREE.Vector2(0, 1), tool.id, tool.label);
      const result = this.proceduralClams.pryHeld((clamForce[tool.id] ?? 0.2) * (1 + this.octipoints.effect('clamPry')))!
      this.player.stamina = clamp(this.player.stamina - (tool.id === 'arms' ? 5.2 : 3.4), 0, 100);
      this.vfx.cast('dig', new THREE.Vector3(result.x, result.y, 0), new THREE.Vector2(0, 1));
      this.sound.dig(tool.id, MaterialId.CrushedShell);
      if (result.opened) {
        this.inventory.food += 1;
        this.inventory.largeShell += 1;
        if (result.pearlBearing) this.inventory.shellFragments += 1;
        this.ecosystem.shellfish = Math.max(0, this.ecosystem.shellfish - 1);
        this.spawnBurst(result.x, result.y, '#f4c4a0');
        this.recordOctoExperience('foraging', 22, 'Opened a living clam without destroying its shell');
        this.setMessage(`CLAM OPENED · ${tool.label} and eight-arm leverage preserve the shell. +1 nutritious clam, +1 intact shell${result.pearlBearing ? ', +1 nacre fragment' : ''}.`);
      } else {
        this.setMessage(`PEELING CLAM · Sucker tension holds while ${tool.label.toLowerCase()} works the seam · ${Math.round(result.progress * 100)}%. Keep digging.`);
      }
      return true;
    }
    this.animateToolUse('cut', new THREE.Vector2(0, -1), tool.id, tool.label);
    const result = this.deepTubeWorms.cutHeld(wormDamage[tool.id] ?? 1)!;
    this.player.stamina = clamp(this.player.stamina - (tool.id === 'arms' ? 6 : 4), 0, 100);
    this.vfx.cast('dig', new THREE.Vector3(result.x, result.y, 0), new THREE.Vector2(0, -1));
    this.sound.dig(tool.id, MaterialId.Mud);
    if (result.harvested) {
      this.inventory.tubeWormMeat += 1;
      this.recordOctoExperience('hunting', 38, 'Survived a defensive vent-worm harvest');
      this.spawnBurst(result.x, result.y, '#ff9a63');
      this.setMessage('VENT WORM HARVESTED · +1 nutrient-dense worm flesh. A restorative thermal vesicle dropped nearby—collect it with E and save it for U/HEAL.');
    } else {
      this.setMessage(`CUTTING VENT WORM · It recoils around the tool. ${result.remainingHealth}/3 resistance remains; expect another hot spray.`);
    }
    return true;
  }

  private handleJetBlast(): void {
    const failure = this.jetBlast.readiness(this.player.stamina, this.player.jetCharges, this.player.underwater);
    if (failure) {
      this.setMessage(failure);
      return;
    }
    const keyboardCast = this.keys.pressed.has('KeyK') && !this.keys.pressed.has('MouseRight');
    let direction: THREE.Vector2;
    if (keyboardCast) {
      const axisX = Number(this.keys.held.has('KeyD') || this.keys.held.has('ArrowRight'))
        - Number(this.keys.held.has('KeyA') || this.keys.held.has('ArrowLeft'));
      const axisY = Number(this.keys.held.has('KeyW') || this.keys.held.has('ArrowUp'))
        - Number(this.keys.held.has('KeyS') || this.keys.held.has('ArrowDown'));
      if (axisX !== 0 || axisY !== 0) direction = new THREE.Vector2(axisX, axisY).normalize();
      else if (this.player.underwater && Math.hypot(this.player.vx, this.player.vy) > 0.35) {
        direction = new THREE.Vector2(this.player.vx, this.player.vy).normalize();
      } else direction = new THREE.Vector2(this.player.facing, 0);
    } else {
      this.pointerAim.syncCamera(this.camera);
      direction = this.pointerAim.directionFrom(this.player.x, this.player.y, this.player.facing).clone();
    }
    const origin = new THREE.Vector2(this.player.x, this.player.y);
    const cast = this.jetBlast.cast(this.world, origin, direction);
    this.player.performJetBlast(direction, this.jetBlast.staminaCost);
    this.sound.pulse('blast');
    this.sound.play('jetBlastImpact', { delaySeconds: 0.08 });

    const pushed = this.marineLife.applyJet(origin.x, origin.y, direction, 3.4)
      + this.deepSeaLife.applyJet(origin.x, origin.y, direction, this.elapsed, 3.4)
      + this.deepSeaShoals.applyJet(origin.x, origin.y, direction, this.elapsed, 3.4)
      + this.importedDeepFauna.applyJet(origin.x, origin.y, direction, this.elapsed, 3.4)
      + this.amphibiousCrabs.applyJet(origin.x, origin.y, direction, this.elapsed, 3.4)
      + this.applySurfaceJet(origin.x, origin.y, direction, 3.4);
    const deepImpact = this.deepSeaLife.applyJetBlast(origin.x, origin.y, direction, this.elapsed);
    const importedImpact = this.importedDeepFauna.applyJetBlast(origin.x, origin.y, direction, this.elapsed);
    const hits = [...deepImpact.hits, ...importedImpact.hits];
    const killed = deepImpact.killed + importedImpact.killed;

    this.vfx.cast('jetBlast', new THREE.Vector3(origin.x, origin.y, 0), direction);
    this.vfx.cast('twist', new THREE.Vector3(cast.target.x, cast.target.y, 0));
    this.spawnBurst(cast.target.x, cast.target.y, '#baffef');
    for (const hit of hits) {
      this.spawnBurst(hit.x, hit.y, hit.killed ? '#c72540' : '#73e9dc');
      if (hit.killed) this.vfx.cast('feeding', new THREE.Vector3(hit.x, hit.y, 3.4));
    }
    const mineralDrops = this.minerals.spawnFromExcavation(
      cast.terrain.material, cast.terrain.removed, cast.target.x, cast.target.y, this.depthState.canonicalDepthM,
    );
    const relicDrops = this.relics.spawnFromExcavation(
      cast.terrain.material, cast.terrain.removed, cast.target.x, cast.target.y, this.depthState.canonicalDepthM,
    );
    const mineralNotice = mineralDrops.length ? ` ${mineralDrops.length} mineral fragment${mineralDrops.length === 1 ? '' : 's'} broke free.` : '';
    const relicNotice = relicDrops.length ? ` Rare find: ${this.relics.definition(relicDrops[0].relic).label}.` : '';
    if (killed > 0) {
      this.setMessage(`JET BLAST · ${killed} predator${killed === 1 ? '' : 's'} ruptured, ${cast.terrain.removed} terrain cells cleared.${mineralNotice}${relicNotice}`);
    } else {
      this.setMessage(`JET BLAST · ${cast.terrain.removed} terrain cells cleared and ${pushed} animal${pushed === 1 ? '' : 's'} thrown back.${mineralNotice}${relicNotice}`);
    }
  }

  private handleInteract(): void {
    if (this.discoveries.recoverNearest(this.player.x, this.player.y)) {
      const found = this.discoveries.latestRecovery();
      this.sound.collect('generic');
      if (found) {
        if (found.kind === 'fossils') {
          this.inventory.fossil += 1;
          this.setMessage(`${found.label} recovered · +1 fossil specimen. Press V inside a den to mount it.`);
        } else if (found.kind === 'geothermal') {
          this.inventory.heaterCore += 1;
          this.setMessage(`${found.label} recovered · +1 geothermal core. Press V inside a den to install it.`);
        } else {
          this.setMessage(`${found.label} recovered · logged in the Codex of the Tide [0].`);
        }
      }
      return;
    }
    const relicDrop = this.relics.nearest(this.player.x, this.player.y, 1.55);
    if (relicDrop) {
      const relic = this.relics.collect(relicDrop);
      if (relic.id === 'stone-adze') this.inventory.stoneAdze += 1;
      this.sound.collect('mineral');
      this.spawnBurst(relicDrop.x, relicDrop.y, relic.color);
      this.setMessage(`${relic.category.toUpperCase()} · ${relic.label}. ${relic.use}`);
      this.refreshHotbar(true);
      return;
    }
    const mineralDrop = this.minerals.nearest(this.player.x, this.player.y, 1.55);
    if (mineralDrop) {
      const mineral = this.minerals.collect(mineralDrop);
      this.inventory[mineral.id] += 1;
      this.sound.collect('mineral');
      this.spawnBurst(mineralDrop.x, mineralDrop.y, mineral.color);
      this.setMessage(`${mineral.label} collected. ${mineral.use}`);
      return;
    }
    const nearbyEntity = this.nearestEntity(1.55);
    const entityDistance = nearbyEntity && nearbyEntity.kind !== 'vent'
      ? Math.hypot(nearbyEntity.x - this.player.x, nearbyEntity.y - this.player.y)
      : Infinity;
    const supplyRange = 1.55 + this.octipoints.effect('mineralSense');
    const supplyDrop = this.supplies.nearest(this.player.x, this.player.y, supplyRange);
    const supplyDistance = supplyDrop ? Math.hypot(supplyDrop.x - this.player.x, supplyDrop.y - this.player.y) : Infinity;
    const looseTargetDistance = Math.min(entityDistance, supplyDistance);
    const healthDrop = this.deepTubeWorms.nearestHealthDrop(this.player.x, this.player.y, 1.55);
    if (healthDrop) {
      this.deepTubeWorms.collectHealthDrop(healthDrop);
      this.inventory.ventTonic += 1;
      this.sound.collect('biolight');
      this.spawnBurst(healthDrop.x, healthDrop.y, '#ffbd68');
      this.setMessage('RESTORATIVE VESICLE COLLECTED · Stored safely. Press U or tap HEAL later to restore health.');
      return;
    }
    const worm = this.deepTubeWorms.nearest(this.player.x, this.player.y, 1.62);
    if (worm && Math.hypot(worm.x - this.player.x, worm.y + worm.height * 0.45 - this.player.y) < looseTargetDistance) {
      this.proceduralClams.release();
      this.heldEntity = null;
      const spray = this.deepTubeWorms.grip(worm, this.elapsed, this.player.x, this.player.y);
      this.setMessage('VENT WORM GRIPPED · Aim and dig to cut it free. Its crown is pressurizing superheated mineral fluid.');
      if (spray) this.applyTubeWormSpray(spray);
      return;
    }
    const clam = this.proceduralClams.nearest(this.player.x, this.player.y, 1.55);
    if (clam && Math.hypot(clam.x - this.player.x, clam.y - this.player.y) < looseTargetDistance) {
      this.deepTubeWorms.release();
      this.heldEntity = null;
      this.proceduralClams.grip(clam);
      this.setMessage('CLAM GRIPPED · Suckers hold both valves. Aim at the seam and dig [X / LMB] repeatedly to peel it open.');
      return;
    }
    if (supplyDrop && supplyDistance <= entityDistance) {
      const supply = this.supplies.collect(supplyDrop);
      this.inventory[supply.id] += 1;
      this.sound.collect('generic');
      this.spawnBurst(supplyDrop.x, supplyDrop.y, supply.color);
      this.recordOctoExperience('foraging', 14, `Discovered ${supply.label}`, `supply:${supplyDrop.id}`);
      this.setMessage(`${supply.label} collected. ${supply.use}`);
      return;
    }
    const entity = nearbyEntity;
    if (!entity) {
      const tree = this.treeInteraction.snapshot(this.player.x, this.player.y).nearest;
      if (tree && tree.distance < 0.85) {
        this.setMessage(`Suckers can hold the ${tree.variant.replaceAll('-', ' ')} bark. Hold G, then W/S to climb or hide against the trunk.`);
        return;
      }
      if (this.denNetwork.currentDen(this.player.x, this.player.y)) this.setMessage('This den chamber is secure. Press V to place gear, G to add mineral reinforcement.');
      else this.setMessage('Your suckers sense no loose object within reach.');
      return;
    }
    if (entity.kind === 'kelp' || entity.kind === 'bush') {
      if (this.toolbelt.isEquipped('shellBlade', this.inventory)) {
        entity.gathered = true;
        const bonusFiber = this.octipoints.effect('harvestYield');
        this.scheduleRegrowth(entity.id);
        this.inventory.fibers += Math.max(1, Math.round((3 + bonusFiber) * this.seasonalWorld.foodScarcityFactor));
        this.inventory.kelp += 1;
        this.ecosystem.kelpCover = Math.max(0, this.ecosystem.kelpCover - 2);
        this.recordOctoExperience('foraging', 10, 'Cut marine vegetation while preserving its holdfast');
        this.tutorial.notify('gathered');
        this.setMessage(`You cut the stalk cleanly. The holdfast will regrow. +${3 + bonusFiber} fiber, +1 kelp`);
        this.sound.collect('fiber');
        this.hideEntity(entity);
      } else {
        this.heldEntity = entity.id;
        this.setMessage('Holdfast gripped. Brace [B] against terrain, then Twist [Q].');
      }
      return;
    }
    if (entity.kind === 'glow') {
      entity.gathered = true;
      this.hideEntity(entity);
      this.inventory.glowKelp += 1;
      this.bioluminescence.addCarried();
      this.tutorial.notify('gathered');
      this.vfx.cast('bioPulse', new THREE.Vector3(entity.x, entity.y + 0.45, 0));
      this.sound.collect('biolight');
      this.setMessage(`Bioluminescent seaweed wraps around one arm. Each sparse frond burns for ${Math.round(this.bioluminescence.lifetimePerFrondSeconds)} seconds; stacks extend the reserve. +1 glow kelp`);
      return;
    }
    entity.gathered = true;
    this.hideEntity(entity);
    if (entity.kind === 'scallop') {
      this.inventory.food += 1;
      if (this.toolbelt.isEquipped('stoneWedge', this.inventory)) {
        this.inventory.largeShell += 1;
        this.setMessage('You pry the scallop cleanly. +1 food, +1 intact shell');
      } else {
        this.inventory.sharpShell += 1;
        this.inventory.shellFragments += 1;
        this.setMessage('You crush the scallop against stone. +1 food, +shell fragments');
      }
      this.ecosystem.shellfish = Math.max(0, this.ecosystem.shellfish - 1);
    } else if (entity.kind === 'stone') {
      this.inventory.stone += 1;
      this.setMessage('A palm-sized stone with a good striking edge. +1 stone');
    } else if (entity.kind === 'wood') {
      this.inventory.wood += 1;
      this.setMessage('Storm-seasoned driftwood. +1 wood');
    } else if (entity.kind === 'bone') {
      this.inventory.bone += 1;
      this.setMessage('A hollow future-bird bone. +1 bone');
    } else if (entity.kind === 'vent') {
      entity.gathered = false;
      this.setMessage('Superheated mineral water. Your skin recoils from the plume.');
    }
    this.tutorial.notify('gathered');
    this.sound.collect(entity.kind === 'stone' ? 'stone' : entity.kind === 'wood' ? 'wood' : 'generic');
  }

  private handleTwist(): void {
    this.vfx.cast('twist', new THREE.Vector3(this.player.x, this.player.y, 0));
    if (!this.heldEntity) {
      this.setMessage('Twist rotates your body around a held object. Grab something first [E].');
      return;
    }
    const entity = this.entities.find((item) => item.id === this.heldEntity && !item.gathered);
    if (!entity) {
      this.heldEntity = null;
      return;
    }
    if (!this.player.braced) {
      this.setMessage('The holdfast pulls you forward. Brace [B] before twisting.');
      return;
    }
    if (Math.hypot(entity.x - this.player.x, entity.y - this.player.y) > 1.8) {
      this.heldEntity = null;
      this.setMessage('The grip slipped.');
      return;
    }
    entity.gathered = true;
    this.hideEntity(entity);
    const bonusFiber = this.octipoints.effect('harvestYield');
    const uprootedFiber = Math.max(1, Math.round(((entity.kind === 'kelp' ? 5 : 4) + bonusFiber) * this.seasonalWorld.foodScarcityFactor));
    this.inventory.fibers += uprootedFiber;
    this.inventory.kelp += entity.kind === 'kelp' ? 2 : 1;
    this.ecosystem.kelpCover = Math.max(0, this.ecosystem.kelpCover - 12);
    this.ecosystem.sedimentStability = Math.max(0, this.ecosystem.sedimentStability - 7);
    this.player.stamina = clamp(this.player.stamina - 13, 0, 100);
    this.heldEntity = null;
    this.sound.collect('fiber');
    this.recordOctoExperience('foraging', 8, 'Learned from uprooting a holdfast and exposing sediment');
    this.setMessage(`The roots tear free. Rich harvest—but the sediment is now exposed. +${uprootedFiber} fiber, +${entity.kind === 'kelp' ? 2 : 1} kelp`);
  }

  private eat(): void {
    if (this.inventory.seasonedFood > 0) {
      this.inventory.seasonedFood -= 1;
      this.survival.hunger = clamp(this.survival.hunger + 46, 0, 100);
      this.survival.health = clamp(this.survival.health + 8, 0, 100);
      this.setMessage('Salt-cured food restores more hunger and keeps longer in a den cache.');
      return;
    }
    if (this.inventory.tubeWormMeat > 0) {
      this.inventory.tubeWormMeat -= 1;
      this.survival.hunger = clamp(this.survival.hunger + 54, 0, 100);
      this.survival.health = clamp(this.survival.health + 11, 0, 100);
      this.setMessage('Protein-rich vent worm flesh restores 54 hunger and 11 health. The mineral heat lingers in your mantle.');
      return;
    }
    if (this.inventory.food <= 0) {
      this.setMessage('No edible food in your sling.');
      return;
    }
    this.inventory.food -= 1;
    this.survival.hunger = clamp(this.survival.hunger + 32, 0, 100);
    this.survival.health = clamp(this.survival.health + 5, 0, 100);
    this.setMessage('A quick meal restores hunger and a little health.');
  }

  private useVentTonic(): void {
    if (this.inventory.ventTonic <= 0) {
      this.setMessage('No restorative vent vesicle stored. Deep tube worms sometimes drop them when harvested.');
      return;
    }
    if (this.survival.health >= 100) {
      this.setMessage('Health is already full. Save the vent tonic for a dangerous dive.');
      return;
    }
    this.inventory.ventTonic -= 1;
    const restored = Math.min(34, 100 - this.survival.health);
    this.survival.health = clamp(this.survival.health + 34, 0, 100);
    this.survival.temperature = clamp(this.survival.temperature + 2.5, -10, 70);
    this.vfx.cast('bioPulse', new THREE.Vector3(this.player.x, this.player.y, 3.4));
    this.sound.collect('biolight');
    this.setMessage(`VENT TONIC USED · regenerative proteins restore ${restored.toFixed(0)} health. The empty vesicle collapses.`);
  }

  private applyTubeWormSpray(event: TubeWormSprayEvent): void {
    const direction = new THREE.Vector2(event.targetX - event.x, event.targetY - event.y);
    if (direction.lengthSq() < 0.001) direction.set(0, 1);
    direction.normalize();
    this.survival.health = clamp(this.survival.health - event.damage, 0, 100);
    this.survival.temperature = clamp(this.survival.temperature + 7, -10, 70);
    this.player.vx += direction.x * 1.7;
    this.player.vy += direction.y * 1.7;
    this.vfx.cast('vent', new THREE.Vector3(event.x, event.y, 3.6), direction);
    this.spawnBurst(event.targetX, event.targetY, '#ff7f45');
    this.setMessage(`THERMAL SPRAY · The vent worm blasts ${event.heatC}°C mineral fluid. −${event.damage} health; keep cutting or release the grip.`);
  }

  private seasonFood(): void {
    if (this.inventory.salt <= 0 || this.inventory.food <= 0) {
      this.setMessage('Seasoning needs one sea-salt crystal and one fresh food.');
      return;
    }
    this.inventory.salt -= 1;
    this.inventory.food -= 1;
    this.inventory.seasonedFood += 1;
    this.sound.play('craftSuccess');
    this.setMessage('Salt worked into the food. +1 seasoned meal with improved restoration and storage life.');
  }

  private claimDen(): void {
    const result = this.denNetwork.claim(this.player.x, this.player.y, this.world);
    if (result.reason === 'existing') {
      this.setMessage(`${result.site?.name ?? 'This den'} is already part of your network.`);
      return;
    }
    if (result.reason === 'too-small') {
      this.setMessage(`This tunnel is too tight to live in · ${Math.round(result.spaceScore * 100)}% usable clearance. Excavate a larger chamber, then press N again.`);
      return;
    }
    if (!result.claimed || !result.site) {
      this.setMessage(`Too exposed for a den · ${Math.round(result.shelterScore * 100)}% enclosure. Dig beneath a roof or into a cave wall first.`);
      return;
    }
    this.denDiscovered = true;
    this.recordOctoExperience('exploration', 46, `Claimed ${result.site.name}`, `den:${result.site.id}`);
    this.tutorial.notify('den-claimed');
    this.createDenMarker(result.site);
    this.sound.play('denClaim');
    this.showBanner(result.site.name, `Den ${this.denNetwork.discoveredCount()} joined to your planetary home network.`, 4.2);
    this.setMessage('New den claimed. Storage, food, decoration, and reinforcement belong to this chamber.');
  }

  private reinforceDenWithMinerals(): void {
    const den = this.denNetwork.currentDen(this.player.x, this.player.y);
    if (!den) {
      this.setMessage('Mineral reinforcement must be pressed into a claimed den wall.');
      return;
    }
    if (this.inventory.ironstone < 2) {
      this.setMessage('Two ironstone nodules are needed to reinforce this chamber edge.');
      return;
    }
    this.inventory.ironstone -= 2;
    const reinforcement = 1 + this.octipoints.effect('reinforcement');
    den.mineralReinforcement += reinforcement;
    this.ecosystem.sedimentStability = clamp(this.ecosystem.sedimentStability + 3, 0, 100);
    this.animateToolUse('reinforce', new THREE.Vector2(this.player.facing, 0.2).normalize(), 'arms', 'eight-arm press');
    this.createDenDecoration('mineral', den.mineralReinforcement, den);
    this.sound.play('denDecoration');
    this.recordOctoExperience('den-work', 36, `Repaired and reinforced ${den.name}`);
    this.setMessage(`${den.name} reinforced with ${reinforcement} ironstone support${reinforcement === 1 ? '' : 's'}. Collapse resistance increased.`);
  }

  private placeInDen(): void {
    const den = this.denNetwork.currentDen(this.player.x, this.player.y);
    if (!den) {
      this.setMessage('Den equipment can only be anchored inside the home chambers.');
      return;
    }
    let placed = '';
    if (this.inventory.fossil > 0) {
      this.inventory.fossil -= 1;
      den.artifacts.push('museum-fossil');
      placed = `Fossil display mounted in ${den.name}. Visiting octopi linger over the ancient chambers.`;
      this.createDenDecoration('mineral', den.artifacts.length, den);
      this.recordOctoExperience('den-work', 22, 'Curated a fossil gallery');
    } else if (this.inventory.heaterCore > 0) {
      this.inventory.heaterCore -= 1;
      den.artifacts.push('thermal-core');
      placed = `Geothermal core bedded into ${den.name}'s floor. The chamber holds warmth through any winter.`;
      this.createDenDecoration('mineral', den.artifacts.length, den);
      this.recordOctoExperience('den-work', 26, 'Installed a geothermal core');
    } else if (this.inventory.glowKelp > 0 && this.bioluminescence.placeInDen(den.id)) {
      this.inventory.glowKelp -= 1;
      den.bioLights += 1;
      placed = `Living seaweed pressed visibly into the chamber wall. ${den.bioLights} stacked frond${den.bioLights === 1 ? '' : 's'} provide a steady ${Math.round(this.bioluminescence.denRemainingSeconds(den.id))}-second reserve.`;
      this.createDenDecoration('bioLight', den.bioLights, den);
    } else if (this.inventory.tunnelBrace > 0) {
      this.inventory.tunnelBrace -= 1;
      const reinforcement = 1 + this.octipoints.effect('reinforcement');
      den.braces += reinforcement;
      placed = `${reinforcement} tunnel support${reinforcement === 1 ? '' : 's'} locked against the chamber roof.`;
      this.createDenDecoration('brace', den.braces, den);
    } else if (this.inventory.storageSling > 0) {
      this.inventory.storageSling -= 1;
      den.storage += 1;
      placed = 'Storage sling hung safely above the flood line.';
      this.createDenDecoration('storage', den.storage, den);
    } else if (this.inventory.kelpCurtain > 0) {
      this.inventory.kelpCurtain -= 1;
      den.curtains += 1;
      placed = 'Wet kelp curtain conceals the entrance.';
      this.createDenDecoration('curtain', den.curtains, den);
    } else if (this.inventory.shellBowl > 0) {
      this.inventory.shellBowl -= 1;
      den.bowls += 1;
      placed = 'Shell bowl nested into a dry shelf.';
      this.createDenDecoration('bowl', den.bowls, den);
    } else if (this.relics.snapshot(this.player.x, this.player.y).carried.length > 0) {
      const relic = this.relics.storeOldest();
      if (relic) {
        den.artifacts.push(relic.id);
        if (relic.id === 'stone-adze') this.inventory.stoneAdze = Math.max(0, this.inventory.stoneAdze - 1);
        placed = `${relic.label} secured in ${den.name}. The artifact is now protected from currents and storm debris.`;
        this.createDenArtifact(relic, den, den.artifacts.length);
        this.refreshHotbar(true);
      }
    } else if (den.storage > 0 && (this.inventory.seasonedFood > 0 || this.inventory.tubeWormMeat > 0 || this.inventory.food > 0)) {
      if (this.inventory.seasonedFood > 0) this.inventory.seasonedFood -= 1;
      else if (this.inventory.tubeWormMeat > 0) this.inventory.tubeWormMeat -= 1;
      else this.inventory.food -= 1;
      den.foodStored += 1;
      this.denDecorations.showStoredFood(den);
      placed = 'Emergency food secured in the sling.';
    }
    if (placed) {
      this.animateToolUse('place', new THREE.Vector2(this.player.facing, 0.25).normalize(), 'arms', 'multi-arm placement');
      this.sound.play('denDecoration');
      this.recordOctoExperience('den-work', 22, `Improved ${den.name}`);
      this.setMessage(placed);
    } else {
      this.setMessage('Bring luminous seaweed, an artifact, or craft a brace, sling, curtain, or bowl. Food can be stored after hanging a sling.');
    }
  }

  private createDenDecoration(kind: DenDecorationKind, count: number, den: DenSite): void {
    const group = this.denDecorations.place(kind, count, den);
    if (kind === 'bioLight') {
      group.userData.denBiolight = den.id;
      const lights = this.denBiolightVisuals.get(den.id) ?? [];
      lights.push(group);
      this.denBiolightVisuals.set(den.id, lights);
    }
  }

  private expireDenBiolightVisuals(denId: string, count: number): void {
    const lights = this.denBiolightVisuals.get(denId) ?? [];
    for (let index = 0; index < count && lights.length > 0; index += 1) {
      const group = lights.shift()!;
      group.traverse((child) => {
        if (child instanceof THREE.PointLight) child.intensity = 0;
        const material = (child as THREE.Mesh).material;
        if (material instanceof THREE.Material) material.opacity = 0.08;
      });
      group.visible = false;
    }
    if (lights.length > 0) this.denBiolightVisuals.set(denId, lights);
    else this.denBiolightVisuals.delete(denId);
  }

  private createDenArtifact(relic: RelicDefinition, den: DenSite, count: number): void {
    const group = new THREE.Group();
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.22), new THREE.MeshStandardMaterial({ color: '#574334', roughness: 0.94 }));
    shelf.position.y = -0.18;
    group.add(shelf);
    const material = new THREE.MeshStandardMaterial({ color: relic.color, roughness: relic.category === 'rare mineral' ? 0.28 : 0.62, metalness: relic.id === 'titanium-clasp' ? 0.7 : 0.05, emissive: relic.category === 'rare mineral' ? relic.color : '#000000', emissiveIntensity: relic.category === 'rare mineral' ? 0.22 : 0 });
    const artifact = new THREE.Mesh(
      relic.category === 'rare mineral' ? new THREE.OctahedronGeometry(0.19, 0) : relic.id === 'fused-glass-lens' ? new THREE.TorusGeometry(0.17, 0.03, 8, 18) : new THREE.ConeGeometry(0.16, 0.42, 6),
      material,
    );
    artifact.rotation.z = relic.category === 'human artifact' ? Math.PI * 0.5 : 0.2;
    group.add(artifact);
    group.position.set(den.x - 0.72 + ((count - 1) % 4) * 0.48, den.y - 0.55 + Math.floor((count - 1) / 4) * 0.5, 3.05);
    group.userData.archivedRelic = relic.id;
    this.scene.add(group);
  }

  private createDenMarker(den: DenSite): void {
    this.denDecorations.ensureHabitat(den);
    const group = new THREE.Group();
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 15, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
      new THREE.MeshStandardMaterial({ color: '#d8c89d', emissive: '#225d54', emissiveIntensity: 0.32, side: THREE.DoubleSide }),
    );
    shell.rotation.x = Math.PI;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.39, 28),
      new THREE.MeshBasicMaterial({ color: '#73dfc0', transparent: true, opacity: 0.42, side: THREE.DoubleSide }),
    );
    group.add(shell, ring);
    group.position.set(den.x, den.y - 0.72, 3.1);
    this.scene.add(group);
    if (!this.denMarkerGroups.has(den.id)) this.denMarkerGroups.set(den.id, group);
    else {
      const existing = this.denMarkerGroups.get(den.id)!;
      this.scene.remove(existing);
      this.denMarkerGroups.set(den.id, group);
    }
  }

  private handleSleepInput(): void {
    const travelPanel = this.ui.querySelector<HTMLElement>('[data-ui="travel"]');
    if (travelPanel && travelPanel.style.display === 'flex') {
      this.toggleTravelPanel(false);
      return;
    }
    const current = this.denNetwork.currentDen(this.player.x, this.player.y);
    if (!current) {
      this.setMessage('You can only settle into deep sleep inside the den.');
      return;
    }
    const destinations = this.denNetwork.snapshot(this.player.x, this.player.y).sites
      .filter((site) => site.id !== current.id && !site.destroyed);
    if (destinations.length === 0) {
      this.sleep();
      return;
    }
    this.toggleTravelPanel(true);
  }

  private toggleTravelPanel(open?: boolean): void {
    const panel = this.ui.querySelector<HTMLElement>('[data-ui="travel"]');
    if (!panel) return;
    const show = open ?? panel.style.display !== 'flex';
    if (show) this.refreshTravelPanel();
    panel.style.display = show ? 'flex' : 'none';
    panel.setAttribute('aria-hidden', String(!show));
  }

  private toggleRecordPanel(open?: boolean): void {
    const panel = this.ui.querySelector<HTMLElement>('[data-ui="record"]');
    if (!panel) return;
    const show = open ?? panel.style.display !== 'flex';
    if (show) this.refreshRecordPanel();
    panel.style.display = show ? 'flex' : 'none';
    panel.setAttribute('aria-hidden', String(!show));
  }

  private refreshRecordPanel(): void {
    const host = this.ui.querySelector<HTMLElement>('[data-record-list]');
    if (!host) return;
    host.replaceChildren();
    const slots: Array<{ name: string; label: string }> = [
      { name: AUTOSAVE_SLOT, label: 'Autosave' },
      { name: 'tideborn-slot-1', label: 'Slot I' },
      { name: 'tideborn-slot-2', label: 'Slot II' },
      { name: 'tideborn-slot-3', label: 'Slot III' },
    ];
    for (const slot of slots) {
      const meta = this.saveLoad.peekSlot(slot.name);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid rgba(125,238,216,.22);border-radius:9px;background:rgba(6,26,30,.7);';
      const info = document.createElement('span');
      info.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:2px;font-size:10.5px;';
      info.innerHTML = `<b style="color:#dff5ec;">${slot.label}${meta.exists && meta.day !== undefined ? ` · day ${meta.day + 1}` : ''}</b><small style="opacity:.62;">${meta.exists ? `saved ${meta.savedAt ? new Date(meta.savedAt).toLocaleTimeString() : ''} · v${meta.version}` : 'empty'}</small>`;
      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.textContent = 'Save';
      saveButton.disabled = slot.name === AUTOSAVE_SLOT || this.mode === 'menu';
      Object.assign(saveButton.style, buttonStyle(saveButton.disabled));
      saveButton.addEventListener('click', () => {
        this.saveLoad.persist(slot.name);
        this.setMessage(`Expedition written to ${slot.label}.`);
        this.refreshRecordPanel();
      });
      const loadButton = document.createElement('button');
      loadButton.type = 'button';
      loadButton.textContent = 'Load';
      loadButton.disabled = !meta.exists;
      Object.assign(loadButton.style, buttonStyle(loadButton.disabled));
      loadButton.addEventListener('click', () => {
        const result = this.restoreMidGame(slot.name);
        this.toggleRecordPanel(false);
        if (result.ok && this.beginPendingFromMenu && this.mode === 'menu') {
          this.beginPendingFromMenu = false;
          this.begin();
        }
        this.setMessage(result.ok
          ? `${slot.label} restored · day ${Math.floor(this.elapsed / DAY_LENGTH) + 1}.`
          : `Restore failed · ${result.error ?? 'unknown error'}.`);
      });
      const eraseButton = document.createElement('button');
      eraseButton.type = 'button';
      eraseButton.textContent = '×';
      eraseButton.setAttribute('aria-label', `Erase ${slot.label}`);
      eraseButton.disabled = !meta.exists || slot.name === AUTOSAVE_SLOT;
      Object.assign(eraseButton.style, buttonStyle(eraseButton.disabled));
      eraseButton.addEventListener('click', () => {
        this.saveLoad.eraseSlot(slot.name);
        this.refreshRecordPanel();
      });
      row.append(info, saveButton, loadButton, eraseButton);
      host.appendChild(row);
    }
  }

  private restoreMidGame(slotName: string): ReturnType<SaveLoadSystem['restore']> {
    const result = this.saveLoad.restore(slotName);
    if (!result.ok) return result;
    this.rebuildDenMarkers();
    this.bioluminescence.reconcile(this.inventory.glowKelp, this.denNetwork.biolightCounts());
    this.cameraTarget.set(this.player.x, this.player.y);
    this.worldMap.visit(this.player.x, this.player.y);
    this.refreshWorldMap();
    this.refreshHotbar(true);
    this.updateUI();
    return result;
  }

  private rebuildDenMarkers(): void {
    for (const group of this.denMarkerGroups.values()) {
      this.scene.remove(group);
      group.traverse((node) => {
        const mesh = node as THREE.Mesh;
        mesh.geometry?.dispose?.();
      });
    }
    this.denMarkerGroups.clear();
    for (const site of this.denNetwork.serializeState()) {
      if (site.discovered && !site.destroyed) this.createDenMarker(site);
    }
  }

  private refreshTravelPanel(): void {
    const host = this.ui.querySelector<HTMLElement>('[data-travel-list]');
    if (!host) return;
    const current = this.denNetwork.currentDen(this.player.x, this.player.y);
    const sites = this.denNetwork.snapshot(this.player.x, this.player.y).sites
      .filter((site) => site && !site.destroyed && site.id !== current?.id);
    host.replaceChildren();
    for (const site of sites) {
      const distance = Math.hypot(site.x - (current?.x ?? this.player.x), site.y - (current?.y ?? this.player.y));
      const cost = Math.max(1, Math.round(distance / 6));
      const row = document.createElement('button');
      row.type = 'button';
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:8px 10px;background:rgba(15,64,58,.55);border:1px solid rgba(125,238,216,.35);border-radius:9px;color:#dff5ec;font:inherit;font-size:11px;cursor:pointer;text-align:left;';
      row.innerHTML = `<span style="display:flex;flex-direction:column;gap:2px;"><b>${site.name}</b><small style="opacity:.66;">${Math.round(distance)} m · ${cost} stored food</small></span><em style="font-style:normal;color:#9df2dd;">TRAVEL ›</em>`;
      row.addEventListener('mouseenter', () => { row.style.background = 'rgba(23,88,79,.75)'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'rgba(15,64,58,.55)'; });
      row.addEventListener('click', () => this.travelTo(site.id, cost));
      host.appendChild(row);
    }
    if (sites.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No other claimed dens yet. Claim more chambers with N.';
      empty.style.cssText = 'opacity:.7;font-size:11px;';
      host.appendChild(empty);
    }
  }

  private travelTo(denId: string, cost: number): void {
    const origin = this.denNetwork.currentDen(this.player.x, this.player.y);
    const destination = this.denNetwork.serializeState().find((site) => site.id === denId);
    if (!destination || destination.destroyed) return;
    let paidFrom = '';
    if ((origin?.foodStored ?? 0) >= cost) {
      origin!.foodStored -= cost;
      paidFrom = `${origin!.name} stores`;
    } else if (this.inventory.food >= cost) {
      this.inventory.food -= cost;
      paidFrom = 'carried food';
    } else {
      this.setMessage(`Travel needs ${cost} stored food. Cache meals in the den first.`);
      return;
    }
    this.toggleTravelPanel(false);
    this.player.x = destination.x;
    this.player.y = destination.y + 0.3;
    this.player.vx = 0;
    this.player.vy = 0;
    this.cameraTarget.set(this.player.x, this.player.y);
    this.camera.position.x = this.player.x;
    this.worldMap.visit(this.player.x, this.player.y);
    this.refreshWorldMap();
    this.elapsed += 2;
    this.sound.play('denClaim');
    this.recordOctoExperience('exploration', 10, `Traveled the den network to ${destination.name}`);
    this.setMessage(`You slip through remembered passages to ${destination.name}. ${cost} food from ${paidFrom} spent on the journey.`);
  }

  private sleep(): void {
    if (!this.denNetwork.currentDen(this.player.x, this.player.y)) {
      this.setMessage('You can only settle into deep sleep inside the den.');
      return;
    }
    this.player.stamina = 100;
    this.survival.health = clamp(this.survival.health + 10 * (1 + this.octipoints.effect('restRecovery')), 0, 100);
    this.survival.hunger = clamp(this.survival.hunger - 8, 0, 100);
    this.elapsed += 7;
    this.recordOctoExperience('survival', 8, 'Recovered safely inside a den');
    this.setMessage('You sleep through seven planetary hours. The world keeps moving.');
  }

  private craft(recipe: Recipe): void {
    if (!this.canCraft(recipe)) return;
    for (const [key, count] of Object.entries(recipe.ingredients) as [ResourceKey, number][]) this.inventory[key] -= count;
    const fiberBonus = (recipe.id === 'cord' || recipe.id === 'rope') ? this.octipoints.effect('fiberMastery') : 0;
    this.inventory[recipe.id] += 1 + fiberBonus;
    this.animateToolUse('craft', new THREE.Vector2(this.player.facing, 0.15).normalize(), 'arms', 'eight-arm crafting');
    this.sound.play('craftSuccess');
    this.recordOctoExperience('crafting', 14, `Crafted ${recipe.name}`);
    this.setMessage(`${recipe.name} completed${fiberBonus ? ` with +${fiberBonus} master-weave bonus` : ''}. ${recipe.description}`);
    this.refreshRecipes();
    this.updateUI();
  }

  private canCraft(recipe: Recipe): boolean {
    return (Object.entries(recipe.ingredients) as [ResourceKey, number][]).every(([key, count]) => this.inventory[key] >= count);
  }

  private refreshRecipes(): void {
    const list = this.craftPanel.querySelector<HTMLElement>('.recipe-list');
    if (!list) return;
    list.innerHTML = '';
    const readyRecipes = RECIPES.filter((recipe) => this.canCraft(recipe)).length;
    const summary = this.craftPanel.querySelector<HTMLElement>('[data-craft-summary]');
    if (summary) summary.textContent = `${readyRecipes} / ${RECIPES.length} recipes ready · ${Object.values(this.inventory).reduce((total, count) => total + count, 0)} items carried`;
    for (const recipe of RECIPES) {
      const ready = this.canCraft(recipe);
      const button = document.createElement('button');
      button.className = `recipe ${ready ? 'ready' : 'missing'}`;
      button.disabled = !ready;
      button.dataset.recipeId = recipe.id;
      button.dataset.recipeName = recipe.name;
      const ingredients = (Object.entries(recipe.ingredients) as [ResourceKey, number][]).map(([key, count]) => {
        const owned = this.inventory[key];
        const sufficient = owned >= count;
        return `<span class="ingredient-chip ${sufficient ? 'ready' : 'missing'}" title="${this.prettyResource(key)} · ${owned} carried, ${count} required"><img src="${this.craftResourceIcon(key)}" alt=""><b>${owned}/${count}</b><small>${this.prettyResource(key)}</small></span>`;
      }).join('');
      button.innerHTML = `<img class="recipe-icon" src="${this.craftResourceIcon(recipe.id)}" alt=""><span class="recipe-copy"><b>${recipe.name}</b><small>${recipe.description}</small><em>OWNED ${this.inventory[recipe.id]}</em></span><span class="recipe-ingredients">${ingredients}</span>`;
      button.addEventListener('click', () => this.craft(recipe));
      list.appendChild(button);
    }
  }

  private craftResourceIcon(key: ResourceKey): string {
    return TOOL_DEFINITIONS.find((definition) => definition.resource === key)?.icon
      ?? MINERAL_DEFINITIONS.find((definition) => definition.id === key)?.icon
      ?? SUPPLY_HUD_ITEMS.find((item) => item.key === key)?.icon
      ?? CRAFT_RESOURCE_FALLBACK_ICONS[key]
      ?? './assets/resources/stone.png';
  }

  private prettyResource(key: ResourceKey): string {
    return key.replace(/([A-Z])/g, ' $1').toLowerCase();
  }

  private updateSurvival(dt: number, storm: number): void {
    const onLand = this.player.y > this.world.seaLevel + 0.05;
    this.survival.hunger = clamp(this.survival.hunger - dt * 0.145 * (1 - this.octipoints.effect('hungerRetention')), 0, 100);
    const depth = this.depthState.canonicalDepthM;
    this.survival.pressure = this.planetScale.pressureAtDepth(depth);
    const season = this.seasonSystem.sample(this.elapsed);
    const regionalCold = this.cryosphere.climateAt(this.player.x, Math.max(this.player.y, this.world.seaLevel), season, storm);
    const contactMaterial = this.world.getMaterial(this.player.x, this.player.y - this.player.radius * 0.92);
    this.moistureEnvironment = this.seasonalMoisture.sample({
      season,
      underwater: this.player.underwater,
      exposedToAir: onLand,
      sheltered: Boolean(this.denNetwork.currentDen(this.player.x, this.player.y)),
      stormStrength: storm,
      snowfallIntensity: regionalCold.snowfallIntensity,
      touchingSnow: contactMaterial === MaterialId.Snow,
      touchingIce: contactMaterial === MaterialId.Ice,
    });
    const moistureRate = this.moistureEnvironment.netRatePerSecond < 0
      ? this.moistureEnvironment.netRatePerSecond * (1 - this.octipoints.effect('moistureRetention'))
      : this.moistureEnvironment.netRatePerSecond;
    this.survival.moisture = clamp(
      this.survival.moisture + dt * moistureRate,
      0,
      100,
    );
    const deepTemperature = 19 - Math.min(depth, 4800) * 0.00355;
    const seasonalInfluence = 1 - Math.min(1, depth / 1200);
    const regionalSurfaceTemperature = onLand
      ? regionalCold.airTemperatureC
      : 17 + season.temperatureOffsetC * 0.65 - regionalCold.coldness * 13;
    this.survival.temperature = deepTemperature * (1 - seasonalInfluence)
      + regionalSurfaceTemperature * seasonalInfluence
      + (this.player.x > 46 && this.player.y < -88 ? 16 : 0);
    const beyondAbyssAdaptation = depth > 30000;
    if (this.survival.hunger <= 0 || this.survival.moisture <= 0 || beyondAbyssAdaptation) {
      this.survival.health = clamp(this.survival.health - dt * (beyondAbyssAdaptation ? 6 : 2.3), 0, 100);
    }
    if (storm > 0.75 && this.player.underwater && !this.player.braced) {
      this.player.vx -= dt * storm * 2.4;
    }
    if (this.survival.health <= 0 && this.mode === 'playing') {
      this.finish(this.contestSession.finishDeath(this.contestInput()));
    }
  }

  private updateWeather(storm: number): void {
    const dayProgress = (this.elapsed % DAY_LENGTH) / DAY_LENGTH;
    const sunAngle = dayProgress * Math.PI * 2 - Math.PI * 0.5;
    const night = clamp((-Math.sin(sunAngle) + 0.05) * 0.78, 0, 0.82);
    this.skyShader.uniforms.uNight.value = night;
    this.skyShader.uniforms.uStorm.value = storm;
    this.oceanSurface.update(this.elapsed, storm, night, this.depthState.darkness);
    this.sun.position.set(this.cameraTarget.x + Math.cos(sunAngle) * 13, 7.5 + Math.sin(sunAngle) * 7.5, -25);
    this.moon.position.set(this.cameraTarget.x - Math.cos(sunAngle) * 13, 7.5 - Math.sin(sunAngle) * 7.5, -24.8);
    (this.sun.material as THREE.MeshBasicMaterial).opacity = (1 - night) * (1 - storm * 0.7);
    (this.moon.material as THREE.MeshBasicMaterial).opacity = night * (1 - storm * 0.65);
    const rainMaterial = this.rain.material as THREE.PointsMaterial;
    const snowfall = this.cryosphere.snapshot().local.snowfallIntensity;
    const reduceParticles = this.accessibility.get('reduceParticles');
    rainMaterial.opacity = storm * 0.74 * (1 - snowfall) * (reduceParticles ? 0.4 : 1);
    this.rain.visible = storm > 0.02 && snowfall < 0.24;
    if (this.rain.visible) {
      const stride = reduceParticles ? 2 : 1;
      const rainPos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < rainPos.count; i += stride) {
        let x = rainPos.getX(i) - storm * 0.065;
        let y = rainPos.getY(i) - (0.18 + storm * 0.28);
        if (y < this.cameraTarget.y - 11) { y = this.cameraTarget.y + 12; x = this.cameraTarget.x + (this.rng() - 0.5) * 38; }
        rainPos.setXY(i, x, y);
      }
      rainPos.needsUpdate = true;
    }
    const thunderEvents = this.thunderstorm.update({
      elapsed: this.elapsed,
      stormStrength: storm,
      cameraX: this.camera.position.x,
      cameraY: this.camera.position.y,
      viewWidth: this.camera.right - this.camera.left,
      viewHeight: this.camera.top - this.camera.bottom,
      seaLevel: this.world.seaLevel,
      depthM: this.depthState.canonicalDepthM,
    });
    for (const event of thunderEvents) {
      this.sound.thunder(event.strength, event.distanceM);
      this.ecologyJournal.recordStorm(storm, this.elapsed);
      if (event.near && this.depthState.canonicalDepthM < 80 && this.messageUntil <= this.elapsed) {
        this.setMessage('THUNDER CRACK · A nearby return stroke flashes across the water. Exposed animals scatter for cover.', 2.4);
      }
    }
    this.world.updateTexture(this.elapsed, storm);
  }

  private updateDepthRendering(): void {
    const depthDarkness = this.depthState.darkness;
    if (this.depthPerformance.updateDepth(this.depthState.canonicalDepthM)) this.resize();
    // Sun shadows cannot contribute in the aphotic ocean; skip that entire
    // shadow-map draw until the player returns to a lit depth.
    this.sunLight.castShadow = this.depthState.canonicalDepthM < 1500;
    const activeDen = this.denNetwork.currentDen(this.player.x, this.player.y);
    const hasCarriedBiolight = this.bioluminescence.hasCarried();
    const hasPlacedBiolight = this.bioluminescence.hasDen(activeDen?.id);
    const hasBiolight = hasCarriedBiolight || hasPlacedBiolight;
    const stableDenLight = Boolean(activeDen && hasBiolight);
    const lightX = hasPlacedBiolight ? activeDen!.x : this.player.x;
    const lightY = hasPlacedBiolight ? activeDen!.y + 0.28 : this.player.y;
    const lightSourceKey = hasPlacedBiolight ? `den:${activeDen!.id}` : hasCarriedBiolight ? 'carried' : 'ambient';
    if (this.depthPerformance.shouldUpdateOcclusion({
      elapsed: this.elapsed,
      hasBiolight,
      sourceKey: lightSourceKey,
      worldRevision: this.world.modifiedCells,
    })) {
      this.lightOcclusionState = this.occludedLight.update(lightX, lightY, this.world, this.world.seaLevel);
    }
    const caveDarkness = Math.pow(1 - this.lightOcclusionState.skyVisibility, 0.62) * 0.997;
    const darkness = Math.max(depthDarkness, caveDarkness);
    this.vibrationSense.assist(0.75 + this.accessibility.get('darknessAssist') * 0.75);
    this.vibrationSpeedFactor = this.vibrationSense.update(this.lastFrameDt, {
      px: this.player.x,
      py: this.player.y,
      vx: this.player.vx,
      vy: this.player.vy,
      darkness,
      hasBiolight,
      gripping: this.player.gripping,
      jetImpulse: Math.max(
        Math.max(0, 1 - (this.elapsed - this.lastJetPulseElapsed) / 0.6),
        this.player.jetBlastDriveSnapshot.active ? 1 : 0,
      ),
    });
    this.darknessMaterial.uniforms.uTime.value = this.elapsed;
    this.darknessMaterial.uniforms.uDarkness.value = depthDarkness;
    this.darknessMaterial.uniforms.uCaveDarkness.value = caveDarkness;
    this.darknessMaterial.uniforms.uBiolight.value = hasBiolight ? 1 : 0;
    const lensBonus = this.relics.effects().biolightRadiusBonusM;
    const sourceBrightness = stableDenLight
      ? this.bioluminescence.denBrightness(activeDen?.id)
      : this.bioluminescence.carriedBrightness();
    this.darknessMaterial.uniforms.uHaloRadius.value = (stableDenLight ? 4.35 : 6.15) + lensBonus;
    this.darknessMaterial.uniforms.uLightStrength.value = (stableDenLight ? 0.62 : 0.82) * sourceBrightness;
    this.darknessMaterial.uniforms.uStableBiolight.value = stableDenLight ? 1 : 0;
    // The darkness halo, emissive organisms and additive vent effects retain
    // readable biological light without paying for a full-screen multi-pass
    // blur in the abyss. Bloom remains a shallow/twilight accent only.
    const quality = this.accessibility.get('shaderQuality');
    this.bloomPass.enabled = depthDarkness < 0.82 && quality !== 'low';
    this.bloomPass.strength = (this.reducedBloom || quality === 'medium' ? 0.08 : 0.24) * (1 - depthDarkness * 0.38);
    this.darknessMaterial.uniforms.uLightCenter.value.set(
      0.5 + (lightX - this.camera.position.x) / 40,
      0.5 + (lightY - this.camera.position.y) / 24,
    );
    this.darknessMesh.position.set(this.camera.position.x, this.camera.position.y, 9);
    this.carriedBiolight.visible = hasCarriedBiolight;
    this.carriedBiolightLamp.intensity = hasCarriedBiolight ? (stableDenLight ? 0.9 : 0.3 + darkness * 1.8) * this.bioluminescence.carriedBrightness() : 0;
    this.carriedBiolightLamp.distance = (stableDenLight ? 4.1 : 4.3 + darkness * 2.2) + lensBonus;
    this.carriedBiolight.children.forEach((child) => {
      const pulse = stableDenLight ? 0.92 : 0.82 + Math.sin(this.elapsed * 2.35 + child.userData.phase) * 0.13;
      child.scale.setScalar(pulse);
    });
    const fog = this.scene.fog;
    if (fog instanceof THREE.FogExp2) {
      fog.color.lerpColors(this.shallowFogColor, this.abyssFogColor, darkness);
      fog.density = 0.008 + darkness * 0.04;
    }
    const bubbleLight = hasBiolight ? Math.max(0.72, sourceBrightness) : Math.max(0, 1 - darkness * 1.18);
    this.bubbles.update(this.elapsed, this.renderer.domElement.height, this.viewHeight, bubbleLight);
    if (hasCarriedBiolight && !stableDenLight && darkness > 0.28 && this.elapsed >= this.nextBiolightPulse) {
      this.vfx.cast('bioPulse', new THREE.Vector3(this.player.x, this.player.y, 0));
      this.nextBiolightPulse = this.elapsed + 2.7;
    }
    if (!this.abyssEntered && hasBiolight && this.depthState.canonicalDepthM >= 1000) {
      this.abyssEntered = true;
      this.showBanner('The midnight ocean', 'Twenty-seven kilometers of water wait below. Your borrowed light is now the horizon.', 4.8);
    }
  }

  private updateEntities(dt: number, storm: number): void {
    for (const entity of this.entities) {
      const visual = this.entityVisuals.get(entity.id);
      if (!visual || entity.gathered) continue;
      if (entity.kind === 'vent') {
        visual.visible = this.hasLocalBiolight() && this.depthState.canonicalDepthM > 12000;
        if (!visual.visible) continue;
      }
      if (entity.kind === 'kelp' || entity.kind === 'bush') {
        visual.children.forEach((child, i) => {
          if (i === visual.children.length - 1) return;
          child.rotation.z = Math.sin(this.elapsed * (1.4 + storm * 2.5) + child.userData.phase) * (0.045 + storm * 0.12);
          const material = (child as THREE.Mesh).material;
          if (material instanceof THREE.ShaderMaterial) {
            material.uniforms.uTime.value = this.elapsed;
            material.uniforms.uStorm.value = storm;
          }
        });
      } else if (entity.kind === 'glow') {
        visual.children.forEach((child) => {
          if (child.userData.glowBulb) {
            const scale = 0.8 + Math.sin(this.elapsed * 2 + child.userData.phase) * 0.25;
            child.scale.setScalar(scale);
          } else if (child.userData.glowFrond) {
            child.rotation.z = Math.sin(this.elapsed * 1.2 + child.userData.phase) * 0.055;
          }
        });
      } else if (entity.kind === 'vent') {
        visual.children.forEach((child) => {
          if (child.userData.aperture) {
            const pulse = 0.82 + Math.sin(this.elapsed * 4.6 + child.userData.phase) * 0.22;
            child.scale.setScalar(pulse);
          } else if (child.userData.lifeGlow) {
            const pulse = 0.72 + Math.sin(this.elapsed * 2.2 + child.userData.phase) * 0.24;
            child.scale.setScalar(pulse);
          }
        });
      }
    }

    if (this.hasLocalBiolight() && this.depthState.canonicalDepthM > 12000 && Math.abs(this.player.x - HADAL_VENT_X) < 12 && this.elapsed >= this.nextVentPulse) {
      this.vfx.cast('vent', new THREE.Vector3(HADAL_VENT_X, HADAL_VENT_Y + 0.35, 0), new THREE.Vector2(0, 1));
      this.nextVentPulse = this.elapsed + 1.25;
    }

  }

  private updateCreatures(dt: number, storm: number): void {
    this.updateSurfaceLifecycle(dt);
    for (const creature of this.creatures) {
      const visual = this.creatureVisuals.get(creature.id);
      if (!visual) continue;
      if (!creature.alive) {
        visual.visible = false;
        continue;
      }
      const jetImpulse = this.surfaceJetImpulses.get(creature.id);
      if (jetImpulse) {
        creature.x += jetImpulse.x * dt;
        creature.y += jetImpulse.y * dt;
        jetImpulse.multiplyScalar(Math.pow(0.12, dt));
        if (jetImpulse.lengthSq() < 0.01) this.surfaceJetImpulses.delete(creature.id);
      }
      visual.visible = true;
      const lifeScale = this.surfaceLifecycle.currentScale(creature.life);
      if (creature.kind === 'bird') {
        creature.x += creature.vx * dt * (1 + storm * 1.8);
        creature.y += Math.sin(this.elapsed * 1.7 + creature.phase) * dt * 0.16;
        if (creature.x > 5) creature.x = -31;
        visual.rotation.z = Math.sin(this.elapsed * 4 + creature.phase) * 0.2;
        visual.scale.setScalar(lifeScale);
      } else if (creature.kind === 'caterpillar') {
        creature.x += Math.sin(this.elapsed * 0.42 + creature.phase) * dt * 0.035;
        visual.rotation.z = Math.sin(this.elapsed * 1.3 + creature.phase) * 0.05;
        visual.scale.setScalar(lifeScale);
      } else if (creature.kind === 'snake') {
        creature.x += Math.sin(this.elapsed * 0.3 + creature.phase) * dt * 0.12;
        visual.scale.setScalar(lifeScale);
      } else if (creature.kind === 'jelly') {
        creature.y += Math.sin(this.elapsed * 0.7 + creature.phase) * dt * 0.2;
        visual.scale.setScalar(lifeScale * (0.9 + Math.sin(this.elapsed * 2.2) * 0.08));
      }
    }
    this.resolveSurfaceCollisions();
    for (const creature of this.creatures) {
      if (!creature.alive) continue;
      this.creatureVisuals.get(creature.id)?.position.set(creature.x, creature.y, 1.8);
    }
  }

  private applySurfaceJet(x: number, y: number, direction: THREE.Vector2, strength: number): number {
    const radius = 4 * Math.max(0.5, strength);
    const normalized = direction.lengthSq() > 0.001 ? direction.clone().normalize() : new THREE.Vector2(this.player.facing, 0);
    let affected = 0;
    for (const creature of this.creatures) {
      if (!creature.alive) continue;
      const dx = creature.x - x;
      const dy = creature.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) continue;
      const falloff = (1 - distance / radius) * strength;
      const inverse = 1 / Math.max(0.2, distance);
      const impulse = this.surfaceJetImpulses.get(creature.id) ?? new THREE.Vector2();
      impulse.x += (dx * inverse * 2.2 + normalized.x * 0.55) * falloff;
      impulse.y += (dy * inverse * 1.55 + normalized.y * 0.45) * falloff;
      this.surfaceJetImpulses.set(creature.id, impulse);
      affected += 1;
    }
    return affected;
  }

  private resolveSurfaceCollisions(): void {
    const active = this.creatures.filter((creature) => creature.alive);
    const bodies: CreatureCollisionBody[] = active.map((creature) => {
      const scale = this.surfaceLifecycle.currentScale(creature.life);
      const shape: Record<SurfaceCreatureKind, { x: number; y: number; mass: number; layer: string }> = {
        bird: { x: 0.3, y: 0.12, mass: 0.8, layer: 'air' },
        caterpillar: { x: 0.22, y: 0.07, mass: 0.25, layer: 'ground' },
        snake: { x: 0.42, y: 0.1, mass: 1.5, layer: 'ground' },
        jelly: { x: 0.32, y: 0.46, mass: 0.6, layer: 'water' },
      };
      const dimensions = shape[creature.kind];
      return {
        id: creature.id,
        x: creature.x,
        y: creature.y,
        vx: creature.vx,
        vy: 0,
        radiusX: dimensions.x * scale,
        radiusY: dimensions.y * scale,
        mass: dimensions.mass * scale * scale,
        layer: dimensions.layer,
      };
    });
    for (const layer of ['air', 'ground', 'water']) {
      bodies.push({ id: `player-${layer}`, x: this.player.x, y: this.player.y, radiusX: 0.5, radiusY: 0.56, mass: 1000, immovable: true, layer });
    }
    this.surfaceCollision.resolve(bodies, () => true, 3);
    for (let index = 0; index < active.length; index += 1) {
      active[index].x = bodies[index].x;
      active[index].y = bodies[index].y;
      active[index].vx = bodies[index].vx ?? active[index].vx;
    }
  }

  private updateSurfaceLifecycle(dt: number): void {
    for (const creature of this.creatures) {
      if (!creature.alive || !this.surfaceLifecycle.advance(creature.life, dt)) continue;
      creature.alive = false;
      this.creatureVisuals.get(creature.id)!.visible = false;
      this.surfaceLifecycle.recordDeath('natural');
      if (creature.kind === 'bird') this.ecosystem.birds = Math.max(0, this.ecosystem.birds - 1);
      if (creature.kind === 'snake') this.ecosystem.snakes = Math.max(0, this.ecosystem.snakes - 1);
    }
    if (this.elapsed < this.nextSurfaceBreedingCheck) return;
    this.nextSurfaceBreedingCheck = this.elapsed + 0.75;
    if (this.seasonalWorld.breedingWindow.intensity < 0.05 || this.rng() > this.seasonalWorld.breedingWindow.intensity) return;

    const kinds: SurfaceCreatureKind[] = ['bird', 'caterpillar', 'snake', 'jelly'];
    for (const kind of kinds) {
      const living = this.creatures.filter((creature) => creature.alive && creature.kind === kind);
      if (living.length >= this.surfaceLifecycle.maxPopulation(kind)) continue;
      let mother: CreatureState | undefined;
      let father: CreatureState | undefined;
      if (this.surfaceLifecycle.isAsexual(kind)) {
        mother = living.find((creature) => this.surfaceLifecycle.canBreed(creature.life));
      } else {
        mother = living.find((creature) => creature.life.sex === 'female' && this.surfaceLifecycle.canBreed(creature.life));
        father = mother && living.find((creature) => creature.id !== mother!.id && this.surfaceLifecycle.compatible(mother!.life, creature.life));
      }
      if (!mother || (!this.surfaceLifecycle.isAsexual(kind) && !father)) continue;
      const brood = Math.min(this.surfaceLifecycle.broodSize(kind), this.surfaceLifecycle.maxPopulation(kind) - living.length);
      this.surfaceLifecycle.markBred(mother.life);
      if (father) this.surfaceLifecycle.markBred(father.life);
      const generation = Math.max(mother.life.generation, father?.life.generation ?? mother.life.generation) + 1;
      const parentIds = father ? [mother.id, father.id] : [mother.id];
      for (let index = 0; index < brood; index += 1) {
        const child = this.spawnSurfaceCreature(
          `${kind}-born-${++this.surfaceBirthSequence}`,
          kind,
          clamp((mother.x + (father?.x ?? mother.x)) * 0.5 + (this.rng() - 0.5) * 0.8, kind === 'jelly' ? 5 : -30, kind === 'jelly' ? 13 : 4),
          clamp((mother.y + (father?.y ?? mother.y)) * 0.5 + (this.rng() - 0.5) * 0.35, kind === 'jelly' ? -6 : 4.7, kind === 'bird' ? 12 : kind === 'jelly' ? 2.5 : 6.4),
          { generation, parentIds, sex: kind === 'jelly' ? 'colony' : undefined },
        );
        this.surfaceLifecycle.recordBirth();
        if (kind === 'bird') this.ecosystem.birds += 1;
        if (kind === 'snake') this.ecosystem.snakes += 1;
        if (Math.hypot(child.x - this.player.x, child.y - this.player.y) < 6 && this.messageUntil <= this.elapsed) {
          this.setMessage(`NEW GENERATION · A juvenile ${kind} enters the local ecosystem.`);
        }
      }
    }
  }

  private checkDiscoveries(): void {
    const discoveredDen = this.denNetwork.discoverAt(this.player.x, this.player.y);
    if (discoveredDen) {
      this.denDiscovered = true;
      this.createDenMarker(discoveredDen);
      this.showBanner('A natural cavity', `${discoveredDen.name} joins your den network. Dry clay above; wet refuge below.`, 4.2);
    }
    if (!this.ventDiscovered && this.hasLocalBiolight() && this.player.x > HADAL_VENT_X - 3.5 && this.player.y < HADAL_VENT_Y + 5) {
      this.ventDiscovered = true;
      this.showBanner('Hadal vent field', 'Twenty-seven kilometers below the sun, stone breathes mineral fire into black water.', 4.8);
      this.setMessage('Only the carried seaweed reveals the chimneys. Outside its glow, the ocean is absolute black.');
    }
    if (this.ventDiscovered && this.player.x > HADAL_VENT_X + 1 && this.player.y < HADAL_VENT_Y + 2 && this.messageUntil < this.elapsed) {
      this.setMessage('EARTHQUAKE · A red fissure opens beyond the vent. You are not adapted for the trench—yet.');
      const shake = this.accessibility.get('cameraShake');
      this.camera.position.x += (this.rng() - 0.5) * 0.22 * shake;
      this.camera.position.y += (this.rng() - 0.5) * 0.22 * shake;
    }
  }

  private checkTimeline(): void {
    if (this.elapsed >= DAY_LENGTH && this.elapsed - FIXED_DT < DAY_LENGTH) this.showBanner('Day two', 'Shape tools. Expand the den. Begin storing food.', 4.2);
    if (this.elapsed >= DAY_LENGTH * 2 && this.elapsed - FIXED_DT < DAY_LENGTH * 2) this.showBanner('Day three', 'Pressure is falling. Reinforce the den before the horizon disappears.', 4.4);
    if (this.elapsed >= STORM_WARNING && this.elapsed - FIXED_DT < STORM_WARNING) {
      this.showBanner('The storm is near', 'Birds flee inland. The tide is already rising.', 5);
    }
    if (this.elapsed >= STORM_START && !this.firstStormPulse) {
      this.firstStormPulse = true;
      this.sound.pulse('storm');
      this.showBanner('Landfall', 'Anchor yourself. Protect what you prepared.', 4.3);
    }
    const seasonNow = this.seasonSystem.sample(this.elapsed);
    if (seasonNow.label !== this.lastSeasonBannerId) {
      const previous = this.lastSeasonBannerId;
      this.lastSeasonBannerId = seasonNow.label;
      const flavor: Record<string, string> = {
        'Late summer': 'Warm shallows. Learn the reef while it is generous.',
        'Autumn': 'The light thins. Kelp grows slower now — harvest carefully.',
        'First thaw': 'Meltwater floods the shallows and kelp regrows fast. Beware freshets near the shore.',
        'Long sun': 'Abundance returns. Store food, expand the network, prepare.',
        'Second autumn': 'The light thins again. Winter comes around once more.',
        'The second winter': 'One more winter. Hold what you built.',
      };
      const text = flavor[seasonNow.label];
      if (text && previous !== null) this.showBanner(seasonNow.label, text, 4.8);
    }
    if (this.elapsed >= STORM_END && !this.firstWinterPassed) {
      this.firstWinterPassed = true;
      const result = this.contestSession.finishStorm(this.contestInput());
      if (result.reason === 'den-collapse') {
        this.denNetwork.collapseAllDiscovered('Catastrophic storm surge at the arrival of winter');
      }
      this.showBanner('The first winter', 'The surge passes into deep cold. Hold your dens until the second spring.', 5.2);
      return;
    }
    if (this.elapsed >= this.seasonSystem.secondSpringAtSeconds && !this.endingShown) {
      this.endingShown = true;
      this.showBanner('The second spring', 'The ice lets go. The kelp greens. You endured both winters.', 5.4);
      this.finish(this.contestSession.finishCampaign(this.contestInput()));
    }
  }

  private isPrepared(): boolean {
    const contest = this.contestSession.snapshot(this.contestInput());
    return contest.winPaths.network.ready || contest.winPaths.solo.ready;
  }

  private totalFood(): number {
    return this.inventory.food + this.inventory.seasonedFood + this.inventory.tubeWormMeat + this.denNetwork.totals().foodStored;
  }

  private hasLocalBiolight(): boolean {
    const den = this.denNetwork.currentDen(this.player.x, this.player.y);
    return this.bioluminescence.hasCarried() || this.bioluminescence.hasDen(den?.id);
  }

  private contestInput(): ContestSessionInput {
    const denSnapshot = this.denNetwork.snapshot(this.player.x, this.player.y);
    return {
      elapsedSeconds: this.elapsed,
      dens: denSnapshot.sites,
      excavatedCells: this.world.modifiedCells,
      carriedFood: this.inventory.food + this.inventory.seasonedFood + this.inventory.tubeWormMeat,
      health: this.survival.health,
    };
  }

  private finish(result: ContestResult): void {
    this.mode = result.outcome === 'won' ? 'won' : 'lost';
    this.craftOpen = false;
    this.atlasOpen = false;
    this.craftPanel.classList.remove('open');
    this.craftPanel.setAttribute('aria-hidden', 'true');
    this.ui.querySelector<HTMLButtonElement>('[data-craft-toggle]')?.setAttribute('aria-expanded', 'false');
    this.atlasPanel.classList.remove('open');
    this.atlasPanel.setAttribute('aria-hidden', 'true');
    this.ui.querySelector<HTMLButtonElement>('[data-map-toggle]')?.setAttribute('aria-expanded', 'false');
    this.keys.held.clear();
    this.keys.pressed.clear();
    this.showResults(result);
  }

  private showResults(result: ContestResult): void {
    const overlay = this.ui.querySelector<HTMLElement>('[data-ui="results"]');
    if (!overlay) return;
    const setText = (selector: string, value: string) => {
      const target = overlay.querySelector<HTMLElement>(selector);
      if (target) target.textContent = value;
    };
    setText('[data-results-outcome]', result.reason === 'second-spring' ? 'TWO WINTERS · SURVIVED' : result.outcome === 'won' ? 'FIRST WINTER · SURVIVED' : 'RUN ENDED');
    setText('[data-results-title]', result.title);
    setText('[data-results-subtitle]', result.subtitle);
    const summary = overlay.querySelector<HTMLElement>('[data-results-summary]');
    if (summary) {
      summary.replaceChildren(...result.summary.map((line) => {
        const row = document.createElement('div');
        row.textContent = line;
        row.style.cssText = 'padding:10px 12px;border:1px solid rgba(140,230,211,.17);background:rgba(4,28,31,.72);line-height:1.35;';
        return row;
      }));
    }
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    const mobileControls = this.root.querySelector<HTMLElement>('.mobile-controls');
    if (mobileControls) {
      mobileControls.style.visibility = 'hidden';
      mobileControls.setAttribute('aria-hidden', 'true');
    }
    overlay.querySelector<HTMLButtonElement>('[data-play-again]')?.focus({ preventScroll: true });
  }

  private stormStrength(): number {
    if (this.elapsed < STORM_WARNING) return this.elapsed > 58 && this.elapsed < 66 ? 0.13 : 0;
    if (this.elapsed < STORM_START) return ((this.elapsed - STORM_WARNING) / (STORM_START - STORM_WARNING)) * 0.48;
    if (this.elapsed < STORM_PEAK) return 0.48 + ((this.elapsed - STORM_START) / (STORM_PEAK - STORM_START)) * 0.52;
    if (this.elapsed < STORM_END) return 1 - ((this.elapsed - STORM_PEAK) / (STORM_END - STORM_PEAK)) * 0.88;
    return 0;
  }

  private updateCamera(dt: number): void {
    const desiredY = this.player.y - (this.mobileCamera.active ? this.viewHeight * this.mobileCamera.focusBiasY : 0);
    this.cameraTarget.x += (this.player.x - this.cameraTarget.x) * Math.min(1, dt * 2.8);
    this.cameraTarget.y += (desiredY - this.cameraTarget.y) * Math.min(1, dt * 2.2);
    this.cameraTarget.y = clamp(this.cameraTarget.y, WORLD_MIN_Y + this.viewHeight * 0.5, WORLD_MAX_Y - this.viewHeight * 0.5);
    this.camera.position.x += (this.cameraTarget.x - this.camera.position.x) * Math.min(1, dt * 5);
    this.camera.position.y += (this.cameraTarget.y - this.camera.position.y) * Math.min(1, dt * 5);
    const shakeScale = this.accessibility?.get('cameraShake') ?? 1;
    if (shakeScale > 0.01 && this.mode === 'playing') {
      const trauma = this.stormStrength() * (this.player.underwater ? 0.045 : 0.075);
      if (trauma > 0.002) {
        this.cameraShakePhase += dt * 9.3;
        this.camera.position.x += Math.sin(this.cameraShakePhase * 1.7) * trauma * shakeScale;
        this.camera.position.y += Math.sin(this.cameraShakePhase * 2.3 + 1.4) * trauma * shakeScale;
      }
    }
    for (const cloud of this.scene.children.filter((item) => item.name === 'cloud')) {
      cloud.position.x += (cloud.userData.speed as number) * dt;
      if (cloud.position.x > WORLD_MAX_X + 12) cloud.position.x = WORLD_MIN_X - 12;
    }
  }

  private nearestEntity(range: number): WorldEntity | null {
    let nearest: WorldEntity | null = null;
    let best = range;
    for (const entity of this.entities) {
      if (entity.gathered) continue;
      const dist = Math.hypot(entity.x - this.player.x, entity.y - this.player.y);
      if (dist < best) { best = dist; nearest = entity; }
    }
    return nearest;
  }

  private hideEntity(entity: WorldEntity): void {
    const visual = this.entityVisuals.get(entity.id);
    if (visual) visual.visible = false;
  }

  private scheduleRegrowth(entityId: string): void {
    const springBonus = this.seasonalWorld.breedingWindow.intensity > 0.8 ? 0.55 : 1;
    const dueAt = this.elapsed + KELP_REGROWTH_DAYS * DAY_LENGTH * springBonus;
    this.regrowthQueue.push({ id: entityId, dueAt });
  }

  private processRegrowth(): void {
    if (this.regrowthQueue.length === 0) return;
    const ready = this.regrowthQueue.filter((entry) => this.elapsed >= entry.dueAt);
    if (ready.length === 0) return;
    this.regrowthQueue = this.regrowthQueue.filter((entry) => this.elapsed < entry.dueAt);
    for (const entry of ready) {
      const entity = this.entities.find((candidate) => candidate.id === entry.id);
      if (!entity || !entity.gathered) continue;
      entity.gathered = false;
      const visual = this.entityVisuals.get(entity.id);
      if (visual) visual.visible = true;
      if (Math.hypot(entity.x - this.player.x, entity.y - this.player.y) < 9) {
        this.spawnBurst(entity.x, entity.y, '#7fe0a8');
      }
    }
    if (ready.length > 0 && this.messageUntil <= this.elapsed) {
      const near = ready.some((entry) => {
        const entity = this.entities.find((candidate) => candidate.id === entry.id);
        return entity && Math.hypot(entity.x - this.player.x, entity.y - this.player.y) < 12;
      });
      if (near) this.setMessage('New growth unfurls where you cut carefully. The reef remembers restraint.');
    }
  }

  private spawnBurst(x: number, y: number, color: string): void {
    if (this.accessibility?.get('reduceParticles') && this.rng() > 0.3) return;
    const group = new THREE.Group();
    let material = this.burstMaterials.get(color);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });
      this.burstMaterials.set(color, material);
    }
    for (let i = 0; i < 12; i += 1) {
      const grain = new THREE.Mesh(this.burstGeometry, material);
      grain.scale.setScalar(0.5 + this.rng() * 0.7);
      const a = this.rng() * Math.PI * 2;
      grain.position.set(Math.cos(a) * this.rng() * 0.4, Math.sin(a) * this.rng() * 0.4, 3.4);
      group.add(grain);
    }
    group.position.set(x, y, 0);
    this.scene.add(group);
    const born = this.elapsed;
    const animate = () => {
      const age = this.elapsed - born;
      if (age > 0.8 || !group.parent) { this.scene.remove(group); return; }
      group.children.forEach((child, i) => {
        child.position.x += Math.cos(i * 2.3) * 0.004;
        child.position.y += 0.006 - age * 0.0008;
        (child as THREE.Mesh).scale.setScalar(1 - age * 0.7);
      });
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  private setMessage(message: string, seconds = 4): void {
    this.message = message;
    this.messageUntil = this.elapsed + seconds;
  }

  private showBanner(title: string, subtitle: string, seconds: number): void {
    const banner = this.ui.querySelector<HTMLElement>('[data-ui="banner"]');
    if (!banner) return;
    const h3 = banner.querySelector('h3');
    const p = banner.querySelector('p');
    if (h3) h3.textContent = title;
    if (p) p.textContent = subtitle;
    banner.classList.add('show');
    this.bannerUntil = this.elapsed + seconds;
  }

  private updateUI(): void {
    this.sound.heartbeat();
    const setText = (selector: string, text: string) => { const el = this.ui.querySelector(selector); if (el) el.textContent = text; };
    const setVital = (kind: string, value: number) => {
      setText(`[data-vital="${kind}"]`, Math.round(value).toString());
      const bar = this.ui.querySelector<HTMLElement>(`.${kind} .bar i`);
      if (bar) bar.style.setProperty('--value', `${clamp(value, 0, 100)}%`);
    };
    setVital('health', this.survival.health);
    const audio = this.sound.snapshot() as { music: { currentTrack: string; mood: string; playing: boolean } };
    setText('[data-now-playing]', audio.music.currentTrack === 'none'
      ? 'NOW PLAYING · enter the water to start'
      : `NOW PLAYING · ${audio.music.currentTrack} · ${audio.music.mood.replaceAll('-', ' ').toUpperCase()}${audio.music.playing ? '' : ' · loading'}`);
    setVital('hunger', this.survival.hunger);
    setVital('stamina', this.player.stamina);
    setVital('moisture', this.survival.moisture);
    const moistureRow = this.ui.querySelector<HTMLElement>('.vital-row.moisture');
    const moistureLabel = moistureRow?.querySelector<HTMLElement>('span:first-child');
    if (moistureLabel) {
      moistureLabel.textContent = 'Moisture';
      moistureLabel.dataset.trend = this.moistureEnvironment.netRatePerSecond > 0.08 ? '↑' : this.moistureEnvironment.netRatePerSecond < -0.08 ? '↓' : '•';
    }
    if (moistureRow) moistureRow.title = `${this.moistureEnvironment.source} · ${this.moistureEnvironment.humidityPercent}% humidity · ${this.moistureEnvironment.netRatePerSecond >= 0 ? '+' : ''}${this.moistureEnvironment.netRatePerSecond.toFixed(2)}/s`;

    const day = Math.min(3, Math.floor(this.elapsed / DAY_LENGTH) + 1);
    const phase = (this.elapsed % DAY_LENGTH) / DAY_LENGTH;
    const phaseName = phase < 0.25 ? 'Morning' : phase < 0.5 ? 'Afternoon' : phase < 0.75 ? 'Evening' : 'Night';
    const season = this.seasonSystem.sample(this.elapsed);
    if (this.atlasOpen) this.refreshWorldMap();
    setText('[data-ui="day"]', `${['Day one', 'Day two', 'Day three'][day - 1]} · ${phaseName}`);
    setText('[data-ui="season"]', season.id === 'winter'
      ? 'First winter has arrived'
      : `${season.label} · winter in ${season.daysUntilWinter.toFixed(1)} days`);
    const storm = this.stormStrength();
    const cold = this.cryosphere.snapshot().local;
    const weather = cold.snowfallIntensity > 0.58
      ? 'Heavy regional snow'
      : cold.snowfallIntensity > 0.08
        ? 'Snow flurries'
        : cold.surfaceFrozen
          ? 'Frozen ice-current coast'
          : storm > 0.75 ? 'Major coastal storm' : storm > 0.25 ? 'Storm approaching' : storm > 0.05 ? 'Passing rain' : 'Clear coast';
    setText('[data-ui="weather"]', weather);
    const dot = this.ui.querySelector('.weather-dot');
    dot?.classList.toggle('storm', storm > 0.2);

    const depth = this.depthState.canonicalDepthM;
    const scaleState = this.planetScale.state(depth);
    setText('[data-ui="depth"]', depth >= 1000 ? `${(depth / 1000).toFixed(2)} km` : `${depth.toFixed(1)} m`);
    setText('[data-ui="pressure"]', this.survival.pressure.toFixed(1));
    setText('[data-ui="depth-band"]', scaleState.currentDepth.band.toUpperCase());
    const pin = this.ui.querySelector<HTMLElement>('.depth-pin');
    if (pin) pin.style.setProperty('--depth', `${clamp(depth / this.planetScale.specification.maximumOceanDepthM * 100, 0, 100)}%`);
    setText('[data-ui="technique"]', this.player.technique + (this.player.concealed ? ' · concealed' : ''));
    const activeTool = this.toolbelt.selectedDefinition(this.inventory);
    setText('[data-ui="tool"]', `${activeTool.label.toLowerCase()} · TAB switch · I craft`);
    setText('[data-ui="stealth"]', this.player.gripping
      ? `G · GRIPPED ${this.player.gripSurface?.toUpperCase() ?? 'SURFACE'}`
      : this.player.camouflage ? `C · MATCHING ${this.player.camouflageSurface.toUpperCase()}` : 'G · GRIP + HIDE · C · CAMO');
    setText('[data-ui="jet"]', this.player.jetCharges > 0
      ? `SHIFT · JETS ${this.player.jetCharges}/3`
      : `SHIFT · JET ${this.player.jetRechargeRemaining.toFixed(1)}s`);
    const blast = this.jetBlast.snapshot();
    setText('[data-ui="blast"]', !blast.unlocked
      ? `RMB / K · JET BLAST ${Math.round(blast.progress * 100)}%`
      : blast.cooldownRemaining > 0
        ? `RMB / K · BLAST ${blast.cooldownRemaining.toFixed(1)}s`
        : 'RMB / K · JET BLAST READY');
    setText('[data-ui="ink"]', this.player.inkCooldown <= 0 ? 'R · INK READY' : `R · INK ${this.player.inkCooldown.toFixed(1)}s`);
    const marine = this.marineLife.snapshot(this.player.x, this.player.y);
    const deepLife = this.deepSeaLife.snapshot(this.player.x, this.player.y);
    const deepShoals = this.deepSeaShoals.snapshot(this.player.x, this.player.y);
    const importedDeepFauna = this.importedDeepFauna.snapshot(this.player.x, this.player.y);
    const survivorTarget = this.survivorOctopi.nearest(this.player.x, this.player.y, 1.62, this.player.facing);
    const huntCooldown = survivorTarget
      ? this.survivorOctopi.snapshot(this.player.x, this.player.y).devourCooldown
      : this.player.y < -14 ? deepShoals.playerHuntCooldown : marine.playerHuntCooldown;
    setText('[data-ui="hunt"]', huntCooldown <= 0 ? 'H · HUNT READY' : `H · HUNT ${huntCooldown.toFixed(1)}s`);

    for (const item of SUPPLY_HUD_ITEMS) setText(`[data-inv="${item.key}"]`, String(this.inventory[item.key]));
    for (const mineral of MINERAL_DEFINITIONS) setText(`[data-inv="${mineral.id}"]`, String(this.inventory[mineral.id]));
    const denSnapshot = this.denNetwork.snapshot(this.player.x, this.player.y);
    const activeDen = denSnapshot.sites.find((site) => site.id === denSnapshot.active);
    const carriedLightSeconds = this.bioluminescence.carriedRemainingSeconds();
    const denLightSeconds = this.bioluminescence.denRemainingSeconds(activeDen?.id);
    const lightTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.ceil(seconds % 60)).padStart(2, '0')}`;
    setText('[data-ui="biolight"]', denLightSeconds > 0
      ? `DEN LIGHT · ${activeDen?.bioLights ?? 0} STACK · ${lightTime(denLightSeconds)}`
      : carriedLightSeconds > 0 ? `DEEP LIGHT · ${this.inventory.glowKelp} STACK · ${lightTime(carriedLightSeconds)}` : 'DEEP LIGHT · NONE');
    setText('[data-ui="den"]', activeDen ? `${activeDen.name.toUpperCase()} · ${denSnapshot.count} DENS` : `DEN NETWORK · ${denSnapshot.count} FOUND · N CLAIM`);
    const denTotals = denSnapshot.totals;
    const contest = this.contestSession.snapshot(this.contestInput());
    const bestDen = contest.winPaths.solo.bestDen;
    setText('[data-ui="mission"]', contest.winPaths.network.ready
      ? 'Seven shelters linked. Survive until first winter.'
      : bestDen?.ready
        ? `${bestDen.denName} is winter-ready. Survive the storm.`
        : `Prepare one large den or link ${contest.winPaths.network.currentDens}/7 shelters before winter.`);
    const objectives = {
      den: this.denDiscovered,
      dig: this.world.modifiedCells >= 36,
      storage: denTotals.storage >= 1,
      brace: denTotals.braces + denTotals.mineralReinforcement >= 2,
      food: this.totalFood() >= 3,
      fixture: denTotals.curtains + denTotals.bowls + denTotals.bioLights >= 1,
    };
    for (const [key, done] of Object.entries(objectives)) this.ui.querySelector(`[data-objective="${key}"]`)?.classList.toggle('done', done);

    let promptText = '';
    if (this.messageUntil > this.elapsed) promptText = `<span class="key">●</span>${this.message}`;
    else {
      const relic = this.relics.nearest(this.player.x, this.player.y, 1.5);
      const senseRange = 1.5 + this.octipoints.effect('mineralSense');
      const mineral = this.minerals.nearest(this.player.x, this.player.y, senseRange);
      const supply = this.supplies.nearest(this.player.x, this.player.y, senseRange);
      const healthDrop = this.deepTubeWorms.nearestHealthDrop(this.player.x, this.player.y, 1.5);
      const worm = this.deepTubeWorms.nearest(this.player.x, this.player.y, 1.6);
      const clam = this.proceduralClams.nearest(this.player.x, this.player.y, 1.5);
      const near = this.nearestEntity(1.5);
      const tree = this.treeInteraction.snapshot(this.player.x, this.player.y).nearest;
      const supplyDistance = supply ? Math.hypot(supply.x - this.player.x, supply.y - this.player.y) : Infinity;
      const nearDistance = near ? Math.hypot(near.x - this.player.x, near.y - this.player.y) : Infinity;
      const looseDistance = Math.min(supplyDistance, nearDistance);
      const wormDistance = worm ? Math.hypot(worm.x - this.player.x, worm.y + worm.height * 0.45 - this.player.y) : Infinity;
      const clamDistance = clam ? Math.hypot(clam.x - this.player.x, clam.y - this.player.y) : Infinity;
      if (relic) promptText = `<span class="key">E</span>Recover ${this.relics.definition(relic.relic).label}`;
      else if (mineral) promptText = `<span class="key">E</span>Collect ${this.minerals.definition(mineral.mineral).label}`;
      else if (healthDrop) promptText = '<span class="key">E</span>Collect restorative vent vesicle';
      else if (worm && wormDistance < looseDistance) promptText = this.deepTubeWorms.held()
        ? '<span class="key">X / LMB</span>Cut held tube worm · beware thermal spray'
        : '<span class="key">E → X</span>Grip and harvest defensive tube worm';
      else if (clam && clamDistance < looseDistance) promptText = this.proceduralClams.held()
        ? '<span class="key">X / LMB</span>Peel open held clam'
        : '<span class="key">E → X</span>Grip clam, then work the seam';
      else if (supply && supplyDistance <= nearDistance) promptText = `<span class="key">E</span>Collect ${this.supplies.definition(supply.resource).label}`;
      else if (near) promptText = `<span class="key">E</span>${this.entityPrompt(near)}`;
      else if (marine.fish[0]?.distance < (this.toolbelt.isEquipped('net', this.inventory) ? 2.7 : 1.9)) promptText = `<span class="key">H</span>${this.toolbelt.isEquipped('net', this.inventory) ? 'Sweep the fiber net around nearby fish' : 'Pounce on the nearest fish'}`;
      else if (deepShoals.nearby[0]?.distance < (this.toolbelt.isEquipped('net', this.inventory) ? 2.8 : 1.9)) promptText = `<span class="key">H</span>Hunt ${deepShoals.nearby[0].label} in the biolight`;
      else if (importedDeepFauna.nearby[0]?.threat && importedDeepFauna.nearby[0].distance < 7) promptText = `<span class="key">!</span>${importedDeepFauna.nearby[0].label} is ${importedDeepFauna.nearby[0].behavior}`;
      else if (deepLife.nearby[0]?.threat && deepLife.nearby[0].distance < 6) promptText = `<span class="key">!</span>${deepLife.nearby[0].species.replaceAll('-', ' ')} senses your movement`;
      else if (tree && tree.distance < 0.85) promptText = `<span class="key">G + W/S</span>Grip and climb ${tree.variant.replaceAll('-', ' ')} bark`;
      else if (activeDen) promptText = `<span class="key">V</span>Place light, gear, or archive artifact · ${activeDen.name}`;
    }
    const prompt = this.ui.querySelector<HTMLElement>('[data-ui="prompt"]');
    if (prompt) { prompt.innerHTML = promptText; prompt.classList.toggle('show', Boolean(promptText)); }
    if (this.bannerUntil <= this.elapsed && this.mode !== 'won' && this.mode !== 'lost') this.ui.querySelector('[data-ui="banner"]')?.classList.remove('show');
    this.refreshHotbar();

  }

  private entityPrompt(entity: WorldEntity): string {
    const labels: Record<string, string> = {
      kelp: this.toolbelt.isEquipped('shellBlade', this.inventory) ? 'Cut kelp without uprooting it' : 'Grip kelp holdfast',
      bush: this.toolbelt.isEquipped('shellBlade', this.inventory) ? 'Cut sea bush' : 'Grip rooted sea bush',
      scallop: this.toolbelt.isEquipped('stoneWedge', this.inventory) ? 'Pry scallop cleanly' : 'Crush scallop for food',
      stone: 'Take shaped stone', wood: 'Take driftwood', bone: 'Take bone', glow: 'Harvest bioluminescent seaweed', vent: 'Inspect hydrothermal vent',
    };
    return labels[entity.kind];
  }

  private resize(): void {
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    const requestedRatio = Math.min(window.devicePixelRatio, this.depthPerformance.pixelRatioCap);
    const quality = this.accessibility?.get('shaderQuality') ?? 'high';
    const pixelBudget = quality === 'low' ? 1280 * 720 : quality === 'medium' ? 1920 * 1080 : MAX_RENDER_PIXELS;
    const requestedPixels = width * height * requestedRatio * requestedRatio;
    this.renderPixelRatio = requestedPixels > pixelBudget
      ? requestedRatio * Math.sqrt(pixelBudget / requestedPixels)
      : requestedRatio;
    const ratioChanged = Math.abs(this.renderer.getPixelRatio() - this.renderPixelRatio) > 0.001;
    const sizeChanged = width !== this.renderWidth || height !== this.renderHeight;
    // setPixelRatio already reallocates at the renderer/composer's remembered
    // logical size. Avoid immediately allocating the same targets a second
    // time when only a depth budget changed.
    if (ratioChanged) {
      this.renderer.setPixelRatio(this.renderPixelRatio);
      this.composer?.setPixelRatio(this.renderPixelRatio);
    }
    if (sizeChanged) {
      this.renderer.setSize(width, height, false);
      this.composer?.setSize(width, height);
      this.renderWidth = width;
      this.renderHeight = height;
    }
    const aspect = width / Math.max(1, height);
    this.camera.left = (-this.viewHeight * aspect) / 2;
    this.camera.right = (this.viewHeight * aspect) / 2;
    this.camera.top = this.viewHeight / 2;
    this.camera.bottom = -this.viewHeight / 2;
    this.camera.updateProjectionMatrix();
  }

  private render(): void {
    this.composer.render();
  }

  private save(): void {
    this.saveLoad.autosave();
  }

  private reset(): void {
    this.saveLoad.eraseSlot(AUTOSAVE_SLOT);
    window.location.reload();
  }

  private renderGameToText(): string {
    const nearby = this.entities
      .filter((entity) => !entity.gathered && Math.abs(entity.x - this.player.x) < 5 && Math.abs(entity.y - this.player.y) < 4)
      .map((entity) => ({ id: entity.id, kind: entity.kind, x: Number(entity.x.toFixed(2)), y: Number(entity.y.toFixed(2)), distance: Number(Math.hypot(entity.x - this.player.x, entity.y - this.player.y).toFixed(2)) }));
    const nonzeroInventory = Object.fromEntries(Object.entries(this.inventory).filter(([, value]) => value > 0));
    const localDepth = Math.max(0, this.world.seaLevel - this.player.y);
    const marineLife = this.marineLife.snapshot(this.player.x, this.player.y);
    const deepSeaLife = this.deepSeaLife.snapshot(this.player.x, this.player.y);
    const deepSeaShoals = this.deepSeaShoals.snapshot(this.player.x, this.player.y);
    const importedDeepFauna = this.importedDeepFauna.snapshot(this.player.x, this.player.y);
    const drawingBuffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const surfacePopulation: Record<SurfaceCreatureKind, number> = { bird: 0, caterpillar: 0, snake: 0, jelly: 0 };
    for (const creature of this.creatures) if (creature.alive) surfacePopulation[creature.kind] += 1;
    const surfaceWildlife = {
      population: surfacePopulation,
      nearby: this.creatures
        .filter((creature) => creature.alive && Math.hypot(creature.x - this.player.x, creature.y - this.player.y) <= 12)
        .map((creature) => ({
          id: creature.id,
          species: creature.kind,
          x: Number(creature.x.toFixed(2)),
          y: Number(creature.y.toFixed(2)),
          ageYears: Number(creature.life.ageYears.toFixed(2)),
          lifespanYears: Number(creature.life.lifespanYears.toFixed(2)),
          lifeStage: this.surfaceLifecycle.stage(creature.life),
          sex: creature.life.sex,
          generation: creature.life.generation,
          parentIds: creature.life.parentIds,
          sizeScale: Number(this.surfaceLifecycle.currentScale(creature.life).toFixed(2)),
        })),
      lifecycle: this.surfaceLifecycle.snapshot(),
      collision: this.surfaceCollision.snapshot(),
    };
    const nearbyMinerals = this.minerals.snapshot(this.player.x, this.player.y);
    const nearbySupplies = this.supplies.snapshot(this.player.x, this.player.y);
    const rareRelics = this.relics.snapshot(this.player.x, this.player.y);
    const proceduralClams = this.proceduralClams.snapshot(this.player.x, this.player.y);
    const deepTubeWorms = this.deepTubeWorms.snapshot(this.player.x, this.player.y);
    const amphibiousCrabs = this.amphibiousCrabs.snapshot(this.player.x, this.player.y);
    const survivorOctopi = this.survivorOctopi.snapshot(this.player.x, this.player.y);
    const loosePromptDistance = Math.min(nearby[0]?.distance ?? Infinity, nearbySupplies.nearby[0]?.distance ?? Infinity);
    const nearbyPrompt = rareRelics.nearby[0]?.distance < 1.55
      ? `Recover ${rareRelics.nearby[0].label} [E].`
      : nearbyMinerals[0]?.distance < 1.55
      ? `Collect ${nearbyMinerals[0].label} [E].`
      : deepTubeWorms.nearbyHealthDrops[0]?.distance < 1.55
      ? 'Collect restorative vent vesicle [E].'
      : deepTubeWorms.nearby[0]?.distance < Math.min(1.62, loosePromptDistance)
      ? (deepTubeWorms.held ? 'Cut held tube worm [X/LMB].' : 'Grip tube worm [E], then cut [X/LMB].')
      : proceduralClams.nearby[0]?.distance < Math.min(1.55, loosePromptDistance)
      ? (proceduralClams.held ? 'Peel held clam [X/LMB].' : 'Grip clam [E], then peel [X/LMB].')
      : nearbySupplies.nearby[0]?.distance < Math.min(1.55 + this.octipoints.effect('mineralSense'), nearby[0]?.distance ?? Infinity)
      ? `Collect ${nearbySupplies.nearby[0].label} [E].`
      : survivorOctopi.nearby[0] && Number(survivorOctopi.nearby[0].distance) < 1.62
      ? `Devour ${survivorOctopi.nearby[0].name} [H].`
      : amphibiousCrabs.nearby[0] && Number(amphibiousCrabs.nearby[0].distance) < (this.toolbelt.isEquipped('net', this.inventory) ? 2.45 : 1.48)
      ? `Hunt ${amphibiousCrabs.nearby[0].label} [H].`
      : nearby[0]
      ? this.entityPrompt(this.entities.find((entity) => entity.id === nearby[0].id)!)
      : marineLife.fish[0]?.distance < (this.toolbelt.isEquipped('net', this.inventory) ? 2.7 : 1.9)
        ? 'Hunt the nearby fish [H].'
        : deepSeaShoals.nearby[0]?.distance < (this.toolbelt.isEquipped('net', this.inventory) ? 2.8 : 1.9)
          ? `Hunt ${deepSeaShoals.nearby[0].label} [H].`
        : '';
    return JSON.stringify({
      coordinateSystem: 'local field meters use +x east and +y upward; depthRoute maps the streamed cave to canonical planetary depth',
      planetScale: this.planetScale.state(this.depthState.canonicalDepthM),
      planetBelt: this.beltTraversal.state(this.player.x, this.planetScale),
      worldMap: this.worldMap.snapshot(this.denNetwork.snapshot(this.player.x, this.player.y).sites),
      landmasses: this.landmasses.snapshot(),
      trees: this.trees.snapshot(),
      treeInteraction: this.treeInteraction.snapshot(this.player.x, this.player.y),
      performance: {
        pixelRatio: Number(this.renderPixelRatio.toFixed(2)),
        depthBudget: this.depthPerformance.snapshot(),
        drawingBuffer: { width: drawingBuffer.x, height: drawingBuffer.y, pixels: drawingBuffer.x * drawingBuffer.y, budget: MAX_RENDER_PIXELS },
        sunShadowPass: this.sunLight.castShadow,
        gpuResources: {
          geometries: this.renderer.info.memory.geometries,
          textures: this.renderer.info.memory.textures,
          shaderPrograms: this.renderer.info.programs?.length ?? 0,
        },
        matter: this.world.performanceSnapshot(),
      },
      audio: this.sound.snapshot(),
      oceanSurface: this.oceanSurface.snapshot(),
      thunderstorm: this.thunderstorm.snapshot(),
      mobileCamera: {
        ...this.mobileCamera,
        appliedViewHeightM: this.viewHeight,
        cameraCenterY: Number(this.cameraTarget.y.toFixed(2)),
        playerScreenBiasM: Number((this.player.y - this.cameraTarget.y).toFixed(2)),
      },
      depthRoute: { ...this.depthState, localDepthM: Number(localDepth.toFixed(2)) },
      lightOcclusion: this.lightOcclusionState,
      mode: this.mode,
      settingsOpen: this.settingsOpen,
      objective: 'Survive two winters and reach the second spring. Seven linked dens or one winter-ready fortress carries you through.',
      tutorial: this.tutorial.snapshot(this.player.x, this.player.y),
      season: this.seasonSystem.sample(this.elapsed),
      cryosphere: this.cryosphere.snapshot(),
      seasonalWorld: this.seasonalWorld.snapshot(this.player.x, this.player.y),
      vibrationSense: this.vibrationSense.snapshot(this.player.x, this.player.y),
      seasonalMoisture: this.moistureEnvironment,
      contestSession: this.contestSession.snapshot(this.contestInput()),
      time: {
        elapsedSeconds: Number(this.elapsed.toFixed(2)),
        day: Math.min(3, Math.floor(this.elapsed / DAY_LENGTH) + 1),
        dayLengthSeconds: DAY_LENGTH,
        dayProgress: Number(((this.elapsed % DAY_LENGTH) / DAY_LENGTH).toFixed(3)),
        stormStrength: Number(this.stormStrength().toFixed(2)),
        stormAt: Number(STORM_START.toFixed(2)),
      },
      player: {
        x: Number(this.player.x.toFixed(2)), y: Number(this.player.y.toFixed(2)),
        vx: Number(this.player.vx.toFixed(2)), vy: Number(this.player.vy.toFixed(2)), facing: this.player.facing,
        underwater: this.player.underwater, onGround: this.player.onGround, braced: this.player.braced, gripping: this.player.gripping,
        gripSurface: this.player.gripSurface, camouflage: this.player.camouflage, camouflageSurface: this.player.camouflageSurface,
        camouflageColor: this.player.camouflageColorHex, concealed: this.player.concealed, concealmentSource: this.player.concealmentSource,
        inkCooldown: Number(this.player.inkCooldown.toFixed(2)), inkRemaining: Number(this.player.inkTime.toFixed(2)),
        technique: this.player.technique, stamina: Number(this.player.stamina.toFixed(1)),
        staminaRecoveryPerSecond: Number(this.player.staminaRecoveryRate.toFixed(1)),
        jetCharges: this.player.jetCharges, jetRechargeRemaining: Number(this.player.jetRechargeRemaining.toFixed(2)),
        lastJetDirection: { x: Number(this.player.lastJetDirection.x.toFixed(2)), y: Number(this.player.lastJetDirection.y.toFixed(2)) },
        lastJetStrength: this.player.lastJetStrength,
        jetBlastDrive: this.player.jetBlastDriveSnapshot,
        armTrail: this.player.armTrailSnapshot,
        toolUsePose: this.player.toolUseSnapshot,
        sweptTerrainContact: this.player.sweptContactSnapshot,
        tiltDegrees: Number(THREE.MathUtils.radToDeg(this.player.swimTilt).toFixed(1)), inDen: Boolean(this.denNetwork.currentDen(this.player.x, this.player.y)),
      },
      pointerAim: this.pointerAim.snapshot(this.player.x, this.player.y, this.player.facing),
      jetBlast: this.jetBlast.snapshot(),
      biolight: {
        ...this.bioluminescence.snapshot(),
        active: this.hasLocalBiolight(),
        source: this.bioluminescence.hasDen(this.denNetwork.currentDen(this.player.x, this.player.y)?.id) ? 'steady-den-lamp' : this.bioluminescence.hasCarried() ? 'carried' : 'none',
      },
      survival: Object.fromEntries(Object.entries(this.survival).map(([key, value]) => [key, Number(value.toFixed(1))])),
      inventory: nonzeroInventory,
      octipoints: this.octipoints.snapshot(),
      supplyCollectibles: nearbySupplies,
      toolbelt: this.toolbelt.snapshot(this.inventory),
      toolUseAnimation: this.toolUseVisuals.snapshot(),
      den: { ...this.denNetwork.totals(), ...this.denNetwork.snapshot(this.player.x, this.player.y), decorations: this.denDecorations.snapshot(), discovered: this.denDiscovered, excavatedCells: this.world.modifiedCells, prepared: this.isPrepared() },
      denBuilder: this.denBuilder.snapshot(this.player.x, this.player.y),
      ecologyJournal: this.ecologyJournal.snapshot(this.player.x, this.player.y),
      huntingFeedback: this.huntingFeedback.snapshot(this.player.x, this.player.y),
      survivorRelations: this.survivorRelations.snapshot(this.player.x, this.player.y),
      discoveries: this.discoveries.snapshot(this.player.x, this.player.y),
      accessibility: this.accessibility.snapshot(this.player.x, this.player.y),
      ecosystem: this.ecosystem,
      marineLife,
      deepSeaLife,
      deepSeaShoals,
      importedDeepFauna,
      survivorOctopi,
      rareRelics,
      proceduralClams,
      deepTubeWorms,
      amphibiousCrabs,
      surfaceWildlife,
      creatureAssets: this.creatureAssets.snapshot(),
      bubbleShader: this.bubbles.snapshot(),
      heldEntity: this.heldEntity,
      nearbyEntities: nearby,
      nearbyMinerals,
      prompt: this.messageUntil > this.elapsed ? this.message : nearbyPrompt,
      craftingOpen: this.craftOpen,
      craftingMenu: {
        open: this.craftOpen,
        totalRecipes: RECIPES.length,
        readyRecipes: RECIPES.filter((recipe) => this.canCraft(recipe)).length,
      },
      atlasOpen: this.atlasOpen,
      resultsVisible: this.ui.querySelector<HTMLElement>('[data-ui="results"]')?.getAttribute('aria-hidden') === 'false',
      ventDiscovered: this.ventDiscovered,
      activeVFX: this.vfx.describeActive(),
    });
  }

  private advanceTime(ms: number): void {
    // Short input bursts stay at 60 Hz. Long test/rest skips use bounded fixed slices;
    // distant regions are summary-simulated rather than burning thousands of visual frames.
    const steps = ms > 5000 ? Math.min(900, Math.max(1, Math.ceil(ms / (1000 / 30)))) : Math.max(1, Math.round(ms / (1000 / 60)));
    const stepDt = ms / 1000 / steps;
    for (let i = 0; i < steps; i += 1) {
      if (this.mode === 'playing') this.update(stepDt);
      else this.animateAmbient(stepDt);
    }
    this.render();
  }
}

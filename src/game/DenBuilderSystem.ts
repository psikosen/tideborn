import * as THREE from 'three';
import { BASE_SEA_LEVEL, MATERIAL_NAMES, MaterialId } from './data';

export interface ChamberBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface RoomAnalysis {
  volumeCells: number;
  volumeSquareMeters: number;
  boundingBox: ChamberBounds;
  enclosurePercent: number;
  entranceCount: number;
  floorMaterials: Record<string, number>;
  avgRoofThicknessM: number;
  centroidX: number;
  centroidY: number;
}

export interface StabilityReport {
  score: number;
  issues: string[];
}

export interface FloodReport {
  level: 'low' | 'moderate' | 'high';
  reasons: string[];
}

export interface WinterReport {
  rating: number;
  label: string;
  checklist: string[];
}

export interface BuilderContext {
  px: number;
  py: number;
  braces: number;
  lamps: number;
  foodStored: number;
}

export interface DenBuilderSnapshot {
  active: boolean;
  chamberFound: boolean;
  chamberKey: string | null;
  currentChamberName: string | null;
  suggestedName: string;
  room: RoomAnalysis | null;
  stability: StabilityReport | null;
  flood: FloodReport | null;
  winter: WinterReport | null;
  contextBraces: number;
  previewIndex: number;
}

interface VisitedGrid {
  data: Uint8Array;
  width: number;
  originX: number;
  originY: number;
}

interface CeilingSample {
  x: number;
  y: number;
  thicknessM: number;
  material: MaterialId;
}

const PITCH = 0.25;
const DETECT_RADIUS = 14;
const GRID_SPAN = Math.ceil((DETECT_RADIUS * 2) / PITCH) + 1;
const SECTOR_COUNT = 16;
const RECOMPUTE_INTERVAL = 0.25;
const MAX_ROOF_STEPS = 96;
const MAX_LOW_CELL_SAMPLES = 48;
const LOW_LEAK_FRACTION = 0.15;
const WATER_NEAR_ROOF_STEPS = 8;
const GHOST_COUNT = 3;
const NAME_SUGGESTIONS = ['The Hollow', 'Pearl Vault', 'Ink Chamber', 'Nursery', 'Cold Larder', 'The Wrack'];
const PASSABLE = new Set<number>([
  MaterialId.Empty,
  MaterialId.Water,
  MaterialId.Steam,
  MaterialId.VentFluid,
  MaterialId.Lava,
]);
const INSULATING = new Set<number>([MaterialId.Mud, MaterialId.Clay]);
const MATERIAL_STRENGTH: Record<number, number> = {
  [MaterialId.Basalt]: 1,
  [MaterialId.Limestone]: 0.82,
  [MaterialId.Clay]: 0.66,
  [MaterialId.Mud]: 0.52,
  [MaterialId.Sand]: 0.4,
  [MaterialId.WetSand]: 0.34,
  [MaterialId.Soil]: 0.5,
  [MaterialId.Ice]: 0.42,
  [MaterialId.Snow]: 0.28,
  [MaterialId.CrushedShell]: 0.56,
  [MaterialId.KelpFiber]: 0.48,
  [MaterialId.Wood]: 0.7,
  [MaterialId.Mineral]: 0.78,
};

export class DenBuilderSystem {
  private readonly scene: THREE.Scene;
  private readonly sampleMaterial: (x: number, y: number) => number;
  private readonly group = new THREE.Group();
  private readonly outline: THREE.LineSegments;
  private readonly ghostMarkers: THREE.Group[] = [];
  private readonly hud: HTMLElement;
  private readonly hudTitle: HTMLElement;
  private readonly hudBody: HTMLElement;
  private readonly hudHint: HTMLElement;
  private activeState = false;
  private accumulator = RECOMPUTE_INTERVAL;
  private context: BuilderContext = { px: 0, py: 0, braces: 0, lamps: 0, foodStored: 0 };
  private visited: VisitedGrid | null = null;
  private room: RoomAnalysis | null = null;
  private stability: StabilityReport | null = null;
  private flood: FloodReport | null = null;
  private winter: WinterReport | null = null;
  private chamberKey: string | null = null;
  private readonly names = new Map<string, string>();
  private previewIndex = 0;

  constructor(scene: THREE.Scene, sampleMaterial: (x: number, y: number) => number, uiRoot: HTMLElement) {
    this.scene = scene;
    this.sampleMaterial = sampleMaterial;

    const edgeGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.outline = new THREE.LineSegments(
      edgeGeometry,
      new THREE.LineBasicMaterial({ color: '#7fe7c8', transparent: true, opacity: 0.85, depthTest: false }),
    );
    this.outline.renderOrder = 60;
    this.outline.visible = false;
    this.group.add(this.outline);

    for (let index = 0; index < GHOST_COUNT; index += 1) {
      const marker = new THREE.Group();
      const material = new THREE.MeshBasicMaterial({
        color: '#9df2dd',
        transparent: true,
        opacity: 0.22,
        depthTest: false,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.18, 22), material);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 10), material);
      cone.rotation.z = Math.PI;
      cone.position.y = 0.26;
      ring.renderOrder = 61;
      cone.renderOrder = 61;
      marker.add(ring, cone);
      marker.userData.material = material;
      marker.visible = false;
      marker.position.z = 2.6;
      this.ghostMarkers.push(marker);
      this.group.add(marker);
    }

    this.group.name = 'den-builder-visuals';
    this.group.visible = false;
    this.scene.add(this.group);

    this.hud = document.createElement('div');
    this.hud.style.cssText = [
      'position:absolute',
      'left:14px',
      'bottom:118px',
      'width:264px',
      'padding:10px 12px',
      'background:rgba(4,18,22,0.84)',
      'border:1px solid rgba(127,231,200,0.35)',
      'border-radius:8px',
      'color:#cfeee4',
      "font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace",
      'pointer-events:none',
      'z-index:8',
      'display:none',
      'white-space:pre-wrap',
    ].join(';');
    this.hudTitle = document.createElement('div');
    this.hudTitle.style.cssText = 'font-weight:bold;color:#9df2dd;margin-bottom:4px;';
    this.hudBody = document.createElement('div');
    this.hudBody.style.cssText = 'color:#cfeee4;';
    this.hudHint = document.createElement('div');
    this.hudHint.style.cssText = 'margin-top:4px;color:#6fae9f;';
    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'display:flex;gap:5px;margin-top:7px;align-items:center;pointer-events:auto;';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 26;
    nameInput.placeholder = 'Name this chamber…';
    nameInput.setAttribute('aria-label', 'Chamber name');
    nameInput.style.cssText = 'flex:1;min-width:0;background:rgba(3,14,17,0.85);border:1px solid rgba(125,238,216,0.35);border-radius:7px;color:#dff5ec;font:inherit;font-size:11px;padding:4px 7px;outline:none;';
    nameInput.addEventListener('keydown', (event) => event.stopPropagation());
    nameInput.addEventListener('keyup', (event) => event.stopPropagation());
    const applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.textContent = 'Name';
    applyButton.style.cssText = 'background:rgba(15,64,58,0.9);border:1px solid rgba(125,238,216,0.45);border-radius:7px;color:#baf3e2;font:inherit;font-size:10px;padding:4px 9px;cursor:pointer;';
    const suggestButton = document.createElement('button');
    suggestButton.type = 'button';
    suggestButton.textContent = '✦ Suggest';
    suggestButton.style.cssText = 'background:transparent;border:1px solid rgba(125,238,216,0.28);border-radius:7px;color:#8fd9c8;font:inherit;font-size:10px;padding:4px 8px;cursor:pointer;';
    applyButton.addEventListener('click', () => {
      const value = nameInput.value.trim();
      if (!value) return;
      if (this.assignName(value)) {
        nameInput.value = '';
        nameInput.placeholder = `Named · ${value}`;
      }
    });
    suggestButton.addEventListener('click', () => {
      nameInput.value = this.suggestName();
      nameInput.focus();
    });
    nameRow.append(nameInput, applyButton, suggestButton);
    this.hud.append(this.hudTitle, this.hudBody, this.hudHint, nameRow);
    uiRoot.appendChild(this.hud);
  }

  get active(): boolean {
    return this.activeState;
  }

  toggle(): void {
    this.setActive(!this.activeState);
  }

  setActive(value: boolean): void {
    this.activeState = value;
    this.group.visible = value;
    this.hud.style.display = value ? 'block' : 'none';
    this.accumulator = RECOMPUTE_INTERVAL;
    if (!value) {
      this.outline.visible = false;
      for (const marker of this.ghostMarkers) marker.visible = false;
    }
    this.refreshHud();
  }

  cyclePreview(): void {
    this.previewIndex = (this.previewIndex + 1) % GHOST_COUNT;
    this.refreshGhostEmphasis();
    this.refreshHud();
  }

  update(dt: number, ctx: BuilderContext): void {
    this.context = ctx;
    if (!this.activeState) return;
    this.accumulator += dt;
    if (!this.room || this.accumulator >= RECOMPUTE_INTERVAL) {
      this.accumulator %= RECOMPUTE_INTERVAL;
      this.analyze(ctx.px, ctx.py);
    }
  }

  assignName(name: string): boolean {
    if (!this.chamberKey) return false;
    this.names.set(this.chamberKey, name);
    this.refreshHud();
    return true;
  }

  suggestName(): string {
    const used = new Set(this.names.values());
    for (const candidate of NAME_SUGGESTIONS) {
      if (!used.has(candidate)) return candidate;
    }
    return `Chamber ${this.names.size + 1}`;
  }

  snapshot(px: number, py: number): DenBuilderSnapshot {
    if (this.activeState && !this.room) this.analyze(px, py);
    return {
      active: this.activeState,
      chamberFound: this.room !== null,
      chamberKey: this.chamberKey,
      currentChamberName: this.chamberKey ? this.names.get(this.chamberKey) ?? null : null,
      suggestedName: this.suggestName(),
      room: this.room ? { ...this.room, boundingBox: { ...this.room.boundingBox }, floorMaterials: { ...this.room.floorMaterials } } : null,
      stability: this.stability ? { ...this.stability, issues: [...this.stability.issues] } : null,
      flood: this.flood ? { ...this.flood, reasons: [...this.flood.reasons] } : null,
      winter: this.winter ? { ...this.winter, checklist: [...this.winter.checklist] } : null,
      contextBraces: this.context.braces,
      previewIndex: this.previewIndex,
    };
  }

  serialize(): string {
    return JSON.stringify({ v: 1, names: Array.from(this.names.entries()), previewIndex: this.previewIndex });
  }

  deserialize(raw: string | null | undefined): void {
    this.names.clear();
    this.previewIndex = 0;
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return;
      const record = parsed as { names?: unknown; previewIndex?: unknown };
      if (Array.isArray(record.names)) {
        for (const entry of record.names) {
          if (!Array.isArray(entry) || entry.length < 2) continue;
          if (typeof entry[0] === 'string' && typeof entry[1] === 'string') this.names.set(entry[0], entry[1]);
        }
      }
      if (typeof record.previewIndex === 'number') {
        this.previewIndex = ((Math.trunc(record.previewIndex) % GHOST_COUNT) + GHOST_COUNT) % GHOST_COUNT;
      }
    } catch {
      this.names.clear();
    }
  }

  destroy(): void {
    this.scene.remove(this.group);
    this.group.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) for (const entry of material) entry.dispose();
      else material?.dispose();
    });
    this.hud.remove();
  }

  private passableAt(x: number, y: number): boolean {
    return PASSABLE.has(this.sampleMaterial(x, y));
  }

  private solidAt(x: number, y: number): boolean {
    return !PASSABLE.has(this.sampleMaterial(x, y));
  }

  private analyze(px: number, py: number): void {
    const originX = Math.floor((px - DETECT_RADIUS) / PITCH) * PITCH;
    const originY = Math.floor((py - DETECT_RADIUS) / PITCH) * PITCH;
    const data = new Uint8Array(GRID_SPAN * GRID_SPAN);
    const queue = new Int32Array(GRID_SPAN * GRID_SPAN);
    const startIndex = this.findStartIndex(px, py, originX, originY, data);

    if (startIndex < 0) {
      this.visited = null;
      this.room = null;
      this.chamberKey = null;
      this.stability = { score: 0, issues: ['No open chamber here'] };
      this.flood = { level: 'low', reasons: [] };
      this.winter = { rating: 0, label: 'Unprepared', checklist: ['Find an open chamber to survey'] };
      this.outline.visible = false;
      for (const marker of this.ghostMarkers) marker.visible = false;
      this.refreshHud();
      return;
    }

    let head = 0;
    let tail = 0;
    data[startIndex] = 1;
    queue[tail += 1] = startIndex;
    let volumeCells = 0;
    let sumI = 0;
    let sumJ = 0;
    let iMin = Number.POSITIVE_INFINITY;
    let iMax = Number.NEGATIVE_INFINITY;
    let jMin = Number.POSITIVE_INFINITY;
    let jMax = Number.NEGATIVE_INFINITY;

    while (head < tail) {
      const index = queue[head];
      head += 1;
      const ci = index % GRID_SPAN;
      const cj = (index - ci) / GRID_SPAN;
      volumeCells += 1;
      sumI += ci;
      sumJ += cj;
      if (ci < iMin) iMin = ci;
      if (ci > iMax) iMax = ci;
      if (cj < jMin) jMin = cj;
      if (cj > jMax) jMax = cj;
      const neighbors = [index - 1, index + 1, index - GRID_SPAN, index + GRID_SPAN];
      const leftOk = ci > 0;
      const rightOk = ci < GRID_SPAN - 1;
      const downOk = cj > 0;
      const upOk = cj < GRID_SPAN - 1;
      const allowed = [leftOk, rightOk, downOk, upOk];
      for (let n = 0; n < 4; n += 1) {
        if (!allowed[n]) continue;
        const nIndex = neighbors[n];
        if (data[nIndex]) continue;
        const ni = nIndex % GRID_SPAN;
        const nj = (nIndex - ni) / GRID_SPAN;
        if (!this.passableAt(originX + (ni + 0.5) * PITCH, originY + (nj + 0.5) * PITCH)) continue;
        data[nIndex] = 1;
        queue[tail] = nIndex;
        tail += 1;
      }
    }

    this.visited = { data, width: GRID_SPAN, originX, originY };
    const centroidX = originX + (sumI / volumeCells + 0.5) * PITCH;
    const centroidY = originY + (sumJ / volumeCells + 0.5) * PITCH;
    const boundingBox: ChamberBounds = {
      minX: originX + iMin * PITCH,
      maxX: originX + (iMax + 1) * PITCH,
      minY: originY + jMin * PITCH,
      maxY: originY + (jMax + 1) * PITCH,
    };
    this.chamberKey = `${Math.round(centroidX)},${Math.round(centroidY)}`;

    const rayOriginX = originX + ((startIndex % GRID_SPAN) + 0.5) * PITCH;
    const rayOriginY = originY + (Math.floor(startIndex / GRID_SPAN) + 0.5) * PITCH;
    const openDirs: boolean[] = [];
    let openCount = 0;
    for (let sector = 0; sector < SECTOR_COUNT; sector += 1) {
      const angle = (sector / SECTOR_COUNT) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let blocked = false;
      for (let r = PITCH; r <= DETECT_RADIUS; r += PITCH) {
        if (this.solidAt(rayOriginX + dx * r, rayOriginY + dy * r)) {
          blocked = true;
          break;
        }
      }
      openDirs.push(!blocked);
      if (!blocked) openCount += 1;
    }
    let entranceCount = 0;
    for (let sector = 0; sector < SECTOR_COUNT; sector += 1) {
      const prev = openDirs[(sector + SECTOR_COUNT - 1) % SECTOR_COUNT];
      if (openDirs[sector] && !prev) entranceCount += 1;
    }
    if (openDirs.every((open) => open)) entranceCount = 1;

    const ceilings: CeilingSample[] = [];
    const floorMaterials: Record<string, number> = {};
    let shellSamples = 0;
    let insulSamples = 0;
    let waterAboveRoofHits = 0;
    const lowCellCenters: Array<{ x: number; y: number }> = [];

    for (let cj = 0; cj < GRID_SPAN; cj += 1) {
      for (let ci = 0; ci < GRID_SPAN; ci += 1) {
        if (!data[cj * GRID_SPAN + ci]) continue;
        const x = originX + (ci + 0.5) * PITCH;
        const y = originY + (cj + 0.5) * PITCH;
        const aboveMat = this.sampleMaterial(x, y + PITCH);
        const belowMat = this.sampleMaterial(x, y - PITCH);
        if (!PASSABLE.has(aboveMat)) {
          let steps = 0;
          let waterNear = false;
          while (steps < MAX_ROOF_STEPS && this.solidAt(x, y + PITCH + steps * PITCH)) {
            if (steps < WATER_NEAR_ROOF_STEPS && this.sampleMaterial(x, y + PITCH + steps * PITCH) === MaterialId.Water) waterNear = true;
            steps += 1;
          }
          if (waterNear) waterAboveRoofHits += 1;
          ceilings.push({ x, y: y + PITCH, thicknessM: steps * PITCH, material: aboveMat });
        }
        if (!PASSABLE.has(belowMat)) {
          const name = MATERIAL_NAMES[belowMat] ?? String(belowMat);
          floorMaterials[name] = (floorMaterials[name] ?? 0) + 1;
        }
        const shellNeighbors = [
          this.sampleMaterial(x + PITCH, y),
          this.sampleMaterial(x - PITCH, y),
          aboveMat,
          belowMat,
        ];
        for (const mat of shellNeighbors) {
          if (PASSABLE.has(mat)) continue;
          shellSamples += 1;
          if (INSULATING.has(mat)) insulSamples += 1;
        }
        if (y < BASE_SEA_LEVEL - 0.5) lowCellCenters.push({ x, y });
      }
    }

    const avgRoofThicknessM = ceilings.length
      ? ceilings.reduce((total, ceiling) => total + ceiling.thicknessM, 0) / ceilings.length
      : 0;

    const room: RoomAnalysis = {
      volumeCells,
      volumeSquareMeters: Number((volumeCells * PITCH * PITCH).toFixed(2)),
      boundingBox,
      enclosurePercent: Math.round(((SECTOR_COUNT - openCount) / SECTOR_COUNT) * 100),
      entranceCount,
      floorMaterials,
      avgRoofThicknessM: Number(avgRoofThicknessM.toFixed(2)),
      centroidX: Number(centroidX.toFixed(2)),
      centroidY: Number(centroidY.toFixed(2)),
    };
    this.room = room;

    const roofWeights = new Map<MaterialId, number>();
    for (const ceiling of ceilings) {
      roofWeights.set(ceiling.material, (roofWeights.get(ceiling.material) ?? 0) + 1);
    }
    let dominantMaterial: MaterialId | null = null;
    let dominantWeight = -1;
    for (const [material, weight] of roofWeights) {
      if (weight > dominantWeight) {
        dominantWeight = weight;
        dominantMaterial = material;
      }
    }
    const roofStrength = dominantMaterial !== null ? MATERIAL_STRENGTH[dominantMaterial] ?? 0.5 : 0.5;
    const spanWidth = boundingBox.maxX - boundingBox.minX;
    const spanHeight = boundingBox.maxY - boundingBox.minY;
    const span = Math.max(spanWidth, spanHeight);
    const allowedSpan = 1.8 + 5.2 * roofStrength;

    let westSum = 0;
    let westCount = 0;
    let eastSum = 0;
    let eastCount = 0;
    for (const ceiling of ceilings) {
      if (ceiling.x < centroidX) {
        westSum += ceiling.thicknessM;
        westCount += 1;
      } else {
        eastSum += ceiling.thicknessM;
        eastCount += 1;
      }
    }
    const westAvg = westCount ? westSum / westCount : Number.POSITIVE_INFINITY;
    const eastAvg = eastCount ? eastSum / eastCount : Number.POSITIVE_INFINITY;
    const thinnerSide = eastAvg <= westAvg ? 'east' : 'west';

    const issues: string[] = [];
    if (!ceilings.length) issues.push('No roof coverage');
    else if (avgRoofThicknessM < 0.7) issues.push(`Thin roof over ${thinnerSide} span`);
    if (span > allowedSpan * 1.02 && this.context.braces === 0) {
      issues.push(`Unbraced wide span in ${(dominantMaterial !== null ? MATERIAL_NAMES[dominantMaterial] : 'loose sediment') ?? 'loose sediment'}`);
    } else if (span > allowedSpan * 1.6 && this.context.braces > 0) {
      issues.push('Wide span under-braced for storm surge');
    }
    const roofScore = ceilings.length ? Math.min(1, avgRoofThicknessM / 1.6) * 45 : 0;
    const spanScore = Math.max(0, Math.min(1, 1 - Math.max(0, span - allowedSpan) / Math.max(1, allowedSpan))) * 35;
    const braceBonus = (Math.min(this.context.braces, 5) / 5) * 20;
    const stability: StabilityReport = {
      score: Math.max(0, Math.min(100, Math.round(roofScore + spanScore + braceBonus))),
      issues,
    };
    this.stability = stability;

    const floodReasons: string[] = [];
    if (waterAboveRoofHits > 0) floodReasons.push('Open water presses directly on the roof');
    const lowStride = Math.max(1, Math.ceil(lowCellCenters.length / MAX_LOW_CELL_SAMPLES));
    let lowChecked = 0;
    let lowLeaking = 0;
    for (let index = 0; index < lowCellCenters.length; index += lowStride) {
      const cell = lowCellCenters[index];
      lowChecked += 1;
      for (let step = 1; step <= MAX_ROOF_STEPS; step += 1) {
        const sample = this.sampleMaterial(cell.x, cell.y + step * PITCH);
        if (sample === MaterialId.Water) {
          lowLeaking += 1;
          break;
        }
        if (!PASSABLE.has(sample)) break;
      }
    }
    if (lowChecked > 0 && lowLeaking / lowChecked >= LOW_LEAK_FRACTION) {
      floodReasons.push('Low floor cells connect upward toward standing water columns');
    }
    let entranceBelowSea = false;
    for (let sector = 0; sector < SECTOR_COUNT; sector += 1) {
      if (!openDirs[sector]) continue;
      const angle = (sector / SECTOR_COUNT) * Math.PI * 2;
      if (rayOriginY + Math.sin(angle) * DETECT_RADIUS < BASE_SEA_LEVEL) entranceBelowSea = true;
    }
    if (entranceBelowSea) floodReasons.push('An open entrance lies below the base sea level');
    const triggerCount = floodReasons.length;
    const flood: FloodReport = {
      level: triggerCount >= 2 ? 'high' : triggerCount === 1 ? 'moderate' : 'low',
      reasons: floodReasons,
    };
    this.flood = flood;

    const insulationFraction = shellSamples > 0 ? insulSamples / shellSamples : 0;
    const depthBelowSea = Math.max(0, BASE_SEA_LEVEL - boundingBox.minY);
    const enclosurePts = (room.enclosurePercent / 100) * 30;
    const depthPts = Math.min(1, depthBelowSea / 10) * 20;
    const insulationPts = Math.min(1, insulationFraction * 2.2) * 25;
    const bracesPts = (Math.min(this.context.braces, 4) / 4) * 10;
    const lampsPts = (Math.min(this.context.lamps, 3) / 3) * 10;
    const foodPts = (Math.min(this.context.foodStored, 6) / 6) * 5;
    const rating = Math.max(0, Math.min(100, Math.round(enclosurePts + depthPts + insulationPts + bracesPts + lampsPts + foodPts)));
    const checklist: string[] = [];
    if (room.enclosurePercent < 70) checklist.push(`Broaden enclosed walls (now ${room.enclosurePercent}%)`);
    if (depthBelowSea < 3) checklist.push('Dig deeper below the storm surge line');
    if (insulationFraction < 0.25) checklist.push('Line walls with mud or clay for insulation');
    if (this.context.braces < 2) checklist.push('Set at least two tunnel braces');
    if (room.entranceCount > 1) checklist.push('Narrow to a single guarded entrance');
    if (this.context.lamps < 1) checklist.push('Anchor a bioluminescent lamp');
    if (this.context.foodStored < 3) checklist.push('Cache cured food above the flood line');
    if (!checklist.length) checklist.push('Den is ready for the long winter');
    const winter: WinterReport = {
      rating,
      label: rating < 25 ? 'Unprepared' : rating < 50 ? 'Marginal' : rating < 75 ? 'Winter-ready' : 'Fortress',
      checklist,
    };
    this.winter = winter;

    this.outline.scale.set(spanWidth + 0.05, spanHeight + 0.05, 1);
    this.outline.position.set(
      (boundingBox.minX + boundingBox.maxX) / 2,
      (boundingBox.minY + boundingBox.maxY) / 2,
      2.5,
    );
    this.outline.visible = true;

    this.refreshGhostPositions(centroidX, centroidY);
    this.refreshGhostEmphasis();
    this.refreshHud();
  }

  private findStartIndex(px: number, py: number, originX: number, originY: number, data: Uint8Array): number {
    const passableIndex = (ci: number, cj: number): number => {
      if (ci < 0 || cj < 0 || ci >= GRID_SPAN || cj >= GRID_SPAN) return -1;
      if (!this.passableAt(originX + (ci + 0.5) * PITCH, originY + (cj + 0.5) * PITCH)) return -1;
      return cj * GRID_SPAN + ci;
    };
    const startI = Math.floor((px - originX) / PITCH);
    const startJ = Math.floor((py - originY) / PITCH);
    const direct = passableIndex(startI, startJ);
    if (direct >= 0) return direct;
    for (let radius = 1; radius <= 8; radius += 1) {
      for (let dj = -radius; dj <= radius; dj += 1) {
        for (let di = -radius; di <= radius; di += 1) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== radius) continue;
          const found = passableIndex(startI + di, startJ + dj);
          if (found >= 0) return found;
        }
      }
    }
    return -1;
  }

  private isVisited(x: number, y: number): boolean {
    const grid = this.visited;
    if (!grid) return false;
    const ci = Math.floor((x - grid.originX) / PITCH);
    const cj = Math.floor((y - grid.originY) / PITCH);
    if (ci < 0 || cj < 0 || ci >= grid.width || cj >= grid.width) return false;
    return grid.data[cj * grid.width + ci] === 1;
  }

  private refreshGhostPositions(centroidX: number, centroidY: number): void {
    for (let index = 0; index < GHOST_COUNT; index += 1) {
      const angle = (index / GHOST_COUNT) * Math.PI * 2 + 0.6;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let placed = false;
      for (let r = PITCH; r <= DETECT_RADIUS; r += PITCH) {
        if (this.isVisited(centroidX + dx * r, centroidY + dy * r)) continue;
        const back = r - PITCH;
        const gx = centroidX + dx * back;
        const gy = centroidY + dy * back;
        this.ghostMarkers[index].position.set(gx, gy, 2.6);
        placed = true;
        break;
      }
      if (!placed) this.ghostMarkers[index].position.set(centroidX, centroidY, 2.6);
      this.ghostMarkers[index].visible = true;
    }
  }

  private refreshGhostEmphasis(): void {
    this.ghostMarkers.forEach((marker, index) => {
      const material = marker.userData.material as THREE.MeshBasicMaterial | undefined;
      if (material) material.opacity = index === this.previewIndex ? 0.7 : 0.22;
    });
  }

  private refreshHud(): void {
    if (!this.activeState) return;
    const assigned = this.chamberKey ? this.names.get(this.chamberKey) ?? null : null;
    const suggestion = this.suggestName();
    this.hudTitle.textContent = `DEN BUILDER · ${assigned ?? `unnamed (suggestion: ${suggestion})`}`;
    if (!this.room || !this.stability || !this.flood || !this.winter) {
      this.hudBody.textContent = 'Swim inside a chamber to survey it.';
      this.hudHint.textContent = `L close · marker ${this.previewIndex + 1}/${GHOST_COUNT}`;
      return;
    }
    const room = this.room;
    const boundsW = room.boundingBox.maxX - room.boundingBox.minX;
    const boundsH = room.boundingBox.maxY - room.boundingBox.minY;
    const topFloor = Object.entries(room.floorMaterials).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'bare sediment';
    const lines = [
      `Room ${room.volumeCells} cells · ${room.volumeSquareMeters.toFixed(1)} m²`,
      `Bounds ${boundsW.toFixed(1)} × ${boundsH.toFixed(1)} m · center (${room.centroidX.toFixed(1)}, ${room.centroidY.toFixed(1)})`,
      `Enclosure ${room.enclosurePercent}% · entrances ${room.entranceCount}`,
      `Avg roof ${room.avgRoofThicknessM.toFixed(2)} m · floor ${topFloor}`,
      `Stability ${this.stability.score}/100${this.stability.issues.length ? ` · ${this.stability.issues.join(' · ')}` : ''}`,
      `Flood risk ${this.flood.level}${this.flood.reasons.length ? ` · ${this.flood.reasons.join(' · ')}` : ''}`,
      `Winter ${this.winter.rating}/100 ${this.winter.label}`,
      ...this.winter.checklist.slice(0, 3).map((item) => `  ▸ ${item}`),
    ];
    this.hudBody.textContent = lines.join('\n');
    this.hudHint.textContent = `L close · marker ${this.previewIndex + 1}/${GHOST_COUNT} · survey 4×/s`;
  }
}

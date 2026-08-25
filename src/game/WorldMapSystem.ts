import { DenSite } from './DenNetworkSystem';
import { MatterWorld } from './MatterWorld';
import {
  MaterialId,
  WORLD_HEIGHT,
  WORLD_MAX_Y,
  WORLD_MIN_X,
  WORLD_MIN_Y,
  WORLD_WIDTH,
  clamp,
  wrapWorldX,
} from './data';

export interface WorldMapRenderInput {
  canvas: HTMLCanvasElement;
  world: MatterWorld;
  seaLevel: number;
  player: { x: number; y: number; canonicalDepthM: number; depthBand: string };
  longitudeKm: number;
  dens: DenSite[];
}

export interface WorldMapSnapshot {
  projection: 'wrapped-longitude-depth-slice';
  grid: { columns: number; rows: number; exploredCells: number; totalCells: number };
  exploredPercent: number;
  currentSector: { column: number; row: number };
  discoveredDens: Array<{ id: string; name: string; x: number; y: number; destroyed: boolean }>;
}

const GRID_COLUMNS = 64;
const GRID_ROWS = 64;
const BASE_WIDTH = 320;
const BASE_HEIGHT = 320;
const REVEAL_RADIUS_X_M = 9;
const REVEAL_RADIUS_Y_M = 6.5;

const MATERIAL_COLORS: Partial<Record<MaterialId, [number, number, number]>> = {
  [MaterialId.Sand]: [190, 164, 112],
  [MaterialId.WetSand]: [132, 126, 96],
  [MaterialId.Soil]: [105, 88, 63],
  [MaterialId.Mud]: [72, 78, 64],
  [MaterialId.Clay]: [134, 100, 91],
  [MaterialId.Limestone]: [145, 151, 137],
  [MaterialId.Basalt]: [42, 52, 57],
  [MaterialId.Water]: [20, 86, 98],
  [MaterialId.Lava]: [233, 90, 35],
  [MaterialId.CrushedShell]: [202, 196, 164],
  [MaterialId.KelpFiber]: [46, 119, 76],
  [MaterialId.Wood]: [108, 76, 46],
  [MaterialId.Mineral]: [84, 137, 132],
  [MaterialId.Steam]: [151, 183, 180],
  [MaterialId.VentFluid]: [62, 171, 147],
  [MaterialId.Ice]: [142, 205, 215],
  [MaterialId.Snow]: [218, 232, 226],
};

/**
 * Session-persistent fog-of-war for the wrapped side-view world.
 *
 * Exploration is intentionally independent from the DOM and terrain renderer:
 * it can later be serialized, streamed by region, or shared with NPC map data
 * without changing the atlas presentation.
 */
export class WorldMapSystem {
  private readonly visited = new Uint8Array(GRID_COLUMNS * GRID_ROWS);
  private readonly baseRaster = document.createElement('canvas');
  private readonly fogRaster = document.createElement('canvas');
  private baseModifiedCells = -1;
  private baseSeaLevel = Number.NaN;
  private exploredCells = 0;
  private currentColumn = 0;
  private currentRow = 0;

  constructor() {
    this.baseRaster.width = BASE_WIDTH;
    this.baseRaster.height = BASE_HEIGHT;
    this.fogRaster.width = GRID_COLUMNS;
    this.fogRaster.height = GRID_ROWS;
  }

  visit(worldX: number, worldY: number): boolean {
    const center = this.worldToGrid(worldX, worldY);
    this.currentColumn = center.column;
    this.currentRow = center.row;
    const cellWidth = WORLD_WIDTH / GRID_COLUMNS;
    const cellHeight = WORLD_HEIGHT / GRID_ROWS;
    const radiusColumns = Math.ceil(REVEAL_RADIUS_X_M / cellWidth);
    const radiusRows = Math.ceil(REVEAL_RADIUS_Y_M / cellHeight);
    let changed = false;
    for (let rowOffset = -radiusRows; rowOffset <= radiusRows; rowOffset += 1) {
      const row = center.row + rowOffset;
      if (row < 0 || row >= GRID_ROWS) continue;
      for (let columnOffset = -radiusColumns; columnOffset <= radiusColumns; columnOffset += 1) {
        const normalized = (columnOffset * cellWidth / REVEAL_RADIUS_X_M) ** 2
          + (rowOffset * cellHeight / REVEAL_RADIUS_Y_M) ** 2;
        if (normalized > 1) continue;
        const column = (center.column + columnOffset + GRID_COLUMNS) % GRID_COLUMNS;
        const index = row * GRID_COLUMNS + column;
        if (this.visited[index]) continue;
        this.visited[index] = 1;
        this.exploredCells += 1;
        changed = true;
      }
    }
    return changed;
  }

  render(input: WorldMapRenderInput): void {
    this.rebuildBaseIfNeeded(input.world, input.seaLevel);
    this.rebuildFog();
    const { canvas } = input;
    const context = canvas.getContext('2d');
    if (!context) return;
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.drawImage(this.baseRaster, 0, 0, width, height);
    context.drawImage(this.fogRaster, 0, 0, width, height);
    this.drawReferenceGrid(context, width, height, input.seaLevel);
    this.drawDens(context, width, height, input.dens);
    this.drawPlayer(context, width, height, input.player, input.longitudeKm);
  }

  snapshot(dens: DenSite[] = []): WorldMapSnapshot {
    return {
      projection: 'wrapped-longitude-depth-slice',
      grid: {
        columns: GRID_COLUMNS,
        rows: GRID_ROWS,
        exploredCells: this.exploredCells,
        totalCells: this.visited.length,
      },
      exploredPercent: Number((this.exploredCells / this.visited.length * 100).toFixed(2)),
      currentSector: { column: this.currentColumn, row: this.currentRow },
      discoveredDens: dens.map((den) => ({
        id: den.id,
        name: den.name,
        x: Number(den.x.toFixed(2)),
        y: Number(den.y.toFixed(2)),
        destroyed: den.destroyed,
      })),
    };
  }

  serialize(): number[] {
    const explored: number[] = [];
    for (let index = 0; index < this.visited.length; index += 1) if (this.visited[index]) explored.push(index);
    return explored;
  }

  deserialize(data: unknown): void {
    if (!Array.isArray(data)) return;
    this.visited.fill(0);
    this.exploredCells = 0;
    for (const entry of data) {
      const index = typeof entry === 'number' ? Math.floor(entry) : Number.NaN;
      if (!Number.isInteger(index) || index < 0 || index >= this.visited.length) continue;
      if (this.visited[index]) continue;
      this.visited[index] = 1;
      this.exploredCells += 1;
    }
    this.baseModifiedCells = -1;
  }

  private rebuildBaseIfNeeded(world: MatterWorld, seaLevel: number): void {
    if (this.baseModifiedCells === world.modifiedCells && Math.abs(this.baseSeaLevel - seaLevel) < 0.08) return;
    this.baseModifiedCells = world.modifiedCells;
    this.baseSeaLevel = seaLevel;
    const context = this.baseRaster.getContext('2d');
    if (!context) return;
    const pixels = context.createImageData(BASE_WIDTH, BASE_HEIGHT);
    for (let py = 0; py < BASE_HEIGHT; py += 1) {
      const worldY = WORLD_MAX_Y - (py + 0.5) / BASE_HEIGHT * WORLD_HEIGHT;
      for (let px = 0; px < BASE_WIDTH; px += 1) {
        const worldX = WORLD_MIN_X + (px + 0.5) / BASE_WIDTH * WORLD_WIDTH;
        const material = world.getMaterial(worldX, worldY);
        let color = MATERIAL_COLORS[material];
        if (material === MaterialId.Empty) {
          if (worldY > seaLevel) {
            const altitude = clamp((worldY - seaLevel) / Math.max(1, WORLD_MAX_Y - seaLevel), 0, 1);
            color = [78 - altitude * 18, 109 - altitude * 21, 111 - altitude * 19];
          } else {
            const depth = clamp((seaLevel - worldY) / (seaLevel - WORLD_MIN_Y), 0, 1);
            color = [14 - depth * 12, 76 - depth * 72, 88 - depth * 82];
          }
        }
        const offset = (py * BASE_WIDTH + px) * 4;
        pixels.data[offset] = Math.round(color?.[0] ?? 8);
        pixels.data[offset + 1] = Math.round(color?.[1] ?? 16);
        pixels.data[offset + 2] = Math.round(color?.[2] ?? 20);
        pixels.data[offset + 3] = 255;
      }
    }
    context.putImageData(pixels, 0, 0);
  }

  private rebuildFog(): void {
    const context = this.fogRaster.getContext('2d');
    if (!context) return;
    const pixels = context.createImageData(GRID_COLUMNS, GRID_ROWS);
    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let column = 0; column < GRID_COLUMNS; column += 1) {
        const index = row * GRID_COLUMNS + column;
        let alpha = this.visited[index] ? 12 : 246;
        if (!this.visited[index]) {
          const nearest = this.nearestVisitedDistance(column, row, 2);
          if (nearest <= 1) alpha = 118;
          else if (nearest <= 2) alpha = 205;
        }
        const offset = index * 4;
        pixels.data[offset] = 0;
        pixels.data[offset + 1] = 7;
        pixels.data[offset + 2] = 11;
        pixels.data[offset + 3] = alpha;
      }
    }
    context.putImageData(pixels, 0, 0);
  }

  private nearestVisitedDistance(column: number, row: number, radius: number): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (let dy = -radius; dy <= radius; dy += 1) {
      const sampleRow = row + dy;
      if (sampleRow < 0 || sampleRow >= GRID_ROWS) continue;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const sampleColumn = (column + dx + GRID_COLUMNS) % GRID_COLUMNS;
        if (!this.visited[sampleRow * GRID_COLUMNS + sampleColumn]) continue;
        nearest = Math.min(nearest, Math.hypot(dx, dy));
      }
    }
    return nearest;
  }

  private drawReferenceGrid(context: CanvasRenderingContext2D, width: number, height: number, seaLevel: number): void {
    context.save();
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(154, 226, 208, 0.13)';
    context.fillStyle = 'rgba(190, 236, 222, 0.52)';
    context.font = `${Math.max(10, Math.round(width / 88))}px ui-monospace, monospace`;
    context.textBaseline = 'top';
    for (let section = 0; section <= 8; section += 1) {
      const x = section / 8 * width;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
      if (section % 2 === 0 && section < 8) context.fillText(`${section * 45}°`, x + 4, 5);
    }
    const seaY = this.mapY(seaLevel, height);
    context.strokeStyle = 'rgba(116, 224, 211, 0.48)';
    context.setLineDash([7, 5]);
    context.beginPath();
    context.moveTo(0, seaY);
    context.lineTo(width, seaY);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = 'rgba(164, 235, 222, 0.74)';
    context.fillText('SEA LEVEL', 7, Math.min(height - 15, seaY + 5));
    context.restore();
  }

  private drawDens(context: CanvasRenderingContext2D, width: number, height: number, dens: DenSite[]): void {
    for (const den of dens) {
      const x = this.mapX(den.x, width);
      const y = this.mapY(den.y, height);
      context.save();
      context.shadowColor = den.destroyed ? '#ef806d' : '#74efd0';
      context.shadowBlur = 12;
      context.fillStyle = den.destroyed ? '#532c2a' : '#0b5d55';
      context.strokeStyle = den.destroyed ? '#ef806d' : '#9ff4dc';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x, y - 7);
      context.lineTo(x + 7, y);
      context.lineTo(x + 5, y + 7);
      context.lineTo(x - 5, y + 7);
      context.lineTo(x - 7, y);
      context.closePath();
      context.fill();
      context.stroke();
      context.shadowBlur = 0;
      context.fillStyle = '#e6f6ed';
      context.font = `700 ${Math.max(9, Math.round(width / 95))}px ui-monospace, monospace`;
      context.textBaseline = 'top';
      const labelX = x > width * 0.76 ? x - 11 : x + 11;
      context.textAlign = x > width * 0.76 ? 'right' : 'left';
      context.fillText(den.destroyed ? `${den.name} · LOST` : den.name, labelX, y + 7);
      context.restore();
    }
  }

  private drawPlayer(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: WorldMapRenderInput['player'],
    longitudeKm: number,
  ): void {
    const x = this.mapX(player.x, width);
    const y = this.mapY(player.y, height);
    context.save();
    context.translate(x, y);
    context.shadowColor = '#ffd18a';
    context.shadowBlur = 16;
    context.fillStyle = '#ffd18a';
    context.strokeStyle = '#1b2526';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, -10);
    context.lineTo(7, 8);
    context.lineTo(0, 5);
    context.lineTo(-7, 8);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
    context.save();
    context.fillStyle = 'rgba(235, 244, 235, 0.8)';
    context.font = `${Math.max(10, Math.round(width / 86))}px ui-monospace, monospace`;
    context.textAlign = x > width * 0.7 ? 'right' : 'left';
    context.textBaseline = 'bottom';
    const labelX = x > width * 0.7 ? x - 12 : x + 12;
    const depth = player.canonicalDepthM >= 1000
      ? `${(player.canonicalDepthM / 1000).toFixed(1)} km`
      : `${Math.round(player.canonicalDepthM)} m`;
    context.fillText(`YOU · ${longitudeKm.toFixed(0)} km · ${depth}`, labelX, y - 3);
    context.restore();
  }

  private worldToGrid(worldX: number, worldY: number): { column: number; row: number } {
    const wrappedX = wrapWorldX(worldX);
    return {
      column: clamp(Math.floor((wrappedX - WORLD_MIN_X) / WORLD_WIDTH * GRID_COLUMNS), 0, GRID_COLUMNS - 1),
      row: clamp(Math.floor((WORLD_MAX_Y - worldY) / WORLD_HEIGHT * GRID_ROWS), 0, GRID_ROWS - 1),
    };
  }

  private mapX(worldX: number, width: number): number {
    return (wrapWorldX(worldX) - WORLD_MIN_X) / WORLD_WIDTH * width;
  }

  private mapY(worldY: number, height: number): number {
    return clamp((WORLD_MAX_Y - worldY) / WORLD_HEIGHT, 0, 1) * height;
  }
}

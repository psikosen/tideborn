export type DepthRenderTier = 'surface' | 'aphotic' | 'midnight' | 'abyssal';

interface OcclusionUpdateRequest {
  elapsed: number;
  hasBiolight: boolean;
  sourceKey: string;
  worldRevision: number;
}

const TIER_SETTINGS: Record<DepthRenderTier, { pixelRatioCap: number; occlusionHz: number; litOcclusionHz: number }> = {
  surface: { pixelRatioCap: 1.5, occlusionHz: 12, litOcclusionHz: 18 },
  aphotic: { pixelRatioCap: 1.25, occlusionHz: 10, litOcclusionHz: 16 },
  midnight: { pixelRatioCap: 1, occlusionHz: 9, litOcclusionHz: 15 },
  abyssal: { pixelRatioCap: 0.9, occlusionHz: 8, litOcclusionHz: 14 },
};

/**
 * Owns the expendable rendering budgets that change with canonical depth.
 * The abyss is almost entirely black, so supersampling it as heavily as the
 * sunlit coast wastes fill-rate without adding visible detail. Expensive 2D
 * terrain rays are similarly sampled at a perceptually stable cadence while
 * their texture is reused by the darkness shader between updates.
 */
export class DepthPerformanceSystem {
  private tier: DepthRenderTier = 'surface';
  private nextOcclusionUpdate = 0;
  private lastOcclusionUpdate = -Infinity;
  private lastWorldRevision = -1;
  private lastSourceKey = '';
  private occlusionUpdates = 0;
  private occlusionReuses = 0;

  updateDepth(canonicalDepthM: number): boolean {
    const previous = this.tier;

    // Hysteresis keeps the drawing buffer from being recreated when the
    // player hovers on a depth-band boundary.
    if (this.tier === 'surface') {
      if (canonicalDepthM > 1700) this.tier = 'aphotic';
    } else if (this.tier === 'aphotic') {
      if (canonicalDepthM < 1250) this.tier = 'surface';
      else if (canonicalDepthM > 7600) this.tier = 'midnight';
    } else if (this.tier === 'midnight') {
      if (canonicalDepthM < 6500) this.tier = 'aphotic';
      else if (canonicalDepthM > 18500) this.tier = 'abyssal';
    } else if (canonicalDepthM < 16500) {
      this.tier = 'midnight';
    }

    return previous !== this.tier;
  }

  get pixelRatioCap(): number {
    return TIER_SETTINGS[this.tier].pixelRatioCap;
  }

  shouldUpdateOcclusion(request: OcclusionUpdateRequest): boolean {
    const settings = TIER_SETTINGS[this.tier];
    const sourceChanged = request.sourceKey !== this.lastSourceKey;
    const terrainChanged = request.worldRevision !== this.lastWorldRevision;
    const clockReset = request.elapsed < this.lastOcclusionUpdate;
    const due = request.elapsed + 1e-6 >= this.nextOcclusionUpdate;

    if (!sourceChanged && !terrainChanged && !clockReset && !due) {
      this.occlusionReuses += 1;
      return false;
    }

    const hz = request.hasBiolight ? settings.litOcclusionHz : settings.occlusionHz;
    this.lastSourceKey = request.sourceKey;
    this.lastWorldRevision = request.worldRevision;
    this.lastOcclusionUpdate = request.elapsed;
    this.nextOcclusionUpdate = request.elapsed + 1 / hz;
    this.occlusionUpdates += 1;
    return true;
  }

  snapshot(): {
    tier: DepthRenderTier;
    pixelRatioCap: number;
    occlusionTargetHz: number;
    occlusionUpdates: number;
    occlusionTextureReuses: number;
  } {
    const settings = TIER_SETTINGS[this.tier];
    return {
      tier: this.tier,
      pixelRatioCap: settings.pixelRatioCap,
      occlusionTargetHz: settings.litOcclusionHz,
      occlusionUpdates: this.occlusionUpdates,
      occlusionTextureReuses: this.occlusionReuses,
    };
  }
}

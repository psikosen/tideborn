export type DepthRenderTier = 'surface' | 'shallow' | 'aphotic' | 'midnight' | 'abyssal';

interface OcclusionUpdateRequest {
  elapsed: number;
  hasBiolight: boolean;
  sourceKey: string;
  worldRevision: number;
}

const TIER_SETTINGS: Record<DepthRenderTier, { pixelRatioCap: number; occlusionHz: number; litOcclusionHz: number }> = {
  surface: { pixelRatioCap: 1.5, occlusionHz: 12, litOcclusionHz: 18 },
  // The intermediate shallow step halves the render-target size jump at the
  // first descent boundary, so the reallocation hitch is far shorter.
  shallow: { pixelRatioCap: 1.25, occlusionHz: 10, litOcclusionHz: 16 },
  // One stable deep-water resolution prevents expensive post-processing
  // render-target reallocations at every canonical depth boundary.
  aphotic: { pixelRatioCap: 1, occlusionHz: 9, litOcclusionHz: 14 },
  midnight: { pixelRatioCap: 1, occlusionHz: 7, litOcclusionHz: 11 },
  abyssal: { pixelRatioCap: 1, occlusionHz: 5, litOcclusionHz: 9 },
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
  private occlusionGraceUntil = -Infinity;

  updateDepth(canonicalDepthM: number): boolean {
    const previous = this.tier;
    const previousPixelRatioCap = TIER_SETTINGS[previous].pixelRatioCap;

    // Hysteresis keeps the drawing buffer from being recreated when the
    // player hovers on a depth-band boundary.
    if (this.tier === 'surface') {
      if (canonicalDepthM > 900) this.tier = 'shallow';
    } else if (this.tier === 'shallow') {
      if (canonicalDepthM < 550) this.tier = 'surface';
      else if (canonicalDepthM > 1700) this.tier = 'aphotic';
    } else if (this.tier === 'aphotic') {
      if (canonicalDepthM < 1250) this.tier = 'shallow';
      else if (canonicalDepthM > 7600) this.tier = 'midnight';
    } else if (canonicalDepthM < 16500) {
      this.tier = 'midnight';
    }

    const ratioChanged = previousPixelRatioCap !== TIER_SETTINGS[this.tier].pixelRatioCap;
    if (ratioChanged) {
      // Let the frame that reallocates render targets settle before the next
      // 160-ray occlusion burst stacks onto the same hitch.
      this.occlusionGraceUntil = this.lastOcclusionUpdate + 0.3;
    }
    return ratioChanged;
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
    const inGrace = request.elapsed < this.occlusionGraceUntil;

    if ((!sourceChanged && !terrainChanged && !clockReset && !due) || (inGrace && !terrainChanged)) {
      this.occlusionReuses += 1;
      return false;
    }
    if (inGrace && this.occlusionGraceUntil > this.nextOcclusionUpdate) {
      this.nextOcclusionUpdate = this.occlusionGraceUntil;
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

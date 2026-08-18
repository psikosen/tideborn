export type PlanetInteriorLayerId = 'crust' | 'abyssal-cave-shell' | 'upper-mantle' | 'lower-mantle' | 'outer-core' | 'inner-core';

export interface PlanetInteriorLayer {
  id: PlanetInteriorLayerId;
  name: string;
  outerRadiusKm: number;
  innerRadiusKm: number;
  state: 'solid' | 'plastic' | 'liquid' | 'mixed';
  composition: string;
  color: string;
  navigable?: boolean;
}

/**
 * Canonical differentiated interior for Pelagos-730. It is deliberately a
 * cheap planetary model, not a promise that local matter cells extend to the
 * core. Its huge water-rock shell is intentionally speculative Tideborn
 * geology and is represented by streamed habitats rather than one cell grid.
 */
export class PlanetInteriorSystem {
  readonly layers: readonly PlanetInteriorLayer[];

  constructor(readonly planetRadiusKm: number) {
    this.layers = [
      {
        id: 'crust', name: 'Oceanic crust', outerRadiusKm: planetRadiusKm, innerRadiusKm: planetRadiusKm - 21,
        state: 'solid', composition: 'thin basalt, hydrated silicates, trench sediments', color: '#40565b',
      },
      {
        id: 'abyssal-cave-shell', name: 'Abyssal ocean & megacave shell', outerRadiusKm: planetRadiusKm - 21, innerRadiusKm: planetRadiusKm - 987,
        state: 'mixed', composition: 'high-pressure brine oceans, basalt vaults, mineral reefs, connected megacaves', color: '#092c46', navigable: true,
      },
      {
        id: 'upper-mantle', name: 'Convecting upper mantle', outerRadiusKm: planetRadiusKm - 987, innerRadiusKm: planetRadiusKm - 1785,
        state: 'plastic', composition: 'hot magnesium-rich silicate rock', color: '#8d4935',
      },
      {
        id: 'lower-mantle', name: 'Dense lower mantle', outerRadiusKm: planetRadiusKm - 1785, innerRadiusKm: 2470,
        state: 'plastic', composition: 'high-pressure silicate minerals', color: '#b75b37',
      },
      {
        id: 'outer-core', name: 'Liquid outer core', outerRadiusKm: 2470, innerRadiusKm: 910,
        state: 'liquid', composition: 'convecting iron–nickel alloy', color: '#f19c3f',
      },
      {
        id: 'inner-core', name: 'Solid inner core', outerRadiusKm: 910, innerRadiusKm: 0,
        state: 'solid', composition: 'compressed iron–nickel crystal', color: '#ffe7a0',
      },
    ] as const;
  }

  layerAtDepth(depthKm: number): PlanetInteriorLayer {
    const radiusKm = Math.max(0, this.planetRadiusKm - Math.max(0, depthKm));
    return this.layers.find((layer) => radiusKm <= layer.outerRadiusKm && radiusKm >= layer.innerRadiusKm)
      ?? this.layers[this.layers.length - 1];
  }

  snapshot(maximumOpenOceanDepthM: number, maximumNavigableDepthM = maximumOpenOceanDepthM): {
    model: string;
    core: { beginsAtDepthKm: number; radiusKm: number; diameterKm: number; radiusPercent: number; dynamo: string };
    deepestOcean: { depthKm: number; layer: string; distanceAboveCoreKm: number };
    openOcean: { maximumDepthKm: number };
    habitableShell: { outerDepthKm: number; innerDepthKm: number; thicknessKm: number; reclaimedFromCrustKm: number; reclaimedFromLowerMantleKm: number };
    layers: Array<PlanetInteriorLayer & { thicknessKm: number; outerRadiusPercent: number }>;
  } {
    const outerCore = this.layers.find((layer) => layer.id === 'outer-core')!;
    const habitat = this.layers.find((layer) => layer.id === 'abyssal-cave-shell')!;
    const coreBeginsAtDepthKm = this.planetRadiusKm - outerCore.outerRadiusKm;
    const oceanDepthKm = maximumNavigableDepthM / 1000;
    return {
      model: 'speculative differentiated ocean planet; the high-pressure water-rock shell is streamed as region summaries and local habitats',
      core: {
        beginsAtDepthKm: coreBeginsAtDepthKm,
        radiusKm: outerCore.outerRadiusKm,
        diameterKm: outerCore.outerRadiusKm * 2,
        radiusPercent: Number((outerCore.outerRadiusKm / this.planetRadiusKm * 100).toFixed(1)),
        dynamo: 'liquid outer-core convection maintains a global magnetic field',
      },
      deepestOcean: {
        depthKm: oceanDepthKm,
        layer: this.layerAtDepth(oceanDepthKm).name,
        distanceAboveCoreKm: Number((coreBeginsAtDepthKm - oceanDepthKm).toFixed(0)),
      },
      openOcean: { maximumDepthKm: maximumOpenOceanDepthM / 1000 },
      habitableShell: {
        outerDepthKm: this.planetRadiusKm - habitat.outerRadiusKm,
        innerDepthKm: this.planetRadiusKm - habitat.innerRadiusKm,
        thicknessKm: habitat.outerRadiusKm - habitat.innerRadiusKm,
        reclaimedFromCrustKm: 21,
        reclaimedFromLowerMantleKm: 945,
      },
      layers: this.layers.map((layer) => ({
        ...layer,
        thicknessKm: layer.outerRadiusKm - layer.innerRadiusKm,
        outerRadiusPercent: Number((layer.outerRadiusKm / this.planetRadiusKm * 100).toFixed(1)),
      })),
    };
  }
}

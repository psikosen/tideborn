import { SeasonState } from './SeasonSystem';
import { clamp } from './data';

export type MoistureTrend = 'saturating' | 'rehydrating' | 'stable' | 'drying' | 'rapidly-drying';

export interface SeasonalMoistureInput {
  season: SeasonState;
  underwater: boolean;
  exposedToAir: boolean;
  sheltered: boolean;
  stormStrength: number;
  snowfallIntensity: number;
  touchingSnow: boolean;
  touchingIce: boolean;
}

export interface SeasonalMoistureState {
  season: SeasonState['id'];
  humidityPercent: number;
  evaporationMultiplier: number;
  evaporationPerSecond: number;
  precipitationGainPerSecond: number;
  netRatePerSecond: number;
  precipitation: 'none' | 'rain' | 'snow' | 'mixed';
  trend: MoistureTrend;
  source: string;
  sheltered: boolean;
  surfaceContact: 'snow' | 'ice' | 'dry';
}

/**
 * Converts the coarse season and local precipitation into one tunable skin-
 * moisture budget. Keeping this separate from Game lets a future regional
 * climate worker or species adaptation replace the formula without changing
 * the survival controller.
 */
export class SeasonalMoistureSystem {
  sample(input: SeasonalMoistureInput): SeasonalMoistureState {
    const storm = clamp(input.stormStrength, 0, 1);
    const snow = clamp(input.snowfallIntensity, 0, 1);
    const rain = storm * (1 - snow);
    const shelterHumidity = input.sheltered ? 8 : 0;
    const precipitationHumidity = rain * 18 + snow * 8;
    const humidityPercent = clamp(
      input.season.relativeHumidityPercent + shelterHumidity + precipitationHumidity,
      25,
      100,
    );

    if (input.underwater || !input.exposedToAir) {
      return {
        season: input.season.id,
        humidityPercent: 100,
        evaporationMultiplier: 0,
        evaporationPerSecond: 0,
        precipitationGainPerSecond: 5,
        netRatePerSecond: 5,
        precipitation: snow > 0.3 ? 'snow' : rain > 0.08 ? 'rain' : 'none',
        trend: 'saturating',
        source: 'surrounding water',
        sheltered: input.sheltered,
        surfaceContact: input.touchingSnow ? 'snow' : input.touchingIce ? 'ice' : 'dry',
      };
    }

    const humidityDrying = lerp(1.08, 0.48, humidityPercent / 100);
    const shelterRetention = input.sheltered ? 0.68 : 1;
    const coldSurfaceRetention = input.touchingSnow ? 0.68 : input.touchingIce ? 0.78 : 1;
    const evaporationMultiplier = input.season.evaporationMultiplier
      * (1 - storm * 0.46)
      * shelterRetention
      * coldSurfaceRetention;
    const evaporationPerSecond = 0.82 * evaporationMultiplier * humidityDrying;
    const precipitationExposure = input.sheltered ? 0.18 : 1;
    const rainGain = rain * 1.48 * precipitationExposure;
    const airborneSnowGain = snow * 0.11 * precipitationExposure;
    const snowContactGain = input.touchingSnow ? 0.42 : input.touchingIce ? 0.07 : 0;
    const precipitationGainPerSecond = rainGain + airborneSnowGain + snowContactGain;
    const netRatePerSecond = precipitationGainPerSecond - evaporationPerSecond;
    const precipitation = rain > 0.12 && snow > 0.22
      ? 'mixed'
      : snow > 0.12
        ? 'snow'
        : rain > 0.08
          ? 'rain'
          : 'none';
    const trend: MoistureTrend = netRatePerSecond > 0.16
      ? 'rehydrating'
      : netRatePerSecond > -0.08
        ? 'stable'
        : netRatePerSecond < -0.65
          ? 'rapidly-drying'
          : 'drying';
    const source = netRatePerSecond > 0.16
      ? input.touchingSnow ? 'melting snow contact' : rain > snow ? 'seasonal rain' : 'falling snow'
      : input.sheltered
        ? 'humid den retention'
        : input.season.id === 'late-summer'
          ? 'late-summer evaporation'
          : input.season.id === 'winter'
            ? 'cold-air moisture retention'
            : 'seasonal air';
    return {
      season: input.season.id,
      humidityPercent: Number(humidityPercent.toFixed(1)),
      evaporationMultiplier: Number(evaporationMultiplier.toFixed(3)),
      evaporationPerSecond: Number(evaporationPerSecond.toFixed(3)),
      precipitationGainPerSecond: Number(precipitationGainPerSecond.toFixed(3)),
      netRatePerSecond: Number(netRatePerSecond.toFixed(3)),
      precipitation,
      trend,
      source,
      sheltered: input.sheltered,
      surfaceContact: input.touchingSnow ? 'snow' : input.touchingIce ? 'ice' : 'dry',
    };
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

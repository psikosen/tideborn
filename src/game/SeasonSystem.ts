export type SeasonId = 'late-summer' | 'autumn' | 'storm-season' | 'winter';

export interface SeasonState {
  id: SeasonId;
  label: string;
  progress: number;
  daysUntilWinter: number;
  winterAtSeconds: number;
  temperatureOffsetC: number;
  daylightHours: number;
  snowfallPotential: number;
  seaIcePotential: number;
  snowLineM: number;
  relativeHumidityPercent: number;
  evaporationMultiplier: number;
  nextSeason: string | null;
}

interface SeasonPhase {
  id: SeasonId;
  label: string;
  startsAt: number;
  endsAt: number;
  temperatureOffsetC: [number, number];
  daylightHours: [number, number];
  snowfallPotential: [number, number];
  seaIcePotential: [number, number];
  snowLineM: [number, number];
  relativeHumidityPercent: [number, number];
  evaporationMultiplier: [number, number];
  nextSeason: string | null;
}

/**
 * Maps the short contest clock onto a readable seasonal arc. This is kept
 * separate from weather so a longer campaign can later replace the four
 * prototype phases without changing survival or session-end code.
 */
export class SeasonSystem {
  private readonly phases: SeasonPhase[];

  constructor(
    readonly dayLengthSeconds: number,
    readonly winterAtSeconds: number,
  ) {
    this.phases = [
      {
        id: 'late-summer',
        label: 'Late summer',
        startsAt: 0,
        endsAt: dayLengthSeconds,
        temperatureOffsetC: [0, -0.7],
        daylightHours: [14.4, 13.2],
        snowfallPotential: [0, 0.04],
        seaIcePotential: [0, 0],
        snowLineM: [14, 11],
        relativeHumidityPercent: [48, 55],
        evaporationMultiplier: [1.2, 1.05],
        nextSeason: 'Autumn',
      },
      {
        id: 'autumn',
        label: 'Autumn',
        startsAt: dayLengthSeconds,
        endsAt: dayLengthSeconds * 2.4,
        temperatureOffsetC: [-0.7, -2.2],
        daylightHours: [13.2, 11.2],
        snowfallPotential: [0.04, 0.28],
        seaIcePotential: [0, 0.12],
        snowLineM: [11, 7],
        relativeHumidityPercent: [55, 70],
        evaporationMultiplier: [1.05, 0.72],
        nextSeason: 'Storm season',
      },
      {
        id: 'storm-season',
        label: 'Storm season',
        startsAt: dayLengthSeconds * 2.4,
        endsAt: winterAtSeconds,
        temperatureOffsetC: [-2.2, -4.4],
        daylightHours: [11.2, 9.4],
        snowfallPotential: [0.28, 0.86],
        seaIcePotential: [0.12, 0.82],
        snowLineM: [7, 2.2],
        relativeHumidityPercent: [70, 92],
        evaporationMultiplier: [0.72, 0.32],
        nextSeason: 'First winter',
      },
      {
        id: 'winter',
        label: 'First winter',
        startsAt: winterAtSeconds,
        endsAt: Number.POSITIVE_INFINITY,
        temperatureOffsetC: [-4.4, -4.4],
        daylightHours: [9.4, 9.4],
        snowfallPotential: [1, 1],
        seaIcePotential: [1, 1],
        snowLineM: [1.5, 1.5],
        relativeHumidityPercent: [78, 78],
        evaporationMultiplier: [0.42, 0.42],
        nextSeason: null,
      },
    ];
  }

  sample(elapsedSeconds: number): SeasonState {
    const elapsed = Math.max(0, elapsedSeconds);
    const phase = this.phases.find((candidate) => elapsed < candidate.endsAt) ?? this.phases[this.phases.length - 1];
    const duration = phase.endsAt - phase.startsAt;
    const progress = Number.isFinite(duration)
      ? this.clamp((elapsed - phase.startsAt) / Math.max(0.001, duration), 0, 1)
      : 1;
    return {
      id: phase.id,
      label: phase.label,
      progress,
      daysUntilWinter: Math.max(0, (this.winterAtSeconds - elapsed) / this.dayLengthSeconds),
      winterAtSeconds: this.winterAtSeconds,
      temperatureOffsetC: this.lerp(phase.temperatureOffsetC[0], phase.temperatureOffsetC[1], progress),
      daylightHours: this.lerp(phase.daylightHours[0], phase.daylightHours[1], progress),
      snowfallPotential: this.lerp(phase.snowfallPotential[0], phase.snowfallPotential[1], progress),
      seaIcePotential: this.lerp(phase.seaIcePotential[0], phase.seaIcePotential[1], progress),
      snowLineM: this.lerp(phase.snowLineM[0], phase.snowLineM[1], progress),
      relativeHumidityPercent: this.lerp(phase.relativeHumidityPercent[0], phase.relativeHumidityPercent[1], progress),
      evaporationMultiplier: this.lerp(phase.evaporationMultiplier[0], phase.evaporationMultiplier[1], progress),
      nextSeason: phase.nextSeason,
    };
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

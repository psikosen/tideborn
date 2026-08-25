export type SeasonId = 'late-summer' | 'autumn' | 'storm-season' | 'winter' | 'spring' | 'summer';

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
 * Maps the campaign clock onto a full two-year seasonal arc: the first autumn
 * storm hardens into winter, then the climate cycles through thaw, growth, and
 * decline again. Surviving to the second spring is the campaign's victory.
 */
export class SeasonSystem {
  static readonly SEASON_LENGTH_DAYS = 2;

  private readonly phases: SeasonPhase[] = [];
  private readonly firstWinterAt: number;

  constructor(
    readonly dayLengthSeconds: number,
    readonly winterAtSeconds: number,
  ) {
    const day = dayLengthSeconds;
    this.firstWinterAt = winterAtSeconds;
    const seasonSpan = day * SeasonSystem.SEASON_LENGTH_DAYS;
    const winter1End = winterAtSeconds + seasonSpan;
    const spring1Start = winter1End;
    const spring1End = spring1Start + seasonSpan;
    const summerStart = spring1End;
    const summerEnd = summerStart + seasonSpan;
    const autumn2Start = summerEnd;
    const autumn2End = autumn2Start + seasonSpan;
    const winter2Start = autumn2End;
    const winter2End = winter2Start + seasonSpan;
    this.phases.push(
      {
        id: 'late-summer',
        label: 'Late summer',
        startsAt: 0,
        endsAt: day,
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
        startsAt: day,
        endsAt: day * 2.4,
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
        startsAt: day * 2.4,
        endsAt: winterAtSeconds,
        temperatureOffsetC: [-2.2, -4.4],
        daylightHours: [11.2, 9.4],
        snowfallPotential: [0.28, 0.86],
        seaIcePotential: [0.12, 0.82],
        snowLineM: [7, 2.2],
        relativeHumidityPercent: [70, 92],
        evaporationMultiplier: [0.72, 0.32],
        nextSeason: 'The first winter',
      },
      {
        id: 'winter',
        label: 'The first winter',
        startsAt: winterAtSeconds,
        endsAt: winter1End,
        temperatureOffsetC: [-4.4, -3.1],
        daylightHours: [9.4, 10.2],
        snowfallPotential: [1, 0.74],
        seaIcePotential: [1, 0.88],
        snowLineM: [1.5, 2.6],
        relativeHumidityPercent: [78, 82],
        evaporationMultiplier: [0.42, 0.5],
        nextSeason: 'First thaw',
      },
      {
        id: 'spring',
        label: 'First thaw',
        startsAt: spring1Start,
        endsAt: spring1End,
        temperatureOffsetC: [-3.1, 0.4],
        daylightHours: [10.2, 12.6],
        snowfallPotential: [0.42, 0.06],
        seaIcePotential: [0.88, 0.08],
        snowLineM: [2.6, 9.5],
        relativeHumidityPercent: [86, 68],
        evaporationMultiplier: [0.62, 1.08],
        nextSeason: 'Long sun',
      },
      {
        id: 'summer',
        label: 'Long sun',
        startsAt: summerStart,
        endsAt: summerEnd,
        temperatureOffsetC: [0.4, 0.9],
        daylightHours: [12.6, 14.6],
        snowfallPotential: [0.02, 0],
        seaIcePotential: [0.04, 0],
        snowLineM: [13, 15],
        relativeHumidityPercent: [58, 46],
        evaporationMultiplier: [1.16, 1.28],
        nextSeason: 'Second autumn',
      },
      {
        id: 'autumn',
        label: 'Second autumn',
        startsAt: autumn2Start,
        endsAt: autumn2End,
        temperatureOffsetC: [0.9, -1.8],
        daylightHours: [14.6, 11.4],
        snowfallPotential: [0, 0.24],
        seaIcePotential: [0, 0.1],
        snowLineM: [14, 7.4],
        relativeHumidityPercent: [46, 68],
        evaporationMultiplier: [1.26, 0.76],
        nextSeason: 'The second winter',
      },
      {
        id: 'winter',
        label: 'The second winter',
        startsAt: winter2Start,
        endsAt: winter2End,
        temperatureOffsetC: [-1.8, -4.8],
        daylightHours: [11.4, 9.2],
        snowfallPotential: [0.34, 1],
        seaIcePotential: [0.2, 1],
        snowLineM: [6.5, 1.4],
        relativeHumidityPercent: [70, 80],
        evaporationMultiplier: [0.7, 0.4],
        nextSeason: 'The second spring',
      },
      {
        id: 'spring',
        label: 'The second spring',
        startsAt: winter2End,
        endsAt: Number.POSITIVE_INFINITY,
        temperatureOffsetC: [-4.8, 1.2],
        daylightHours: [9.2, 13.4],
        snowfallPotential: [0.6, 0.02],
        seaIcePotential: [0.7, 0],
        snowLineM: [3.4, 12],
        relativeHumidityPercent: [84, 60],
        evaporationMultiplier: [0.66, 1.2],
        nextSeason: null,
      },
    );
  }

  get secondSpringAtSeconds(): number {
    return this.firstWinterAt + SeasonSystem.SEASON_LENGTH_DAYS * this.dayLengthSeconds * 4;
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
      daysUntilWinter: this.daysUntilNextWinter(elapsed),
      winterAtSeconds: this.nextWinterAt(elapsed),
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

  private nextWinterAt(elapsed: number): number {
    if (elapsed < this.phases[3].startsAt) return this.phases[3].startsAt;
    if (elapsed < this.phases[7].startsAt) return this.phases[7].startsAt;
    return Number.POSITIVE_INFINITY;
  }

  private daysUntilNextWinter(elapsed: number): number {
    const next = this.nextWinterAt(elapsed);
    if (!Number.isFinite(next)) return 0;
    return Math.max(0, (next - elapsed) / this.dayLengthSeconds);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

import { MaterialId } from './data';
import type { ToolId } from './ToolbeltSystem';

type PulseKind = 'jet' | 'blast' | 'ink' | 'dig' | 'gather' | 'hunt' | 'craft' | 'storm';

export type GameAudioCue =
  | 'stoneHammer' | 'bareArms' | 'shellSpade' | 'shellBlade' | 'stoneWedge' | 'toolEquip'
  | 'digWetSand' | 'digSoil' | 'digMud' | 'digClay' | 'digGravel' | 'digLimestone' | 'digBasalt'
  | 'jet' | 'jetBlast' | 'jetBlastImpact' | 'ink' | 'camouflageOn' | 'camouflageOff'
  | 'gripLock' | 'grabRelease' | 'brace'
  | 'collectGeneric' | 'collectFiber' | 'collectStone' | 'collectWood' | 'collectBiolight' | 'rareMineral'
  | 'eatFish' | 'eatTubeWorm' | 'feedingCapture' | 'fishScatter' | 'sharkDetect' | 'predatorSpotted'
  | 'orcaClicks' | 'crabScuttle' | 'craftStart' | 'craftSuccess' | 'octipointEarned'
  | 'settingsOpen' | 'settingsClose' | 'gridNodeActivated' | 'gridDenied' | 'denClaim' | 'denDecoration'
  | 'thunderNear' | 'thunderFar' | 'ambienceCoast' | 'ambienceOpenOcean' | 'ambienceMidnight';

interface CueDefinition {
  label: string;
  files: readonly string[];
  volume: number;
  cooldownMs?: number;
  preload?: boolean;
  ambience?: boolean;
}

interface PlayOptions {
  volume?: number;
  playbackRate?: number;
  delaySeconds?: number;
  pan?: number;
}

interface PlayedCue {
  cue: GameAudioCue;
  label: string;
  variant: number;
  file: string;
  atMs: number;
}

export type MusicMood = 'coast' | 'open-ocean' | 'deep' | 'storm' | 'winter';

export type MusicTrackId =
  | 'blueSaltGlide' | 'frostReefRun' | 'iceTideA' | 'iceTideB' | 'saltwaterSurge'
  | 'tideCircuitA' | 'tideCircuitB' | 'tideDrift' | 'tideMapA' | 'tideMapB' | 'tidebreakSprint';

interface MusicTrackDefinition {
  label: string;
  file: string;
  volume: number;
}

interface MusicSlot {
  element: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

const sfx = (name: string) => `./assets/audio/sfx/${name}.mp3`;
const ambience = (name: string) => `./assets/audio/ambience/${name}.mp3`;
const music = (name: string) => `./assets/audio/music/${name}.mp3`;

export const GAME_AUDIO_CUES: Readonly<Record<GameAudioCue, CueDefinition>> = {
  stoneHammer: { label: 'Stone hammer impact', files: [sfx('stone-hammer-a'), sfx('stone-hammer-b')], volume: 0.9, cooldownMs: 65, preload: true },
  bareArms: { label: 'Bare-arm excavation', files: [sfx('bare-arms-a'), sfx('bare-arms-b')], volume: 0.65, cooldownMs: 70, preload: true },
  shellSpade: { label: 'Shell spade scrape', files: [sfx('shell-spade')], volume: 0.72, cooldownMs: 70, preload: true },
  shellBlade: { label: 'Shell blade slice', files: [sfx('shell-blade')], volume: 0.7, cooldownMs: 75 },
  stoneWedge: { label: 'Stone wedge pry', files: [sfx('stone-wedge')], volume: 0.78, cooldownMs: 90 },
  toolEquip: { label: 'Tool equipped', files: [sfx('tool-equip')], volume: 0.48, cooldownMs: 80, preload: true },
  digWetSand: { label: 'Wet sand excavation', files: [sfx('dig-wet-sand-a'), sfx('dig-wet-sand-b')], volume: 0.48, cooldownMs: 65, preload: true },
  digSoil: { label: 'Soil excavation', files: [sfx('dig-soil')], volume: 0.48, cooldownMs: 65 },
  digMud: { label: 'Mud excavation', files: [sfx('dig-mud')], volume: 0.48, cooldownMs: 65 },
  digClay: { label: 'Clay excavation', files: [sfx('dig-clay')], volume: 0.52, cooldownMs: 65, preload: true },
  digGravel: { label: 'Gravel excavation', files: [sfx('dig-gravel')], volume: 0.5, cooldownMs: 65 },
  digLimestone: { label: 'Limestone fracture', files: [sfx('dig-limestone')], volume: 0.52, cooldownMs: 65 },
  digBasalt: { label: 'Basalt fracture', files: [sfx('dig-basalt')], volume: 0.56, cooldownMs: 65 },
  jet: { label: 'Jet release', files: [sfx('jet-release')], volume: 0.84, cooldownMs: 120, preload: true },
  jetBlast: { label: 'Jet Blast release', files: [sfx('jet-blast-release-a'), sfx('jet-blast-release-b')], volume: 1, cooldownMs: 180, preload: true },
  jetBlastImpact: { label: 'Jet Blast impact', files: [sfx('jet-blast-impact-a'), sfx('jet-blast-impact-b')], volume: 0.82, cooldownMs: 120 },
  ink: { label: 'Ink release', files: [sfx('ink-release')], volume: 0.72, cooldownMs: 180, preload: true },
  camouflageOn: { label: 'Camouflage engaged', files: [sfx('camouflage-on-a'), sfx('camouflage-on-b')], volume: 0.52, cooldownMs: 180 },
  camouflageOff: { label: 'Camouflage released', files: [sfx('camouflage-off')], volume: 0.45, cooldownMs: 180 },
  gripLock: { label: 'Sucker grip lock', files: [sfx('grip-lock')], volume: 0.66, cooldownMs: 120 },
  grabRelease: { label: 'Suckers release', files: [sfx('grab-release-a'), sfx('grab-release-b')], volume: 0.58, cooldownMs: 90 },
  brace: { label: 'Eight-arm brace', files: [sfx('brace')], volume: 0.66, cooldownMs: 140 },
  collectGeneric: { label: 'Resource collected', files: [sfx('collect-generic')], volume: 0.56, cooldownMs: 75, preload: true },
  collectFiber: { label: 'Fiber collected', files: [sfx('collect-fiber')], volume: 0.58, cooldownMs: 75 },
  collectStone: { label: 'Stone collected', files: [sfx('collect-stone')], volume: 0.58, cooldownMs: 75 },
  collectWood: { label: 'Wood collected', files: [sfx('collect-wood')], volume: 0.58, cooldownMs: 75 },
  collectBiolight: { label: 'Biolight collected', files: [sfx('collect-biolight')], volume: 0.62, cooldownMs: 100 },
  rareMineral: { label: 'Rare mineral resonance', files: [sfx('rare-mineral-a'), sfx('rare-mineral-b')], volume: 0.7, cooldownMs: 180 },
  eatFish: { label: 'Fish eaten', files: [sfx('eat-fish-a'), sfx('eat-fish-b')], volume: 0.62, cooldownMs: 110, preload: true },
  eatTubeWorm: { label: 'Tube worm eaten', files: [sfx('eat-tube-worm')], volume: 0.62, cooldownMs: 110 },
  feedingCapture: { label: 'Predator feeding capture', files: [sfx('feeding-capture')], volume: 0.72, cooldownMs: 260 },
  fishScatter: { label: 'Fish school scattering', files: [sfx('fish-scatter-a'), sfx('fish-scatter-b')], volume: 0.42, cooldownMs: 300 },
  sharkDetect: { label: 'Shark detects prey', files: [sfx('shark-detect-a'), sfx('shark-detect-b')], volume: 0.72, cooldownMs: 900 },
  predatorSpotted: { label: 'Predator spotted alert', files: [sfx('predator-spotted')], volume: 0.86, cooldownMs: 850, preload: true },
  orcaClicks: { label: 'Orca echolocation', files: [sfx('orca-clicks')], volume: 0.58, cooldownMs: 650 },
  crabScuttle: { label: 'Crab scuttle on sand', files: [sfx('crab-scuttle')], volume: 0.34, cooldownMs: 350 },
  craftStart: { label: 'Crafting begins', files: [sfx('craft-start')], volume: 0.46, cooldownMs: 100 },
  craftSuccess: { label: 'Crafting completed', files: [sfx('craft-success')], volume: 0.68, cooldownMs: 100, preload: true },
  octipointEarned: { label: 'Octipoint earned', files: [sfx('octipoint-earned')], volume: 0.78, cooldownMs: 500 },
  settingsOpen: { label: 'Settings opened', files: [sfx('settings-open')], volume: 0.4, cooldownMs: 100 },
  settingsClose: { label: 'Settings closed', files: [sfx('settings-close')], volume: 0.4, cooldownMs: 100 },
  gridNodeActivated: { label: 'Octipoint node activated', files: [sfx('grid-node-activated')], volume: 0.72, cooldownMs: 160 },
  gridDenied: { label: 'Insufficient Octipoints', files: [sfx('grid-denied-a'), sfx('grid-denied-b')], volume: 0.5, cooldownMs: 180 },
  denClaim: { label: 'Den claimed', files: [sfx('den-claim')], volume: 0.72, cooldownMs: 220 },
  denDecoration: { label: 'Den decoration placed', files: [sfx('den-decoration')], volume: 0.58, cooldownMs: 120 },
  thunderNear: { label: 'Nearby thunder', files: [sfx('thunder-near')], volume: 0.9, cooldownMs: 250 },
  thunderFar: { label: 'Distant thunder', files: [sfx('thunder-far')], volume: 0.62, cooldownMs: 250 },
  ambienceCoast: { label: 'Coastal ambience', files: [ambience('coast')], volume: 0.24, ambience: true, preload: true },
  ambienceOpenOcean: { label: 'Open-ocean ambience', files: [ambience('open-ocean')], volume: 0.2, ambience: true, preload: true },
  ambienceMidnight: { label: 'Midnight-zone ambience', files: [ambience('midnight')], volume: 0.2, ambience: true, preload: true },
};

export const GAME_MUSIC_TRACKS: Readonly<Record<MusicTrackId, MusicTrackDefinition>> = {
  blueSaltGlide: { label: 'Blue Salt Glide', file: music('blue-salt-glide'), volume: 0.68 },
  frostReefRun: { label: 'Frost Reef Run', file: music('frost-reef-run'), volume: 0.72 },
  iceTideA: { label: 'Ice Tide · Current I', file: music('ice-tide-a'), volume: 0.66 },
  iceTideB: { label: 'Ice Tide · Current II', file: music('ice-tide-b'), volume: 0.66 },
  saltwaterSurge: { label: 'Saltwater Surge', file: music('saltwater-surge'), volume: 0.72 },
  tideCircuitA: { label: 'Tide Circuit · Current I', file: music('tide-circuit-a'), volume: 0.67 },
  tideCircuitB: { label: 'Tide Circuit · Current II', file: music('tide-circuit-b'), volume: 0.67 },
  tideDrift: { label: 'Tide Drift', file: music('tide-drift'), volume: 0.64 },
  tideMapA: { label: 'Tide Map · Current I', file: music('tide-map-a'), volume: 0.66 },
  tideMapB: { label: 'Tide Map · Current II', file: music('tide-map-b'), volume: 0.66 },
  tidebreakSprint: { label: 'Tidebreak Sprint', file: music('tidebreak-sprint'), volume: 0.74 },
};

const MUSIC_PLAYLISTS: Readonly<Record<MusicMood, readonly MusicTrackId[]>> = {
  coast: ['tideMapA', 'blueSaltGlide', 'tideMapB', 'tideDrift'],
  'open-ocean': ['blueSaltGlide', 'tideCircuitA', 'tideMapB', 'tideCircuitB', 'tideDrift'],
  deep: ['tideDrift', 'tideCircuitB', 'saltwaterSurge', 'tideCircuitA'],
  storm: ['saltwaterSurge', 'tidebreakSprint', 'frostReefRun'],
  winter: ['iceTideA', 'frostReefRun', 'iceTideB', 'blueSaltGlide'],
};

const MATERIAL_CUE: Partial<Record<MaterialId, GameAudioCue>> = {
  [MaterialId.Sand]: 'digWetSand',
  [MaterialId.WetSand]: 'digWetSand',
  [MaterialId.Soil]: 'digSoil',
  [MaterialId.Mud]: 'digMud',
  [MaterialId.Clay]: 'digClay',
  [MaterialId.Limestone]: 'digLimestone',
  [MaterialId.Basalt]: 'digBasalt',
  [MaterialId.CrushedShell]: 'digGravel',
  [MaterialId.Mineral]: 'digGravel',
  [MaterialId.Ice]: 'digLimestone',
  [MaterialId.Snow]: 'digWetSand',
};

const TOOL_CUE: Partial<Record<ToolId, GameAudioCue>> = {
  arms: 'bareArms', shellBlade: 'shellBlade', shellSpade: 'shellSpade', stoneHammer: 'stoneHammer',
  stoneWedge: 'stoneWedge', stoneAdze: 'stoneHammer',
};

export class GameAudioSystem {
  private ctx?: AudioContext;
  private master?: GainNode;
  private sampleFilter?: BiquadFilterNode;
  private sampleBus?: GainNode;
  private ambienceBus?: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private pendingBuffers = new Map<string, Promise<AudioBuffer>>();
  private failed = new Set<string>();
  private variantCursor = new Map<GameAudioCue, number>();
  private lastPlayAt = new Map<GameAudioCue, number>();
  private playCounts = new Map<GameAudioCue, number>();
  private recent: PlayedCue[] = [];
  private ambientCue?: GameAudioCue;
  private ambientSource?: AudioBufferSourceNode;
  private ambientGain?: GainNode;
  private ambienceRequest = 0;
  private masterVolume = 0.16;
  private musicBus?: GainNode;
  private musicFilter?: BiquadFilterNode;
  private musicSlots: MusicSlot[] = [];
  private musicSlotGeneration = [0, 0];
  private activeMusicSlot = -1;
  private musicMood: MusicMood = 'coast';
  private currentTrack?: MusicTrackId;
  private musicCursor = new Map<MusicMood, number>();
  private musicVolume = 0.55;
  private musicFailures = new Set<string>();
  private musicRetryTimer = 0;
  private musicHistory: Array<{ track: MusicTrackId; label: string; mood: MusicMood }> = [];

  start(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.master.connect(this.ctx.destination);
      this.sampleFilter = this.ctx.createBiquadFilter();
      this.sampleFilter.type = 'lowpass';
      this.sampleFilter.frequency.value = 14000;
      this.sampleBus = this.ctx.createGain();
      this.sampleBus.connect(this.sampleFilter).connect(this.master);
      this.ambienceBus = this.ctx.createGain();
      this.ambienceBus.gain.value = 0.72;
      this.ambienceBus.connect(this.sampleFilter);
      this.musicFilter = this.ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 14000;
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.musicFilter).connect(this.master);
      this.setupMusicSlots();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    for (const definition of Object.values(GAME_AUDIO_CUES)) {
      if (!definition.preload) continue;
      for (const file of definition.files) void this.load(file);
    }
    if (!this.currentTrack) this.playNextMusic();
  }

  setMuted(muted: boolean): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(muted ? 0 : this.masterVolume, this.ctx.currentTime, 0.025);
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (!this.ctx || this.activeMusicSlot < 0) return;
    const slot = this.musicSlots[this.activeMusicSlot];
    const definition = this.currentTrack ? GAME_MUSIC_TRACKS[this.currentTrack] : undefined;
    slot.gain.gain.setTargetAtTime((definition?.volume ?? 0.65) * this.musicVolume, this.ctx.currentTime, 0.05);
  }

  nextMusic(): void {
    if (!this.ctx) return;
    this.playNextMusic();
  }

  pulse(kind: PulseKind): void {
    const sampled: Partial<Record<PulseKind, GameAudioCue>> = {
      jet: 'jet', blast: 'jetBlast', ink: 'ink', dig: 'bareArms', gather: 'collectGeneric',
      hunt: 'eatFish', craft: 'craftSuccess', storm: 'thunderFar',
    };
    const cue = sampled[kind];
    if (cue) this.play(cue);
    this.synthPulse(kind, cue ? 0.32 : 1);
  }

  dig(tool: ToolId, material: MaterialId): void {
    this.play(TOOL_CUE[tool] ?? 'bareArms', { volume: 0.92 });
    const materialCue = MATERIAL_CUE[material];
    if (materialCue) this.play(materialCue, { volume: 0.72, delaySeconds: 0.025 });
    this.synthPulse('dig', 0.18);
  }

  collect(kind: 'generic' | 'fiber' | 'stone' | 'wood' | 'biolight' | 'mineral'): void {
    const cues: Record<typeof kind, GameAudioCue> = {
      generic: 'collectGeneric', fiber: 'collectFiber', stone: 'collectStone', wood: 'collectWood',
      biolight: 'collectBiolight', mineral: 'rareMineral',
    };
    this.play(cues[kind]);
  }

  play(cue: GameAudioCue, options: PlayOptions = {}): void {
    if (!this.ctx || !this.sampleBus) return;
    const definition = GAME_AUDIO_CUES[cue];
    const nowMs = performance.now();
    if (nowMs - (this.lastPlayAt.get(cue) ?? -Infinity) < (definition.cooldownMs ?? 0)) return;
    this.lastPlayAt.set(cue, nowMs);
    const previous = this.variantCursor.get(cue) ?? -1;
    const variant = definition.files.length > 1 ? (previous + 1) % definition.files.length : 0;
    this.variantCursor.set(cue, variant);
    const file = definition.files[variant];
    this.playCounts.set(cue, (this.playCounts.get(cue) ?? 0) + 1);
    this.recent.push({ cue, label: definition.label, variant: variant + 1, file, atMs: Math.round(nowMs) });
    if (this.recent.length > 16) this.recent.splice(0, this.recent.length - 16);
    const requestedAt = performance.now();
    void this.load(file).then((buffer) => {
      if (!this.ctx || !this.sampleBus || performance.now() - requestedAt > 1800) return;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = options.playbackRate ?? 1;
      const gain = this.ctx.createGain();
      gain.gain.value = definition.volume * (options.volume ?? 1);
      source.connect(gain);
      if (typeof options.pan === 'number' && 'createStereoPanner' in this.ctx) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, options.pan));
        gain.connect(panner).connect(this.sampleBus);
      } else gain.connect(this.sampleBus);
      source.start(this.ctx.currentTime + (options.delaySeconds ?? 0));
    }).catch(() => undefined);
  }

  updateEnvironment(
    depthM: number,
    underwater: boolean,
    context: { stormStrength?: number; winter?: boolean } = {},
  ): void {
    if (!this.ctx || !this.sampleFilter) return;
    const cutoff = underwater ? Math.max(1100, 11800 - Math.log10(Math.max(1, depthM + 1)) * 3600) : 15000;
    this.sampleFilter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.18);
    const musicCutoff = underwater ? Math.max(3600, 14200 - Math.log10(Math.max(1, depthM + 1)) * 2600) : 16000;
    this.musicFilter?.frequency.setTargetAtTime(musicCutoff, this.ctx.currentTime, 0.45);
    const next: GameAudioCue = depthM >= 1000
      ? 'ambienceMidnight'
      : depthM >= 120
        ? 'ambienceOpenOcean'
        : 'ambienceCoast';
    if (next !== this.ambientCue) this.setAmbience(next);
    if (this.ambientGain) {
      const target = underwater ? GAME_AUDIO_CUES[next].volume : GAME_AUDIO_CUES[next].volume * 0.52;
      this.ambientGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.35);
    }
    const mood: MusicMood = context.winter
      ? 'winter'
      : (context.stormStrength ?? 0) >= 0.48
        ? 'storm'
        : depthM >= 1000
          ? 'deep'
          : depthM >= 120
            ? 'open-ocean'
            : 'coast';
    this.setMusicMood(mood);
  }

  thunder(strength: number, distanceM: number): void {
    const near = distanceM < 180;
    this.play(near ? 'thunderNear' : 'thunderFar', { volume: Math.min(1, 0.58 + strength * 0.42) });
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const body = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(near ? 52 : 37, now);
    body.frequency.exponentialRampToValueAtTime(near ? 24 : 19, now + 1.9);
    bodyGain.gain.setValueAtTime((near ? 0.035 : 0.018) * strength, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 1.9);
    body.connect(bodyGain).connect(this.master);
    body.start(now);
    body.stop(now + 1.9);
  }

  snapshot(): object {
    const cueFiles = new Set(Object.values(GAME_AUDIO_CUES).flatMap((definition) => definition.files));
    const allFiles = new Set([...cueFiles, ...Object.values(GAME_MUSIC_TRACKS).map((track) => track.file)]);
    const activeMusic = this.activeMusicSlot >= 0 ? this.musicSlots[this.activeMusicSlot]?.element : undefined;
    return {
      started: Boolean(this.ctx),
      contextState: this.ctx?.state ?? 'not-started',
      cueCount: Object.keys(GAME_AUDIO_CUES).length,
      musicTrackCount: Object.keys(GAME_MUSIC_TRACKS).length,
      runtimeFileCount: allFiles.size,
      loadedFiles: this.buffers.size,
      pendingFiles: this.pendingBuffers.size,
      failedFiles: [...this.failed],
      currentAmbience: this.ambientCue ? GAME_AUDIO_CUES[this.ambientCue].label : 'none',
      music: {
        mood: this.musicMood,
        currentTrack: this.currentTrack ? GAME_MUSIC_TRACKS[this.currentTrack].label : 'none',
        currentFile: this.currentTrack ? GAME_MUSIC_TRACKS[this.currentTrack].file : null,
        playing: Boolean(activeMusic && !activeMusic.paused),
        currentSeconds: Number((activeMusic?.currentTime ?? 0).toFixed(2)),
        durationSeconds: Number.isFinite(activeMusic?.duration) ? Number(activeMusic!.duration.toFixed(2)) : 0,
        volume: Number(this.musicVolume.toFixed(2)),
        failedTracks: [...this.musicFailures],
        recentTracks: this.musicHistory.slice(-6),
      },
      playCounts: Object.fromEntries(this.playCounts),
      nextVariants: Object.fromEntries(Object.entries(GAME_AUDIO_CUES)
        .filter(([, definition]) => definition.files.length > 1)
        .map(([cue, definition]) => [cue, ((this.variantCursor.get(cue as GameAudioCue) ?? -1) + 1) % definition.files.length + 1])),
      recent: this.recent,
    };
  }

  private setupMusicSlots(): void {
    if (!this.ctx || !this.musicBus || this.musicSlots.length) return;
    for (let index = 0; index < 2; index += 1) {
      const element = new Audio();
      element.preload = 'metadata';
      element.loop = false;
      element.setAttribute('playsinline', '');
      const source = this.ctx.createMediaElementSource(element);
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(this.musicBus);
      element.addEventListener('ended', () => {
        if (this.activeMusicSlot === index) this.playNextMusic();
      });
      element.addEventListener('error', () => {
        if (element.currentSrc) this.musicFailures.add(element.currentSrc);
      });
      this.musicSlots.push({ element, source, gain });
    }
  }

  private setMusicMood(mood: MusicMood): void {
    if (mood === this.musicMood) return;
    this.musicMood = mood;
    const playlist = MUSIC_PLAYLISTS[mood];
    const urgent = mood === 'storm' || mood === 'winter';
    if (!this.currentTrack || urgent || !playlist.includes(this.currentTrack)) this.playNextMusic();
  }

  private playNextMusic(): void {
    const playlist = MUSIC_PLAYLISTS[this.musicMood];
    let cursor = this.musicCursor.get(this.musicMood) ?? 0;
    let next = playlist[cursor % playlist.length];
    if (next === this.currentTrack && playlist.length > 1) {
      cursor += 1;
      next = playlist[cursor % playlist.length];
    }
    this.musicCursor.set(this.musicMood, cursor + 1);
    this.playMusicTrack(next);
  }

  private playMusicTrack(track: MusicTrackId): void {
    if (!this.ctx || !this.musicBus || this.musicSlots.length < 2) return;
    const definition = GAME_MUSIC_TRACKS[track];
    const previousIndex = this.activeMusicSlot;
    const nextIndex = previousIndex < 0 ? 0 : 1 - previousIndex;
    const next = this.musicSlots[nextIndex];
    this.musicSlotGeneration[nextIndex] += 1;
    const now = this.ctx.currentTime;
    next.element.pause();
    next.element.src = definition.file;
    next.element.currentTime = 0;
    next.element.load();
    next.gain.gain.cancelScheduledValues(now);
    next.gain.gain.setValueAtTime(0.001, now);
    next.gain.gain.linearRampToValueAtTime(definition.volume * this.musicVolume, now + 2.4);
    if (previousIndex >= 0) {
      const previous = this.musicSlots[previousIndex];
      const previousGeneration = this.musicSlotGeneration[previousIndex];
      previous.gain.gain.cancelScheduledValues(now);
      previous.gain.gain.setValueAtTime(previous.gain.gain.value, now);
      previous.gain.gain.linearRampToValueAtTime(0.001, now + 2.4);
      window.setTimeout(() => {
        if (this.activeMusicSlot !== previousIndex && this.musicSlotGeneration[previousIndex] === previousGeneration) previous.element.pause();
      }, 2700);
    }
    this.activeMusicSlot = nextIndex;
    this.currentTrack = track;
    this.musicHistory.push({ track, label: definition.label, mood: this.musicMood });
    if (this.musicHistory.length > 12) this.musicHistory.splice(0, this.musicHistory.length - 12);
    void next.element.play()
      .then(() => this.musicFailures.delete(new URL(definition.file, window.location.href).href))
      .catch((error: DOMException) => {
        // A rapid biome/season crossfade intentionally interrupts the prior
        // slot's pending play request; that AbortError is not a bad track.
        if (error.name === 'NotAllowedError') {
          this.queueMusicRetry();
          return;
        }
        if (error.name !== 'AbortError') this.musicFailures.add(definition.file);
      });
  }

  private queueMusicRetry(): void {
    if (this.musicRetryTimer !== 0) return;
    this.musicRetryTimer = window.setTimeout(() => {
      this.musicRetryTimer = 0;
      if (this.ctx && this.ctx.state === 'running') this.playNextMusic();
    }, 1600);
  }

  heartbeat(): void {
    if (!this.ctx || this.activeMusicSlot < 0) return;
    const element = this.musicSlots[this.activeMusicSlot]?.element;
    if (!element || !element.paused || element.ended) return;
    if (this.ctx.state !== 'running') {
      void this.ctx.resume();
      return;
    }
    void element.play().catch(() => this.queueMusicRetry());
  }

  private async load(file: string): Promise<AudioBuffer> {
    const existing = this.buffers.get(file);
    if (existing) return existing;
    const pending = this.pendingBuffers.get(file);
    if (pending) return pending;
    if (!this.ctx) throw new Error('Audio context has not started.');
    const promise = fetch(file)
      .then((response) => {
        if (!response.ok) throw new Error(`Audio fetch failed: ${response.status} ${file}`);
        return response.arrayBuffer();
      })
      .then((bytes) => this.ctx!.decodeAudioData(bytes))
      .then((buffer) => {
        this.buffers.set(file, buffer);
        this.failed.delete(file);
        return buffer;
      })
      .catch((error) => {
        this.failed.add(file);
        throw error;
      })
      .finally(() => this.pendingBuffers.delete(file));
    this.pendingBuffers.set(file, promise);
    return promise;
  }

  private setAmbience(cue: GameAudioCue): void {
    if (!this.ctx || !this.ambienceBus || this.ambientCue === cue) return;
    this.ambientCue = cue;
    const request = ++this.ambienceRequest;
    const definition = GAME_AUDIO_CUES[cue];
    void this.load(definition.files[0]).then((buffer) => {
      if (!this.ctx || !this.ambienceBus || request !== this.ambienceRequest) return;
      const now = this.ctx.currentTime;
      if (this.ambientGain && this.ambientSource) {
        this.ambientGain.gain.cancelScheduledValues(now);
        this.ambientGain.gain.setTargetAtTime(0.001, now, 0.16);
        this.ambientSource.stop(now + 0.7);
      }
      const source = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.setTargetAtTime(definition.volume, now, 0.28);
      source.connect(gain).connect(this.ambienceBus);
      source.start(now);
      this.ambientSource = source;
      this.ambientGain = gain;
    }).catch(() => undefined);
  }

  private synthPulse(kind: PulseKind, level: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    const config = {
      jet: [100, 46, 0.16], blast: [138, 31, 0.48], ink: [82, 31, 0.42], dig: [72, 45, 0.08],
      gather: [310, 480, 0.12], hunt: [185, 520, 0.18], craft: [220, 660, 0.24], storm: [58, 27, 0.6],
    }[kind];
    osc.type = kind === 'dig' || kind === 'storm' ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(config[0], now);
    osc.frequency.exponentialRampToValueAtTime(config[1], now + config[2]);
    gain.gain.setValueAtTime(0.045 * level, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + config[2]);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + config[2]);
  }
}

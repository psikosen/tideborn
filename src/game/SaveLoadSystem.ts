export const SCHEMA_VERSION = 2;

export const AUTOSAVE_SLOT = 'tideborn-autosave';

export const MANUAL_SLOTS: readonly string[] = ['tideborn-slot-1', 'tideborn-slot-2', 'tideborn-slot-3'];

const ALL_SLOTS: readonly string[] = [AUTOSAVE_SLOT, ...MANUAL_SLOTS];

const V1_DAY_LENGTH_SECONDS = 90;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export interface SaveLoadOptions {
  getElapsedSeconds?: () => number;
  getDayNumber?: () => number;
  getPlaytimeSeconds?: () => number | undefined;
}

export interface SaveEnvelope {
  version: number;
  savedAtEpochMs: number;
  elapsedSeconds: number;
  dayNumber: number;
  playtimeSeconds?: number;
  sections: Record<string, unknown>;
  checksum?: number;
}

export interface SectionHandlers {
  save: () => unknown;
  load: (data: unknown) => void;
}

export interface RestoreResult {
  ok: boolean;
  version?: number;
  migratedFrom?: number;
  missingSections: string[];
  error?: string;
}

export interface SlotPeek {
  exists: boolean;
  version?: number;
  savedAt?: number;
  day?: number;
  sectionKeys: string[];
}

export interface SlotMetadata extends SlotPeek {
  slotName: string;
}

interface ParsedPayload {
  envelope: Partial<SaveEnvelope>;
  migratedFrom?: number;
}

export class SaveLoadSystem {
  private readonly handlers = new Map<string, SectionHandlers>();
  private readonly options: SaveLoadOptions;
  private lastErrorValue: string | null = null;

  constructor(options: SaveLoadOptions = {}) {
    this.options = options;
  }

  get lastError(): string | null {
    return this.lastErrorValue;
  }

  register(key: string, handlers: SectionHandlers): void {
    this.handlers.set(key, handlers);
  }

  unregister(key: string): void {
    this.handlers.delete(key);
  }

  registeredKeys(): string[] {
    return [...this.handlers.keys()];
  }

  autosave(): boolean {
    return this.persist(AUTOSAVE_SLOT);
  }

  persist(slotName: string): boolean {
    const sections: Record<string, unknown> = {};
    for (const [key, handler] of this.handlers) {
      try {
        sections[key] = handler.save();
      } catch {
        this.lastErrorValue = `section-save-failed:${key}`;
        return false;
      }
    }
    const elapsedSeconds = this.readNumber(this.options.getElapsedSeconds);
    const dayNumber = this.readNumber(this.options.getDayNumber);
    const playtimeSeconds = this.options.getPlaytimeSeconds?.();
    const envelope: SaveEnvelope = {
      version: SCHEMA_VERSION,
      savedAtEpochMs: Date.now(),
      elapsedSeconds,
      dayNumber,
      sections,
      checksum: this.fnv1a(JSON.stringify(sections)),
    };
    if (playtimeSeconds !== undefined) envelope.playtimeSeconds = playtimeSeconds;
    let serialized: string;
    try {
      serialized = JSON.stringify(envelope);
    } catch {
      this.lastErrorValue = 'serialize-failed';
      return false;
    }
    if (!this.writeRaw(slotName, serialized)) return false;
    this.lastErrorValue = null;
    return true;
  }

  restore(slotName: string): RestoreResult {
    const raw = this.readRaw(slotName);
    if (raw === null) {
      this.lastErrorValue = this.lastErrorValue ?? 'slot-empty';
      return { ok: false, missingSections: [], error: this.lastErrorValue };
    }
    const parsed = this.parsePayload(raw);
    if (!parsed.ok) {
      this.lastErrorValue = parsed.error;
      return { ok: false, missingSections: [], error: parsed.error };
    }
    const { envelope, migratedFrom } = parsed.payload;
    const sections = envelope.sections;
    if (!this.isRecord(sections)) {
      this.lastErrorValue = 'invalid-sections';
      return { ok: false, version: envelope.version, missingSections: [], error: this.lastErrorValue };
    }
    if (!migratedFrom && typeof envelope.checksum === 'number') {
      if (envelope.checksum !== this.fnv1a(JSON.stringify(sections))) {
        this.lastErrorValue = 'checksum-mismatch';
        return { ok: false, version: envelope.version, missingSections: [], error: this.lastErrorValue };
      }
    }
    const missingSections: string[] = [];
    for (const key of Object.keys(sections)) {
      if (!this.handlers.has(key)) missingSections.push(key);
    }
    missingSections.sort();
    for (const [key, handler] of this.handlers) {
      if (!(key in sections)) continue;
      try {
        handler.load(sections[key]);
      } catch {
        this.lastErrorValue = `section-load-failed:${key}`;
        return {
          ok: false,
          version: envelope.version,
          ...(migratedFrom ? { migratedFrom } : {}),
          missingSections,
          error: this.lastErrorValue,
        };
      }
    }
    this.lastErrorValue = null;
    return {
      ok: true,
      version: envelope.version,
      ...(migratedFrom ? { migratedFrom } : {}),
      missingSections,
    };
  }

  peekSlot(slotName: string): SlotPeek {
    const raw = this.readRaw(slotName);
    if (raw === null) return { exists: false, sectionKeys: [] };
    const parsed = this.parsePayload(raw);
    if (!parsed.ok) return { exists: true, sectionKeys: [] };
    const { envelope } = parsed.payload;
    return {
      exists: true,
      version: envelope.version,
      savedAt: envelope.savedAtEpochMs,
      day: envelope.dayNumber,
      sectionKeys: this.isRecord(envelope.sections) ? Object.keys(envelope.sections) : [],
    };
  }

  listSlots(): SlotMetadata[] {
    return ALL_SLOTS.map((slotName) => ({ slotName, ...this.peekSlot(slotName) }));
  }

  eraseSlot(slotName: string): boolean {
    try {
      window.localStorage.removeItem(slotName);
      this.lastErrorValue = null;
      return true;
    } catch {
      this.lastErrorValue = 'storage-unavailable';
      return false;
    }
  }

  private parsePayload(raw: string): { ok: true; payload: ParsedPayload } | { ok: false; error: string } {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'corrupt-json' };
    }
    if (!this.isRecord(value)) return { ok: false, error: 'corrupt-payload' };
    const version = value['version'];
    if (version === SCHEMA_VERSION) {
      return { ok: true, payload: { envelope: value as Partial<SaveEnvelope> } };
    }
    if (version === 1) {
      const elapsed = typeof value['elapsed'] === 'number' ? value['elapsed'] : 0;
      const sections: Record<string, unknown> = {
        core: {
          elapsed,
          player: value['player'] ?? null,
          inventory: value['inventory'] ?? null,
          gathered: Array.isArray(value['gathered']) ? value['gathered'] : [],
        },
        ecosystem: value['ecosystem'] ?? null,
        progression: {
          jetBlastMastery: typeof value['jetBlastMastery'] === 'number' ? value['jetBlastMastery'] : 0,
          octipoints: value['octipoints'] ?? null,
          equippedTool: value['equippedTool'] ?? null,
        },
        map: Array.isArray(value['worldMapExploration']) ? value['worldMapExploration'] : [],
        dens: value['denNetwork'] ?? null,
      };
      return {
        ok: true,
        payload: {
          migratedFrom: 1,
          envelope: {
            version: SCHEMA_VERSION,
            savedAtEpochMs: 0,
            elapsedSeconds: elapsed,
            dayNumber: Math.floor(Math.max(0, elapsed) / V1_DAY_LENGTH_SECONDS),
            sections,
          },
        },
      };
    }
    return { ok: false, error: 'unsupported-version' };
  }

  private readRaw(slotName: string): string | null {
    try {
      return window.localStorage.getItem(slotName);
    } catch {
      this.lastErrorValue = 'storage-unavailable';
      return null;
    }
  }

  private writeRaw(slotName: string, value: string): boolean {
    try {
      window.localStorage.setItem(slotName, value);
      return true;
    } catch {
      this.lastErrorValue = 'quota-exceeded';
      return false;
    }
  }

  private readNumber(provider?: () => number): number {
    const value = provider?.();
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private fnv1a(input: string): number {
    let hash = FNV_OFFSET_BASIS;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, FNV_PRIME);
    }
    return hash >>> 0;
  }
}

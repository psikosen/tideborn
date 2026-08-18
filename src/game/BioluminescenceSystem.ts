export interface BiolightUpdate {
  carriedExpired: number;
  denExpired: Array<{ denId: string; count: number }>;
}

export interface BiolightSnapshot {
  lifetimePerFrondSeconds: number;
  carried: { stacks: number; active: boolean; remainingSeconds: number; brightness: number };
  dens: Array<{ denId: string; stacks: number; active: boolean; remainingSeconds: number; brightness: number }>;
}

/**
 * Limited living-light reserves. One frond in each source is metabolically
 * active while additional fronds remain as stacked reserves, making every
 * harvest extend exploration time without turning the light into a permanent
 * unlock. Den lights use the same charge model but render steadily.
 */
export class BioluminescenceSystem {
  private carriedCharges: number[] = [];
  private denCharges = new Map<string, number[]>();

  constructor(readonly lifetimePerFrondSeconds: number) {}

  addCarried(): void {
    this.carriedCharges.push(this.lifetimePerFrondSeconds);
  }

  reconcile(carriedCount: number, denCounts: ReadonlyArray<{ id: string; count: number }>): void {
    this.reconcileQueue(this.carriedCharges, carriedCount);
    for (const den of denCounts) {
      const queue = this.denCharges.get(den.id) ?? [];
      this.reconcileQueue(queue, den.count);
      if (queue.length > 0) this.denCharges.set(den.id, queue);
      else this.denCharges.delete(den.id);
    }
  }

  placeInDen(denId: string): boolean {
    if (this.carriedCharges.length <= 0) return false;
    // Transfer a full reserve when possible. If this is the only frond, its
    // already-used lifetime follows it into the wall fixture.
    const index = this.carriedCharges.length > 1 ? this.carriedCharges.length - 1 : 0;
    const [charge] = this.carriedCharges.splice(index, 1);
    const queue = this.denCharges.get(denId) ?? [];
    queue.push(charge);
    this.denCharges.set(denId, queue);
    return true;
  }

  update(dt: number): BiolightUpdate {
    const update: BiolightUpdate = { carriedExpired: 0, denExpired: [] };
    update.carriedExpired = this.drainQueue(this.carriedCharges, dt);
    for (const [denId, queue] of this.denCharges) {
      const expired = this.drainQueue(queue, dt);
      if (expired > 0) update.denExpired.push({ denId, count: expired });
      if (queue.length === 0) this.denCharges.delete(denId);
    }
    return update;
  }

  hasCarried(): boolean {
    return this.carriedCharges.length > 0;
  }

  hasDen(denId: string | undefined): boolean {
    return Boolean(denId && (this.denCharges.get(denId)?.length ?? 0) > 0);
  }

  carriedRemainingSeconds(): number {
    return this.total(this.carriedCharges);
  }

  denRemainingSeconds(denId: string | undefined): number {
    return denId ? this.total(this.denCharges.get(denId) ?? []) : 0;
  }

  carriedBrightness(): number {
    return this.brightness(this.carriedCharges.length);
  }

  denBrightness(denId: string | undefined): number {
    return this.brightness(denId ? this.denCharges.get(denId)?.length ?? 0 : 0);
  }

  snapshot(): BiolightSnapshot {
    return {
      lifetimePerFrondSeconds: this.lifetimePerFrondSeconds,
      carried: {
        stacks: this.carriedCharges.length,
        active: this.hasCarried(),
        remainingSeconds: Number(this.carriedRemainingSeconds().toFixed(1)),
        brightness: Number(this.carriedBrightness().toFixed(2)),
      },
      dens: [...this.denCharges.entries()].map(([denId, queue]) => ({
        denId,
        stacks: queue.length,
        active: queue.length > 0,
        remainingSeconds: Number(this.total(queue).toFixed(1)),
        brightness: Number(this.brightness(queue.length).toFixed(2)),
      })),
    };
  }

  private reconcileQueue(queue: number[], count: number): void {
    while (queue.length < count) queue.push(this.lifetimePerFrondSeconds);
    while (queue.length > count) queue.pop();
  }

  private drainQueue(queue: number[], dt: number): number {
    let remainingDt = Math.max(0, dt);
    let expired = 0;
    while (remainingDt > 0 && queue.length > 0) {
      if (queue[0] > remainingDt) {
        queue[0] -= remainingDt;
        remainingDt = 0;
      } else {
        remainingDt -= queue[0];
        queue.shift();
        expired += 1;
      }
    }
    return expired;
  }

  private total(queue: readonly number[]): number {
    return queue.reduce((sum, charge) => sum + charge, 0);
  }

  private brightness(stacks: number): number {
    return stacks <= 0 ? 0 : Math.min(1.28, 0.9 + Math.log2(stacks + 1) * 0.12);
  }
}

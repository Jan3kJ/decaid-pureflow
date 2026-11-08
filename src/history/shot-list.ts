// The plain parts of `ShotCache` (shots.svelte.ts): lists of shots merged and cut where the held
// ones begin, and the records with measurements kept for a while. Nothing here is reactive.
import type { ShotRecord, ShotRecordSummary } from '../api';
import { DETERGENT_TITLE } from '../settings-page/detergent';
import { frameTime } from '../shell/shot';

/** Two lists of shots as one, newest first, each shot once, at most `most`. */
export function merge(a: readonly ShotRecordSummary[], b: readonly ShotRecordSummary[], most: number): ShotRecordSummary[] {
  const byId = new Map<string, ShotRecordSummary>();
  for (const shot of [...a, ...b]) if (!byId.has(shot.id)) byId.set(shot.id, shot);
  return [...byId.values()].sort((x, y) => frameTime(y.timestamp) - frameTime(x.timestamp)).slice(0, most);
}

/** The shots of a page, newest first, before the first one that is held; `reached` when one is. */
export function newerThan(
  page: readonly ShotRecordSummary[],
  held: readonly ShotRecordSummary[],
): { shots: ShotRecordSummary[]; reached: boolean } {
  const ids = new Set(held.map((shot) => shot.id));
  const at = page.findIndex((shot) => ids.has(shot.id));
  return at < 0 ? { shots: [...page], reached: false } : { shots: page.slice(0, at), reached: true };
}

/** Records with measurements, read once each; the `size` read last are kept. A failed read is not. */
export class Records {
  private readonly kept = new Map<string, Promise<ShotRecord>>();
  private readonly size: number;

  constructor(size: number) {
    this.size = size;
  }

  get(id: string, read: (id: string) => Promise<ShotRecord>): Promise<ShotRecord> {
    let record = this.kept.get(id);
    if (record) this.kept.delete(id);
    else {
      record = read(id);
      record.catch(() => this.kept.delete(id));
    }
    this.kept.set(id, record);
    for (const old of this.kept.keys()) {
      if (this.kept.size <= this.size) break;
      this.kept.delete(old);
    }
    return record;
  }
}

/** How many of the newest records are looked through for one that is not a cleaning run. */
export const NEWEST_LOOKBACK = 10;

/** The newest record whose profile is not the detergent profile, among the newest ones; null if all are. */
export function newestRealShot(shots: readonly ShotRecordSummary[]): ShotRecordSummary | null {
  return shots.slice(0, NEWEST_LOOKBACK).find((shot) => shot.workflow?.profile?.title !== DETERGENT_TITLE) ?? null;
}

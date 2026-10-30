// The shots the skin has read from Decaid, kept for the session: the history's
// list, the record of a shot with its measurements for the restore and for the next shot's
// time axis. Read once in the background after the start, the newest `FIRST_SHOTS` first and
// the rest after them; later only what is newer than the newest one held.
import type { DecaidClient, ShotRecord, ShotRecordSummary } from '../api';
import { Records, merge, newerThan } from './shot-list';
import { errorMessage } from '../error-message';

/** How many shots the first read asks for: the history shows them before the rest arrive. */
export const FIRST_SHOTS = 20;
/** How many shots the history reads at most, newest first. */
export const HISTORY_SHOTS = 500;
/** The gateway's largest page (`limit` is 1 to 100). */
const PAGE = 100;
/** How many records with measurements are kept, the newest read last. */
const RECORDS = 20;
/** ms between the looks for the record of a shot that ended; Decaid writes it a few seconds later. */
const RECORD_POLL_MS = 2000;
/** How often the record of a shot that ended is looked for before the skin gives up. */
const RECORD_POLLS = 15;

/** 'first': the newest shots are held and the older ones are being read. */
export type ShotsRead = 'none' | 'first' | 'all';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ShotCache {
  /** the shots read, newest first, without measurements */
  shots: ShotRecordSummary[] = $state.raw([]);
  read: ShotsRead = $state('none');
  /** why the first read failed, null after one that did not */
  error: string | null = $state(null);

  private readonly client: DecaidClient;
  private readonly most: number;
  private reading: Promise<void> | null = null;
  /** resolved when the first read has its first page, or has failed */
  private firstPage: Promise<void> = Promise.resolve();
  private readonly records = new Records(RECORDS);

  constructor(client: DecaidClient, most = HISTORY_SHOTS) {
    this.client = client;
    this.most = most;
  }

  /**
   * Reads the shots the first time, else what is newer than the newest one held. Returns when
   * all are held; the first page is in `shots` before. Calls while one runs share it.
   */
  sync(): Promise<void> {
    this.reading ??= (this.read === 'all' ? this.readNew() : this.readAll()).finally(() => (this.reading = null));
    return this.reading;
  }

  /** The newest `FIRST_SHOTS`, then the rest in pages of the gateway's largest size. */
  private async readAll(): Promise<void> {
    this.error = null;
    let first = () => undefined as void;
    this.firstPage = new Promise((resolve) => (first = resolve));
    try {
      let page = await this.client.listShots({ limit: Math.min(FIRST_SHOTS, this.most), offset: 0, order: 'desc' });
      this.shots = page.items;
      this.read = 'first';
      first();
      while (page.items.length > 0 && this.shots.length < Math.min(page.total, this.most)) {
        const offset = this.shots.length;
        page = await this.client.listShots({ limit: Math.min(PAGE, this.most - offset), offset, order: 'desc' });
        this.shots = merge(this.shots, page.items, this.most);
      }
      this.read = 'all';
    } catch (cause) {
      this.error = errorMessage(cause);
      throw cause;
    } finally {
      first();
    }
  }

  /**
   * The newest shot after a look for newer ones (`sync`), null without one or while the gateway
   * is away. On the first read the first page is enough; the older shots go on arriving.
   */
  async newest(): Promise<ShotRecordSummary | null> {
    const reading = this.sync().catch(() => undefined);
    await (this.read === 'all' ? reading : Promise.race([reading, this.firstPage]));
    return this.shots[0] ?? null;
  }

  /**
   * The shots newer than the newest one held: nothing but `GET /api/v1/shots/latest` when
   * there is none, else pages of `FIRST_SHOTS` from the newest until one that is held. An
   * empty history has no latest shot, so it reads the newest page instead.
   */
  private async readNew(): Promise<void> {
    try {
      if (this.shots.length > 0 && newerThan([await this.client.getLatestShot()], this.shots).reached) return;
      const found: ShotRecordSummary[] = [];
      while (found.length < this.most) {
        const page = await this.client.listShots({ limit: FIRST_SHOTS, offset: found.length, order: 'desc' });
        const newer = newerThan(page.items, this.shots);
        found.push(...newer.shots);
        if (newer.reached || page.items.length < FIRST_SHOTS) break;
      }
      this.shots = merge(found, this.shots, this.most);
    } catch {
      // No shot at all answers 404; the shots held stay, and the next look finds the new ones.
    }
  }

  /**
   * A shot ended: its record is added when Decaid has written it, which is a few seconds
   * after the end. Gives up after half a minute.
   */
  async shotEnded(): Promise<void> {
    if (this.read === 'none') return void (await this.sync().catch(() => undefined));
    const newest = this.shots[0]?.id;
    for (let i = 0; i < RECORD_POLLS; i++) {
      await sleep(RECORD_POLL_MS);
      await this.sync().catch(() => undefined);
      if (this.shots[0] && this.shots[0].id !== newest) return;
    }
  }

  /** The shot with its measurements (`GET /api/v1/shots/{id}`), read once while it is kept. */
  record(id: string): Promise<ShotRecord> {
    return this.records.get(id, (shot) => this.client.getShot(shot));
  }

  /**
   * The newest shot with this profile title, as the history takes a profile (`entryKey`);
   * null without one. Waits for the older shots when the newest held do not have it.
   */
  async latestWithTitle(title: string): Promise<ShotRecordSummary | null> {
    const find = () => this.shots.find((shot) => shot.workflow?.profile?.title?.trim() === title.trim()) ?? null;
    const found = find();
    if (found || this.read === 'all') return found;
    await this.sync();
    return find();
  }
}

// The shot history's part of the skin (spec 3.5, 3.8): its overlay, the restore of an entry
// with the graph of its latest shot, the newest shot record home shows when it has no shot of
// its own, and the last shot's length per profile, where the next shot's time axis starts. A part of `Skin`, which hands its history fields to it; the
// workflow, the notice and the warning before a load stay the skin's (`RecallHost`).
import { untrack } from 'svelte';
import type { DecaidClient, Workflow } from '../api';
import { NO_FILTER, restoreEntry, seriesOf, type HistoryEntry, type HistoryFilter } from '../history/entries';
import type { ShotCache } from '../history/shots.svelte';
import type { LoadAnswer } from './load-warning.svelte';
import { expectedShotSeconds, lastShotSeconds } from './expected';
import { wantsNewest } from './home-shot';
import { shotSeconds, type Shot, type ShotSeries } from './shot';
import { errorMessage } from '../error-message';

/** An entry of the shot history that was made the current one, with its latest shot's graph. */
export interface Recalled {
  entry: HistoryEntry;
  series: ShotSeries;
}

/** What the history part reads and writes of the skin. */
export interface RecallHost {
  readonly client: DecaidClient;
  readonly shots: ShotCache;
  /** the running shot, or the finished one that home keeps */
  readonly shot: Shot | null;
  workflow: Workflow | null;
  notice: string | null;
  info: string | null;
  mayLoad(): Promise<LoadAnswer>;
  openSaveAs(): void;
}

export class Recall {
  /** the shot history's overlay is open (spec 3.1); only home shows it */
  historyOpen = $state(false);
  /** the history's filter by bean and grinder; it lasts for the session */
  historyFilter: HistoryFilter = $state.raw(NO_FILTER);
  /** the history entry that was restored, until it is dismissed or a shot starts */
  recalled: Recalled | null = $state.raw(null);
  /** the newest shot record's graph, read from Decaid for home while it has no shot of its own (`showNewest`) */
  newest: ShotSeries | null = $state.raw(null);
  /** how many reads of the newest record were started, so only the last one's answer is shown */
  private newestReads = 0;
  /** s, the length of the last shot with a profile title, null when it has none; see `expectedSeconds` */
  private lastShot: { title: string; seconds: number | null } | null = $state.raw(null);
  private readonly host: RecallHost;

  /**
   * s, where the running shot graph's time axis starts (spec 3.8): the last shot with the
   * workflow's profile title, else the profile's estimate, else 30 s, rounded up to 10 s.
   */
  readonly expectedSeconds = $derived.by(() => {
    const profile = this.host.workflow?.profile;
    const last = this.lastShot && this.lastShot.title === profile?.title ? this.lastShot.seconds : null;
    return expectedShotSeconds(profile, last);
  });

  constructor(host: RecallHost) {
    this.host = host;
  }

  /** Reads the last shot with the profile whenever another profile is loaded. Returns what stops it. */
  follow(): () => void {
    return $effect.root(() => {
      $effect(() => {
        const title = this.host.workflow?.profile?.title;
        if (title) void untrack(() => this.readLastShot(title));
      });
    });
  }

  /** A shot ended: it is the last one with the workflow's profile, and the history reads it. */
  shotEnded(shot: Shot): void {
    // The next shot's axis starts at its length.
    const title = this.host.workflow?.profile?.title;
    if (title && shotSeconds(shot) > 0) this.lastShot = { title, seconds: shotSeconds(shot) };
    void this.host.shots.shotEnded();
  }

  /**
   * Home has no shot of its own after a start, a reconnect, a wake or the page becoming
   * visible (`wantsNewest`): it looks for the newest shot in Decaid (`ShotCache.newest`) and
   * shows its record's graph. A shot that starts or an entry recalled meanwhile is not
   * replaced; no shot at all or a gateway away leaves what is shown.
   */
  async showNewest(): Promise<void> {
    if (!this.wants()) return;
    const read = ++this.newestReads;
    try {
      const latest = await this.host.shots.newest();
      if (!latest) return;
      const series = seriesOf(await this.host.shots.record(latest.id));
      if (read === this.newestReads && this.wants()) this.newest = series;
    } catch {
      // The next start, reconnect, wake or look at the page reads it again.
    }
  }

  private wants(): boolean {
    return wantsNewest(this.host.shot, this.recalled?.series ?? null);
  }

  /** Reads the length of the last shot with this title from the shots held; a failure leaves the estimate. */
  private async readLastShot(title: string): Promise<void> {
    if (this.lastShot?.title === title) return;
    try {
      const seconds = await lastShotSeconds(this.host.shots, title);
      // A shot that ended meanwhile is newer than the record read.
      if (this.host.workflow?.profile?.title === title && this.lastShot?.title !== title) this.lastShot = { title, seconds };
    } catch {
      // The axis starts at the profile's estimate instead.
    }
  }

  /**
   * An entry of the shot history was tapped (spec 3.5): the overlay closes, the entry's
   * profile, bean and grinder setting become the current ones, and home shows the graph of
   * the last shot made with it. Only its record (`ShotCache.record`) has the measurements.
   */
  async restore(entry: HistoryEntry): Promise<void> {
    const host = this.host;
    this.historyOpen = false;
    host.notice = host.info = null;
    const answer = await host.mayLoad();
    if (answer === 'save-as') host.openSaveAs();
    if (answer !== 'load') return;
    try {
      host.workflow = await restoreEntry(host.client, entry);
      this.recalled = { entry, series: seriesOf(await host.shots.record(entry.latest.id)) };
    } catch (error) {
      host.notice = `The entry was not restored: ${errorMessage(error)}`;
    }
  }
}

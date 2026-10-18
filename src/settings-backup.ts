// The backup of the skin's settings in Decaid's KV store (founder, 2026-10-14): localStorage
// stays the store of the settings (settings.ts), the backup is a copy that survives a new
// port or a cleared app (research.md 9.1 and 9.2). One key in the skin's own namespace; every
// save writes it after a short pause, and a start without settings reads it back. No UI: the
// gateway and the clock are parameters.
import { readSettings, type Settings } from './settings';

/** The key in the skin's namespace (`decaid-skin`, the client's default): `decaid-skin/settings-backup`. */
export const BACKUP_KEY = 'settings-backup';

/** How long the settings must stay unchanged before the backup is written, in ms. */
export const BACKUP_DEBOUNCE_MS = 1500;

/** The JSON value under the key. */
export interface Backup {
  /** when it was written, ISO 8601 */
  savedAt: string;
  /** the skin's version that wrote it */
  version: string;
  settings: Settings;
}

/** A backup as it was read: its settings already checked field by field. */
export interface ReadBackup {
  /** ISO 8601, null when the backup does not say */
  savedAt: string | null;
  settings: Settings;
}

/** What the backup needs of the client. */
export interface BackupGateway {
  kvGet(key: string, namespace?: string): Promise<unknown>;
  kvSet(key: string, value: unknown, namespace?: string): Promise<void>;
}

export function backupOf(settings: Settings, version: string, now: Date): Backup {
  return { savedAt: now.toISOString(), version, settings };
}

/**
 * A stored value as a backup: null when it is none (no key, not an object, no settings in
 * it). Its settings pass the checks of stored settings, so a bad or old field is the default.
 */
export function readBackup(value: unknown): ReadBackup | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { savedAt, settings } = value as Record<string, unknown>;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  const time = typeof savedAt === 'string' && !Number.isNaN(Date.parse(savedAt)) ? savedAt : null;
  return { savedAt: time, settings: readSettings(settings) };
}

/** The backup's time as the settings page shows it, local time: "2026-10-15 06:48". */
export function backupTime(savedAt: string): string {
  const time = new Date(savedAt);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${time.getFullYear()}-${two(time.getMonth() + 1)}-${two(time.getDate())} ${two(time.getHours())}:${two(time.getMinutes())}`;
}

/** Two settings hold the same values. */
export const sameSettings = (a: Settings, b: Settings): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * What a start does with the backup it read: 'restore' when localStorage held no settings
 * (a new port, a cleared app) and none were changed since; 'write' when the settings held
 * differ from the backup or there is none yet; else nothing.
 */
export function atStart(
  hadSettings: boolean,
  changedSince: boolean,
  backup: ReadBackup | null,
  settings: Settings,
): 'restore' | 'write' | null {
  if (changedSince) return null; // their save wrote the backup already
  if (!hadSettings) return backup ? 'restore' : null;
  return backup && sameSettings(backup.settings, settings) ? null : 'write';
}

/** The outcome of one write, for the settings page. */
export type Written = { savedAt: string } | { error: string };

/**
 * Writes the backup: `schedule` after every save, so a run of changes (a number typed, a
 * switch flipped twice) makes one write with the last settings. A failed write is reported
 * to `onWritten` and never thrown: the save in localStorage is done already.
 */
export class SettingsBackup {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly gateway: BackupGateway,
    private readonly version: string,
    private readonly onWritten: (written: Written) => void,
    private readonly now: () => Date = () => new Date(),
    private readonly delay: number = BACKUP_DEBOUNCE_MS,
  ) {}

  schedule(settings: Settings): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.write(settings), this.delay);
  }

  /** Drops a scheduled write: a restore puts the backup's own settings back. */
  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  async write(settings: Settings): Promise<void> {
    this.cancel();
    const backup = backupOf(settings, this.version, this.now());
    try {
      await this.gateway.kvSet(BACKUP_KEY, backup);
      this.onWritten({ savedAt: backup.savedAt });
    } catch (cause) {
      this.onWritten({ error: cause instanceof Error ? cause.message : String(cause) });
    }
  }

  /** The stored backup; null when there is none or it is not one. Throws when the gateway does not answer. */
  async read(): Promise<ReadBackup | null> {
    return readBackup(await this.gateway.kvGet(BACKUP_KEY));
  }
}

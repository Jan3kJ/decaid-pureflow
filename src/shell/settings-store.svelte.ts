// The skin's settings and their backup in Decaid's KV store: stored in localStorage on every
// change, backed up a moment later, and taken from the backup at a start without settings.
// A part of `Skin`, which hands its settings and backup fields to it.
import { PRODUCT_VERSION } from '../product';
import { hasSettings, loadSettings, saveSettings, type Settings } from '../settings';
import { SettingsBackup, atStart, type BackupGateway, type ReadBackup, type Written } from '../settings-backup';

export class SettingsStore {
  /** the skin's settings; changed with `set` only, so they are stored */
  settings: Settings = $state.raw(loadSettings());
  /** the time of the last backup of the settings in Decaid's KV store, ISO 8601; null while none is known */
  backupAt: string | null = $state(null);
  /** why the last backup was not written, for the settings page; null after one that was */
  backupError: string | null = $state(null);
  /**
   * The skin started without settings and took them from the backup: its time ('' when the
   * backup has none), said once until it is dismissed.
   */
  restoredFrom: string | null = $state(null);

  private readonly backup: SettingsBackup;
  /** localStorage held settings when the skin started; without them a backup is restored */
  private readonly hadSettings = hasSettings();
  /** the settings were changed since the start: a backup read later must not replace them */
  private settingsChanged = false;
  /** the backup was read once at the start, or is being read */
  private backupRead: Promise<void> | null = null;

  constructor(client: BackupGateway) {
    this.backup = new SettingsBackup(client, PRODUCT_VERSION, (written) => this.onBackupWritten(written));
  }

  /**
   * Changes settings and stores them (localStorage: they survive a reload and the WebView),
   * and writes their backup to Decaid's KV store a moment later.
   */
  set(change: Partial<Settings>): void {
    this.settings = { ...this.settings, ...change };
    this.settingsChanged = true;
    saveSettings(this.settings);
    this.backup.schedule(this.settings);
  }

  /**
   * Reads the backup once the gateway answers, until it was read once. A start without
   * settings in localStorage takes the backup's; settings that differ from the backup, or
   * have none yet, are backed up.
   */
  readAtStart(): Promise<void> {
    this.backupRead ??= (async () => {
      let backup: ReadBackup | null;
      try {
        backup = await this.backup.read();
      } catch {
        this.backupRead = null;
        return;
      }
      if (!this.backupAt) this.backupAt = backup?.savedAt ?? null;
      const action = atStart(this.hadSettings, this.settingsChanged, backup, this.settings);
      if (action === 'restore' && backup) {
        this.settings = backup.settings;
        saveSettings(this.settings);
        this.restoredFrom = backup.savedAt ?? '';
      } else if (action === 'write') {
        this.backup.schedule(this.settings);
      }
    })();
    return this.backupRead;
  }

  /** The settings page's 'Restore from backup': the backup's settings, or null when there is none. Throws when it cannot be read. */
  async restore(): Promise<ReadBackup | null> {
    const backup = await this.backup.read();
    if (!backup) return null;
    this.backup.cancel();
    this.settings = backup.settings;
    this.settingsChanged = true;
    saveSettings(this.settings);
    this.backupAt = backup.savedAt;
    return backup;
  }

  private onBackupWritten(written: Written): void {
    if ('savedAt' in written) {
      this.backupAt = written.savedAt;
      this.backupError = null;
    } else {
      this.backupError = `The backup in Decaid was not written: ${written.error}`;
    }
  }
}

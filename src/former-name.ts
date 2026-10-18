// The skin was called decaid-skin until 2026-10-18 (founder): its keys in localStorage, the
// namespace of its settings' backup in the KV store and the `metadata.source` of the profiles
// it stored carried that name. A start moves what it finds under the former name to the new
// one (localStorage in former-keys.ts, the backup in settings-backup.ts), and the profiles keep counting
// as the skin's own (shell/profiles.ts).
export const FORMER_NAME = 'decaid-skin';

<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import type { ProfileRecord } from '../api';
  import NumberPad from '../editor/NumberPad.svelte';
  import { startChoices, startName } from '../editor/start';
  import {
    PROFILE_FIELDS,
    RATIO_RANGE,
    STEAM_FIELDS,
    profileValue,
    steamValue,
    withRatio,
    withStartProfile,
    withSteamValue,
    type ProfileField,
    type Settings,
    type SteamField,
  } from '../settings';
  import Dialog from '../ui/Dialog.svelte';
  import Lever from '../ui/Lever.svelte';
  import { backupTime } from '../settings-backup';
  import type { Skin } from '../shell/skin.svelte';
  import type { Hit } from './settings-filter';
  import {
    BACKUP_ROW,
    DEVELOPER_ROW,
    DISPLAY,
    EDITOR_DOSE_ROW,
    GRAPH_SWITCHES,
    OLD_AFLOW_ROW,
    RATIOS_ROW,
    START_ROW,
    STEAM_ROWS,
    SWITCHES,
    VERSION_ROW,
    type SkinSwitch,
  } from './skin-rows';
  import { SETTINGS_TREE, type Subcategory } from './tree';
  import { errorMessage } from '../error-message';
  import { importQuestion, importReport, planImport, runImport, type ImportPlan } from '../editor/import';
  import Confirm from './Confirm.svelte';
  import Skins from './Skins.svelte';
  import Versions from './Versions.svelte';
  import SettingsRow from './SettingsRow.svelte';
  import LocalInstall from './LocalInstall.svelte';
  import { saveDeveloper } from './local-install';
  import { signed } from '../display';

  interface Props {
    skin: Skin;
    /** developer options: Skin > Developer shows; kept on this tablet, not in the settings */
    developer: boolean;
    /** a subcategory's name and hint, as the page draws them */
    heading: Snippet<[Subcategory]>;
    /** what the page's filter leaves of this category, by subcategory; all of it without a filter */
    only?: Map<string, Hit>;
  }

  let { skin, developer = $bindable(), heading, only }: Props = $props();

  const shows = (sub: string) => !only || only.has(sub);
  const showsRow = (sub: string, row: string) => !only || !!only.get(sub)?.rows.has(row);

  function toggleDeveloper() {
    developer = !developer;
    saveDeveloper(developer);
  }

  // The category Skin of the settings page: the skin's own settings, all in
  // the one settings object (src/settings.ts) and so in its KV backup. It keeps the test ids of the
  // settings page it came from.
  const SUB = Object.fromEntries(SETTINGS_TREE.find((category) => category.id === 'skin')!.subcategories.map((sub) => [sub.id, sub]));
  const settings: Settings = $derived(skin.settings);
  /** the value the number pad is open for */
  let typing: SteamField | null = $state.raw(null);
  /** the name over the number pad: the group and the value, "mugs: s" */
  const named = (field: SteamField) =>
    `${STEAM_FIELDS.find((group) => group.fields.some((entry) => entry.id === field.id))?.title}: ${field.label}`;

  /** an adjust button's amount as the steam page shows it, '−8'; the unit stays in its own element */
  const shown = (field: SteamField) => {
    const value = steamValue(settings.steam, field);
    return field.key === 'adjustments' ? signed(value, '') : `${+value.toFixed(1)}`;
  };

  function confirm(value: number) {
    if (typing) skin.setSettings({ steam: withSteamValue(settings.steam, typing, value) });
    typing = null;
  }

  /** the value of the category Profile the number pad is open for */
  let typingProfile: ProfileField | null = $state.raw(null);
  const shownProfile = (field: ProfileField) => `${profileValue(settings, field)}`;

  function confirmProfile(value: number) {
    if (typingProfile) skin.setSettings({ [typingProfile.key]: profileValue(settings, typingProfile, value) });
    typingProfile = null;
  }

  /** the ratio favourite of the hot water page the number pad is open for */
  let typingRatio: number | null = $state(null);
  const shownRatio = (index: number) => `${+settings.hotWater.ratios[index].toFixed(1)}`;

  function confirmRatio(value: number) {
    if (typingRatio !== null) skin.setSettings({ hotWater: withRatio(settings.hotWater, typingRatio, value) });
    typingRatio = null;
  }

  // The editor's start row: what a slot can hold is read from the gateway.
  let records: ProfileRecord[] | null = $state.raw(null);
  let unread: string | null = $state(null);
  /** the slot whose list is open */
  let choosing: number | null = $state(null);
  const choices = $derived(startChoices(records ?? []));
  /** a chosen profile the editor no longer finds; unknown while the list is not read */
  const isMissing = (title: string) => !!records && !choices.some((choice) => choice.title === title);
  /** a slot's list: every profile that is not in another slot */
  const offered = $derived(
    choices.filter((choice) => !settings.startProfiles.some((title, i) => i !== choosing && title === choice.title)),
  );

  async function readProfiles() {
    unread = null;
    try {
      records = await skin.client.listProfiles();
    } catch (cause) {
      unread = `The profiles could not be read: ${errorMessage(cause)}`;
    }
  }

  function choose(title: string | null) {
    if (choosing !== null) skin.setSettings({ startProfiles: withStartProfile(settings.startProfiles, choosing, title) });
    choosing = null;
  }

  onMount(readProfiles);

  // The import of old A-Flow profiles: it reads the list again, asks, converts.
  /** what the question is about; null while it is not asked */
  let importing: ImportPlan | null = $state.raw(null);
  let importBusy = $state(false);
  /** what the last import, or the look for one, found */
  let imported: string | null = $state(null);

  async function findOld() {
    imported = null;
    importBusy = true;
    try {
      const plan = planImport(await skin.client.listProfiles());
      if (plan.convert.length) importing = plan;
      else imported = importQuestion(plan);
    } catch (cause) {
      imported = `The profiles could not be read: ${errorMessage(cause)}`;
    }
    importBusy = false;
  }

  async function convertOld() {
    const plan = importing!;
    importing = null;
    importBusy = true;
    imported = 'Converting …';
    const result = await runImport(skin.client, plan, settings.firstStepWorkaround);
    imported = importReport(plan, result);
    importBusy = false;
    await readProfiles();
  }

  // The backup in Decaid's KV store: its time, and a restore with a confirm.
  let confirming = $state(false);
  /** what the last restore did */
  let restored: string | null = $state(null);

  async function restore() {
    confirming = false;
    try {
      const backup = await skin.restoreBackup();
      restored = backup
        ? `Restored the backup${backup.savedAt ? ` of ${backupTime(backup.savedAt)}` : ''}.`
        : 'There is no backup in Decaid.';
    } catch (cause) {
      restored = `The backup could not be read: ${errorMessage(cause)}`;
    }
  }
</script>

{#if shows('skin-steam')}
  <section id="sub-skin-steam" data-testid="settings-steam">
    {@render heading(SUB['skin-steam'])}
    {#each STEAM_FIELDS as group, index (group.title)}
      {#if showsRow('skin-steam', STEAM_ROWS[index].id)}
        <SettingsRow label={group.title} hint={group.hint} spacing="skin">
          <div class="values">
            {#each group.fields as field (field.id)}
              <button class="tile" data-testid="setting-{field.id}" onclick={() => (typing = field)}>
                <small>{field.label}</small>
                <b>{shown(field)}<i>{field.unit}</i></b>
              </button>
            {/each}
          </div>
        </SettingsRow>
      {/if}
    {/each}
  </section>
{/if}

<!-- The hot water page's ratio favourites. -->
{#if shows('skin-hot-water')}
  <section id="sub-skin-hot-water" data-testid="settings-hot-water">
    {@render heading(SUB['skin-hot-water'])}
    <SettingsRow label={RATIOS_ROW.label} hint={RATIOS_ROW.hint} spacing="skin">
      <div class="values">
        {#each settings.hotWater.ratios, index}
          <button class="tile" data-testid="setting-ratio-{index + 1}" onclick={() => (typingRatio = index)}>
            <small>{index + 1}</small>
            <b><i class="lead">1:</i>{shownRatio(index)}</b>
          </button>
        {/each}
      </div>
    </SettingsRow>
  </section>
{/if}

{#if shows('skin-profile')}
  <section id="sub-skin-profile" data-testid="settings-profile">
    {@render heading(SUB['skin-profile'])}
    {#if showsRow('skin-profile', EDITOR_DOSE_ROW.id)}
      <SettingsRow label={EDITOR_DOSE_ROW.label} hint={EDITOR_DOSE_ROW.hint} spacing="skin">
        <div class="values">
          {#each PROFILE_FIELDS as field (field.id)}
            <button class="tile" data-testid="setting-{field.id}" onclick={() => (typingProfile = field)}>
              <small>{field.label}</small>
              <b>{shownProfile(field)}<i>{field.unit}</i></b>
            </button>
          {/each}
        </div>
      </SettingsRow>
    {/if}
    {#each SWITCHES as item (item.key)}
      {#if showsRow('skin-profile', item.id)}{@render lever(item)}{/if}
    {/each}

    {#if showsRow('skin-profile', OLD_AFLOW_ROW.id)}
      <SettingsRow label={OLD_AFLOW_ROW.label} hint={OLD_AFLOW_ROW.hint} spacing="skin">
        {#snippet about()}
          {#if imported}<small data-testid="aflow-import-result">{imported}</small>{/if}
        {/snippet}
        <button class="retry" data-testid="aflow-import" disabled={importBusy} onclick={findOld}>convert to 3.0</button>
      </SettingsRow>
    {/if}

    {#if showsRow('skin-profile', START_ROW.id)}
      <div class="start" data-testid="settings-start">
        <SettingsRow label={START_ROW.label} hint={START_ROW.hint} spacing="skin">
          {#if unread}
            <button class="retry" data-testid="start-retry" onclick={readProfiles}>{unread} try again</button>
          {/if}
        </SettingsRow>
        <div class="slots">
          {#each settings.startProfiles as title, index (index)}
            <button
              class="tile slot"
              class:missing={title !== null && isMissing(title)}
              data-testid="start-slot-{index + 1}"
              onclick={() => (choosing = index)}
            >
              <small>{index + 1}</small>
              {#if title === null}
                <span class="none">empty</span>
              {:else}
                <b class="truncate">{startName(title)}</b>
                {#if isMissing(title)}<small class="warn" data-testid="start-missing">missing</small>{/if}
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </section>
{/if}

{#if shows('skin-graph')}
  <section id="sub-skin-graph" data-testid="settings-graph">
    {@render heading(SUB['skin-graph'])}
    {#each GRAPH_SWITCHES as item (item.key)}
      {#if showsRow('skin-graph', item.id)}{@render lever(item)}{/if}
    {/each}
  </section>
{/if}

{#if shows('skin-display')}
  <section id="sub-skin-display" data-testid="settings-display">
    {@render heading(SUB['skin-display'])}
    {#each DISPLAY as item (item.key)}
      {#if showsRow('skin-display', item.id)}
        <SettingsRow label={item.label} hint={item.hint} spacing="skin">
          <div class="chips" data-testid="setting-{item.id}">
            {#each item.choices as choice (choice.value)}
              <button
                class="chip select-outline"
                aria-pressed={settings[item.key] === choice.value}
                data-testid="setting-{item.id}-{choice.value}"
                onclick={() => skin.setSettings({ [item.key]: choice.value })}>{choice.label}</button
              >
            {/each}
          </div>
        </SettingsRow>
      {/if}
    {/each}
  </section>
{/if}

{#if shows('skin-active')}
  <section id="sub-skin-active" data-testid="settings-skins">
    {@render heading(SUB['skin-active'])}
    <Skins {skin} />
  </section>
{/if}

{#if shows('skin-version')}
  <section id="sub-skin-version" data-testid="settings-versions">
    {@render heading(SUB['skin-version'])}
    <Versions {skin} />
  </section>
{/if}

<!-- The backup in Decaid's KV store, and the skin's name and version. -->
{#if shows('skin-backup')}
  <section id="sub-skin-backup" data-testid="settings-backup">
    {@render heading(SUB['skin-backup'])}
    {#if showsRow('skin-backup', BACKUP_ROW.id)}
      <SettingsRow label={BACKUP_ROW.label} spacing="skin">
        {#snippet about()}
          <small data-testid="backup-time">
            {skin.backupAt ? `in Decaid, ${backupTime(skin.backupAt)}` : 'none yet'}; every change is copied to Decaid
          </small>
          {#if skin.backupError}<small class="warn" data-testid="backup-error">{skin.backupError}</small>{/if}
          {#if restored}<small data-testid="backup-restored">{restored}</small>{/if}
        {/snippet}
        <button class="retry" data-testid="backup-restore" onclick={() => ((restored = null), (confirming = true))}
          >restore from backup</button
        >
      </SettingsRow>
    {/if}
    {#if showsRow('skin-backup', VERSION_ROW.id)}
      <SettingsRow label={VERSION_ROW.label} hint={VERSION_ROW.hint} spacing="skin" />
    {/if}
    {#if showsRow('skin-backup', DEVELOPER_ROW.id)}
      <Lever checked={developer} testid="setting-developer" onchange={toggleDeveloper}>
        <span class="about">
          <strong>{DEVELOPER_ROW.label}</strong>
          <small>{DEVELOPER_ROW.hint}</small>
        </span>
      </Lever>
    {/if}
  </section>
{/if}

{#if developer && shows('skin-developer')}
  <section id="sub-skin-developer" data-testid="settings-developer">
    {@render heading(SUB['skin-developer'])}
    <LocalInstall {skin} />
  </section>
{/if}

{#snippet lever(item: SkinSwitch)}
  <Lever checked={settings[item.key]} testid="setting-{item.id}" onchange={(on: boolean) => skin.setSettings({ [item.key]: on })}>
    <span class="about">
      <strong>{item.label}</strong>
      <small>{item.hint}</small>
    </span>
  </Lever>
{/snippet}

{#if confirming}
  <Dialog label="restore from backup" width="28rem" maxHeight="80vh" testid="backup-confirm" oncancel={() => (confirming = false)}>
    <div class="dialog">
      <h2>Restore from backup?</h2>
      <p>Every setting on this page becomes the backup's{skin.backupAt ? ` of ${backupTime(skin.backupAt)}` : ''}.</p>
      <div class="actions">
        <button class="retry" data-testid="backup-cancel" onclick={() => (confirming = false)}>cancel</button>
        <button class="retry primary" data-testid="backup-confirm-restore" onclick={restore}>restore</button>
      </div>
    </div>
  </Dialog>
{/if}

{#if importing}
  <Confirm
    title="Convert old A-Flow profiles?"
    text={importQuestion(importing)}
    ok="convert"
    onok={convertOld}
    oncancel={() => (importing = null)}
  />
{/if}

{#if choosing !== null}
  <Dialog label="slot {choosing + 1}" width="28rem" maxHeight="80vh" testid="start-choices" oncancel={() => (choosing = null)}>
    <div class="dialog">
      <h2>slot {choosing + 1}</h2>
      <ul>
        <li>
          <button
            class="choice select-outline"
            aria-pressed={settings.startProfiles[choosing] === null}
            data-testid="start-choice-empty"
            onclick={() => choose(null)}><span class="none">empty</span></button
          >
        </li>
        {#each offered as choice (choice.title)}
          <li>
            <button
              class="choice select-outline"
              aria-pressed={settings.startProfiles[choosing] === choice.title}
              data-testid="start-choice"
              data-title={choice.title}
              onclick={() => choose(choice.title)}>{choice.name}</button
            >
          </li>
        {/each}
        {#if !records && !unread}<li class="none">Reading the profiles …</li>{/if}
      </ul>
    </div>
  </Dialog>
{/if}

{#if typing}
  <NumberPad
    label={named(typing)}
    unit={typing.unit}
    min={typing.min}
    max={typing.max}
    decimals={typing.decimals}
    current={shown(typing)}
    onconfirm={confirm}
    oncancel={() => (typing = null)}
  />
{/if}

{#if typingRatio !== null}
  <NumberPad
    label="hot water: ratio {typingRatio + 1} (1:n)"
    unit=""
    min={RATIO_RANGE.min}
    max={RATIO_RANGE.max}
    decimals={true}
    current={shownRatio(typingRatio)}
    onconfirm={confirmRatio}
    oncancel={() => (typingRatio = null)}
  />
{/if}

{#if typingProfile}
  <NumberPad
    label={typingProfile.label}
    unit={typingProfile.unit}
    min={typingProfile.min}
    max={typingProfile.max}
    decimals={true}
    current={shownProfile(typingProfile)}
    onconfirm={confirmProfile}
    oncancel={() => (typingProfile = null)}
  />
{/if}

<style>
  section {
    padding: var(--space-1) var(--space-3) var(--space-2);
    border: 1px solid var(--edge);
    border-radius: var(--radius);
    background: var(--glass);
    scroll-margin-top: 0.6rem;
  }

  h2 {
    margin: var(--space-2) 0 0.1rem;
    font-size: var(--text-title);
    font-weight: 600;
  }

  .about {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    text-align: left;
  }

  strong {
    font-size: var(--text-body);
    font-weight: 600;
  }

  small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  .warn {
    color: var(--temperature);
  }

  .values {
    flex: none;
    display: flex;
    gap: var(--space-2);
  }

  /* A value with its caption above, to tap for the number pad. */
  .tile {
    width: 7rem;
    min-height: 4.2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--radius);
  }

  .tile b {
    font-size: var(--text-value);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .tile .lead {
    margin: 0 0.1em 0 0;
  }

  .slots {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: var(--space-2);
    padding-bottom: var(--space-1);
  }

  .tile.slot {
    width: auto;
    min-width: 0;
    padding: 0 0.6rem;
  }

  .slot b {
    max-width: 100%;
    font-size: var(--text-value);
  }

  .slot.missing {
    border-color: var(--temperature);
  }

  .none {
    color: var(--dim);
    font-style: italic;
  }

  .retry {
    flex: none;
    min-height: var(--control);
    padding: 0 1rem;
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--radius);
  }

  .actions {
    margin-top: 1rem;
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .dialog {
    min-height: 0;
    padding: var(--space-1) var(--space-3) var(--space-3);
    display: flex;
    flex-direction: column;
  }

  .dialog p {
    margin: 0;
    color: var(--dim);
  }

  ul {
    min-height: 0;
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .choice {
    width: 100%;
    min-height: var(--control-big);
    padding: 0 1rem;
    text-align: left;
    font-size: var(--text-body);
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--radius);
  }

  .chips {
    flex: none;
    display: flex;
    gap: var(--space-1);
  }
</style>

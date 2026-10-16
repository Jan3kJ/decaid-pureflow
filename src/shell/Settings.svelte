<script lang="ts">
  import { onMount } from 'svelte';
  import type { ProfileRecord } from '../api';
  import NumberPad from '../editor/NumberPad.svelte';
  import { startChoices, startName } from '../editor/start';
  import {
    PROFILE_FIELDS,
    STEAM_FIELDS,
    profileValue,
    steamValue,
    withStartProfile,
    withSteamValue,
    type ProfileField,
    type Settings,
    type SteamField,
  } from '../settings';
  import { PRODUCT_NAME, PRODUCT_VERSION } from '../product';
  import { backupTime } from '../settings-backup';
  import type { Skin } from './skin.svelte';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  // The few settings of the skin (spec 3.1); everything else stays in Decaid's own settings.
  type Switch = { key: 'firstStepWorkaround' | 'showProfileSteps' | 'showGraphLegend'; id: string; title: string; hint: string };
  const SWITCHES: Switch[] = [
    {
      key: 'firstStepWorkaround',
      id: 'first-step-workaround',
      title: 'first-step workaround',
      hint: 'A profile from the editor starts with a Pre Fill step of 1 s, for a machine that skips the first step.',
    },
    {
      key: 'showProfileSteps',
      id: 'show-profile-steps',
      title: 'profile steps',
      hint: 'The editor has a button that shows the generated steps under the graph. It opens closed.',
    },
  ];

  const GRAPH_SWITCHES: Switch[] = [
    {
      key: 'showGraphLegend',
      id: 'show-graph-legend',
      title: 'legend',
      hint: 'The shot graph names its curves under it, and what a dashed line is.',
    },
  ];

  const settings: Settings = $derived(skin.settings);
  /** the value the number pad is open for */
  let typing: SteamField | null = $state.raw(null);
  /** the name over the number pad: the group and the value, "mugs: s" */
  const named = (field: SteamField) =>
    `${STEAM_FIELDS.find((group) => group.fields.some((entry) => entry.id === field.id))?.title}: ${field.label}`;

  const shown = (field: SteamField) => `${+steamValue(settings.steam, field).toFixed(1)}`;

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

  // The editor's start row (founder, 2026-10-13): what a slot can hold is read from the gateway.
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
      unread = `The profiles could not be read: ${cause instanceof Error ? cause.message : String(cause)}`;
    }
  }

  function choose(title: string | null) {
    if (choosing !== null) skin.setSettings({ startProfiles: withStartProfile(settings.startProfiles, choosing, title) });
    choosing = null;
  }

  onMount(readProfiles);

  // The backup in Decaid's KV store (founder, 2026-10-14): its time, and a restore with a confirm.
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
      restored = `The backup could not be read: ${cause instanceof Error ? cause.message : String(cause)}`;
    }
  }
</script>

<div class="settings">
  <header>
    <h1>Settings</h1>
    <p>Kept on this tablet, with a backup in Decaid. Everything else is in Decaid's own settings.</p>
    <!-- The skin's version, top right (founder, 2026-10-14); from the manifest, like the build. -->
    <small class="version" data-testid="skin-version">{PRODUCT_NAME} {PRODUCT_VERSION}</small>
  </header>

  <section data-testid="settings-steam">
    <h2>Steam</h2>
    {#each STEAM_FIELDS as group (group.title)}
      <div class="row">
        <div class="about">
          <strong>{group.title}</strong>
          <small>{group.hint}</small>
        </div>
        <div class="values">
          {#each group.fields as field (field.id)}
            <button class="value" data-testid="setting-{field.id}" onclick={() => (typing = field)}>
              <small>{field.label}</small>
              <b>{shown(field)}<i>{field.unit}</i></b>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </section>

  {#each [{ id: 'profile', title: 'Profile', switches: SWITCHES }, { id: 'graph', title: 'Shot graph', switches: GRAPH_SWITCHES }] as group (group.id)}
    <section data-testid="settings-{group.id}">
      {#if group.id === 'profile'}
        <!-- founder, 2026-10-15: the editor's maximum flow and the dose of a shot that has none; on
             the category's title line, so the page still fits the screen -->
        <div class="titled">
          <h2>{group.title}</h2>
          <div class="values">
            {#each PROFILE_FIELDS as field (field.id)}
              <button class="value" data-testid="setting-{field.id}" onclick={() => (typingProfile = field)}>
                <small>{field.label}</small>
                <b>{shownProfile(field)}<i>{field.unit}</i></b>
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <h2>{group.title}</h2>
      {/if}
      {#each group.switches as item (item.key)}
        <button
          class="row switch"
          role="switch"
          aria-checked={settings[item.key]}
          data-testid="setting-{item.id}"
          onclick={() => skin.setSettings({ [item.key]: !settings[item.key] })}
        >
          <span class="about">
            <strong>{item.title}</strong>
            <small>{item.hint}</small>
          </span>
          <span class="lever"><span></span></span>
        </button>
      {/each}
    </section>
  {/each}

  <!-- Category Profile, in a block of its own: five slots do not fit beside Steam. -->
  <section class="start" data-testid="settings-start">
    <div class="row">
      <div class="about">
        <h2>Profile: start row</h2>
        <small>The editor's profiles to start from, up to five. A tap on a slot chooses its profile.</small>
      </div>
      {#if unread}
        <button class="retry" data-testid="start-retry" onclick={readProfiles}>{unread} Try again</button>
      {/if}
    </div>
    <div class="slots">
      {#each settings.startProfiles as title, index (index)}
        <button
          class="value slot"
          class:missing={title !== null && isMissing(title)}
          data-testid="start-slot-{index + 1}"
          onclick={() => (choosing = index)}
        >
          <small>{index + 1}</small>
          {#if title === null}
            <span class="none">empty</span>
          {:else}
            <b>{startName(title)}</b>
            {#if isMissing(title)}<small class="warn" data-testid="start-missing">missing</small>{/if}
          {/if}
        </button>
      {/each}
    </div>
  </section>

  <div class="backup" data-testid="settings-backup">
    <span class="about">
      <strong>Backup</strong>
      <small data-testid="backup-time">
        {skin.backupAt ? `in Decaid, ${backupTime(skin.backupAt)}` : 'none yet'}; every change is copied to Decaid
      </small>
    </span>
    {#if skin.backupError}<small class="warn" data-testid="backup-error">{skin.backupError}</small>{/if}
    {#if restored}<small data-testid="backup-restored">{restored}</small>{/if}
    <button class="retry" data-testid="backup-restore" onclick={() => ((restored = null), (confirming = true))}>Restore from backup</button>
  </div>
</div>

{#if confirming}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={(e) => e.target === e.currentTarget && (confirming = false)}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="restore from backup" data-testid="backup-confirm">
      <h2>Restore from backup?</h2>
      <p>Every setting on this page becomes the backup's{skin.backupAt ? ` of ${backupTime(skin.backupAt)}` : ''}.</p>
      <div class="actions">
        <button class="retry" data-testid="backup-cancel" onclick={() => (confirming = false)}>Cancel</button>
        <button class="retry primary" data-testid="backup-confirm-restore" onclick={restore}>Restore</button>
      </div>
    </div>
  </div>
{/if}

{#if choosing !== null}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={(e) => e.target === e.currentTarget && (choosing = null)}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="slot {choosing + 1}" data-testid="start-choices">
      <h2>slot {choosing + 1}</h2>
      <ul>
        <li>
          <button
            class="choice"
            aria-pressed={settings.startProfiles[choosing] === null}
            data-testid="start-choice-empty"
            onclick={() => choose(null)}><span class="none">empty</span></button
          >
        </li>
        {#each offered as choice (choice.title)}
          <li>
            <button
              class="choice"
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
  </div>
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
  .settings {
    height: 100%;
    box-sizing: border-box;
    padding: 1rem 1.2rem;
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    grid-template-rows: auto auto auto auto minmax(0, 1fr);
    gap: 1rem 1.2rem;
  }

  /* Steam fills the left column; the switches' categories are stacked in the right one. */
  section:first-of-type {
    grid-row: 2 / 4;
  }

  .titled {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  /* The start row's slots run under both. */
  .start {
    grid-column: 1 / -1;
  }

  .start h2 {
    margin: 0;
  }

  .start > .row {
    border-top: 0;
  }

  .slots {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.6rem;
    padding-bottom: 0.4rem;
  }

  .value.slot {
    width: auto;
    min-width: 0;
    padding: 0 0.6rem;
  }

  .slot b {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.25rem;
  }

  .slot.missing {
    border-color: var(--temperature);
  }

  .warn {
    color: var(--temperature);
  }

  /* The backup: one line under the blocks, across both columns. */
  .backup {
    grid-column: 1 / -1;
    align-self: start;
    display: flex;
    align-items: center;
    gap: 1.2rem;
    padding: 0 1.2rem;
  }

  .backup .about {
    flex: 1;
  }

  .backup > small {
    max-width: 40%;
  }

  .actions {
    margin-top: 1rem;
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
  }

  .retry.primary {
    color: var(--bg);
    background: var(--fg);
    border-color: var(--fg);
    font-weight: 600;
  }

  .none {
    color: var(--dim);
    font-style: italic;
  }

  .retry {
    flex: none;
    min-height: 3rem;
    padding: 0 1rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 55%);
  }

  .dialog {
    width: 28rem;
    max-height: 80vh;
    box-sizing: border-box;
    padding: 0.4rem 1.2rem 1.2rem;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 1.2rem;
    box-shadow: 0 0.6rem 2.4rem rgb(0 0 0 / 70%);
  }

  ul {
    min-height: 0;
    margin: 0.6rem 0 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .choice {
    width: 100%;
    min-height: 3.4rem;
    padding: 0 1rem;
    text-align: left;
    font-size: 1.1rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .choice[aria-pressed='true'] {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
    font-weight: 600;
  }

  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: baseline;
    gap: 1.2rem;
  }

  .version {
    margin-left: auto;
    flex: none;
    opacity: 0.7;
  }

  h1 {
    margin: 0;
    font-size: 2.2rem;
    font-weight: 600;
    line-height: 1.15;
  }

  p {
    margin: 0;
    color: var(--dim);
  }

  section {
    min-height: 0;
    align-self: start;
    padding: 0.4rem 1.2rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--panel);
  }

  h2 {
    margin: 0.6rem 0 0.2rem;
    font-size: 1.4rem;
    font-weight: 600;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.8rem 0;
    border-top: 1px solid var(--line);
  }

  h2 + .row {
    border-top: 0;
  }

  .about {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    text-align: left;
  }

  strong {
    font-size: 1.15rem;
    font-weight: 600;
  }

  small {
    color: var(--dim);
    font-size: 0.85rem;
  }

  .values {
    flex: none;
    display: flex;
    gap: 0.6rem;
  }

  button {
    font: inherit;
    color: var(--fg);
    touch-action: manipulation;
    user-select: none;
  }

  .value {
    width: 7rem;
    min-height: 4.2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .value b {
    font-size: 1.5rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  i {
    margin-left: 0.25em;
    font-style: normal;
    font-size: 0.6em;
    font-weight: 400;
    color: var(--dim);
  }

  .switch {
    width: 100%;
    min-height: 5.8rem;
    background: none;
    border-width: 1px 0 0;
    border-style: solid;
    border-color: var(--line);
  }

  h2 + .switch,
  .titled + .switch {
    border-top-color: transparent;
  }

  .lever {
    flex: none;
    width: 4.4rem;
    height: 2.4rem;
    padding: 0.25rem;
    box-sizing: border-box;
    border-radius: 1.2rem;
    background: var(--raised);
    border: 1px solid var(--line);
  }

  .lever span {
    display: block;
    width: 1.8rem;
    height: 100%;
    border-radius: 50%;
    background: var(--dim);
    transition: transform 0.12s;
  }

  [aria-checked='true'] .lever {
    background: var(--pressure);
    border-color: var(--pressure);
  }

  [aria-checked='true'] .lever span {
    background: var(--bg);
    transform: translateX(2rem);
  }
</style>

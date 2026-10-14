<script lang="ts">
  import NumberPad from '../editor/NumberPad.svelte';
  import { STEAM_FIELDS, steamValue, withSteamValue, type Settings, type SteamField } from '../settings';
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
      hint: 'The editor shows the generated steps under the graph.',
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
</script>

<div class="settings">
  <header>
    <h1>Settings</h1>
    <p>Kept on this tablet. Everything else is in Decaid's own settings.</p>
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
      <h2>{group.title}</h2>
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
</div>

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

<style>
  .settings {
    height: 100%;
    box-sizing: border-box;
    padding: 1rem 1.2rem;
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 1rem 1.2rem;
  }

  /* Steam fills the left column; the switches' categories are stacked in the right one. */
  section:first-of-type {
    grid-row: 2 / 4;
  }

  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: baseline;
    gap: 1.2rem;
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

  h2 + .switch {
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

<script lang="ts">
  import ShotGraph from '../graph/ShotGraph.svelte';
  import { phaseTable, type PhaseRow } from './phases';
  import { emptySeries, shotSeconds } from './shot';
  import type { Skin } from './skin.svelte';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  // The shot's overlay on home's graph area (spec 3.8): the live graph and its values with the
  // stop button while the shot runs; after it the per-phase table in place of the button,
  // until a tap anywhere closes it (`Skin.closeShot`) or the next shot replaces it.
  const shot = $derived(skin.shot);
  const series = $derived(shot?.series ?? emptySeries());
  const ended = $derived(shot?.ended ?? false);
  const snapshot = $derived(skin.link === 'machine' ? skin.snapshot : null);
  const brewing = $derived(snapshot?.state.state === 'espresso' && !ended);
  const profile = $derived(skin.workflow?.profile);
  const target = $derived(skin.workflow?.context?.targetYield || null);
  // The profile step that runs: the machine's frame number, not its substate (research 8.2).
  const step = $derived(brewing && snapshot ? profile?.steps[snapshot.profileFrame]?.name : undefined);
  // In espresso before water moves: the graph and the timer wait (shot.ts).
  const heating = $derived(brewing && series.t.length === 0);
  // Streamline's table of the shot (phases.ts), once it is over.
  const table = $derived(ended && shot ? phaseTable(shot.samples, shot.finalWeight) : null);
  const rows = $derived(
    table
      ? ([
          ['preinfusion', 'Preinfusion', table.preinfusion],
          ['extraction', 'Extraction', table.extraction],
          ['total', 'Total', table.total],
        ] as const)
      : [],
  );
  const weight = $derived(ended ? (shot?.finalWeight ?? skin.weight) : skin.weight);
  const value = (number: number | null | undefined, digits = 1) =>
    number === null || number === undefined ? '–' : number.toFixed(digits);
  const cell = (row: Partial<PhaseRow> | null, key: keyof PhaseRow) => row?.[key] ?? '';
</script>

<div class="overlay" class:ended data-testid="shot-overlay">
  <header>
    <strong data-testid="espresso-profile">{profile?.title ?? '–'}</strong>
    <span data-testid="espresso-step">
      {ended ? 'shot finished' : heating ? 'heating' : (step ?? (brewing ? '' : skin.status.title))}
    </span>
  </header>

  <div class="plot">
    <ShotGraph {...series} fit={ended} minSeconds={skin.expectedSeconds} legend={skin.settings.showGraphLegend} label="live shot" />
  </div>

  {#if table}
    <table data-testid="shot-phases">
      <thead>
        <tr>
          <th></th>
          <th>s</th>
          <th class="weight">g</th>
          <th>ml</th>
          <th class="temperature">°C</th>
          <th class="flow">ml/s</th>
          <th class="pressure">bar</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as [id, name, row] (id)}
          <tr data-testid="phase-{id}" class={id}>
            <th>{name}</th>
            {#each ['seconds', 'weight', 'volume', 'temperature', 'flow', 'pressure'] as const as key (key)}
              <td data-testid="phase-{id}-{key}">{cell(row, key)}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <aside>
    <div class="big">
      <small>time</small>
      <b data-testid="shot-timer">{shotSeconds(shot).toFixed(1)}<i>s</i></b>
    </div>
    <div class="big weight">
      <small>weight{target ? `, stops at ${+target.toFixed(1)} g` : ''}</small>
      <b data-testid="shot-weight">{value(weight)}<i>g</i></b>
    </div>
    <dl>
      <div class="pressure">
        <dt>pressure</dt>
        <dd data-testid="shot-pressure">{value(snapshot?.pressure)} <i>bar</i></dd>
      </div>
      <div class="flow">
        <dt>flow</dt>
        <dd data-testid="shot-flow">{value(snapshot?.flow)} <i>ml/s</i></dd>
      </div>
      <div class="temperature">
        <dt>temperature</dt>
        <dd data-testid="shot-temperature">{value(snapshot?.groupTemperature)} <i>°C</i></dd>
      </div>
    </dl>
    {#if skin.notice}
      <p class="notice" data-testid="notice">{skin.notice}</p>
    {/if}
    {#if ended}
      <p class="close" data-testid="shot-close-hint">tap anywhere to close</p>
    {:else}
      <button data-testid="stop" disabled={!skin.canStop} onclick={() => skin.stop()}>stop</button>
    {/if}
  </aside>
</div>

{#if ended}
  <!-- After the shot a tap anywhere closes the overlay and does nothing else (founder, 2026-10-17). -->
  <button class="catch" data-testid="shot-close" aria-label="close the shot" onclick={() => skin.closeShot()}></button>
{/if}

<style>
  .overlay {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 17rem;
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas: 'header side' 'plot side' 'table side';
    gap: 0.6rem 1.2rem;
  }

  header {
    grid-area: header;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    min-height: 2rem;
  }

  header strong {
    font-size: var(--text-value);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  header span {
    color: var(--dim);
    font-size: var(--text-body);
    white-space: nowrap;
  }

  .plot {
    grid-area: plot;
    min-height: 0;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--panel);
  }

  table {
    grid-area: table;
    border-collapse: collapse;
    font-size: var(--text-value);
    font-variant-numeric: tabular-nums;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--panel);
  }

  th,
  td {
    padding: 0.25rem 0.8rem;
    text-align: left;
    white-space: nowrap;
  }

  thead th {
    padding-top: 0.5rem;
    color: var(--dim);
    font-size: var(--text-label);
    font-weight: 400;
  }

  tbody th {
    color: var(--dim);
    font-weight: 600;
    text-align: right;
  }

  tbody tr:last-child th,
  tbody tr:last-child td {
    padding-bottom: 0.5rem;
  }

  tr.total td {
    font-weight: 700;
  }

  thead .weight {
    color: var(--weight);
  }
  thead .temperature {
    color: var(--temperature);
  }
  thead .flow {
    color: var(--flow);
  }
  thead .pressure {
    color: var(--pressure);
  }

  aside {
    grid-area: side;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  small,
  dt {
    color: var(--dim);
    font-size: var(--text-label);
  }

  i {
    font-style: normal;
    font-size: 0.5em;
    font-weight: 400;
    color: var(--dim);
    margin-left: 0.2em;
  }

  .big {
    display: flex;
    flex-direction: column;
  }

  .big b {
    font-size: var(--text-big);
    font-weight: 600;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .big.weight b {
    color: var(--weight);
  }

  dl {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  dl div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  dd {
    margin: 0;
    font-size: var(--text-title);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  dd i {
    font-size: 0.6em;
  }

  .pressure dd {
    color: var(--pressure);
  }
  .flow dd {
    color: var(--flow);
  }
  .temperature dd {
    color: var(--temperature);
  }

  .notice {
    margin: 0;
    color: var(--warn);
    font-size: var(--text-label);
  }

  .close {
    margin: auto 0 0;
    padding: 1rem;
    color: var(--dim);
    font-size: var(--text-body);
    text-align: center;
    border: 1px dashed var(--line);
    border-radius: 0.9rem;
  }

  button {
    margin-top: auto;
    min-height: 7rem;
    font: inherit;
    font-size: var(--text-large);
    font-weight: 600;
    color: var(--bg);
    background: var(--temperature);
    border: 1px solid var(--temperature);
    border-radius: 0.9rem;
    touch-action: manipulation;
    user-select: none;
  }

  button:disabled {
    background: var(--panel);
    border-color: var(--line);
    color: var(--dim);
  }

  /* Over the whole app, under the dialogs: the stream's banner and the sleep screen stay on top. */
  .catch {
    position: fixed;
    inset: 0;
    z-index: 9;
    min-height: 0;
    margin: 0;
    background: none;
    border: 0;
    border-radius: 0;
  }
</style>

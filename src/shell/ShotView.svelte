<script lang="ts">
  import type { Snippet } from 'svelte';
  import { gramsOf } from '../display';
  import ShotGraph from '../graph/ShotGraph.svelte';
  import { homeShot } from './home-shot';
  import NextShot from './NextShot.svelte';
  import { phaseTable, type PhaseRow } from './phases';
  import { shotWeightText } from './shot';
  import type { Skin } from './skin.svelte';

  interface Props {
    skin: Skin;
    /** home's header, left of the title; the right column starts below both, level with the graph */
    top?: Snippet;
  }

  let { skin, top }: Props = $props();

  // Home is the shot screen: one graph on the left, and the right column of a fixed
  // width with the shot's time, weight and values, so nothing changes size when a shot starts.
  // While the shot runs the curves are live and stop is at the column's bottom; after it the
  // shot stays with the per-phase table until the next one starts (`homeShot`).
  const shown = $derived(homeShot(skin.shot, skin.recalled?.series ?? null, skin.weight, skin.newestShot));
  const running = $derived(shown.kind === 'running');
  const finished = $derived(shown.kind === 'finished');
  const recalled = $derived(shown.kind === 'recalled');
  const snapshot = $derived(skin.link === 'machine' ? skin.snapshot : null);
  const target = $derived(skin.workflow?.context?.targetYield || null);
  // Streamline's table of the shot (phases.ts), once it is over and the setting shows it.
  const table = $derived(
    finished && skin.shot && skin.settings.showShotValues ? phaseTable(skin.shot.samples, skin.shot.finalWeight) : null,
  );
  const rows = $derived(
    table
      ? ([
          ['preinfusion', 'Preinfusion', table.preinfusion],
          ['extraction', 'Extraction', table.extraction],
          ['total', 'Total', table.total],
        ] as const)
      : [],
  );
  const PLOT = { running: 'shot-plot', finished: 'last-shot', recalled: 'history-graph', none: 'empty-graph' } as const;
  const LABEL = {
    running: 'live shot',
    finished: 'last shot',
    recalled: 'last shot of the history entry',
    none: 'no shot yet',
  } as const;
  const value = (number: number | null | undefined, digits = 1) =>
    number === null || number === undefined ? '–' : number.toFixed(digits);
  const cell = (row: Partial<PhaseRow> | null, key: keyof PhaseRow) => row?.[key] ?? '';
</script>

<div class="shot" class:values={table !== null} data-testid="home-shot" data-shot={shown.kind}>
  <div class="top">{@render top?.()}</div>
  <h1 data-testid="home-title">Home</h1>
  <!-- No strip and no caption over the graph: the step is in the state line, the shot's time
       and weight and a recalled entry's profile, bean and grinder in the column. -->
  <div class="plot" data-testid={PLOT[shown.kind]} data-main-frame>
    <ShotGraph
      {...shown.series}
      fit={finished || recalled}
      minSeconds={skin.expectedSeconds}
      legend={skin.settings.showGraphLegend}
      label={LABEL[shown.kind]}
    />
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

  <aside data-testid="shot-column">
    <!-- The profile and bean for the next shot, at their place for the whole shot but off while
         it runs, so the values under them do not move when it starts. -->
    <NextShot {skin} off={running} />
    <!-- Each row: the caption on the left, the number and its unit on the right; the units have one
         width, so every number ends on one edge. -->
    <div class="row big">
      <small data-testid="shot-timer-label">{finished ? 'time, finished' : 'time'}</small>
      <b class="big-number" data-testid="shot-timer">{value(shown.seconds)}<i>s</i></b>
    </div>
    <div class="row big weight">
      <small data-testid="shot-weight-label"
        ><span>weight</span>{#if target}<span data-testid="shot-stops-at">stops at {+target.toFixed(1)} g</span>{/if}</small
      >
      <b class="big-number" data-testid="shot-weight"
        >{shown.kind === 'running' ? gramsOf(shown.weight, '') : shotWeightText(shown.weight)}<i>g</i></b
      >
    </div>
    <dl>
      <div class="row pressure">
        <dt>pressure</dt>
        <dd data-testid="shot-pressure">{value(snapshot?.pressure)}<i>bar</i></dd>
      </div>
      <div class="row flow">
        <dt>flow</dt>
        <dd data-testid="shot-flow">{value(snapshot?.flow)}<i>ml/s</i></dd>
      </div>
      <div class="row temperature">
        <dt>temperature</dt>
        <dd data-testid="shot-temperature">{value(snapshot?.groupTemperature)}<i>°C</i></dd>
      </div>
    </dl>
    <!-- Why the finished shot stopped, as Decaid's sequencer said it (stop-reason.ts), under the last
         of the values. The line keeps its height when empty, so nothing under it moves when a shot starts. -->
    <p class="hint stop-reason" data-testid="stop-reason">{finished ? (skin.stopLine ?? '') : ''}</p>
    {#if skin.notice}
      <p class="notice" data-testid="notice">{skin.notice}</p>
    {:else if skin.info}
      <p class="notice info" data-testid="tare-notice">{skin.info}</p>
    {/if}
    <!-- Nothing is started here: the DE1 is started at the machine. What runs can be stopped. -->
    {#if running || skin.canStop}
      <button class="stop big-stop" data-testid="stop" disabled={!skin.canStop} onclick={() => skin.stop()}>stop</button>
    {/if}
  </aside>
</div>

<style>
  .shot {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 17rem;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: 'top title' 'plot side';
    gap: var(--space-2) var(--space-3);
  }

  /* The table's row only when it is drawn: else the graph takes its height. */
  .shot.values {
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas: 'top title' 'plot side' 'table side';
  }

  .top {
    grid-area: top;
    min-width: 0;
  }

  /* a page's header is a name, as on steam and hot water */
  h1 {
    grid-area: title;
    align-self: center;
    justify-self: end;
    margin: 0;
    font-size: var(--text-body);
    font-weight: 600;
    white-space: nowrap;
  }

  .plot {
    grid-area: plot;
    min-height: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
  }

  table {
    grid-area: table;
    /* `collapse` would drop the frame's rounded corners */
    border-collapse: separate;
    border-spacing: 0;
    font-size: var(--text-value);
    font-variant-numeric: tabular-nums;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
  }

  th,
  td {
    padding: var(--space-1) 0.8rem;
    text-align: left;
    white-space: nowrap;
  }

  thead th {
    padding-top: var(--space-2);
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
    padding-bottom: var(--space-2);
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
    /* the column has one row less than the page: the smaller gap is what keeps the stop button in view at the largest display size */
    gap: var(--space-1);
  }

  small,
  dt {
    color: var(--dim);
    font-size: var(--text-label);
  }

  /* The caption, its two lines as one block, is centred on the row's middle: the row keeps the
     number's height, so no number moves when the caption changes. */
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1);
  }

  .row > small,
  .row > dt {
    min-width: 0;
  }

  small span {
    display: block;
  }

  /* the unit column: one width in every row, the unit at its left */
  i {
    display: inline-block;
    width: 2.4rem;
    margin-left: var(--space-1);
    font-style: normal;
    font-size: var(--text-title);
    font-weight: 400;
    color: var(--dim);
    text-align: left;
  }

  .big b {
    flex: none;
  }

  .big.weight b {
    color: var(--weight);
  }

  .stop-reason {
    min-height: 1lh;
  }

  dl {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  dd {
    flex: none;
    margin: 0;
    font-size: var(--text-title);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  dd i {
    font-size: var(--text-label);
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

  /*
   * 7 rem high where the column has room; at a larger display size it gives up height, never
   * less than 3.5 rem, so it stays whole in view under the values.
   */
  .stop {
    margin-top: auto;
    flex: 0 1 7rem;
    min-height: var(--control-big);
    font-size: var(--text-large);
  }
</style>

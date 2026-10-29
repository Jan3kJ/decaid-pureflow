<script lang="ts">
  import { gramsOf, signed } from '../display';
  import ShotGraph from '../graph/ShotGraph.svelte';
  import type { Skin } from '../shell/skin.svelte';
  import PageHeader from '../shell/PageHeader.svelte';
  import { emptySteamSeries, secondsLeft, steamSeconds } from './run';
  import { adjustedSeconds, readScale } from './timer';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  // The values are the settings page's; this page only reads them.
  const settings = $derived(skin.settings.steam);

  const series = $derived(skin.steam?.series ?? emptySteamSeries());
  const steaming = $derived(skin.steam !== null && !skin.steam.ended);
  /** s, the timer the machine has */
  const timer = $derived(skin.steamTimer);
  const reading = $derived(skin.weight === null ? null : readScale(skin.weight, settings));
  /** g without the unit: the mug's and the milk's are calculated, so no '.0' */
  const grams = (value: number) => `${+value.toFixed(1)}`;
  const scaled = $derived(skin.scaleLink === 'connected');
  /** s, a timer with the selected adjust button's amount (spec 3.7): what a tap sends */
  const adjusted = (seconds: number) => adjustedSeconds(seconds, skin.steamAdjustment);
  const calculated = $derived(reading ? adjusted(reading.seconds) : 0);
  /** While steam runs the timer counts down from the set seconds (spec 3.7). */
  const shown = $derived(timer === null ? null : steaming && skin.steam ? secondsLeft(timer, steamSeconds(skin.steam)) : timer);
</script>

<div class="steam">
  <div class="header">
    <PageHeader {skin} heat="steam" title="Steam">
      {#snippet beside()}
        <!-- Only after the steam: while it runs 'steam left' is the one clock (spec 3.18 item 4). -->
        {#if skin.steam?.ended}
          <span class="run" data-testid="steam-state">
            last steam
            <b data-testid="steam-elapsed">{steamSeconds(skin.steam).toFixed(0)} s</b>
          </span>
        {/if}
        <!-- With the heater off the state line says Off; the switch that turns it on sits left of the title (spec 3.12). -->
        {#if skin.steamHeater === 'off'}
          <button class="heater-on" data-testid="steam-heater-on" onclick={() => skin.setSteamHeater(true)}>steam on</button>
        {/if}
      {/snippet}
    </PageHeader>
  </div>

  <div class="plot" data-main-frame>
    <ShotGraph
      t={series.t}
      pressure={series.pressure}
      flow={series.flow}
      temperature={series.temperature}
      yMax={4}
      temperatureScale={{ min: 140, max: 170 }}
      minSeconds={Math.max(30, timer ?? 0)}
      legend={skin.settings.showGraphLegend}
      label="steam graph"
    />
  </div>

  <aside>
    <div class="favourites">
      <!-- A chip shows the seconds it sends: its own with the selected adjust button's amount. -->
      {#each settings.favourites as seconds, i (i)}
        <button
          class="chip select-fill"
          aria-pressed={adjusted(seconds) === timer}
          data-testid="steam-favourite"
          onclick={() => skin.setSteamTimer(adjusted(seconds))}
        >
          {adjusted(seconds)} s
        </button>
      {/each}
    </div>

    <!-- In the centre of the column, in line with 'set timer' (spec 3.7). -->
    <div class="big">
      <small>{steaming ? 'steam left' : 'steam timer'}</small>
      <b data-testid="steam-timer">{shown ?? '–'}<i>s</i></b>
    </div>

    <!-- A grid of label, number and unit as on home: the numbers end on one edge, the units have
         their own column (spec 3.18 item 4). The scale's row is the one tare of the skin (Skin.tare,
         spec 3.7), off while steam runs; without a scale one line in place of the rows looks for
         the scale (spec 3.9). -->
    {#if scaled}
      <div class="rows">
        <button class="line" data-testid="steam-tare" disabled={steaming} onclick={() => skin.tare()}>
          <span class="key">scale</span>
          <span class="reading weight" data-testid="steam-weight">
            {#if skin.weight === null}<b>–</b> <i></i>{:else}<b>{gramsOf(skin.weight, '')}</b> <i>g</i>{/if}
          </span>
        </button>
        <div class="line">
          <span class="key">
            mug
            {#if reading}<span class="badge" data-testid="steam-mug">{reading.mug.size}</span>{/if}
          </span>
          <span class="reading of" data-testid="steam-mug-weight">
            {#if reading}<b>{grams(reading.mug.weight)}</b> <i>g</i>{:else}<b>–</b> <i></i>{/if}
          </span>
        </div>
        <div class="line">
          <span class="key">milk</span>
          <span class="reading" data-testid="steam-milk">
            {#if reading}<b>{grams(reading.milk)}</b> <i>g</i>{:else}<b>–</b> <i></i>{/if}
          </span>
        </div>
      </div>
    {:else}
      <button class="line none" data-testid="steam-no-scale" onclick={() => skin.findScale()}>no scale: the chips set the timer</button
      >
    {/if}

    <!-- The adjust buttons (spec 3.7): for milk colder or warmer than the calibration's. One at a
         time, a tap on the selected one clears it; while steam runs a tap moves the timer too. -->
    <div class="adjust">
      {#each settings.adjustments as amount, i (i)}
        <button
          class="chip select-fill"
          aria-pressed={skin.steamAdjust === i}
          data-testid="steam-adjust"
          onclick={() => skin.tapSteamAdjust(i)}
        >
          {signed(amount)}
        </button>
      {/each}
    </div>

    <button
      class="set primary"
      data-testid="steam-set-timer"
      disabled={calculated === 0}
      onclick={() => calculated > 0 && skin.setSteamTimer(calculated)}
    >
      set timer
      {#if calculated > 0}
        <b data-testid="steam-seconds">{calculated} s</b>
      {:else if !scaled}
        <small data-testid="steam-needs-scale">needs the scale</small>
      {/if}
    </button>

    {#if skin.notice}
      <p class="notice" data-testid="notice">{skin.notice}</p>
    {:else if skin.info}
      <p class="notice info" data-testid="tare-notice">{skin.info}</p>
    {:else if skin.steamMismatch}
      <p class="notice" data-testid="steam-mismatch">{skin.steamMismatch}</p>
    {/if}

    <!-- Steam is started at the machine (founder, 2026-10-13); it is stopped here. -->
    {#if skin.canStop}
      <button class="stop" data-testid="steam-stop" onclick={() => skin.stop()}>stop</button>
    {/if}
  </aside>
</div>

<style>
  .steam {
    height: 100%;
    box-sizing: border-box;
    /* home's padding, so the header is in the same place (spec 3.11) */
    padding: 0.8rem 1.2rem 1rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 21rem;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: 'header header' 'plot side';
    gap: 0.8rem 1.2rem;
  }

  .header {
    grid-area: header;
    min-width: 0;
  }

  .run {
    color: var(--dim);
    font-size: var(--text-body);
    white-space: nowrap;
  }

  .run b {
    margin-left: 0.4rem;
    color: var(--fg);
    font-variant-numeric: tabular-nums;
  }

  .plot {
    grid-area: plot;
    min-height: 0;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--panel);
  }

  aside {
    grid-area: side;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  button {
    font: inherit;
    color: var(--fg);
    border: 1px solid var(--line);
    background: var(--panel);
    border-radius: 0.9rem;
    touch-action: manipulation;
    user-select: none;
  }

  /* no taller than the header (PageHeader's 3.5rem), so the column under it does not move */
  .heater-on {
    flex: none;
    min-height: 3.5rem;
    padding: 0 1.4rem;
    white-space: nowrap;
    font-size: var(--text-value);
    font-weight: 600;
  }

  .favourites,
  .adjust {
    display: flex;
    gap: 0.6rem;
  }

  .adjust .chip {
    min-height: 3.4rem;
    font-size: var(--text-value);
  }

  .chip {
    flex: 1;
    min-height: 4rem;
    font-size: var(--text-value);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  i {
    font-style: normal;
    font-size: var(--text-title);
    font-weight: 400;
    color: var(--dim);
    margin-left: 0.2em;
  }

  .big {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .big b {
    font-size: var(--text-big);
    font-weight: 600;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* label, number, unit: the unit column has one width, so the numbers end on one edge */
  .line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 1.6rem;
    align-items: baseline;
    column-gap: 0.4rem;
    padding: 0 0.6rem 0 1rem;
    border: 1px solid transparent;
    text-align: left;
  }

  /* the tare: the whole row a button, a finger's target */
  button.line {
    min-height: 3.5rem;
    align-content: center;
    border-color: var(--line);
  }

  .line.none {
    display: block;
    color: var(--dim);
    font-size: var(--text-label);
  }

  .key {
    color: var(--dim);
    font-size: var(--text-label);
  }

  .badge {
    margin-left: 0.4rem;
    padding: 0 0.4rem;
    border: 1px solid var(--line);
    border-radius: 0.4rem;
    color: var(--fg);
    font-weight: 600;
    text-transform: uppercase;
  }

  .reading {
    display: contents;
  }

  .reading b {
    justify-self: end;
    font-size: var(--text-title);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .reading i {
    font-size: var(--text-label);
  }

  .weight b {
    color: var(--weight);
  }

  button.line:disabled .weight b {
    color: var(--dim);
  }

  /* the mug's weight is a setting, not a reading */
  .of b {
    color: var(--dim);
  }

  .set {
    min-height: 4.5rem;
    font-size: var(--text-value);
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    background: var(--raised);
  }

  .set b {
    font-variant-numeric: tabular-nums;
  }

  .set small {
    font-weight: 400;
  }

  .notice {
    margin: 0;
    color: var(--warn);
    font-size: var(--text-label);
  }

  .info {
    color: var(--fg);
  }

  .stop {
    margin-top: auto;
    min-height: 6rem;
    font-size: var(--text-large);
    font-weight: 600;
    color: var(--bg);
    background: var(--temperature);
    border-color: var(--temperature);
  }
</style>

<script lang="ts">
  import { gramsOf, signed } from '../display';
  import ShotGraph from '../graph/ShotGraph.svelte';
  import type { Skin } from '../shell/skin.svelte';
  import PageHeader from '../shell/PageHeader.svelte';
  import SidePage from '../ui/SidePage.svelte';
  import ValueLine from '../ui/ValueLine.svelte';
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
  /** s, a timer with the selected adjust button's amount: what a tap sends */
  const adjusted = (seconds: number) => adjustedSeconds(seconds, skin.steamAdjustment);
  const calculated = $derived(reading ? adjusted(reading.seconds) : 0);
  /** While steam runs the timer counts down from the set seconds. */
  const shown = $derived(timer === null ? null : steaming && skin.steam ? secondsLeft(timer, steamSeconds(skin.steam)) : timer);
</script>

<!-- Steam is started at the machine; it is stopped here. -->
<SidePage onstop={skin.canStop ? () => skin.stop() : undefined} stopTestid="steam-stop">
  {#snippet header()}
    <PageHeader {skin} heat="steam" title="Steam">
      {#snippet beside()}
        <!-- Only after the steam: while it runs 'steam left' is the one clock. -->
        {#if skin.steam?.ended}
          <span class="run" data-testid="steam-state">
            last steam
            <b data-testid="steam-elapsed">{steamSeconds(skin.steam).toFixed(0)} s</b>
          </span>
        {/if}
        <!-- With the heater off the state line says Off; the switch that turns it on sits left of the title. -->
        {#if skin.steamHeater === 'off'}
          <button class="heater-on" data-testid="steam-heater-on" onclick={() => skin.setSteamHeater(true)}>steam on</button>
        {/if}
      {/snippet}
    </PageHeader>
  {/snippet}

  {#snippet main()}
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
  {/snippet}

  <div class="favourites">
    <!-- A chip shows the seconds it sends: its own with the selected adjust button's amount. -->
    {#each settings.favourites as seconds, i (i)}
      <button
        class="chip select-outline"
        aria-pressed={adjusted(seconds) === timer}
        data-testid="steam-favourite"
        onclick={() => skin.setSteamTimer(adjusted(seconds))}
      >
        {adjusted(seconds)} s
      </button>
    {/each}
  </div>

  <!-- In the centre of the column, in line with 'set timer'. -->
  <div class="big">
    <small>{steaming ? 'steam left' : 'steam timer'}</small>
    <b class="big-number" data-testid="steam-timer">{shown ?? '–'}<i>s</i></b>
  </div>

  <!-- A grid of label, number and unit as on home: the numbers end on one edge, the units have
         their own column. The scale's row is the one tare of the skin (Skin.tare),
         off while steam runs; without a scale one line in place of the rows looks for
         the scale. -->
  {#if scaled}
    <div class="rows">
      <ValueLine
        label="scale"
        value={skin.weight === null ? null : gramsOf(skin.weight, '')}
        tone="weight"
        testid="steam-weight"
        buttonTestid="steam-tare"
        disabled={steaming}
        onclick={() => skin.tare()}
      />
      <!-- the mug's weight is a setting, not a reading -->
      <ValueLine label="mug" value={reading && grams(reading.mug.weight)} tone="setting" testid="steam-mug-weight">
        {#if reading}<span class="badge" data-testid="steam-mug">{reading.mug.size}</span>{/if}
      </ValueLine>
      <ValueLine label="milk" value={reading && grams(reading.milk)} testid="steam-milk" />
    </div>
  {:else}
    <button class="none" data-testid="steam-no-scale" onclick={() => skin.findScale()}>no scale: the chips set the timer</button>
  {/if}

  <!-- The adjust buttons: for milk colder or warmer than the calibration's. One at a
         time, a tap on the selected one clears it; while steam runs a tap moves the timer too. -->
  <div class="adjust">
    {#each settings.adjustments as amount, i (i)}
      <button
        class="chip select-outline"
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
</SidePage>

<style>
  .run {
    color: var(--dim);
    font-size: var(--text-body);
    white-space: nowrap;
  }

  .run b {
    margin-left: var(--space-1);
    color: var(--fg);
    font-variant-numeric: tabular-nums;
  }

  .plot {
    min-height: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
  }

  button {
    border: 1px solid var(--line);
    background: var(--panel);
    border-radius: var(--radius);
  }

  /* no taller than the header (PageHeader's 3.5rem), so the column under it does not move */
  .heater-on {
    flex: none;
    min-height: var(--control-big);
    padding: 0 1.4rem;
    white-space: nowrap;
    font-size: var(--text-value);
    font-weight: 600;
  }

  .favourites,
  .adjust {
    display: flex;
    gap: var(--space-2);
  }

  .adjust .chip {
    min-height: var(--control-tall);
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

  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* in place of the scale's lines, as high as one */
  .none {
    display: block;
    min-height: var(--control-big);
    align-content: center;
    padding: 0 0.6rem 0 1rem;
    text-align: left;
    color: var(--dim);
    font-size: var(--text-label);
  }

  /* a plain letter, as high as the number's line so the row keeps its height */
  .badge {
    box-sizing: border-box;
    height: calc(var(--number-line) * 1em);
    min-width: 1.6em;
    display: grid;
    place-items: center;
    padding: 0 var(--space-1);
    color: var(--fg);
    font-size: var(--text-title);
    font-weight: 600;
    line-height: 1;
    text-transform: uppercase;
  }

  /* Raised like the chips, not the main button's fill; off, it takes the shared off look of `.primary`. */
  .set.primary {
    min-height: 4.5rem;
    font-size: var(--text-value);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    color: var(--fg);
    background: var(--raised);
    border-color: var(--line);
  }

  .set b {
    font-variant-numeric: tabular-nums;
  }

  .set small {
    font-weight: 400;
  }
</style>

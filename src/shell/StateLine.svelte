<script lang="ts">
  import type { HeatTarget } from './machine';
  import type { Skin } from './skin.svelte';

  interface Props {
    skin: Skin;
    /**
     * the heater this page waits for: an idle machine says 'Heating' under its target, and the
     * steam page 'Off' while the steam heater is off
     */
    heat?: HeatTarget;
  }

  let { skin, heat }: Props = $props();

  const status = $derived(skin.statusFor(heat ?? null));

  // The readings are the machine's values; without a machine there are none, and the corner says why.
  const machine = $derived(skin.link === 'machine' && skin.snapshot !== null);
</script>

<!-- The readings of the header, centred over the page's main frame: group or steam, tank and scale. Each has a slot
     sized from its widest text, in place from the first frame, so no reading moves another. `data-state` is the
     machine's state as the header says it, for the tests; no word shows. -->
<section class="state" data-testid="status" data-state={status.title} data-link={skin.link}>
  {#each skin.stateValues as item (item.key)}
    {#if item.key === 'scale' && !machine}
      <span class="value scale">
        <small>{item.label}</small>
        <span class="slot" data-max={item.widest}><b data-testid="state-scale">–</b></span>
      </span>
    {:else if item.key === 'scale' && skin.scaleLink === 'connected'}
      <!-- A tap on the weight tares the scale; without a scale it is not a button. -->
      <button class="value scale" data-testid="tare" aria-label="tare the scale" onclick={() => skin.tare()}>
        <small>{item.label}</small>
        <span class="slot" data-max={item.widest}><b data-testid="state-scale">{item.value}</b></span>
      </button>
    {:else if item.key === 'scale'}
      <!-- Without a scale the cell is a button, a tap looks for the scale again. Its box is held by an invisible copy
           of the connected cell (label and slot); the warning's two rows lie inside that box. -->
      <button class="value scale warn" data-testid="scale-retry" aria-label="look for the scale" onclick={() => skin.findScale()}>
        <span class="ghost" aria-hidden="true">
          <small>{item.label}</small>
          <span class="slot" data-max={item.widest}><b>0</b></span>
        </span>
        <span class="rows">
          <b class="warning" data-testid="state-scale">{item.value}</b>
          <span class="sentence" data-testid="scale-hint">{item.hint}</span>
        </span>
      </button>
    {:else}
      <span class="value {item.key}" class:warn={item.warn}>
        <small>{item.label}</small>
        <span class="slot" data-max={item.widest}
          ><b class:warning={item.warn} data-testid="state-{item.key}">{machine ? item.value : '–'}</b></span
        >
      </span>
    {/if}
  {/each}
</section>

<style>
  /* centred over the main frame (the header's first column); nothing wraps */
  .state {
    min-width: 0;
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: var(--space-4);
    font-size: var(--text-value);
    font-weight: 300;
    white-space: nowrap;
    /* it lies over the corner's word, which stays tappable; only its buttons take touches */
    pointer-events: none;
    /* Clipped sideways only: the weight's tap target reaches above and below the line. */
    overflow-x: clip;
  }

  small {
    margin-right: var(--space-1);
    color: var(--dim);
    font-size: var(--text-label);
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }

  /* The slot: as wide as the value's widest text, which an invisible, empty-height copy holds open; the number
     is right aligned in it. */
  .slot {
    display: inline-grid;
    justify-items: end;
  }

  .slot::after {
    content: attr(data-max);
    height: 0;
    overflow: hidden;
    visibility: hidden;
  }

  b {
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  .scale.warn small {
    color: var(--warn);
  }

  .scale b:not(.warning) {
    color: var(--weight);
  }

  /* The weight as a tare button: the line's text, with a finger's target around it. */
  button.value {
    pointer-events: auto;
    margin: -0.9rem -0.6rem;
    padding: 0.9rem 0.6rem;
    color: inherit;
    font-weight: inherit;
    background: none;
    border: 0;
    border-radius: var(--radius-small);
  }

  /* The warning without a scale: the cell's box is held by the invisible copy of the weight cell; the sign and
     the sentence, two rows of label size, fill that box. The whole cell takes the tap. */
  .scale.warn {
    position: relative;
  }

  .ghost {
    visibility: hidden;
  }

  .rows {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: var(--space-1);
    padding: 0 0.6rem;
    font-size: var(--text-label);
    line-height: 1.15;
    text-align: left;
    white-space: normal;
  }

  .sentence {
    max-width: 12ch;
    color: var(--warn);
    text-wrap: balance;
  }
</style>

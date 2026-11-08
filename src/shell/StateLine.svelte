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

<!-- The readings of the header, centred over the page's main frame: group or steam, tank, scale and the step
     that runs. `data-state` is the machine's state as the header says it, for the tests; no word shows. -->
<section class="state" data-testid="status" data-state={status.title} data-link={skin.link}>
  {#if machine}
    {#each skin.stateValues as item (item.key)}
      {#if item.key === 'scale' && skin.scaleLink === 'connected'}
        <!-- A tap on the weight tares the scale; without a scale it is not a button. -->
        <button class="value scale" data-testid="tare" aria-label="tare the scale" onclick={() => skin.tare()}>
          <small>{item.label}</small>
          <b data-testid="state-scale">{item.value}</b>
        </button>
      {:else if item.key === 'scale'}
        <!-- Without a scale the warning is a button: a tap looks for the scale again. -->
        <button class="value scale warn" data-testid="scale-retry" aria-label="look for the scale" onclick={() => skin.findScale()}>
          <small>{item.label}</small>
          <b class="warning" data-testid="state-scale">{item.value}</b>
        </button>
      {:else}
        <span class="value {item.key}" class:warn={item.warn}>
          <small>{item.label}</small>
          <b class:warning={item.warn} data-testid="state-{item.key}">{item.value}</b>
        </span>
      {/if}
    {/each}
    {#if skin.step}
      <!-- The step that runs, after the weight: in the values' size. -->
      <span class="step" data-testid="state-step">{skin.step}</span>
    {/if}
  {/if}
</section>

<style>
  /* centred over the main frame (the header's first column); a long step is cut, not wrapped */
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

  .step {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  small {
    margin-right: var(--space-1);
    color: var(--dim);
    font-size: var(--text-label);
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }

  b {
    font-weight: 400;
    font-variant-numeric: tabular-nums;
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

  button.value:active {
    background: var(--raised);
  }

  /* The scale's warning is a hint, not a value: at a label's size it fits beside the others. */
  .scale.warn b {
    font-size: var(--text-label);
  }
</style>

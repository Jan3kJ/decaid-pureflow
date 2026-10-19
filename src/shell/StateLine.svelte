<script lang="ts">
  import type { HeatTarget } from './machine';
  import type { Skin } from './skin.svelte';

  interface Props {
    skin: Skin;
    /** the heater this page waits for: an idle machine under its target says 'Heating' (spec 3.8) */
    heat?: HeatTarget;
  }

  let { skin, heat }: Props = $props();

  const status = $derived(skin.statusFor(heat ?? null));

  // With a machine the line is its values; without one, what the skin knows about the link.
  const machine = $derived(skin.link === 'machine' && skin.snapshot !== null);
</script>

<!-- The machine's state in one line, on home and on the steam page (founder, 2026-10-13). -->
<section class="state {status.tone}" data-testid="status" data-link={skin.link}>
  <span class="dot"></span>
  <strong data-testid="status-title">{status.title}</strong>
  {#if machine}
    {#each skin.stateValues as item (item.key)}
      {#if item.key === 'scale' && skin.scaleLink === 'connected'}
        <!-- A tap on the weight tares the scale (founder, 2026-10-16); without a scale it is not a button. -->
        <button class="value scale" data-testid="tare" aria-label="tare the scale" onclick={() => skin.tare()}>
          <small>{item.label}</small>
          <b data-testid="state-scale">{item.value}</b>
        </button>
      {:else if item.key === 'scale'}
        <!-- Without a scale the warning is a button: a tap looks for the scale again (spec 3.9). -->
        <button class="value scale warn" data-testid="scale-retry" aria-label="look for the scale" onclick={() => skin.findScale()}>
          <small>{item.label}</small>
          <b data-testid="state-scale">⚠ {item.value}</b>
        </button>
      {:else}
        <span class="value {item.key}" class:warn={item.warn}>
          <small>{item.label}</small>
          <b data-testid="state-{item.key}">{item.value}</b>
        </span>
      {/if}
    {/each}
  {:else}
    <span class="detail" data-testid="status-detail">{status.detail}</span>
  {/if}
</section>

<style>
  .state {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 1.1rem;
    font-size: var(--text-value);
    white-space: nowrap;
    /* Clipped sideways only: the weight's tap target reaches above and below the line. */
    overflow-x: clip;
  }

  .dot {
    flex: none;
    align-self: center;
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    background: var(--dim);
  }
  .ok .dot {
    background: var(--pressure);
  }
  .busy .dot {
    background: var(--flow);
  }
  .warn .dot {
    background: var(--warn);
  }

  strong {
    margin-left: -0.5rem;
    font-weight: 600;
  }

  .state.warn strong {
    color: var(--warn);
  }

  small {
    margin-right: 0.35rem;
    color: var(--dim);
    font-size: var(--text-label);
  }

  b {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .scale b {
    color: var(--weight);
  }

  /* The weight as a tare button: the line's text, with a finger's target around it. */
  button.value {
    margin: -0.9rem -0.6rem;
    padding: 0.9rem 0.6rem;
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    border-radius: 0.6rem;
    touch-action: manipulation;
    user-select: none;
  }

  button.value:active {
    background: var(--raised);
  }

  .value.warn b {
    color: var(--warn);
  }

  /* The scale's warning is a hint, not a value: at a label's size it fits beside the profile. */
  .scale.warn b {
    font-size: var(--text-label);
  }

  .detail {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--dim);
    font-size: var(--text-body);
  }
</style>

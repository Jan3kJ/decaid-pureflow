<script lang="ts">
  import type { Skin } from './skin.svelte';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  // With a machine the line is its values; without one, what the skin knows about the link.
  const machine = $derived(skin.link === 'machine' && skin.snapshot !== null);
</script>

<!-- The machine's state in one line, on home and on the steam page (founder, 2026-10-13). -->
<section class="state {skin.status.tone}" data-testid="status" data-link={skin.link}>
  <span class="dot"></span>
  <strong data-testid="status-title">{skin.status.title}</strong>
  {#if machine}
    {#each skin.stateValues as item (item.key)}
      <span class="value {item.key}" class:warn={item.warn}>
        <small>{item.label}</small>
        <b data-testid="state-{item.key}">{item.warn && item.key === 'scale' ? `⚠ ${item.value}` : item.value}</b>
      </span>
    {/each}
  {:else}
    <span class="detail" data-testid="status-detail">{skin.status.detail}</span>
  {/if}
</section>

<style>
  .state {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 1.1rem;
    font-size: 1.1rem;
    white-space: nowrap;
    overflow: hidden;
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
    font-size: 0.85rem;
  }

  b {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .scale b {
    color: var(--weight);
  }

  .value.warn b {
    color: var(--warn);
  }

  .detail {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--dim);
    font-size: 0.95rem;
  }
</style>

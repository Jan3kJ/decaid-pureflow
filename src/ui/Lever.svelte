<script lang="ts">
  // The on/off switch: a track with a knob that moves right when on. A caption puts a small word
  // above a smaller track (a list row's switch); children make the whole row the switch, its text
  // left and the track right.
  import type { Snippet } from 'svelte';

  let {
    checked,
    label,
    onchange,
    disabled = false,
    testid,
    caption,
    children,
  }: {
    checked: boolean;
    label?: string;
    onchange: (checked: boolean) => void;
    disabled?: boolean;
    testid?: string;
    caption?: string;
    children?: Snippet;
  } = $props();
</script>

<button
  class="lever-button"
  class:small={caption !== undefined}
  class:row={children !== undefined}
  role="switch"
  aria-label={label}
  aria-checked={checked}
  {disabled}
  data-testid={testid}
  onclick={() => onchange(!checked)}
  >{#if children}{@render children()}{/if}{#if caption !== undefined}<small>{caption}</small>{/if}<span
    class="lever"
    class:glow={checked}><span></span></span
  ></button
>

<style>
  .lever-button {
    flex: none;
    min-height: var(--control-big);
    padding: 0;
    background: none;
    border: 0;
  }

  .lever-button:disabled {
    opacity: 0.5;
  }

  .small {
    min-height: var(--control-tall);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
  }

  .row {
    width: 100%;
    min-height: 5.2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 0.8rem 0;
    border-top: 1px solid var(--edge);
  }

  small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  .lever {
    flex: none;
    display: block;
    width: 4.4rem;
    height: 2.4rem;
    padding: var(--space-1);
    box-sizing: border-box;
    border-radius: var(--radius-lever);
    background: none;
    border: 1px solid var(--edge);
  }

  .lever span {
    display: block;
    width: 1.8rem;
    height: 100%;
    border-radius: var(--radius-round);
    background: var(--dim);
    transition: transform var(--motion-fast);
  }

  /* on: the track lights in pressure's green (the shared glow) */
  .lever-button {
    --glow-rgb: var(--pressure-rgb);
  }

  [aria-checked='true'] .lever span {
    background: var(--pressure);
    transform: translateX(2rem);
  }

  .small .lever {
    width: 3.6rem;
    height: 1.9rem;
  }

  .small .lever span {
    width: 1.4rem;
  }

  .small[aria-checked='true'] .lever span {
    transform: translateX(1.7rem);
  }
</style>

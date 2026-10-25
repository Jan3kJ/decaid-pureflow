<script lang="ts">
  import Pick from '../beans/Pick.svelte';
  import { beanLabel, contextBean } from '../history/entries';
  import type { Skin } from './skin.svelte';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  // The profile and the bean and grinder setting for the next shot, as the workflow holds them;
  // a tap picks others (spec 3.9 item 19, 3.11). Drawn at the top of home's right column while
  // no shot runs.
  const nextBean = $derived(beanLabel(contextBean(skin.workflow?.context)));
  const nextSetting = $derived(skin.workflow?.context?.grinderSetting?.trim() || null);
  let picking = $state(false);
</script>

<div class="next" data-testid="next-shot">
  <div class="profile">
    <button class="name" data-testid="open-profiles" aria-label="choose a profile" onclick={() => skin.go('profiles')}>
      <strong data-testid="profile-name">{skin.workflow?.profile?.title ?? '–'}</strong>
    </button>
    <button class="icon" data-testid="open-editor" aria-label="edit the profile" onclick={() => skin.go('editor')}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" />
      </svg>
    </button>
  </div>

  <button class="pick" data-testid="open-pick" aria-label="bean and grinder for the next shot" onclick={() => (picking = true)}>
    <span data-testid="next-bean">{nextBean}</span>
    {#if nextSetting}<small data-testid="next-setting">{nextSetting}</small>{/if}
  </button>
</div>

{#if picking}
  <Pick {skin} onclose={() => (picking = false)} />
{/if}

<style>
  .next {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
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

  /*
   * As wide as the column; the name and the bean are cut, not wrapped, so the column stays. Both
   * are names (spec 3.14): the same size and weight.
   */
  .profile {
    display: flex;
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--panel);
  }

  .profile button {
    border: 0;
    background: none;
  }

  .name {
    flex: 1;
    min-width: 0;
    min-height: 3.5rem;
    padding: 0 0.4rem 0 1rem;
    text-align: left;
  }

  .name strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-body);
    font-weight: 600;
  }

  .pick {
    min-width: 0;
    min-height: 3.5rem;
    padding: 0 1rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: var(--text-body);
  }

  .pick span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    font-weight: 600;
  }

  .pick small {
    flex: none;
    color: var(--dim);
    font-size: var(--text-body);
    font-variant-numeric: tabular-nums;
  }

  .icon {
    flex: none;
    width: 3.5rem;
    height: 3.5rem;
    display: grid;
    place-items: center;
    padding: 0;
    color: var(--dim);
  }

  .icon svg {
    width: 1.6rem;
    height: 1.6rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>

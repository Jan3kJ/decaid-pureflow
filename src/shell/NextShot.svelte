<script lang="ts">
  import Pick from '../beans/Pick.svelte';
  import { beanLines, contextBean } from '../history/entries';
  import { titleLines } from './profiles';
  import type { Skin } from './skin.svelte';

  interface Props {
    skin: Skin;
    /** a shot runs: the buttons are shown but off, so what the shot saves does not change */
    off?: boolean;
  }

  let { skin, off = false }: Props = $props();

  // The profile and the bean and grinder setting for the next shot, as the workflow holds them;
  // a tap picks others. Drawn at the top of home's right column, off
  // while a shot runs. Each names the name first, its family or roaster in a
  // caption under it.
  const profile = $derived(titleLines(skin.workflow?.profile?.title ?? '–'));
  const bean = $derived(beanLines(contextBean(skin.workflow?.context)));
  const nextSetting = $derived(skin.workflow?.context?.grinderSetting?.trim() || null);
  let picking = $state(false);
  $effect(() => {
    if (off) picking = false;
  });
</script>

<div class="next" class:off data-testid="next-shot">
  <div class="profile">
    <button class="name" data-testid="open-profiles" aria-label="choose a profile" disabled={off} onclick={() => skin.go('profiles')}>
      <strong data-testid="profile-name">{profile.name}</strong>
      {#if profile.caption}<small data-testid="profile-caption">{profile.caption}</small>{/if}
    </button>
    <button class="icon" data-testid="open-editor" aria-label="edit the profile" disabled={off} onclick={() => skin.go('editor')}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" />
      </svg>
    </button>
  </div>

  <button
    class="pick"
    data-testid="open-pick"
    aria-label="bean and grinder for the next shot"
    disabled={off}
    onclick={() => (picking = true)}
  >
    <span class="lines">
      <strong data-testid="next-bean">{bean.name}</strong>
      {#if bean.caption}<small data-testid="next-bean-caption">{bean.caption}</small>{/if}
    </span>
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
    gap: var(--space-2);
  }

  .off {
    opacity: 0.4;
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
   * are names: the same size and weight, each with a caption under it. The height
   * holds both lines, also for a name without a caption, so the column does not move.
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
    min-height: 4.7rem;
    padding: 0 0.4rem 0 1rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: left;
  }

  strong,
  .lines small,
  .name small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: var(--text-body);
    font-weight: 600;
  }

  .name small,
  .lines small {
    margin-top: 0.2rem;
    color: var(--dim);
    font-size: var(--text-label);
  }

  .pick {
    min-width: 0;
    min-height: 4.7rem;
    padding: 0 1rem;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-body);
  }

  .lines {
    flex: 1;
    min-width: 0;
    text-align: left;
  }

  .pick > small {
    flex: none;
    color: var(--dim);
    font-size: var(--text-body);
    font-variant-numeric: tabular-nums;
  }

  .icon {
    flex: none;
    width: 3.5rem;
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

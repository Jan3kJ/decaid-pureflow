<script lang="ts">
  // Quick Adjustments > Water Tank's own row of the skin: the unit the state
  // line shows the tank in. It is the skin's setting (`tankUnit` in src/settings.ts, and so in its
  // KV backup), not the machine's, so it is written at once and never read from the gateway.
  import type { Skin } from '../shell/skin.svelte';
  import { TANK_UNITS } from '../shell/tank';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();
</script>

<div class="row" data-testid="row-tank-unit">
  <div class="about">
    <strong>tank unit</strong>
    <small
      >The water in the tank on the state line: in ml, or in mm as the machine measures it. This one is the skin's, not the machine's.</small
    >
  </div>
  <div class="choices" data-testid="setting-tank-unit">
    {#each TANK_UNITS as choice (choice.value)}
      <button
        class="chip select-fill"
        aria-pressed={skin.settings.tankUnit === choice.value}
        data-testid="setting-tank-unit-{choice.value}"
        onclick={() => skin.setSettings({ tankUnit: choice.value })}>{choice.label}</button
      >
    {/each}
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.7rem 0;
    border-top: 1px solid var(--line);
  }

  .about {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  strong {
    font-size: var(--text-body);
    font-weight: 600;
  }

  small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  .choices {
    flex: none;
    display: flex;
    gap: 0.4rem;
  }

  .chip {
    min-height: 3rem;
    padding: 0 0.9rem;
    font: inherit;
    color: var(--fg);
    touch-action: manipulation;
    user-select: none;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 1.5rem;
  }
</style>

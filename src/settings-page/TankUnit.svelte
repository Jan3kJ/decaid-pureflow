<script lang="ts">
  // Quick Adjustments > Water Tank's own row of the skin: the unit the state
  // line shows the tank in. It is the skin's setting (`tankUnit` in src/settings.ts, and so in its
  // KV backup), not the machine's, so it is written at once and never read from the gateway.
  import type { Skin } from '../shell/skin.svelte';
  import SettingsRow from './SettingsRow.svelte';
  import { TANK_UNITS } from '../shell/tank';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();
</script>

<SettingsRow
  label="tank unit"
  hint="the water in the tank on the state line: in ml, or in mm as the machine measures it. This one is the skin's, not the machine's."
  testid="row-tank-unit"
>
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
</SettingsRow>

<style>
  .choices {
    flex: none;
    display: flex;
    gap: var(--space-1);
  }
</style>

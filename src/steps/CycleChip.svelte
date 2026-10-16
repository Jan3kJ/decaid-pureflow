<!--
Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
src/modules/profile_editor.js (createCycleChip).
Streamline.js - A browser-native skin for Decent Espresso machines
Copyright (C) 2025-2026 Decent Espresso
Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // A chip that says a state and goes to the next one on a tap: the sensor, the pump, the exit.
  interface Props {
    label: string;
    /** the state, in words */
    value: string;
    testid: string;
    tone?: 'flow' | 'pressure' | 'temperature' | 'none';
    disabled?: boolean;
    oncycle: () => void;
  }

  let { label, value, testid, tone = 'none', disabled = false, oncycle }: Props = $props();
</script>

<button class="cycle {tone}" data-testid="cycle-{testid}" aria-label="{label}: {value}, tap for the next" {disabled} onclick={oncycle}>
  <span class="label">{label}</span>
  <span class="value" data-testid="cycle-value-{testid}">{value}</span>
</button>

<style>
  .cycle {
    --tone: var(--fg);
    min-height: 3.6rem;
    min-width: 0;
    padding: 0.3rem 0.8rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 0.1rem;
    font: inherit;
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    touch-action: manipulation;
    user-select: none;
    white-space: nowrap;
  }

  .cycle.flow {
    --tone: var(--flow);
  }
  .cycle.pressure {
    --tone: var(--pressure);
  }
  .cycle.temperature {
    --tone: var(--temperature);
  }

  .label {
    font-size: 0.8rem;
    color: var(--dim);
  }

  .value {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--tone);
  }

  .cycle:active {
    background: var(--line);
  }
</style>

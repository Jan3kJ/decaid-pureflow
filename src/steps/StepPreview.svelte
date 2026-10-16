<!--
Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
src/modules/profile_editor.js (the graph preview of renderScriptGraph).
Streamline.js - A browser-native skin for Decent Espresso machines
Copyright (C) 2025-2026 Decent Espresso
Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // The step editor's curve preview (research.md 17.15): the targets of the profile's steps,
  // drawn by the skin's one chart, redrawn with every change of the profile. The CARDS tab
  // shows it above the cards, the SCRIPT tab beside the text.
  import type { Profile } from '../api';
  import ShotGraph from '../graph/ShotGraph.svelte';
  import { stepCurve } from './curve';

  interface Props {
    profile: Profile;
  }

  let { profile }: Props = $props();

  const curve = $derived(stepCurve(profile));
  /** Pressure and flow share one scale, as on every graph of the skin; it reaches a target above 12. */
  const previewMax = $derived(
    Math.max(12, Math.ceil(Math.max(0, ...curve.pressure.map((v) => v ?? 0), ...curve.flow.map((v) => v ?? 0)) / 4) * 4),
  );
</script>

<div class="preview" data-testid="step-preview" data-seconds={curve.seconds}>
  <ShotGraph
    t={curve.t}
    pressure={[]}
    flow={[]}
    temperature={[]}
    targetPressure={curve.pressure}
    targetFlow={curve.flow}
    targetTemperature={curve.temperature}
    borders={curve.steps.slice(1).map((span) => span.start)}
    shaded={curve.steps.filter((span) => span.untimed)}
    yMax={previewMax}
    fit
    preview
    label="curve preview"
  />
  {#if curve.steps.some((span) => span.untimed)}
    <p class="untimed" data-testid="preview-untimed">shaded: a step without a time, drawn 10 s long</p>
  {/if}
</div>

<style>
  /* The preview takes the room it is given, at least a fifth of the screen. */
  .preview {
    position: relative;
    flex: 1 1 0;
    min-height: 20vh;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 1rem;
    overflow: hidden;
  }

  .untimed {
    position: absolute;
    top: 0.3rem;
    right: 1rem;
    margin: 0;
    color: var(--dim);
    font-size: 0.8rem;
  }
</style>

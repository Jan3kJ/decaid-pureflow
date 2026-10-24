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
    /** the picker's small preview: no labels (spec 3.8) */
    bare?: boolean;
    /** s, the last step is drawn this far at most (`stepCurve`); without it every step whole */
    lastStepSeconds?: number;
    /** part of its screen's main frame, which hot water and flush cover (src/shell/cover.ts) */
    mainFrame?: boolean;
  }

  let { profile, bare = false, lastStepSeconds, mainFrame = false }: Props = $props();

  const curve = $derived(stepCurve(profile, { lastStepSeconds }));
  /** Pressure and flow share one scale, as on every graph of the skin; it reaches a target or limit above 12. */
  const previewMax = $derived(
    Math.max(
      12,
      Math.ceil(Math.max(0, ...[curve.pressure, curve.flow, curve.pressureLimit, curve.flowLimit].flat().map((v) => v ?? 0)) / 4) * 4,
    ),
  );
</script>

<div class="preview" class:bare data-testid="step-preview" data-seconds={curve.seconds} data-main-frame={mainFrame ? '' : undefined}>
  <ShotGraph
    t={curve.t}
    pressure={[]}
    flow={[]}
    temperature={[]}
    targetPressure={curve.pressure}
    targetFlow={curve.flow}
    targetTemperature={curve.temperature}
    pressureLimit={curve.pressureLimit}
    flowLimit={curve.flowLimit}
    borders={curve.steps.slice(1).map((span) => span.start)}
    yMax={previewMax}
    fit
    preview
    {bare}
    label="curve preview"
  />
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

  .preview.bare {
    min-height: 0;
  }
</style>

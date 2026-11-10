<!--
Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
src/modules/profile_editor.js (the graph preview of renderScriptGraph).
Streamline.js - A browser-native skin for Decent Espresso machines
Copyright (C) 2025-2026 Decent Espresso
Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // The step editor's curve preview: the targets of the profile's steps,
  // drawn by the skin's one chart, redrawn with every change of the profile. The CARDS tab
  // shows it above the cards, the SCRIPT tab beside the text. The picker's preview (`estimate`)
  // draws the modelled shot instead, the targets dotted under it (src/steps/estimate.ts). With
  // `onselect` (the CARDS tab) a tap on the graph picks the step under the finger.
  import type { Snippet } from 'svelte';
  import type { Profile } from '../api';
  import ShotGraph from '../graph/ShotGraph.svelte';
  import { spanOf, stepAt, stepCurve, type StepSpan } from './curve';
  import { shotEstimate } from './estimate';

  interface Props {
    profile: Profile;
    /** the picker's small preview: no labels */
    bare?: boolean;
    /** s, the last step is drawn this far at most (`stepCurve`); without it every step whole */
    lastStepSeconds?: number;
    /** part of its screen's main frame, which hot water and flush cover (src/shell/cover.ts) */
    mainFrame?: boolean;
    /** the modelled shot is the curves, the targets dotted under them (the picker) */
    estimate?: boolean;
    /** the profile's step index lit on the graph (the cards tab's open step); none, or a step without a span, lights nothing */
    selected?: number | null;
    /** a tap on the graph chose this step (its index in the profile); without it the graph takes no tap */
    onselect?: (index: number) => void;
    /** drawn over the top of the frame (a message) */
    children?: Snippet;
  }

  let {
    profile,
    bare = false,
    lastStepSeconds,
    mainFrame = false,
    estimate = false,
    selected = null,
    onselect,
    children,
  }: Props = $props();

  // The model runs only for the estimate, once per profile shown.
  const drawn = $derived.by((): ReturnType<typeof shotEstimate> & { steps: StepSpan[] } => {
    if (estimate) return { ...shotEstimate(profile, { lastStepSeconds }), steps: [] };
    const curve = stepCurve(profile, { lastStepSeconds });
    return {
      t: curve.t,
      flow: [],
      pressure: [],
      temperature: [],
      targetFlow: curve.flow,
      targetPressure: curve.pressure,
      targetTemperature: curve.temperature,
      pressureLimit: curve.pressureLimit,
      flowLimit: curve.flowLimit,
      borders: curve.steps.slice(1).map((span) => span.start),
      seconds: curve.seconds,
      steps: curve.steps,
    };
  });
  /** Pressure and flow share one scale, as on every graph of the skin; it reaches a value, target or limit above 12. */
  const previewMax = $derived(
    Math.max(
      12,
      Math.ceil(
        Math.max(
          0,
          ...[drawn.pressure, drawn.flow, drawn.targetPressure, drawn.targetFlow, drawn.pressureLimit, drawn.flowLimit]
            .flat()
            .map((v) => v ?? 0),
        ) / 4,
      ) * 4,
    ),
  );

  const lit = $derived.by(() => {
    const span = spanOf(drawn.steps, selected);
    return span ? { from: span.start, to: span.end } : null;
  });

  /** A step only where the curve draws one: a step of no time has no span and is never hit. */
  function tapped(seconds: number) {
    const index = stepAt(drawn.steps, seconds);
    if (index !== null) onselect?.(index);
  }
</script>

<div class="preview" class:bare data-testid="step-preview" data-seconds={drawn.seconds} data-main-frame={mainFrame ? '' : undefined}>
  <ShotGraph
    t={drawn.t}
    pressure={drawn.pressure}
    flow={drawn.flow}
    temperature={drawn.temperature}
    targetPressure={drawn.targetPressure}
    targetFlow={drawn.targetFlow}
    targetTemperature={drawn.targetTemperature}
    pressureLimit={drawn.pressureLimit}
    flowLimit={drawn.flowLimit}
    borders={drawn.borders}
    yMax={previewMax}
    fit
    preview={!estimate}
    {estimate}
    {bare}
    selected={lit}
    label={estimate ? 'estimated shot' : 'curve preview'}
    ontap={onselect ? tapped : undefined}
  />
  {@render children?.()}
</div>

<style>
  /* The preview takes the room it is given, at least a fifth of the screen. */
  .preview {
    position: relative;
    flex: 1 1 0;
    min-height: 20vh;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    overflow: hidden;
  }

  .preview.bare {
    min-height: 0;
  }
</style>

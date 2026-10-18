<!--
Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
src/profiles/profile_editor.html and src/modules/profile_editor.js (the SCRIPT panel:
"Steps Overview" left, "Graph Preview" right; renderScriptTab, createScriptChip).
Streamline.js - A browser-native skin for Decent Espresso machines
Copyright (C) 2025-2026 Decent Espresso
Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // The step editor's SCRIPT tab (spec 3.7, research.md 17.18): each step its name and
  // Streamline's sentences, the preview beside them. A tap on a state word cycles it, a tap on
  // a number opens the number pad; either is an edit of the editor's profile at once.
  import type { Profile } from '../api';
  import { cyclePump, cycleSensor, type StepValue } from './model';
  import { cycleScriptExit, stepSentences, type ScriptChip } from './sentences';
  import StepPreview from './StepPreview.svelte';

  interface Props {
    profile: Profile;
    disabled?: boolean;
    onedit: (next: Profile) => void;
    ontype: (index: number, value: StepValue) => void;
  }

  let { profile, disabled = false, onedit, ontype }: Props = $props();

  function cycle(index: number, chip: ScriptChip) {
    if (chip === 'sensor') onedit(cycleSensor(profile, index));
    else if (chip === 'pump') onedit(cyclePump(profile, index));
    else onedit(cycleScriptExit(profile, index));
  }
</script>

<div class="script" data-testid="step-script">
  <div class="steps" data-testid="script-steps">
    {#each profile.steps as step, index (index)}
      <div class="step" data-testid="script-step-{index}">
        <p class="name">{index + 1}: {step.name || 'Step'}</p>
        <ul>
          {#each stepSentences(profile, index) as sentence (sentence.kind)}
            <li data-testid="script-line-{index}-{sentence.kind}">
              {#each sentence.parts as part, n (n)}
                {n > 0 ? ' ' : ''}{#if part.kind === 'text'}
                  <span>{part.text}</span>
                {:else if part.kind === 'chip'}
                  <button
                    class="chip {part.tone}"
                    data-testid="script-chip-{index}-{part.chip}"
                    aria-label="{part.text}, tap for the next"
                    {disabled}
                    onclick={() => cycle(index, part.chip)}>{part.text}</button
                  >
                {:else}
                  <button
                    class="pill {part.tone}"
                    data-testid="script-value-{index}-{part.value}"
                    aria-label="{part.text}, tap to type"
                    {disabled}
                    onclick={() => ontype(index, part.value)}>{part.text}</button
                  >
                {/if}
              {/each}
            </li>
          {/each}
        </ul>
      </div>
    {:else}
      <p class="empty">No steps: add one on the cards.</p>
    {/each}
  </div>
  <StepPreview {profile} />
</div>

<style>
  .script {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    gap: 0.8rem;
  }

  .steps {
    flex: 0 0 56%;
    min-width: 0;
    box-sizing: border-box;
    padding: 0.4rem 0.9rem;
    overflow-y: auto;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 1rem;
  }

  .step {
    display: flex;
    gap: 0.8rem;
    padding: 0.6rem 0;
  }

  /* A hairline between steps, not above the first. */
  .step + .step {
    border-top: 1px solid var(--line);
  }

  .name {
    flex: 0 0 11rem;
    margin: 0.35rem 0 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  ul {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding-left: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  li {
    line-height: 1.2;
  }

  li > span {
    user-select: none;
  }

  /* A word or a number to tap: a finger's target taller than its text, a chip's tint for its quantity. */
  .chip,
  .pill {
    --tone: var(--fg);
    min-height: 2.6rem;
    margin: 0;
    padding: 0 0.5rem;
    font: inherit;
    font-weight: 600;
    color: var(--tone);
    background: none;
    border: 1px solid transparent;
    border-radius: 0.6rem;
    touch-action: manipulation;
    user-select: none;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .pill {
    background: var(--raised);
    border-color: var(--line);
  }

  .chip {
    text-decoration: underline dotted;
    text-underline-offset: 0.25rem;
  }

  .chip:active,
  .pill:active {
    background: var(--line);
  }

  .flow {
    --tone: var(--flow);
  }
  .pressure {
    --tone: var(--pressure);
  }
  .temperature {
    --tone: var(--temperature);
  }
  .weight {
    --tone: var(--weight);
  }

  button:disabled {
    opacity: 0.6;
  }

  .empty {
    color: var(--dim);
  }
</style>

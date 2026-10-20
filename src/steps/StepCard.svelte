<!--
Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
src/modules/profile_editor.js (renderStepCards).
Streamline.js - A browser-native skin for Decent Espresso machines
Copyright (C) 2025-2026 Decent Espresso
Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // One step of the profile. Closed, its values in lines and a tap opens it; open, every value
  // with ± and the number pad, the chips that cycle, its name, and in its footer the buttons that
  // delete it, move it left or right and add a step after it. What a tap changes is the editor's.
  import type { ProfileStep } from '../api';
  import ValueChip from '../editor/ValueChip.svelte';
  import CycleChip from './CycleChip.svelte';
  import { exitLabel, formatValue, isOff, pumpLabel, readExitDef, stepProblems, type StepValue } from './model';

  interface Props {
    step: ProfileStep;
    index: number;
    count: number;
    open: boolean;
    disabled?: boolean;
    onopen: () => void;
    onstep: (value: StepValue, direction: 1 | -1) => void;
    ontype: (value: StepValue) => void;
    oncycle: (what: 'sensor' | 'pump' | 'exit') => void;
    onname: (name: string) => void;
    onmove: (direction: 1 | -1) => void;
    ondelete: () => void;
    oninsert: () => void;
  }

  let {
    step,
    index,
    count,
    open,
    disabled = false,
    onopen,
    onstep,
    ontype,
    oncycle,
    onname,
    onmove,
    ondelete,
    oninsert,
  }: Props = $props();

  const exit = $derived(readExitDef(step));
  const pressure = $derived(step.pump === 'pressure');
  const problems = $derived(stepProblems(step));

  const shown = formatValue;

  const TONE = { flow: 'flow', pressure: 'pressure' } as const;
  const maxima = $derived(
    (['weight', 'seconds', 'volume'] as const).filter((value) => !isOff(step, value)).map((value) => shown(step, value)),
  );
</script>

{#if open}
  <article class="card open" class:warn={problems.length > 0} data-testid="step-card-{index}" data-open="true">
    <header>
      <span class="number">{index + 1}</span>
      <input
        class="name"
        aria-label="name of step {index + 1}"
        data-testid="step-name-{index}"
        value={step.name}
        maxlength="40"
        {disabled}
        onchange={(e) => onname(e.currentTarget.value)}
      />
    </header>

    <div class="rows">
      <div class="pair">
        <CycleChip
          label="sensor"
          value={step.sensor === 'water' ? 'Water' : 'Coffee'}
          testid="{index}-sensor"
          tone="temperature"
          {disabled}
          oncycle={() => oncycle('sensor')}
        />
        <ValueChip
          label="temperature"
          value={shown(step, 'temperature')}
          tone="temperature"
          testid="{index}-temperature"
          onstep={(d: 1 | -1) => onstep('temperature', d)}
          onedit={() => ontype('temperature')}
        />
      </div>
      <div class="pair">
        <CycleChip
          label="pump"
          value={pumpLabel({ pump: step.pump, transition: step.transition })}
          testid="{index}-pump"
          tone={pressure ? 'pressure' : 'flow'}
          {disabled}
          oncycle={() => oncycle('pump')}
        />
        <ValueChip
          label={pressure ? 'pressure' : 'flow'}
          value={shown(step, 'target')}
          tone={pressure ? 'pressure' : 'flow'}
          testid="{index}-target"
          onstep={(d: 1 | -1) => onstep('target', d)}
          onedit={() => ontype('target')}
        />
      </div>
      <div class="pair">
        <span class="caption">limit to</span>
        <ValueChip
          label={pressure ? 'flow limit' : 'pressure limit'}
          value={shown(step, 'limiter')}
          tone={pressure ? 'flow' : 'pressure'}
          testid="{index}-limiter"
          onstep={(d: 1 | -1) => onstep('limiter', d)}
          onedit={() => ontype('limiter')}
        />
      </div>
      <div class="pair">
        <CycleChip
          label="move on if"
          value={exitLabel(exit)}
          testid="{index}-exit"
          tone={exit.type === 'off' ? 'none' : TONE[exit.type]}
          {disabled}
          oncycle={() => oncycle('exit')}
        />
        {#if exit.type !== 'off'}
          <ValueChip
            label="exit at"
            value={shown(step, 'exit')}
            tone={TONE[exit.type]}
            testid="{index}-exit"
            onstep={(d: 1 | -1) => onstep('exit', d)}
            onedit={() => ontype('exit')}
          />
        {:else}
          <span class="caption">no exit: the step runs to its maximum</span>
        {/if}
      </div>
      <div class="maxima">
        <span class="caption">maximum</span>
        <ValueChip
          label="weight"
          value={shown(step, 'weight')}
          testid="{index}-weight"
          onstep={(d: 1 | -1) => onstep('weight', d)}
          onedit={() => ontype('weight')}
        />
        <ValueChip
          label="time"
          value={shown(step, 'seconds')}
          testid="{index}-seconds"
          onstep={(d: 1 | -1) => onstep('seconds', d)}
          onedit={() => ontype('seconds')}
        />
        <ValueChip
          label="volume"
          value={shown(step, 'volume')}
          testid="{index}-volume"
          onstep={(d: 1 | -1) => onstep('volume', d)}
          onedit={() => ontype('volume')}
        />
      </div>
    </div>

    {#if problems.length > 0}
      <p class="problems" data-testid="step-problems-{index}">Kept as the profile has it: {problems.join('; ')}.</p>
    {/if}

    <footer>
      <button class="act delete" data-testid="step-delete-{index}" disabled={disabled || count === 1} onclick={ondelete}
        >delete step</button
      >
      <span class="moves">
        <button class="act" data-testid="step-move-left-{index}" disabled={disabled || index === 0} onclick={() => onmove(-1)}
          >move left</button
        >
        <button class="act" data-testid="step-move-right-{index}" disabled={disabled || index === count - 1} onclick={() => onmove(1)}
          >move right</button
        >
        <button class="act" data-testid="step-insert-{index}" {disabled} onclick={oninsert}>+ step after</button>
      </span>
    </footer>
  </article>
{:else}
  <button
    class="card closed"
    class:warn={problems.length > 0}
    data-testid="step-card-{index}"
    data-open="false"
    {disabled}
    onclick={onopen}
  >
    <span class="head"><span class="number">{index + 1}</span><span class="title">{step.name}</span></span>
    <span class="line temperature">{shown(step, 'temperature')} {step.sensor === 'water' ? 'water' : 'coffee'}</span>
    <span class="line {pressure ? 'pressure' : 'flow'}"
      >{pumpLabel({ pump: step.pump, transition: step.transition })} {shown(step, 'target')}</span
    >
    {#if !isOff(step, 'limiter')}
      <span class="line {pressure ? 'flow' : 'pressure'}">limit {shown(step, 'limiter')}</span>
    {/if}
    <span class="line">max {maxima.length > 0 ? maxima.join(' · ') : 'none'}</span>
    <span class="line {exit.type === 'off' ? '' : exit.type}">
      {exit.type === 'off' ? 'no exit' : `${exitLabel(exit).toLowerCase()} ${shown(step, 'exit')}`}
    </span>
  </button>
{/if}

<style>
  .card {
    flex: none;
    box-sizing: border-box;
    max-height: 100%;
    scroll-snap-align: center;
    font: inherit;
    color: var(--fg);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 1rem;
  }

  .card.warn {
    border-color: var(--warn);
  }

  .closed {
    width: 13.5rem;
    padding: 0.8rem 0.9rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.45rem;
    text-align: left;
    touch-action: manipulation;
    overflow: hidden;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    max-width: 100%;
    margin-bottom: 0.3rem;
  }

  .title {
    font-size: 1.05rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .number {
    flex: none;
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--raised);
    font-weight: 600;
  }

  .line {
    font-size: 0.95rem;
    color: var(--dim);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .line.temperature {
    color: var(--temperature);
  }
  .line.flow {
    color: var(--flow);
  }
  .line.pressure {
    color: var(--pressure);
  }

  .open {
    width: 46rem;
    padding: 0.7rem 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    border-color: var(--fg);
    overflow-y: auto;
  }

  .open.warn {
    border-color: var(--warn);
  }

  .open header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .name {
    flex: 1;
    min-width: 0;
    min-height: 3rem;
    padding: 0 0.8rem;
    font: inherit;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.8rem;
  }

  .rows {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem 1rem;
  }

  .pair {
    display: grid;
    grid-template-columns: 9.5rem minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem;
  }

  .maxima {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 5.5rem repeat(3, minmax(0, 1fr));
    align-items: center;
    gap: 0.5rem;
  }

  .caption {
    font-size: 0.9rem;
    color: var(--dim);
  }

  .problems {
    margin: 0;
    font-size: 0.9rem;
    color: var(--warn);
  }

  footer {
    margin-top: 0.4rem;
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
  }

  .act {
    min-height: 3rem;
    font: inherit;
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.8rem;
    touch-action: manipulation;
    user-select: none;
  }

  .act {
    padding: 0 1.2rem;
  }

  .moves {
    display: flex;
    gap: 0.6rem;
  }

  .act.delete {
    color: var(--warn);
  }

  button:disabled {
    color: var(--dim);
    opacity: 0.6;
  }
</style>

<script lang="ts">
  import { generateProfile, type AFlowParams, type ProfileStep } from '../aflow';
  import { exitText } from './status';

  interface Props {
    params: AFlowParams;
    title: string;
    /** the setting of that name: the list starts with the Pre Fill step */
    firstStepWorkaround?: boolean;
  }

  let { params, title, firstStepWorkaround = false }: Props = $props();

  // What the machine would get: the generator's output, nothing computed here.
  const profile = $derived(generateProfile(params, { title, firstStepWorkaround }));

  function target(step: ProfileStep): string {
    return step.pump === 'flow' ? `${step.flow} ml/s` : `${step.pressure} bar`;
  }
</script>

<table data-testid="steps">
  <thead>
    <tr>
      <th>step</th>
      <th>target</th>
      <th>temperature</th>
      <th>seconds</th>
      <th>exit</th>
    </tr>
  </thead>
  <tbody>
    {#each profile.steps as step, index (step.name)}
      <tr>
        <td>{step.name}</td>
        <td class={step.pump}>{target(step)}{step.transition === 'smooth' ? ', smooth' : ''}</td>
        <td class="temperature">{step.temperature} °C</td>
        <td>{step.seconds}</td>
        <!-- The stop weight stands in the last step's exit: no line of its own. -->
        <td data-testid="step-exit">{exitText(step, index === profile.steps.length - 1 ? profile.target_weight : null)}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-label);
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 0.22rem 0.8rem;
    text-align: left;
    white-space: nowrap;
  }

  th {
    color: var(--dim);
    font-weight: 400;
    border-bottom: 1px solid var(--line);
  }

  .flow {
    color: var(--flow);
  }
  .pressure {
    color: var(--pressure);
  }
  .temperature {
    color: var(--temperature);
  }
</style>

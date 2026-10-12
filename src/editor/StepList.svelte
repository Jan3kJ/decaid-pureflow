<script lang="ts">
  import { generateProfile, type AFlowParams, type ProfileStep } from '../aflow';

  interface Props {
    params: AFlowParams;
    title: string;
  }

  let { params, title }: Props = $props();

  // What the machine would get: the generator's output, nothing computed here.
  const profile = $derived(generateProfile(params, { title }));

  function target(step: ProfileStep): string {
    return step.pump === 'flow' ? `${step.flow} ml/s` : `${step.pressure} bar`;
  }

  function exit(step: ProfileStep): string {
    const parts: string[] = [];
    if (step.exit) {
      const unit = step.exit.type === 'flow' ? 'ml/s' : 'bar';
      parts.push(`${step.exit.type} ${step.exit.condition} ${step.exit.value} ${unit}`);
    }
    if (step.weight > 0) parts.push(`weight ${step.weight} g`);
    return parts.join(', ') || '-';
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
    {#each profile.steps as step (step.name)}
      <tr>
        <td>{step.name}</td>
        <td class={step.pump}>{target(step)}{step.transition === 'smooth' ? ', smooth' : ''}</td>
        <td class="temperature">{step.temperature} °C</td>
        <td>{step.seconds}</td>
        <td>{exit(step)}</td>
      </tr>
    {/each}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="5">The shot stops at {profile.target_weight} g.</td>
    </tr>
  </tfoot>
</table>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
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

  tfoot td {
    color: var(--dim);
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

<script lang="ts">
  // The clean with detergent's card, in the way of the other maintenance procedures: a row with
  // its description and its button, the steps under it. Its state is the skin's
  // (`DetergentClean`), so it shows the procedure where it is when the page is opened again.
  import type { Skin } from '../shell/skin.svelte';
  import Confirm from './Confirm.svelte';
  import ProcedureSteps from './ProcedureSteps.svelte';
  import SettingsRow from './SettingsRow.svelte';
  import { DETERGENT_MILESTONES, DETERGENT_TITLE, FLUSH_SECONDS, detergentCaption, milestoneOf } from './detergent';
  import { DETERGENT_NAME } from './detergent-clean.svelte';
  import { CLEAN, LOST_CONTACT, NEEDS_WATER } from './maintenance';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  const procedure = $derived(skin.detergent);
  const current = $derived(procedure.state);
  const stage = $derived(current.stage);
  const busy = $derived(procedure.busy);
  /** What the confirm asks about, while it is open. */
  let asking: 'run' | 'cycle' | null = $state(null);
  /** The machine is out of water: the same refusal as the other procedures, shown here. */
  let dry = $state(false);

  const frame = $derived(skin.snapshot);
  const stepName = $derived(
    frame ? (skin.workflow?.profile?.steps?.[frame.profileFrame]?.name?.trim() ?? `Step ${frame.profileFrame + 1}`) : null,
  );
  const started = $derived(stage !== 'idle' && !(stage === 'done' && !current.earlier));
  const line = $derived(
    started && skin.link !== 'machine' ? { text: LOST_CONTACT, tone: 'error' as const } : detergentCaption(current, stepName),
  );
  const message = $derived(dry ? NEEDS_WATER : procedure.message);

  /** Out of water nothing is asked or started; otherwise `then`. */
  function withWater(then: () => void) {
    dry = frame?.state.state === 'needsWater' && skin.link === 'machine';
    if (!dry) then();
  }

  function confirmed() {
    const asked = asking;
    asking = null;
    void (asked === 'run' ? procedure.start() : procedure.cycle());
  }
</script>

<div class="procedure" data-testid="maintenance-detergent">
  <SettingsRow
    hint="a guided clean with a blind basket and 1 teaspoon of detergent: the machine runs {DETERGENT_TITLE}, then one flush of {FLUSH_SECONDS} s, then its cleaning cycle. Your profile comes back at the end."
    end
  >
    {#if stage === 'flush-ready'}
      <button
        class="action primary"
        disabled={busy}
        data-testid="detergent-flush"
        onclick={() => withWater(() => void procedure.flush())}
      >
        flush
      </button>
    {:else if stage === 'cycle-ready'}
      <button class="action primary" disabled={busy} data-testid="detergent-cycle" onclick={() => withWater(() => (asking = 'cycle'))}>
        clean
      </button>
    {/if}
    {#if stage === 'cycle-ready'}
      <button class="action" disabled={busy} data-testid="detergent-finish" onclick={() => void procedure.cancel()}>finish</button>
    {:else if stage === 'done' && current.earlier}
      <button class="action" disabled={busy} data-testid="detergent-restore" onclick={() => void procedure.restoreAfterCycle()}>
        try again
      </button>
    {:else if started}
      <button class="action" disabled={busy} data-testid="maintenance-cancel-detergent" onclick={() => void procedure.cancel()}>
        cancel
      </button>
    {:else}
      <button
        class="action primary"
        disabled={busy}
        data-testid="maintenance-start-detergent"
        onclick={() => withWater(() => (asking = 'run'))}
      >
        start
      </button>
    {/if}
  </SettingsRow>

  {#if line}
    <ProcedureSteps id="detergent" milestones={DETERGENT_MILESTONES} milestone={milestoneOf(current)} {line} />
  {/if}
  {#if message}<p class="warn" data-testid="maintenance-message-detergent">{message}</p>{/if}
</div>

{#if asking === 'run'}
  <Confirm
    title="{DETERGENT_NAME}?"
    text="Empty the drip tray first. Put a blind basket with 1 teaspoon of detergent in the portafilter and lock it into the group head. The skin loads {DETERGENT_TITLE}; you start it at the machine."
    ok="load"
    onok={confirmed}
    oncancel={() => (asking = null)}
  />
{:else if asking === 'cycle'}
  <Confirm title="{CLEAN.title}?" text={CLEAN.confirm} ok="start" onok={confirmed} oncancel={() => (asking = null)} />
{/if}

<style>
  .action {
    min-width: 8rem;
    min-height: var(--control-big);
  }

  .warn {
    margin: 0 0 var(--space-2);
    color: var(--temperature);
  }
</style>

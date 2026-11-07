<script lang="ts">
  // Quick Adjustments > Tank calibration: the guided fill (tank-calibration.ts). The live level
  // in mm, the amount to pour next, 'next' while the level is steady, 'done' from 1000 ml, 'start
  // again' and 'back to decent's table'. The fill lives on this page only: leaving it keeps what
  // was saved before.
  import { onDestroy, onMount, untrack } from 'svelte';
  import type { Skin } from '../shell/skin.svelte';
  import type { TankRow } from '../shell/tank';
  import SettingsRow from './SettingsRow.svelte';
  import { canFinish, isSteady, nextMl, recentReadings, takeRow, usingText, type Reading } from './tank-calibration';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  /** ms between two looks at whether the level is steady */
  const TICK_MS = 500;

  let rows: TankRow[] = $state([]);
  let readings: Reading[] = $state([]);
  let now = $state(Date.now());
  /** what the last tap did: a refused row (a warning) or the saved table */
  let message: { text: string; saved: boolean } | null = $state(null);
  let timer: ReturnType<typeof setInterval> | undefined;

  const level = $derived(skin.link === 'machine' ? skin.water : null);
  const saved = $derived(skin.settings.tankRows);
  const steady = $derived(level !== null && isSteady(readings, now));
  const next = $derived(nextMl(rows));

  // Every level the machine sends; a level it stops sending is no reading.
  $effect(() => {
    if (level) {
      const at = Date.now();
      const mm = level.currentLevel;
      readings = [...untrack(() => recentReadings(readings, at)), { at, mm }];
    } else {
      readings = [];
    }
  });

  onMount(() => {
    timer = setInterval(() => (now = Date.now()), TICK_MS);
  });
  onDestroy(() => clearInterval(timer));

  function take() {
    if (!level) return;
    const taken = takeRow(rows, level.currentLevel);
    if ('problem' in taken) {
      message = { text: taken.problem, saved: false };
    } else {
      rows = taken.rows;
      message = null;
    }
  }

  function done() {
    skin.setSettings({ tankRows: rows });
    message = { text: `Saved: ${usingText(rows)}.`, saved: true };
    rows = [];
  }

  function startAgain() {
    rows = [];
    message = null;
  }

  function backToTable() {
    skin.setSettings({ tankRows: [] });
    rows = [];
    message = null;
  }
</script>

<div data-testid="tank-calibration">
  <SettingsRow
    label="using"
    hint="the table the skin turns the level into ml with: on the state line, in the water alert's note and for the clean. The machine and its water alert still work in mm."
    end
  >
    <b data-testid="tank-calibration-using">{usingText(saved)}</b>
    {#if saved.length > 0}
      <button class="action" data-testid="tank-calibration-back" onclick={backToTable}>back to decent's table</button>
    {/if}
  </SettingsRow>

  <SettingsRow
    label="how"
    hint="Empty the tank; set a refill kit to 'force off' first. Then pour 250 ml at a time, slowly, weighed on a scale (1 g = 1 ml), with the machine level, and tap next once the level is steady. You may stop from 1000 ml. The sensor reads to about a mm, about 30 ml. If the level looks low, lift the uptake assembly out of the water for 5 to 10 s before you start."
  />

  <SettingsRow
    label="now"
    hint={next === null ? 'the tank is full: tap done.' : next === 0 ? 'the tank empty.' : `pour until ${next} ml in all.`}
    end
  >
    {#snippet about()}
      <small data-testid="tank-calibration-steady"
        >{level === null ? 'no level from the machine' : steady ? 'steady' : 'settling'}</small
      >
    {/snippet}
    <b data-testid="tank-calibration-level">{level === null ? '–' : `${level.currentLevel.toFixed(1)} mm`}</b>
    {#if next !== null}
      <button class="action primary" disabled={!steady} data-testid="tank-calibration-next" onclick={take}>next</button>
    {/if}
    {#if canFinish(rows)}
      <button class="action" data-testid="tank-calibration-done" onclick={done}>done</button>
    {/if}
    {#if rows.length > 0}
      <button class="action" data-testid="tank-calibration-again" onclick={startAgain}>start again</button>
    {/if}
  </SettingsRow>

  {#each rows as row (row.ml)}
    <SettingsRow label="{row.ml} ml" spacing="tight" testid="tank-calibration-row">
      <b>{row.mm.toFixed(1)} mm</b>
    </SettingsRow>
  {/each}

  {#if message}<p class="notice" class:info={message.saved} data-testid="tank-calibration-message">{message.text}</p>{/if}
</div>

<style>
  .action {
    min-width: 8rem;
  }

  .notice {
    margin: 0 0 var(--space-2);
  }
</style>

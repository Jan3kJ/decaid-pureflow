<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
  src/settings/settings.js (renderPresenceSettings and the schedule handlers).
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // Miscellaneous > Presence Detection, its wake schedules: each
  // schedule's time, days and keep-awake, its switch, Edit and Delete (after a confirm), and
  // Add. A change is one request, then the presence settings are read again and the list shows
  // what Decaid holds. Presence itself and the sleep timeout are the fields above it.
  import type { WakeSchedule } from '../api';
  import NumberPad from '../editor/NumberPad.svelte';
  import type { Skin } from '../shell/skin.svelte';
  import Lever from '../ui/Lever.svelte';
  import Confirm from './Confirm.svelte';
  import SettingsRow from './SettingsRow.svelte';
  import { clock, minutesOf } from './fields';
  import { DAYS, KEEP_AWAKE_MAX, NEW_SCHEDULE, formOf, scheduleOf, scheduleText, type ScheduleForm } from './presence';
  import { errorMessage } from '../error-message';

  interface Props {
    skin: Skin;
    /** the schedules as the page read them; null while not read */
    schedules: WakeSchedule[] | null;
    /** reads the presence settings again */
    onchanged: () => Promise<void>;
  }

  let { skin, schedules, onchanged }: Props = $props();

  /** the schedule being edited: its id, or 'new' */
  let editing: string | null = $state(null);
  let form: ScheduleForm = $state({ ...NEW_SCHEDULE });
  let typing: 'time' | 'keep-awake' | null = $state(null);
  let busy = $state(false);
  let error: string | null = $state(null);
  let deleting: WakeSchedule | null = $state(null);

  function edit(schedule: WakeSchedule | null) {
    error = null;
    editing = schedule ? schedule.id : 'new';
    form = schedule ? formOf(schedule) : { ...NEW_SCHEDULE, days: [] };
  }

  function toggleDay(day: number) {
    form.days = form.days.includes(day) ? form.days.filter((entry) => entry !== day) : [...form.days, day];
  }

  async function run(what: string, request: () => Promise<unknown>) {
    busy = true;
    error = null;
    try {
      await request();
      await onchanged();
      return true;
    } catch (cause) {
      error = `${what}: ${errorMessage(cause)}`;
      return false;
    } finally {
      busy = false;
    }
  }

  async function save() {
    const schedule = scheduleOf(form);
    const id = editing;
    const ok =
      id === 'new'
        ? await run('Not added', () => skin.client.createWakeSchedule(schedule))
        : await run('Not changed', () => skin.client.updateWakeSchedule(id!, schedule));
    if (ok) editing = null;
  }

  function toggle(schedule: WakeSchedule) {
    void run('Not changed', () => skin.client.updateWakeSchedule(schedule.id, { enabled: !schedule.enabled }));
  }

  async function remove(schedule: WakeSchedule) {
    deleting = null;
    if (editing === schedule.id) editing = null;
    await run('Not deleted', () => skin.client.deleteWakeSchedule(schedule.id));
  }
</script>

<div class="presence" data-testid="presence-schedules">
  <SettingsRow label="wake schedules" hint="the machine wakes at these times, and stays awake for the time given.">
    {#snippet about()}
      {#if error}<small class="warn" data-testid="schedule-error">{error}</small>{/if}
    {/snippet}
    <button
      class="action"
      data-testid="schedule-add"
      disabled={busy || schedules === null || editing !== null}
      onclick={() => edit(null)}>add schedule</button
    >
  </SettingsRow>

  {#if schedules !== null && !schedules.length && editing !== 'new'}
    <p class="dim">No schedules.</p>
  {/if}

  {#each schedules ?? [] as schedule (schedule.id)}
    <SettingsRow label={scheduleText(schedule)} named testid="schedule-{schedule.id}" labelTestid="schedule-text-{schedule.id}">
      <div class="buttons">
        <Lever
          checked={schedule.enabled}
          label="schedule {schedule.time} on"
          disabled={busy}
          testid="schedule-enabled-{schedule.id}"
          onchange={() => toggle(schedule)}
        />
        <button
          class="action"
          data-testid="schedule-edit-{schedule.id}"
          disabled={busy || editing !== null}
          onclick={() => edit(schedule)}>edit</button
        >
        <button class="action" data-testid="schedule-delete-{schedule.id}" disabled={busy} onclick={() => (deleting = schedule)}
          >delete</button
        >
      </div>
    </SettingsRow>
  {/each}

  {#if editing !== null}
    <div class="form" data-testid="schedule-form">
      <h3>{editing === 'new' ? 'New schedule' : 'Edit schedule'}</h3>
      <SettingsRow label="wake at">
        <button class="value" data-testid="schedule-time" onclick={() => (typing = 'time')}><b>{clock(form.minutes)}</b></button>
      </SettingsRow>
      <SettingsRow label="days" hint="none chosen: every day.">
        <div class="choices">
          {#each DAYS as day, i (day)}
            <button
              class="chip select-outline"
              aria-pressed={form.days.includes(i + 1)}
              data-testid="schedule-day-{i + 1}"
              onclick={() => toggleDay(i + 1)}>{day}</button
            >
          {/each}
        </div>
      </SettingsRow>
      <SettingsRow label="keep awake for" hint="minutes after it wakes, at most 720 (12 hours); 0 only wakes.">
        <button class="value" data-testid="schedule-keep-awake" onclick={() => (typing = 'keep-awake')}
          ><b>{form.keepAwake}<i>min</i></b></button
        >
      </SettingsRow>
      <SettingsRow end>
        <button class="action" data-testid="schedule-cancel" disabled={busy} onclick={() => (editing = null)}>cancel</button>
        <button class="action primary" data-testid="schedule-save" disabled={busy} onclick={save}>save</button>
      </SettingsRow>
    </div>
  {/if}
</div>

{#if typing === 'time'}
  <NumberPad
    label="wake at, hhmm"
    unit=""
    min={0}
    max={2359}
    decimals={false}
    current={clock(form.minutes).replace(':', '')}
    onconfirm={(typed: number) => {
      typing = null;
      const minutes = minutesOf(typed);
      if (minutes !== null) form.minutes = minutes;
    }}
    oncancel={() => (typing = null)}
  />
{:else if typing === 'keep-awake'}
  <NumberPad
    label="keep awake for"
    unit="min"
    min={0}
    max={KEEP_AWAKE_MAX}
    decimals={false}
    current={String(form.keepAwake)}
    onconfirm={(typed: number) => {
      typing = null;
      form.keepAwake = Math.round(typed);
    }}
    oncancel={() => (typing = null)}
  />
{/if}

{#if deleting}
  {@const schedule = deleting}
  <Confirm
    title="Delete the schedule {schedule.time}?"
    text={scheduleText(schedule)}
    ok="delete"
    onok={() => void remove(schedule)}
    oncancel={() => (deleting = null)}
  />
{/if}

<style>
  .presence {
    display: flex;
    flex-direction: column;
  }

  .dim {
    color: var(--dim);
  }

  small.warn {
    color: var(--temperature);
  }

  .buttons {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .form {
    margin: var(--space-1) 0;
    padding: var(--space-1) 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
  }

  h3 {
    margin: var(--space-2) 0 var(--space-1);
    font-size: var(--text-title);
    font-weight: 600;
  }

  button:disabled {
    opacity: 0.5;
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-1);
  }

  .chip {
    min-width: 3.6rem;
    padding: 0 0.7rem;
  }
</style>

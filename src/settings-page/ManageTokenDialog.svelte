<script lang="ts">
  // The question for the "Manage plugins and skins" API token, raised by `withManageToken`
  // (manage-token.svelte.ts) when Decaid gates a call. The token is pasted from Decaid's
  // Decent Account page > API access tokens > Create > Manage plugins and skins.
  import Confirm from './Confirm.svelte';
  import { tokenDialog } from './manage-token.svelte';

  let token = $state('');
  const ask = $derived(tokenDialog.ask);
  // each question starts with an empty field
  $effect(() => {
    if (ask) token = '';
  });
</script>

{#if ask}
  <Confirm
    title="Paste an API token"
    text="Decaid only lets a skin install or change skins and plugins with a “Manage plugins and skins” token: Decent Account page > API access tokens > Create. It is kept until this screen is closed."
    ok="use"
    label="the API token"
    error={ask.refused}
    bind:value={token}
    onok={() => {
      const typed = token.trim();
      if (typed) ask.done(typed);
    }}
    oncancel={() => ask.done(null)}
  />
{/if}

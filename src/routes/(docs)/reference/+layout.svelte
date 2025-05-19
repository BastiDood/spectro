<script>
  import DocsLayout from '$lib/layouts/DocsLayout.svelte';
  const { children } = $props();
</script>

<!-- <slot /> -->
<DocsLayout content={children}>
  {#snippet navigation(onclick)}
    <li>
      <a {onclick} href="#basic-usage">Basic Usage</a>
      <ul>
        <li><a {onclick} href="#confess">Confessions</a></li>
        <li><a {onclick} href="#reply">Anonymous Replies</a></li>
      </ul>
    </li>
    <li>
      <a {onclick} href="#moderation">Moderation</a>
      <ul>
        <li><a {onclick} href="#channel-setup">Channel Setup</a></li>
        <li><a {onclick} href="#manage-confessions">Manage Confessions</a></li>
      </ul>
    </li>
  {/snippet}
</DocsLayout>

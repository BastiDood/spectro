<script>
    import DocsLayout from '$lib/layouts/DocsLayout.svelte';
    const { children } = $props();
</script>

<DocsLayout content={children}>
    {#snippet navigation(hideSidebar)}
        <li>
            <a href="#basic-usage" onclick={hideSidebar}>Basic Usage</a>
            <ul>
                <li><a href="#confess" onclick={hideSidebar}>Confessions</a></li>
                <li><a href="#reply" onclick={hideSidebar}>Anonymous Replies</a></li>
            </ul>
        </li>
        <li>
            <a href="#moderation" onclick={hideSidebar}>Moderation</a>
            <ul>
                <li><a href="#channel-setup" onclick={hideSidebar}>Channel Setup</a></li>
                <li><a href="#manage-confessions" onclick={hideSidebar}>Manage Confessions</a></li>
            </ul>
        </li>
    {/snippet}
</DocsLayout>

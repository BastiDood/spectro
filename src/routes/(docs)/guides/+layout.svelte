<script>
    import DocsLayout from '$lib/layouts/DocsLayout.svelte';
    const { children } = $props();
</script>

<DocsLayout content={children}>
    {#snippet navigation(onclick)}
        <li><a {onclick} href="#invite">Hello World!</a></li>
    {/snippet}
</DocsLayout>

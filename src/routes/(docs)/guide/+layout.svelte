<script>
    import DocsLayout from '$lib/layouts/DocsLayout.svelte';
    const { children } = $props();
</script>

<DocsLayout content={children}>
    {#snippet navigation(onclick)}
        <li><a {onclick} href="#set-up">Setting up Confession Channels</a></li>
        <li><a {onclick} href="#submit-confessions">Submitting Confessions</a></li>
        <li><a {onclick} href="#approve-confessions">Approving Confessions</a></li>
        <li><a {onclick} href="#reply-to-confessions">Replying to Confessions</a></li>
        <li><a {onclick} href="#resend-confessions">Resending Confessions</a></li>
        <li><a {onclick} href="#panic-button">The Panic Button</a></li>
    {/snippet}
</DocsLayout>

<script lang="ts">
    import type { HTMLAnchorAttributes } from 'svelte/elements';
    import type { Snippet } from 'svelte';

    import { page } from '$app/state';

    interface Props extends HTMLAnchorAttributes {
        children: Snippet;
    }

    const { children, ...props }: Props = $props();
</script>

<a class:menu-active={page.url.pathname === props.href} {...props}>{@render children()}</a>

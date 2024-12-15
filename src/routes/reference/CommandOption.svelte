<script lang="ts">
    import type { Snippet } from 'svelte';

    interface Props {
        required?: boolean;
        tooltip: string;
        children: Snippet;
    }

    const { required = false, tooltip, children }: Props = $props();
    const badgeColor = $derived(required ? 'badge-secondary' : 'badge-neutral');
</script>

<span class="badge {badgeColor} tooltip tooltip-accent" data-tip={tooltip}>{@render children()}</span>

<script lang="ts">
    import Icon from '@iconify/svelte';
    import RoundMenu from '@iconify/icons-ic/round-menu';
    import type { Snippet } from 'svelte';

    let isSidebarHidden = $state(true);
    function hideSidebar() {
        isSidebarHidden = true;
    }

    interface Props {
        navigation: Snippet<[typeof hideSidebar]>;
        content: Snippet;
    }

    const { navigation, content }: Props = $props();
</script>

<button
    class="btn btn-accent fixed left-0 z-10 mt-10 rounded-l-sm px-1 md:hidden"
    onclick={() => (isSidebarHidden = !isSidebarHidden)}
>
    <Icon icon={RoundMenu} height="24" />
</button>
<div class="grid grid-cols-[auto_1fr]">
    <div
        role="none"
        onclick={hideSidebar}
        class:hidden={isSidebarHidden}
        class="fixed inset-0 z-10 bg-base-200 opacity-60"
    ></div>
    <div
        class:hidden={isSidebarHidden}
        class="absolute top-0 z-20 h-full overflow-y-auto drop-shadow-[3px_3px_0px_rgba(247,149,29,0.35)] md:static md:block md:px-4"
    >
        <ul
            class="menu menu-lg sticky min-h-full flex-nowrap bg-base-300 px-6 py-4 md:menu-md md:top-10 md:min-h-min md:rounded-box"
        >
            {@render navigation(hideSidebar)}
        </ul>
    </div>
    <div class="overflow-y-auto">
        {@render content()}
    </div>
</div>

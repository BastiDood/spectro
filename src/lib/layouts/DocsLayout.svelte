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
    class="btn btn-accent fixed left-0 mt-10 rounded-l-sm px-1 md:hidden"
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
        class="fixed bottom-0 z-20 md:static md:block md:px-4 md:drop-shadow-[3px_3px_0px_rgba(247,149,29,0.35)]"
    >
        <ul class="menu menu-lg flex-nowrap bg-base-300 px-6 py-4 md:menu-md md:sticky md:top-32 md:rounded-box">
            {@render navigation(hideSidebar)}
        </ul>
    </div>
    <div
        class="prose max-w-full p-10 prose-headings:scroll-mt-10 prose-h2:border-b prose-h2:border-neutral prose-h2:pb-3"
    >
        {@render content()}
    </div>
</div>

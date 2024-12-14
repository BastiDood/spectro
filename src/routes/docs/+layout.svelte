<script>
    import Icon from '@iconify/svelte';

    let isSidebarHidden = $state(true);

    function hideSidebar() {
        isSidebarHidden = true;
    }

    const { children } = $props();
</script>

<button
    class="btn btn-accent fixed left-0 z-10 mt-10 rounded-l-sm px-1 md:hidden"
    onclick={() => (isSidebarHidden = !isSidebarHidden)}
>
    <Icon icon="ic:round-menu" height="24" />
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
        <div
            class="menu menu-lg sticky min-h-full flex-nowrap bg-base-300 px-6 py-4 md:menu-md md:top-10 md:min-h-min md:rounded-box"
        >
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
        </div>
    </div>
    <div class="overflow-y-auto">
        {@render children()}
    </div>
</div>

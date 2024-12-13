<script>
    const { children } = $props();
</script>

<div class="flex flex-row overflow-y-auto">
    <div
        class="menu sticky top-10 m-10 w-2/5 flex-nowrap overflow-y-auto rounded-box bg-base-300 p-6 drop-shadow-[3px_3px_0px_rgba(247,149,29,0.35)]"
    >
        <li class="menu-title text-secondary-content">Spectro Docs</li>
        <li><a href="/">Getting Started</a></li>
        <li><a href="/">Basic Usage</a></li>
        <li><a href="/">Moderation</a></li>
    </div>
    <div>
        {@render children()}
    </div>
</div>

<script>
    const { children } = $props();
</script>

<div class="flex flex-row overflow-y-auto">
    <div
        class="menu sticky top-10 m-10 w-2/5 flex-nowrap overflow-y-auto rounded-box bg-base-300 p-6 drop-shadow-[3px_3px_0px_rgba(247,149,29,0.35)]"
    >
        <li class="menu-title text-secondary-content">Spectro Docs</li>
        <li><a href="#features">Features</a></li>
        <li><a href="#getting-started">Getting Started</a></li>
        <li>
            <a href="#basic-usage">Basic Usage</a>
            <ul>
                <li><a href="#confess">Confessions</a></li>
                <li><a href="#reply">Anonymous Replies</a></li>
            </ul>
        </li>
        <li>
            <a href="#moderation">Moderation</a>
            <ul>
                <li><a href="#channel-setup">Channel Setup</a></li>
                <li><a href="#manage-confessions">Manage Confessions</a></li>
            </ul>
        </li>
    </div>
    <div>
        {@render children()}
    </div>
</div>

<script lang="ts">
    import CommandOption from './CommandOption.svelte';
</script>

{#snippet permissionBadge(perms: string)}
    <div class="badge badge-info badge-outline place-self-center">Required permissions: {perms}</div>
{/snippet}

<section>
    <h1 class="font-medium">Documentation</h1>
    <p>
        <strong>Spectro</strong> enables your community members to post anonymous confessions and replies to moderator-configured
        channels. However, for the sake of moderation, confessions are still logged for later viewing.
    </p>
</section>
<section>
    <h2 id="basic-usage">Basic Usage</h2>
    <section>
        <div id="help" class="flex flex-col items-center gap-2 lg:flex-row lg:items-start">
            <div
                class="w-fit self-center rounded-md bg-base-300 px-4 py-2 font-mono text-lg font-bold text-primary drop-shadow-md"
            >
                <span>/help</span>
                <CommandOption tooltip="Message visibility.">preview</CommandOption>
            </div>
        </div>
        <p class="mb-10">
            <strong>Open the help page to show a list of commands.</strong> By default, the help page is shown
            privately, but you can enable the
            <code>public</code> message mode. This command can be run anywhere: server channels, private DMs, etc.
        </p>
    </section>
    <section>
        <div id="info" class="flex flex-col items-center gap-2 lg:flex-row lg:items-start">
            <div
                class="w-fit self-center rounded-md bg-base-300 px-4 py-2 font-mono text-lg font-bold text-primary drop-shadow-md"
            >
                <span>/info</span>
                <CommandOption tooltip="Message visibility.">public</CommandOption>
            </div>
        </div>
        <p class="mb-10">
            <strong>View important information and links about Spectro,</strong> including links for reporting bugs and
            viewing the source code. By default, the information page is shown privately, but you can enable the
            <code>public</code> message mode. This command can be run anywhere: server channels, private DMs, etc.
        </p>
    </section>
    <section>
        <div id="confess" class="flex scroll-mt-10 flex-col items-center gap-2 lg:flex-row lg:items-start">
            <div
                class="w-fit self-center rounded-md bg-base-300 px-4 py-2 font-mono text-lg font-bold text-primary drop-shadow-md"
            >
                <span>/confess</span>
                <CommandOption required tooltip="Content of the confession message.">content</CommandOption>
            </div>
            {@render permissionBadge('Send Messages')}
        </div>
        <p class="mb-10">
            <strong>Send a confession to the current channel.</strong> This command fails if the current channel has not
            yet been configured to receive confessions.
        </p>
    </section>
    <section>
        <div id="reply" class="flex scroll-mt-10 flex-col items-center gap-2 lg:flex-row lg:items-start">
            <div
                class="w-fit self-center rounded-md bg-base-300 px-4 py-2 font-mono text-lg font-bold text-primary drop-shadow-md"
            >
                <span>Apps &gt; Reply Anonymously</span>
            </div>
            {@render permissionBadge('Send Messages')}
        </div>
        <p class="mb-10">
            <strong>Anonymously reply</strong> to any message (in a confessions-enabled channel) by
            <strong>right-clicking</strong>
            on that message and invoking the <code class="whitespace-nowrap">Apps &gt; Reply Anonymously</code> command.
        </p>
    </section>
</section>
<section>
    <h2 id="moderation">Moderation</h2>
    <section>
        <h3 id="channel-setup" class="scroll-mt-10">Channel Setup</h3>
        <div id="setup" class="flex flex-col items-center gap-2 lg:flex-row lg:items-start">
            <div
                class="w-fit self-center rounded-md bg-base-300 px-4 py-2 font-mono text-lg font-bold text-primary drop-shadow-md"
            >
                <span>/setup</span>
                <CommandOption required tooltip="Moderator-only channel for confession logs">channel</CommandOption>
                <CommandOption tooltip="Custom title for confession messages.">label</CommandOption>
                <CommandOption tooltip="Custom hex color for confession messages.">color</CommandOption>
                <CommandOption tooltip="Should prior approvals be required?">approval</CommandOption>
            </div>
            {@render permissionBadge('Manage Channels')}
        </div>
        <p>
            <strong>Enable confessions for the current channel where the command is being run.</strong> All confessions,
            along with the sender's username, will be logged in a separate provided
            <code>channel</code> ideally only accessed by server moderators. You may set whether to require moderator
            <code>approval</code>
            before publishing a confession (not required by default). If enabled, confessions can be approved or rejected
            in the logs
            <code>channel</code>. Running this command again will simply overwrite the affected previous settings.
        </p>
        <p class="mb-10">
            <strong>Customization.</strong>
            Optionally, you can set a <code>label</code> to be used for the embed title (e.g., "Confession" by default).
            You may also set the RGB <code>color </code> hex code that will be used for the embeds.
        </p>
    </section>
    <section>
        <h3 id="manage-confessions" class="scroll-mt-10">Manage Confessions</h3>
        <div id="lockdown" class="flex flex-col items-center gap-2 lg:flex-row lg:items-start">
            <div
                class="w-fit self-center rounded-md bg-base-300 px-4 py-2 font-mono text-lg font-bold text-primary drop-shadow-md"
            >
                <span>/lockdown</span>
            </div>
            {@render permissionBadge('Manage Channels')}
        </div>
        <p class="mb-10">
            <strong>Temporarily disable anonymous confessions for the current channel.</strong> Previous settings are
            preserved for the next time <code>/setup</code> is run.
        </p>
        <div id="resend" class="flex flex-col items-center gap-2 lg:flex-row lg:items-start">
            <div
                class="w-fit self-center rounded-md bg-base-300 px-4 py-2 font-mono text-lg font-bold text-primary drop-shadow-md"
            >
                <span>/resend</span>
                <CommandOption required tooltip="ID of confession to resend.">confession</CommandOption>
            </div>
            {@render permissionBadge('Manage Messages')}
        </div>
        <p class="mb-10">
            <strong>Resend an existing confession by its <code>id</code>.</strong> This is useful for times when a confession
            message has been accidentally deleted. Note that the current channel settings are still enforced.
        </p>
    </section>
</section>

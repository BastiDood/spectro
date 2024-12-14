<script>
    import Icon from '@iconify/svelte';
</script>

<div class="prose max-w-full p-10 prose-headings:scroll-mt-10 prose-h2:border-b prose-h2:border-neutral prose-h2:pb-3">
    <h1 class="font-medium">Documentation</h1>
    <div class="alert alert-warning gap-2 text-sm text-warning-content">
        <Icon icon="tabler:barrier-block-filled" height="24" />
        This page is a work in progress.
    </div>
    <p>
        <strong>Spectro</strong> enables your community members to post anonymous confessions and replies to moderator-configured
        channels. However, for the sake of moderation, confessions are still logged for later viewing.
    </p>

    <h2 id="getting-started">Getting Started</h2>
    <h3>Invite Spectro to Discord</h3>
    <p class="text-pink-500">Instructions to add Spectro to Discord here.</p>
    <p>
        Once Spectro has been added, you can use the <code>/help</code> and <code>/info</code> commands to learn more about
        the bot.
    </p>
    <h3>Using Spectro</h3>
    <div class="flex flex-col items-center gap-2 lg:flex-row lg:items-start">
        <code class="rounded-md bg-base-300 px-4 py-2 text-lg text-primary drop-shadow-md"
            >/help <div
                class="badge badge-neutral tooltip tooltip-accent"
                data-tip="Message visibility: public (optional)"
            >
                preview
            </div></code
        >
    </div>
    <p class="mb-10">
        <strong>Open the help page to show a list of commands.</strong> By default, the help page is shown privately,
        but you can enable the
        <code>public</code> message mode. This command can be run anywhere: server channels, private DMs, etc.
    </p>
    <div class="flex flex-col items-center gap-2 lg:flex-row lg:items-start">
        <code class="rounded-md bg-base-300 px-4 py-2 text-lg text-primary drop-shadow-md"
            >/info <div
                class="badge badge-neutral tooltip tooltip-accent"
                data-tip="Message visibility: public (optional)"
            >
                preview
            </div></code
        >
    </div>
    <p class="mb-10">
        <strong>View important information and links about Spectro,</strong> including links for reporting bugs and
        viewing the source code. By default, the information page is shown privately, but you can enable the
        <code>public</code> message mode. This command can be run anywhere: server channels, private DMs, etc.
    </p>
    <p>
        To begin setting up channels for confessions, see <a href="#channel-setup" class="link link-primary"
            >Channel Setup</a
        >.
    </p>

    <h2 id="basic-usage">Basic Usage</h2>
    <div class="flex flex-col items-center gap-2 lg:flex-row lg:items-start">
        <code id="confess" class="scroll-mt-10 rounded-md bg-base-300 px-3 py-1.5 text-lg text-primary drop-shadow-md"
            >/confess <div
                class="badge badge-secondary tooltip tooltip-accent"
                data-tip="Content of the confession message"
            >
                content
            </div></code
        >
        <div class="badge badge-info badge-outline place-self-center">Required permissions: Send Messages</div>
    </div>
    <p class="mb-10">
        <strong>Send a confession to the current channel.</strong> This command fails if the current channel has not yet
        been configured to receive confessions.
    </p>
    <div class="flex flex-col items-center gap-2 lg:flex-row lg:items-start">
        <code id="reply" class="scroll-mt-10 rounded-md bg-base-300 px-3 py-1.5 text-lg text-primary drop-shadow-md"
            >Apps &gt; Reply Anonymously</code
        >
        <div class="badge badge-info badge-outline place-self-center">Required permissions: Send Messages</div>
    </div>
    <p class="mb-10">
        <strong>Anonymously reply</strong> to any message (in a confessions-enabled channel) by
        <strong>right-clicking</strong>
        on that message and invoking the <code class="whitespace-nowrap">Apps &gt; Reply Anonymously</code> command.
    </p>

    <h2 id="moderation">Moderation</h2>
    <h3 id="channel-setup" class="scroll-mt-10">Channel Setup</h3>
    <div></div>
    <div class="flex flex-col items-center gap-2 lg:flex-row lg:items-start">
        <code class="rounded-md bg-base-300 px-3 py-1.5 text-lg text-primary drop-shadow-md"
            >/setup
            <div
                class="badge badge-secondary tooltip tooltip-accent"
                data-tip="Moderator-only channel for confession logs"
            >
                channel
            </div>
            <div
                class="badge badge-neutral tooltip tooltip-accent"
                data-tip="Custom title for confession messages (optional)"
            >
                label
            </div>
            <div
                class="badge badge-neutral tooltip tooltip-accent"
                data-tip="Custom hex color for confession messages (optional)"
            >
                color
            </div>
            <div
                class="badge badge-neutral tooltip tooltip-accent"
                data-tip="Require approvals: true or false (default)"
            >
                approval
            </div>
        </code>
        <div class="badge badge-info badge-outline place-self-center">Required permissions: Manage Channels</div>
    </div>
    <p>
        <strong>Enable confessions for the current channel where the command is being run.</strong> All confessions,
        along with the sender's username, will be logged in a separate provided
        <code>channel</code> ideally only accessed by server moderators. You may set whether to require moderator
        <code>approval</code>
        before publishing a confession (not required by default). If enabled, confessions can be approved or rejected in
        the logs
        <code>channel</code>. Running this command again will simply overwrite the affected previous settings.
    </p>
    <p class="mb-10">
        <strong>Customization.</strong>
        Optionally, you can set a <code>label</code> to be used for the embed title (e.g., "Confession" by default). You
        may also set the RGB <code>color </code> hex code that will be used for the embeds.
    </p>

    <h3 id="manage-confessions" class="scroll-mt-10">Manage Confessions</h3>
    <div class="flex flex-col items-center gap-2 lg:flex-row lg:items-start">
        <code class="rounded-md bg-base-300 px-3 py-1.5 text-lg text-primary drop-shadow-md">/lockdown</code>
        <div class="badge badge-info badge-outline place-self-center">Required permissions: Manage Channels</div>
    </div>
    <p class="mb-10">
        <strong>Temporarily disable anonymous confessions for the current channel.</strong> Previous settings are
        preserved for the next time <code>/setup</code> is run.
    </p>
    <div class="flex flex-col items-center gap-2 lg:flex-row lg:items-start">
        <code class="rounded-md bg-base-300 px-3 py-1.5 text-lg text-primary drop-shadow-md"
            >/resend <div class="badge badge-secondary tooltip tooltip-accent" data-tip="ID of confession to resend">
                id
            </div></code
        >
        <div class="badge badge-info badge-outline place-self-center">Required permissions: Manage Messages</div>
    </div>
    <p class="mb-10">
        <strong>Resend an existing confession by its <code>id</code>.</strong> This is useful for times when a confession
        message has been accidentally deleted. Note that the current channel settings are still enforced.
    </p>
</div>

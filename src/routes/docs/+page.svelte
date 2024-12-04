<script>
    import Icon from '@iconify/svelte';
</script>

<div class="prose max-w-full p-10">
    <h1 class="border-b border-neutral pb-6 font-medium">Documentation</h1>
    <div class="alert alert-warning text-warning-content">
        <Icon icon="tabler:barrier-block-filled" height="24" />
        This page is a work in progress.
    </div>
    <p>
        <strong>Spectro</strong> enables your community members to post anonymous confessions and replies to moderator-configured
        channels. However, for the sake of moderation, confessions are still logged for later viewing.
    </p>
    <h2 class="border-b border-neutral pb-2">Commands</h2>
    <code class="text-lg">/help [preview]</code>
    <p>
        <strong>Open the help page.</strong> By default, the help page is shown privately, but you can enable the
        <code>public</code> message mode. This command can be run anywhere: server channels, private DMs, etc.
    </p>
    <code class="text-lg">/confess &lt;content&gt;</code>
    <p>
        <strong>Send a confession to a channel.</strong> This command fails if the current channel has not yet been configured
        to receive confessions.
    </p>
    <code class="text-lg">Apps &gt; Reply Anonymously</code>
    <p>
        You may <strong>anonymously reply</strong> to any message (in a confessions-enabled channel) by right-clicking
        on that message and invoking the <code>Apps &gt; Reply Anonymously command.</code>
    </p>
    <code class="text-lg">/setup [label] [color] [approval]</code>
    <div class="alert alert-info text-info-content">Moderators and above only.</div>
    <p>
        <strong>Enables confessions for the current channel.</strong> Optionally, you may set a <code>label</code> to be
        used for the embed title (e.g., "Confession" by default). You may also set the RGB <code>color </code> hex code
        that will be used for the embeds. Finally, you may set whether to require prior <code>approval</code> before publishing
        a confession to a channel (e.g., no approval required by default). Running this command again will simply overwrite
        the affected previous settings.
    </p>
    <code class="text-lg">/lockdown</code>
    <div class="alert alert-info text-info-content">Moderators and above only.</div>
    <p>
        <strong>Temporarily disables anonymous confessions for the channel.</strong> Previous settings are preserved for
        the next time <code>/setup</code> is run.
    </p>
    <code class="text-lg">/resend &lt;id&gt;</code>
    <p>
        <strong>Resends an existing confession by its <code>id</code>.</strong> This is useful for times when a confession
        message has been accidentally deleted. Note that the current channel settings are still enforced.
    </p>
    <code class="text-lg"> /set &lt;member|moderator|administrator&gt; &lt;@user&gt; </code>
    <div class="alert alert-info text-info-content">Administrators only.</div>
    <p>
        <strong>Sets the privilege level of <code>@user</code>.</strong> Setting your own permissions—even as the server
        owner—is forbidden.
    </p>
</div>

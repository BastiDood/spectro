<script lang="ts">
  import CommandOption from './CommandOption.svelte';
</script>

{#snippet permissionBadge(perms: string)}
  <div class="badge place-self-center badge-outline badge-info">{perms}</div>
{/snippet}

<section>
  <h1 class="font-medium">Documentation</h1>
  <p>
    <strong>Spectro</strong> enables your community members to post anonymous confessions and replies
    to moderator-configured channels. For moderation, these posts are still logged for server staff.
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
      <strong>Open the help page to show a list of commands.</strong> By default, the help page is
      shown privately, but you can enable the
      <code>public</code> message mode. This command can be run anywhere: server channels, private DMs,
      etc.
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
      <strong>View important information and links about Spectro,</strong> including links for
      reporting bugs and viewing the source code. By default, the information page is shown
      privately, but you can enable the
      <code>public</code> message mode. This command can be run anywhere: server channels, private DMs,
      etc.
    </p>
  </section>
  <section>
    <div
      id="confess"
      class="flex scroll-mt-10 flex-col items-center gap-2 lg:flex-row lg:items-start"
    >
      <div
        class="w-fit self-center rounded-md bg-base-300 px-4 py-2 font-mono text-lg font-bold text-primary drop-shadow-md"
      >
        <span>/confess</span>
      </div>
      {@render permissionBadge('Send Messages')}
    </div>
    <p class="mb-10">
      <strong>Send a confession to the current channel.</strong>
      A modal will be shown where you can draft your message. This command works in configured confession
      channels. It also works inside existing confession threads, where the message is posted back into
      that thread.
    </p>
    <p class="mb-10">
      <strong>Optional Attachments.</strong> The confession modal includes an optional attachment
      field. If you upload an image or file, you must have the
      <span class="badge badge-accent">Attach Files</span> permission.
    </p>
    <p class="mb-10">
      <strong>Threads.</strong> In a thread, Spectro uses the original confession channel's settings and
      moderator log. Posting in threads requires permission to send messages in threads. Locked threads
      may require moderator thread permissions.
    </p>
    <p class="mb-10">
      <strong>Uploaded Files.</strong> Spectro keeps uploaded files through the moderator log before showing
      them publicly. Images show inline when possible. Other uploads are kept as files.
    </p>
  </section>
  <section>
    <div
      id="thread"
      class="flex scroll-mt-10 flex-col items-center gap-2 lg:flex-row lg:items-start"
    >
      <div
        class="w-fit self-center rounded-md bg-base-300 px-4 py-2 font-mono text-lg font-bold text-primary drop-shadow-md"
      >
        <span>/thread</span>
      </div>
      {@render permissionBadge('Create Public Threads')}
      {@render permissionBadge('Send Messages in Threads')}
    </div>
    <p class="mb-10">
      <strong>Start a new anonymous public thread.</strong> Use this from a configured confession
      channel. The modal asks for a thread title and your anonymous message. It is not used inside
      existing threads; use <code>/confess</code> there instead.
    </p>
  </section>
  <section>
    <div
      id="reply"
      class="flex scroll-mt-10 flex-col items-center gap-2 lg:flex-row lg:items-start"
    >
      <div
        class="w-fit self-center rounded-md bg-base-300 px-4 py-2 font-mono text-lg font-bold text-primary drop-shadow-md"
      >
        <span>Apps &gt; Reply Anonymously</span>
      </div>
      {@render permissionBadge('Send Messages')}
    </div>
    <p class="mb-10">
      <strong>Anonymously reply</strong> to a message in a confessions-enabled channel by
      <strong>right-clicking</strong>
      on that message and invoking the
      <code class="whitespace-nowrap">Apps &gt; Reply Anonymously</code> command. This posts a normal
      anonymous reply to the selected message.
    </p>
    <p class="mb-10">
      <strong>Optional Attachments.</strong> Replies can include an optional attachment. If you
      upload an image or file, the
      <span class="badge badge-accent">Attach Files</span> permission is required when attaching files.
    </p>
    <p class="mb-10">
      Replies follow the same attachment flow as confessions. Spectro keeps the uploaded file
      through the moderator log before showing it publicly.
    </p>
  </section>
  <section>
    <div
      id="thread-reply"
      class="flex scroll-mt-10 flex-col items-center gap-2 lg:flex-row lg:items-start"
    >
      <div
        class="w-fit self-center rounded-md bg-base-300 px-4 py-2 font-mono text-lg font-bold text-primary drop-shadow-md"
      >
        <span>Apps &gt; Reply as Anonymous Thread</span>
      </div>
      {@render permissionBadge('Send Messages')}
      {@render permissionBadge('Create Public Threads')}
      {@render permissionBadge('Send Messages in Threads')}
    </div>
    <p class="mb-10">
      <strong>Start an anonymous thread from a message.</strong> Right-click or long-press a message
      in a confession channel and choose
      <code class="whitespace-nowrap">Apps &gt; Reply as Anonymous Thread</code>. This creates a new
      public thread with your anonymous reply as the first message.
    </p>
    <p class="mb-10">
      Replying as a thread is for messages in the main confession channel. It does not work from
      inside existing threads, and it does not work in channels that require approval. Use the
      normal anonymous reply flow in those cases.
    </p>
    <p class="mb-10">
      <strong>Optional Attachments.</strong> The first message in the thread can include an optional
      attachment. If you upload an image or file, the
      <span class="badge badge-accent">Attach Files</span> permission is required when attaching files.
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
        <CommandOption required tooltip="Moderator-only channel for confession logs"
          >log-channel</CommandOption
        >
        <CommandOption tooltip="Channel to enable anonymous confessions in"
          >confession-channel</CommandOption
        >
        <CommandOption tooltip="Custom title for confession messages.">label</CommandOption>
        <CommandOption tooltip="Custom hex color for confession messages.">color</CommandOption>
        <CommandOption tooltip="Should prior approvals be required?">approval</CommandOption>
      </div>
      {@render permissionBadge('Manage Channels')}
    </div>
    <p>
      <strong>Enable confessions for the current channel or a selected target channel.</strong>
      Moderators choose where anonymous posts appear and where private moderator logs are sent. The
      <code>log-channel</code> should usually be visible only to server staff. If
      <code>confession-channel</code> is omitted, Spectro configures the channel where the command
      is being run. You may set whether to require moderator
      <code>approval</code>
      before publishing a confession (not required by default). If enabled, confessions can be approved
      or rejected in the logs
      <code>log-channel</code>. Running this command again will simply overwrite the affected
      previous settings.
    </p>
    <p>
      The <code>log-channel</code> also helps Spectro keep uploaded files available for approvals and
      resends. Moderators should avoid deleting these log messages unless they intentionally want to remove
      that record.
    </p>
    <p class="mb-10">
      <strong>Customization.</strong>
      Optionally, you can set a <code>label</code> to be used for the embed title (e.g.,
      "Confession" by default). You may also set the RGB <code>color </code> hex code that will be used
      for the embeds.
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
      <strong>Temporarily disable anonymous confessions for the current channel.</strong> Previous
      settings are preserved for the next time <code>/setup</code> is run.
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
      <strong>Resend an existing confession by its <code>id</code>.</strong> This is useful when a confession
      message was accidentally deleted. The current channel settings still apply.
    </p>
    <p class="mb-10">
      Resends use the moderator log to recover uploaded files when possible. Older posts with
      attachments may no longer be resendable if Discord no longer has the original upload.
    </p>
  </section>
</section>

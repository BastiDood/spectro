<script lang="ts">
  import BaselineAnnouncement from '@iconify-icons/ic/baseline-announcement';
  import Icon from '@iconify/svelte';
</script>

{#snippet command(hash: string)}
  <a href="/reference/#{hash}" class="link link-primary">/{hash}</a>
{/snippet}

<section>
  <h1 id="getting started" class="font-medium">Getting Started</h1>
  <p>To get started with Spectro, we must first invite the Discord bot into the server.</p>
  <div class="alert alert-warning">
    <Icon icon={BaselineAnnouncement} width={24} />
    <span>Spectro is currently under closed beta.</span>
  </div>
</section>
<section>
  <h2 id="set-up">Setting up Confession Channels</h2>
  <p>
    By default, Spectro is not configured to send anonymous confessions to any channel. To "set up"
    a channel for confessions, server moderators (i.e., any member with the <span
      class="badge badge-accent">Manage Channels</span
    >
    permission) must invoke the {@render command('setup')} command with a target
    <strong>channel</strong> to which all confession logs will be sent.
  </p>
  <p>
    Optionally, the <strong>label</strong> and the <strong>color</strong> of the confession embed
    may be configured. The <strong>color</strong> must be a valid RGB color hex code.
  </p>
  <p>
    If prior approval is required before a confession may be published to a confession <strong
      >channel</strong
    >, the
    {@render command('setup')} command also has an <strong>approval</strong> flag, which configures
    whether submitted confessions should be put on hold before publication. By default,
    <strong>approval</strong> is false.
  </p>
  <p>
    If a channel has already been set up for confessions, invoking {@render command('setup')} again will
    simply overwrite the non-empty arguments of the command invocation.
  </p>
  <p>
    In summary, the following is a minimum checklist of required permissions and configurations for
    Spectro to properly publish confessions.
  </p>
  <ul>
    <li>
      Spectro must have the <span class="badge badge-accent">Send Messages</span> permission in the
      target
      <strong>channel</strong> in order to publish confessions.
    </li>
    <li>
      Spectro should have the <span class="badge badge-accent">Send Messages</span> permission in
      the log
      <strong>channel</strong> in order to forward confession logs.
    </li>
    <li>
      The server moderator setting up the channel must have the <span class="badge badge-accent"
        >Manage Channels</span
      > permission.
    </li>
  </ul>
</section>
<section>
  <h2 id="submit-confessions">Submitting Confessions</h2>
  <p>
    Once a channel has been properly configured, any member with the <span
      class="badge badge-accent">Send Messages</span
    >
    permission can now invoke the {@render command('confess')} command to publish an anonymous confession.
  </p>
  <div class="alert alert-warning">
    <Icon icon={BaselineAnnouncement} width={24} />
    <span>All confessions are logged for moderation purposes.</span>
  </div>
</section>
<section>
  <h2 id="approve-confessions">Approving Confessions</h2>
  <p>
    For channels that require approval, submitted confessions first go through the configured log <strong
      >channel</strong
    >. While a confession is pending approval in the log <strong>channel</strong>, any server
    moderator with the
    <span class="badge badge-accent">Manage Messages</span>
    permission can press the <button class="btn btn-success btn-xs">Publish</button> button or the
    <button class="btn btn-error btn-xs">Delete</button>
    button to moderate the confession.
  </p>
  <p>
    Whenever a pending confession is published/deleted, Spectro logs the timestamp of the
    interaction and the user who triggered the action.
  </p>
  <div class="alert alert-warning">
    <Icon icon={BaselineAnnouncement} width={24} />
    <span
      >If a confession log message has been deleted, there is no way to recover that original
      message. This is especially consequential for pending confessions should these be accidentally
      deleted.</span
    >
  </div>
</section>
<section>
  <h2 id="reply-to-confessions">Replying to Confessions</h2>
  <p>
    Any member with the <span class="badge badge-accent">Send Messages</span> permission can
    anonymously reply to any message in a confessions-enabled <strong>channel</strong>. Simply open
    the context menu on that message (i.e., right-click on desktop and press-and-hold on mobile) and
    then select the
    <a href="/reference/#reply" class="link link-primary">Apps &gt; Reply Anonymously</a> option. A modal
    with a text area input should pop up on the screen, where the anonymous reply can be drafted.
  </p>
  <div class="alert alert-info">
    <Icon icon={BaselineAnnouncement} width={24} />
    <span
      >Attaching a file alongside a message reply is currently unsupported. This feature is blocked
      on Discord finally implementing file select inputs for modal submit components.</span
    >
  </div>
</section>
<section>
  <h2 id="resend-confessions">Resending Confessions</h2>
  <p>
    In the rare occasion when a confession message gets accidentally deleted, any user with the <span
      class="badge badge-accent">Manage Messages</span
    >
    permission can {@render command('resend')} an already approved and published confession. The invoking
    user must be in the same channel that the confession was originally sent.
  </p>
</section>
<section>
  <h2 id="panic-button">The Panic Button: Locking Down Channels</h2>
  <p>
    If the confessions get too heated, server moderators with the <span class="badge badge-accent"
      >Manage Channels</span
    >
    permission can press the panic button and temporarily disable confessions on a channel using the
    {@render command('lockdown')} command. All previous channel settings will be preserved.
  </p>
  <p>
    To re-enable confessions, the {@render command('setup')} command can be invoked again. Note that the
    log
    <strong>channel</strong> is a required argument. The rest of the optional arguments (e.g.,
    <strong>label</strong>, <strong>color</strong>, and <strong>approval</strong>) will be restored
    from the previous invocation of the {@render command('setup')} command.
  </p>
</section>

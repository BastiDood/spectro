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
    Spectro will not post anonymous messages until a moderator sets up a confession channel.
    Moderators use {@render command('setup')} to choose where anonymous messages appear and where private
    moderator logs are sent. The command sets up the current channel by default, or the selected
    <strong>confession-channel</strong> when one is provided.
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
    The configured <strong>log-channel</strong> also helps Spectro keep uploaded files available for approvals
    and resends. Moderators should avoid deleting confession log messages unless they are intentionally
    removing that record.
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
    permission can invoke {@render command('confess')} to post an anonymous confession. The command also
    works inside an existing confession thread, where the message appears in that thread.
  </p>
  <p>
    The confession modal includes an optional <strong>Attachment</strong> field. If you choose to
    upload an image or file, you must have the
    <span class="badge badge-accent">Attach Files</span> permission.
  </p>
  <p>
    Images show inline when possible. Other uploads are kept as files. Spectro uses the moderator
    log to keep those uploads available for approvals, resends, and later viewing.
  </p>
  <p>
    To start a new anonymous public thread from a confession channel, use {@render command(
      'thread',
    )}. The modal asks for a thread title and the anonymous message. If you are already inside a
    confession thread, use {@render command('confess')} instead.
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
    permission can press the <button class="btn btn-xs btn-success">Publish</button> button or the
    <button class="btn btn-xs btn-error">Delete</button>
    button to moderate the confession.
  </p>
  <p>
    Whenever a pending confession is published/deleted, Spectro logs the timestamp of the
    interaction and the user who triggered the action.
  </p>
  <p>
    For posts with attachments, approval uses the file kept by the moderator log. Older posts from
    before this attachment flow may no longer be approvable if Discord no longer has the original
    upload.
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
    anonymously reply to a message in a confessions-enabled <strong>channel</strong>. Open the
    context menu on that message (i.e., right-click on desktop and press-and-hold on mobile) and
    then select the
    <a href="/reference/#reply" class="link link-primary">Apps &gt; Reply Anonymously</a> option. This
    posts a normal anonymous reply to the selected message.
  </p>
  <p>
    You can also choose <strong>Apps &gt; Reply as Anonymous Thread</strong> to start a new anonymous
    thread from the selected message. This is for messages in the main confession channel, not for messages
    already inside threads. In channels that require approval, use the normal reply flow instead because
    Spectro cannot create the thread before moderators approve it.
  </p>
  <p>
    Like confessions, replies can include an optional <strong>Attachment</strong>. If you upload an
    image or file, the
    <span class="badge badge-accent">Attach Files</span> permission is required.
  </p>
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
  <p>
    Resends reuse the file kept by the moderator log when one is available. Older posts with
    attachments may no longer be resendable if Discord no longer has the original upload.
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
    <strong>log-channel</strong> is a required argument. The <strong>confession-channel</strong> is
    an optional override that selects a different channel to re-enable. The rest of the optional
    arguments (e.g., <strong>label</strong>, <strong>color</strong>, and <strong>approval</strong>)
    will be restored from the previous invocation of the {@render command('setup')} command.
  </p>
</section>

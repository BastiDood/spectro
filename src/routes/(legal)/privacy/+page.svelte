<script lang="ts">
  import Icon from '@iconify/svelte';

  import BaselineInfo from '@iconify-icons/ic/baseline-info';
</script>

<div class="not-prose alert alert-info">
  <Icon icon={BaselineInfo} width={24} />
  <span>Last updated on <time datetime="2026-01-16">January 16, 2026</time>.</span>
</div>

<br />

<h1>Privacy Policy</h1>
<p>
  This document details all of the information collected by the <code>Spectro#3767</code> (Discord
  User ID:
  <code>1310159012234264617</code>) bot—hereon referred to as the <strong>"Bot"</strong>—about you
  (the
  <strong>"User"</strong>). For any concerns regarding the privacy policy, kindly
  <a rel="external" target="_blank" href="https://github.com/BastiDood/spectro/issues/new"
    >create a new issue</a
  >
  in the
  <a rel="external" target="_blank" href="https://github.com/BastiDood/spectro">GitHub repository</a
  >.
</p>
<p>
  First and foremost, as the Bot is a Discord bot, usage of the Bot transitively implies the usage
  of the Discord platform. As such, <a
    rel="external"
    target="_blank"
    href="https://discord.com/privacy">Discord's Privacy Policy</a
  >
  is a relevant document for other data usage that this document omits by implication. Although the Bot
  does not collect everything that the Discord platform does, this is still worth noting for completeness.
</p>

<h2>Logged Data</h2>
<p>
  As far as first-party data collection is concerned, the Bot logs most of the data provided by the
  Discord platform whenever a <a href="/reference/">command</a> is invoked. Specifically, for each
  time that the Bot is authorized, the Discord platform pings the Bot about the installation
  information. This includes data
  <a
    rel="external"
    target="_blank"
    href="https://discord.com/developers/docs/events/webhook-events#application-authorized"
    >(among others)</a
  > such as:
</p>
<ul>
  <li>
    The user who installed the Bot. This includes the user ID, the username, the user avatar URL,
    the user roles in the guild, and <a
      rel="external"
      target="_blank"
      href="https://discord.com/developers/docs/resources/user#user-object-user-structure"
      >other fields</a
    >
    (except the <code>email</code>-related ones).
  </li>
  <li>
    The Discord guild (also colloquially known as the <strong>"Server"</strong>) in which the Bot is
    now installed. This includes the guild ID, the guild name, the guild icon, the guild splash
    banner URL, and
    <a
      rel="external"
      target="_blank"
      href="https://discord.com/developers/docs/resources/guild#guild-object-guild-structure"
    >
      other fields</a
    >.
  </li>
</ul>
<p>
  Moreover, for each time that a user invokes the <a href="/reference/">Bot's commands</a>, the
  Discord platform pings the Bot about the invocation context. This includes data
  <a
    rel="external"
    target="_blank"
    href="https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-response-object"
    >(among others)</a
  > such as:
</p>
<ul>
  <li>
    The user who invoked the Bot command. This includes the user ID, the username, the user avatar
    URL, the user roles in the guild, and <a
      rel="external"
      target="_blank"
      href="https://discord.com/developers/docs/resources/guild#guild-member-object">other fields</a
    >
    (except the <code>email</code>-related ones)
  </li>
  <li>The guild ID of Server in which the Bot command was invoked.</li>
  <li>The ID of the channel in which the Bot command was invoked.</li>
</ul>
<p>
  Logs are only retained for up to 30 days—after which they are deleted. These logs are essential
  for monitoring the Bot's health and performance. Should any bugs arise, the logs also provide the
  pertinent context that is necessary for resolving them.
</p>

<h2>Persisted Data</h2>
<p>
  As an "anonymous" confession bot for Discord, it must be clarified what is meant by the word
  "anonymous" in the Bot's context. To aid in server moderation, the Bot persists all user-generated
  confessions in a database that can only be viewed by server moderators and bot developers. With
  that said, anonymity is limited with respect to the visibility of regular members in a Server.
  That is to say, anonymity is preserved in so far that unauthorized and untrusted persons are kept
  out of the system.
</p>
<p>
  <strong>Important:</strong> Anonymity is a convenience feature, not a security guarantee. Users should
  not submit content they would not want associated with their identity under any circumstances.
</p>
<p>
  Concretely, each persisted confession (for the purposes of effective server moderation) includes
  the following data:
</p>
<ul>
  <li>Time of submission.</li>
  <li>User-generated text in the confession.</li>
  <li>User-generated URLs to uploaded attachments via the Discord platform.</li>
  <li>Discord user ID of the confessor.</li>
  <li>Discord channel ID in which the confession was submitted.</li>
</ul>

<h2>Data Retention</h2>
<ul>
  <li><strong>Logs:</strong> Retained for up to 30 days, then automatically deleted.</li>
  <li>
    <strong>Confessions:</strong> Retained indefinitely until (a) you request deletion, (b) the guild
    removes the Bot, or (c) the guild is deleted from Discord.
  </li>
  <li><strong>Guild data:</strong> Deleted when the Bot is removed from the guild.</li>
</ul>

<h2>Third Parties</h2>
<p>
  The Bot relies on the following third-party service providers to operate. Each provider has their
  own privacy policy governing how they handle data.
</p>

<h3>Hosting and Database</h3>
<ul>
  <li>
    <a rel="external" target="_blank" href="https://vercel.com/legal/privacy-policy">Vercel</a>
    — hosts the application and serves all web requests.
  </li>
  <li>
    <a rel="external" target="_blank" href="https://neon.com/privacy-policy">Neon</a>
    — provides the serverless PostgreSQL database where all confession data is stored.
  </li>
</ul>

<h3>Orchestration and Observability</h3>
<ul>
  <li>
    <a rel="external" target="_blank" href="https://www.inngest.com/privacy">Inngest</a>
    — manages background job orchestration for processing confessions asynchronously.
  </li>
  <li>
    <a rel="external" target="_blank" href="https://pydantic.dev/legal/privacy-policy">Logfire</a>
    — provides application observability, logging, and performance monitoring.
  </li>
</ul>

<h3>Data Isolation</h3>
<p>
  User-generated confession content is <strong>strictly isolated</strong> between the application
  (hosted on Vercel) and the database (hosted on Neon). External services used for orchestration
  (Inngest) and observability (Logfire) only receive internal identifiers and operational metadata
  (e.g., timestamps, channel IDs) for correlation and monitoring purposes.
  <strong
    >No confession text or user-submitted content is ever transmitted to these services.</strong
  >
</p>

<h2>International Data Transfers</h2>
<p>
  Your data may be transferred to and processed in countries outside your jurisdiction, including
  the United States (where Vercel, Neon, Inngest, and Logfire operate). These providers maintain
  their own data protection measures as described in their respective privacy policies linked above.
</p>

<h2>Legal Basis for Processing</h2>
<p>We process your data under the following legal bases:</p>
<ul>
  <li>
    <strong>Legitimate interests:</strong> Operating and improving the Service, preventing abuse.
  </li>
  <li><strong>Consent:</strong> By using the Bot, you consent to this processing.</li>
  <li>
    <strong>Legal obligation:</strong> Complying with applicable laws and valid legal requests.
  </li>
</ul>

<h2>Your Rights</h2>
<p>Depending on your jurisdiction, you may have the right to:</p>
<ul>
  <li>Access the personal data we hold about you.</li>
  <li>Request correction of inaccurate data.</li>
  <li>Request deletion of your data ("right to be forgotten").</li>
  <li>Object to or restrict certain processing.</li>
  <li>Data portability (receive your data in a structured format).</li>
  <li>Lodge a complaint with your local data protection authority.</li>
</ul>
<p>
  To exercise these rights, contact us via
  <a rel="external" href="mailto:39114273+BastiDood@users.noreply.github.com">email</a> with your Discord
  User ID and other pertinent details about your request.
</p>

<h2>Security</h2>
<p>
  We implement appropriate technical measures to protect your data, including encryption in transit
  (TLS/HTTPS), access controls, and secure authentication. However, no system is completely secure,
  and we cannot guarantee absolute security.
</p>

<h2>Data Breach Notification</h2>
<p>
  In the event of a data breach affecting your personal information, we will notify affected users
  and relevant authorities as required by applicable law.
</p>

<h2>Children's Privacy</h2>
<p>
  The Service is not intended for users under 13 years of age (or the minimum age required by
  Discord in your jurisdiction). We do not knowingly collect personal information from children. If
  you believe a child has provided us with personal data, please contact us for deletion.
</p>

<h2>Disclosure to Authorities</h2>
<p>
  We may disclose your information if required by law, subpoena, court order, or other valid legal
  process, or when we believe disclosure is necessary to protect our rights, your safety, or the
  safety of others.
</p>

<h2>Data Deletion</h2>
<p>To request deletion of your data:</p>
<ol>
  <li>
    Email
    <a rel="external" href="mailto:39114273+BastiDood@users.noreply.github.com"
      ><code>39114273+BastiDood@users.noreply.github.com</code></a
    > with your Discord User ID.
  </li>
  <li>
    Alternatively,
    <a rel="external" target="_blank" href="https://github.com/BastiDood/spectro/issues/new"
      >open a GitHub issue</a
    >.
  </li>
</ol>
<p>We will respond within 30 days. Note:</p>
<ul>
  <li>Server moderators retain their own moderation logs independently.</li>
  <li>Some data may be retained as required by law or for legitimate dispute resolution.</li>
  <li>Deletion of your confessions requires coordination with the relevant server moderators.</li>
</ul>

<h2>California Residents</h2>
<p>
  We do not sell personal information as defined under the California Consumer Privacy Act (CCPA).
</p>

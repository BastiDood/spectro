<h1>Privacy Policy</h1>
<p>
    This document details all of the information collected by the <code>Spectro#3767</code> (Discord User ID:
    <code>1310159012234264617</code>) bot—hereon referred to as the <strong>"Bot"</strong>—about you (the
    <strong>"User"</strong>). For any concerns regarding the privacy policy, kindly
    <a rel="external" target="_blank" href="https://github.com/BastiDood/spectro/issues/new">create a new issue</a> in
    the
    <a rel="external" target="_blank" href="https://github.com/BastiDood/spectro">GitHub repository</a>.
</p>
<p>
    First and foremost, as the Bot is a Discord bot, usage of the Bot transitively implies the usage of the Discord
    platform. As such, <a rel="external" target="_blank" href="https://discord.com/privacy">Discord's Privacy Policy</a>
    is a relevant document for other data usage that this document omits by implication. Although the Bot does not collect
    everything that the Discord platform does, this is still worth noting for completeness.
</p>

<h2>Logged Data</h2>
<p>
    As far as first-party data collection is concerned, the Bot logs most of the data provided by the Discord platform
    whenever a <a href="/reference/">command</a> is invoked. Specifically, for each time that the Bot is authorized, the
    Discord platform pings the Bot about the installation information. This includes data
    <a
        rel="external"
        target="_blank"
        href="https://discord.com/developers/docs/events/webhook-events#application-authorized">(among others)</a
    > such as:
</p>
<ul>
    <li>
        The user who installed the Bot. This includes the user ID, the username, the user avatar URL, the user roles in
        the guild, and <a
            rel="external"
            target="_blank"
            href="https://discord.com/developers/docs/resources/user#user-object-user-structure">other fields</a
        >
        (except the <code>email</code>-related ones).
    </li>
    <li>
        The Discord guild (also colloquially known as the <strong>"Server"</strong>) in which the Bot is now installed.
        This includes the guild ID, the guild name, the guild icon, the guild splash banner URL, and
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
    Moreover, for each time that a user invokes the <a href="/reference/">Bot's commands</a>, the Discord platform pings
    the Bot about the invocation context. This includes data
    <a
        rel="external"
        target="_blank"
        href="https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-response-object"
        >(among others)</a
    > such as:
</p>
<ul>
    <li>
        The user who invoked the Bot command. This includes the user ID, the username, the user avatar URL, the user
        roles in the guild, and <a
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
    Logs are only retained for up to 30 days—after which they are deleted. These logs are essential for monitoring the
    Bot's health and performance. Should any bugs arise, the logs also provide the pertinent context that is necessary
    for resolving them.
</p>

<h2>Persisted Data</h2>
<p>
    As an "anonymous" confession bot for Discord, it must clarified what is meant by the word "anonymous" in the Bot's
    context. To aid in server moderation, the Bot persists all user-generated confessions in a database that can only be
    viewed by server moderators and bot developers. With that said, anonymity is limited with respect to the visibility
    of regular members in a Server. That is to say, anonymity is preserved in so far that unauthorized and untrusted
    persons are kept out of the system.
</p>
<p>
    Concretely, each persisted confession (for the purposes of effective server moderation) includes the following data:
</p>
<ul>
    <li>Time of submission.</li>
    <li>User-generated text in the confession.</li>
    <li>User-generated URLs to uploaded attachments via the Discord platform.</li>
    <li>Discord user ID of the confessor.</li>
    <li>Discord channel ID in which the confession was submitted.</li>
</ul>

<h2>Third Parties</h2>
<p>The Bot does not share any data with third parties.</p>

<h2>Data Deletion</h2>
<p>
    Should the User wish to have their data deleted, they must coordinate the bot maintainer (via <a
        rel="external"
        href="mailto:39114273+BastiDood@users.noreply.github.com">email</a
    >) and the concerned server moderators.
</p>

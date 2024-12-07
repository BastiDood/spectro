import assert from 'node:assert/strict';

const { DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN } = process.env;
assert(typeof DISCORD_APPLICATION_ID !== 'undefined', 'missing discord application id');
assert(typeof DISCORD_BOT_TOKEN !== 'undefined', 'missing discord bot token');

const response = await fetch(`https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`, {
    method: 'PUT',
    headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify([
        {
            type: 1,
            name: 'info',
            description: 'Learn more about the bot.',
            integration_types: [0, 1],
            contexts: [0, 1, 2],
            options: [
                {
                    type: 5,
                    name: 'public',
                    description: 'Send the help message publicly. Disabled by default.',
                },
            ],
        },
        {
            type: 1,
            name: 'help',
            description: 'Open the help page.',
            integration_types: [0, 1],
            contexts: [0, 1, 2],
            options: [
                {
                    type: 5,
                    name: 'public',
                    description: 'Send the help message publicly. Disabled by default.',
                },
            ],
        },
        {
            type: 1,
            name: 'confess',
            description: 'Send an anonymous confession.',
            default_member_permissions: (1 << 11).toString(),
            integration_types: [0],
            contexts: [0],
            options: [
                {
                    type: 3,
                    required: true,
                    name: 'content',
                    description: 'The content of the actual confession.',
                },
            ],
        },
        {
            type: 3,
            name: 'Reply Anonymously',
            default_member_permissions: (1 << 11).toString(),
            integration_types: [0],
            contexts: [0],
        },
        {
            type: 1,
            name: 'setup',
            description: 'Enable confessions for this channel.',
            default_member_permissions: (1 << 4).toString(),
            integration_types: [0],
            contexts: [0],
            options: [
                {
                    type: 7,
                    name: 'channel',
                    required: true,
                    description: 'The channel to which all confession logs and approval requests will be sent.',
                },
                {
                    type: 3,
                    name: 'label',
                    description: 'A label to use for the confession. Defaults to "Confession".',
                },
                {
                    type: 3,
                    name: 'color',
                    description: 'A hex-encoded RGB color to use for highlighting confession embeds.',
                    min_length: 6,
                    max_length: 6,
                },
                {
                    type: 5,
                    name: 'approval',
                    description:
                        'Sets whether approval is required before confession publication in this channel. Defaults to false.',
                },
            ],
        },
        {
            type: 1,
            name: 'lockdown',
            description: 'Temporarily disable confessions for this channel. Previous settings are remembered.',
            default_member_permissions: (1 << 4).toString(),
            integration_types: [0],
            contexts: [0],
        },
        {
            type: 1,
            name: 'resend',
            description:
                'Resend a confession by its ID. This is useful when the original message was accidentally deleted.',
            default_member_permissions: (1 << 13).toString(),
            integration_types: [0],
            contexts: [0],
            options: [
                {
                    type: 4,
                    required: true,
                    name: 'confession',
                    min_value: 1,
                    description: 'A label to use for the confession. Defaults to "Confession".',
                },
            ],
        },
    ]),
});

const json = await response.json();
console.dir(json, { depth: Infinity });

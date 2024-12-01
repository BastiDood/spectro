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
            name: 'confess',
            description: 'Send an anonymous confession.',
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
            type: 1,
            name: 'setup',
            description: 'Enable confessions for this channel.',
            integration_types: [0],
            contexts: [0],
            options: [
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
            integration_types: [0],
            contexts: [0],
        },
        {
            type: 1,
            name: 'resend',
            description:
                'Resend a confession by its ID. This is useful when the original message was accidentally deleted.',
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
        {
            type: 1,
            name: 'set',
            description: 'Set the permissions for a guild member.',
            integration_types: [0],
            contexts: [0],
            options: [
                {
                    type: 1,
                    name: 'member',
                    description: 'Set the user to be a regular member.',
                    options: [
                        {
                            type: 6,
                            name: 'user',
                            required: true,
                            description: 'The user to be set as a regular member.',
                        },
                    ],
                },
                {
                    type: 1,
                    name: 'moderator',
                    description: 'Set the user to be a confession moderator.',
                    options: [
                        {
                            type: 6,
                            name: 'user',
                            required: true,
                            description: 'The user to be set as a confession moderator.',
                        },
                    ],
                },
                {
                    type: 1,
                    name: 'administrator',
                    description: 'Set the user to be a confession administrator.',
                    options: [
                        {
                            type: 6,
                            name: 'user',
                            required: true,
                            description: 'The user to be set as a confession administrator.',
                        },
                    ],
                },
            ],
        },
        {
            type: 3,
            name: 'Reply Anonymously',
            integration_types: [0],
            contexts: [0],
        },
    ]),
});

const json = await response.json();
console.dir(json, { depth: Infinity });

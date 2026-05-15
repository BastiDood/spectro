def main [profile?: string] {
    # Load environment variables from a TOML-like `.env` file.
    open '.env' | from toml | load-env
    if $profile != null { open $'.env.($profile)' | from toml | load-env }
    open --raw 'discord.json' | http put --content-type 'application/json' --headers { Authorization: $'Bot ($env.DISCORD_BOT_TOKEN)' } $'https://discord.com/api/v10/applications/($env.DISCORD_APPLICATION_ID)/commands'
}

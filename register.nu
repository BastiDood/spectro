def main [profile?: string] {
    # Load environment variables from a TOML-like `.env` file.
    let file = if $profile == null { '.env' } else { $'.env.($profile)' }
    open $file | from toml | load-env
    ^curl --request 'PUT' --header 'Content-Type: application/json' --header $'Authorization: Bot ($env.DISCORD_BOT_TOKEN)' --data '@discord.json' $'https://discord.com/api/v10/applications/($env.DISCORD_APPLICATION_ID)/commands'
}

# Spectro

Spectro is a Discord bot for anonymous confessions with moderation logging. Built with SvelteKit + PostgreSQL + Inngest for background jobs.

> [!IMPORTANT]
> After building features, you MUST run `pnpm lint` followed by `pnpm fmt:fix` to uphold codebase conventions.

## Development Workflow

After building features, you must run the following commands to ensure the codebase is consistent and follows the conventions:

```shell
# Run auto-fixers for ESLint and Prettier
pnpm lint:eslint --fix
pnpm lint:svelte
pnpm fmt:fix
```

## Code Conventions

- Discriminated unions with explicit `interface` types
- `switch` for union discrimination, not `if` chains
- `const enum` for string constants
- Prefer type inference over explicit return types
- Runtime non-null assertions (no `!` operator)
- Use `assert` from `node:assert/strict` for runtime checks
- Avoid double negation in conditional code

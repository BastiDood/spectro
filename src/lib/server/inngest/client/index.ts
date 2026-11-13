import { DiscordError } from '#lib/server/models/discord/errors.ts';
import { extendedTracesMiddleware } from 'inngest/experimental';
import { Inngest, Middleware } from 'inngest';
import { Logger } from '#lib/server/telemetry/logger/index.ts';

import { version } from '$app/env';

import { InngestLogger } from './logger.ts';

class DiscordStepErrorMiddlewareError extends Middleware.BaseMiddleware {
  static readonly #logger = Logger.byName('inngest.steps');
  readonly id = 'spectro-discord-step-errors';

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this -- Inngest calls this instance hook for failed steps.
  override onStepError({ error, stepInfo }: Middleware.OnStepErrorArgs) {
    // Step handlers record the errors they recover from or translate. Record bare Discord errors here.
    if (error instanceof DiscordError)
      DiscordStepErrorMiddlewareError.#logger.error(
        'Discord rejected the request',
        'spectro.inngest.step.discord_request.exception',
        {
          'spectro.discord.error.code': error.code,
          'spectro.inngest.step.id': stepInfo.options.id,
        },
        error,
      );
  }
}

const logger = new InngestLogger({});

export const inngest = new Inngest({
  id: 'spectro',
  optimizeParallelism: true,
  checkpointing: { maxRuntime: '50s' },
  middleware: [extendedTracesMiddleware({ behaviour: 'off' }), DiscordStepErrorMiddlewareError],
  appVersion: version,
  logger,
  internalLogger: logger,
});

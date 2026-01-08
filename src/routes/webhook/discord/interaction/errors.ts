import type { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { InteractionApplicationCommandType } from '$lib/server/models/discord/interaction/application-command/base';
import { Logger } from '$lib/server/telemetry/logger';
import type { MessageComponentButtonStyle } from '$lib/server/models/discord/message/component/button/base';

const SERVICE_NAME = 'webhook.interaction.error';
const logger = Logger.byName(SERVICE_NAME);

export class UnexpectedApplicationCommandChatInputNameError extends Error {
  constructor(public commandName: string) {
    super(`unexpected application command chat input name ${commandName}`);
    this.name = 'UnexpectedApplicationCommandChatInputNameError';
  }

  static throwNew(commandName: string): never {
    const error = new UnexpectedApplicationCommandChatInputNameError(commandName);
    logger.error('unexpected application command chat input name', error, {
      'error.command.name': commandName,
    });
    throw error;
  }
}

export class UnexpectedApplicationCommandMessageNameError extends Error {
  constructor(public commandName: string) {
    super(`unexpected interaction application command message name ${commandName}`);
    this.name = 'UnexpectedApplicationCommandMessageNameError';
  }

  static throwNew(commandName: string): never {
    const error = new UnexpectedApplicationCommandMessageNameError(commandName);
    logger.error('unexpected interaction application command message name', error, {
      'error.command.name': commandName,
    });
    throw error;
  }
}

export class UnexpectedApplicationCommandTypeError extends Error {
  constructor(public commandType: InteractionApplicationCommandType) {
    super(`unexpected interaction application command type ${commandType}`);
    this.name = 'UnexpectedApplicationCommandTypeError';
  }

  static throwNew(commandType: InteractionApplicationCommandType): never {
    const error = new UnexpectedApplicationCommandTypeError(commandType);
    logger.error('unexpected interaction application command type', error, {
      'error.command.type': commandType,
    });
    throw error;
  }
}

export class UnexpectedModalSubmitError extends Error {
  constructor(public customId: string) {
    super(`unexpected modal submit ${customId}`);
    this.name = 'UnexpectedModalSubmitError';
  }

  static throwNew(customId: string): never {
    const error = new UnexpectedModalSubmitError(customId);
    logger.error('unexpected modal submit', error, {
      'error.custom.id': customId,
    });
    throw error;
  }
}

export class UnexpectedSetupArgumentError extends Error {
  constructor(public argumentName: string) {
    super(`unexpected setup argument ${argumentName}`);
    this.name = 'UnexpectedSetupArgumentError';
  }

  static throwNew(argumentName: string): never {
    const error = new UnexpectedSetupArgumentError(argumentName);
    logger.error('unexpected setup argument', error, {
      'error.argument.name': argumentName,
    });
    throw error;
  }
}

export class UnexpectedSetupOptionTypeError extends Error {
  constructor(public optionType: InteractionApplicationCommandChatInputOptionType) {
    super(`unexpected option type ${optionType} encountered`);
    this.name = 'UnexpectedSetupOptionTypeError';
  }

  static throwNew(optionType: InteractionApplicationCommandChatInputOptionType): never {
    const error = new UnexpectedSetupOptionTypeError(optionType);
    logger.error('unexpected option type encountered', error, {
      'error.option.type': optionType,
    });
    throw error;
  }
}

export class UnexpectedDiscordErrorCode extends Error {
  constructor(public code: number) {
    super(`unexpected discord error code ${code}`);
    this.name = 'UnexpectedDiscordErrorCode';
  }

  static throwNew(code: number): never {
    const error = new UnexpectedDiscordErrorCode(code);
    logger.error('unexpected discord error code', error, {
      'error.code': code,
    });
    throw error;
  }
}

export class UnexpectedMessageComponentButtonStyle extends Error {
  constructor(public style: MessageComponentButtonStyle) {
    super(`unexpected message component button style ${style}`);
    this.name = 'UnexpectedMessageComponentButtonStyle';
  }

  static throwNew(style: MessageComponentButtonStyle): never {
    const error = new UnexpectedMessageComponentButtonStyle(style);
    logger.error('unexpected message component button style', error, {
      'error.style': style,
    });
    throw error;
  }
}

export class MalformedCustomIdFormat extends Error {
  constructor(public key: string) {
    super(`malformed custom id has key ${key}`);
    this.name = 'MalformedCustomIdFormat';
  }

  static throwNew(key: string): never {
    const error = new MalformedCustomIdFormat(key);
    logger.error('malformed custom id format', error, {
      'error.key': key,
    });
    throw error;
  }
}

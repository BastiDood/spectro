import type { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { InteractionApplicationCommandType } from '$lib/server/models/discord/interaction/application-command/base';
import { Logger } from '$lib/server/telemetry/logger';
import type { MessageComponentButtonStyle } from '$lib/server/models/discord/message/component/button/base';

const SERVICE_NAME = 'webhook.interaction.error';
const logger = Logger.byName(SERVICE_NAME);

export class UnexpectedApplicationCommandChatInputNameError extends Error {
  constructor(public readonly commandName: string) {
    super(`Unexpected application command chat input name: ${commandName}.`);
    this.name = 'UnexpectedApplicationCommandChatInputNameError';
  }

  static throwNew(commandName: string): never {
    const error = new UnexpectedApplicationCommandChatInputNameError(commandName);
    logger.error(
      error.message,
      'spectro.discord.interaction.command_chat_input.unexpected',
      { 'spectro.discord.command.name': error.commandName },
      error,
    );
    throw error;
  }
}

export class UnexpectedApplicationCommandMessageNameError extends Error {
  constructor(public readonly commandName: string) {
    super(`Unexpected interaction application command message name: ${commandName}.`);
    this.name = 'UnexpectedApplicationCommandMessageNameError';
  }

  static throwNew(commandName: string): never {
    const error = new UnexpectedApplicationCommandMessageNameError(commandName);
    logger.error(
      error.message,
      'spectro.discord.interaction.command_message.unexpected',
      { 'spectro.discord.command.name': error.commandName },
      error,
    );
    throw error;
  }
}

export class UnexpectedApplicationCommandTypeError extends Error {
  constructor(public readonly commandType: InteractionApplicationCommandType) {
    super(`Unexpected interaction application command type: ${commandType}.`);
    this.name = 'UnexpectedApplicationCommandTypeError';
  }

  static throwNew(commandType: InteractionApplicationCommandType): never {
    const error = new UnexpectedApplicationCommandTypeError(commandType);
    logger.error(
      error.message,
      'spectro.discord.interaction.command_type.unexpected',
      { 'spectro.discord.command.type': error.commandType },
      error,
    );
    throw error;
  }
}

export class UnexpectedSetupArgumentError extends Error {
  constructor(public readonly argumentName: string) {
    super(`Unexpected setup argument: ${argumentName}.`);
    this.name = 'UnexpectedSetupArgumentError';
  }

  static throwNew(argumentName: string): never {
    const error = new UnexpectedSetupArgumentError(argumentName);
    logger.error(
      error.message,
      'spectro.discord.interaction.setup_argument.unexpected',
      { 'spectro.discord.setup_argument.name': error.argumentName },
      error,
    );
    throw error;
  }
}

export class UnexpectedSetupOptionTypeError extends Error {
  constructor(public readonly optionType: InteractionApplicationCommandChatInputOptionType) {
    super(`Unexpected application command option type: ${optionType}.`);
    this.name = 'UnexpectedSetupOptionTypeError';
  }

  static throwNew(optionType: InteractionApplicationCommandChatInputOptionType): never {
    const error = new UnexpectedSetupOptionTypeError(optionType);
    logger.error(
      error.message,
      'spectro.discord.interaction.command_option_type.unexpected',
      { 'spectro.discord.command_option.type': error.optionType },
      error,
    );
    throw error;
  }
}

export class UnexpectedDiscordErrorCode extends Error {
  constructor(public readonly code: number) {
    super(`Unexpected Discord error code: ${code}.`);
    this.name = 'UnexpectedDiscordErrorCode';
  }

  static throwNew(code: number): never {
    const error = new UnexpectedDiscordErrorCode(code);
    logger.error(
      error.message,
      'spectro.discord.interaction.discord_error_code.unexpected',
      { 'spectro.discord.error.code': error.code },
      error,
    );
    throw error;
  }
}

export class UnexpectedMessageComponentButtonStyle extends Error {
  constructor(public readonly style: MessageComponentButtonStyle) {
    super(`Unexpected message component button style: ${style}.`);
    this.name = 'UnexpectedMessageComponentButtonStyle';
  }

  static throwNew(style: MessageComponentButtonStyle): never {
    const error = new UnexpectedMessageComponentButtonStyle(style);
    logger.error(
      error.message,
      'spectro.discord.interaction.message_component_button_style.unexpected',
      { 'spectro.discord.message_component_button.style': error.style },
      error,
    );
    throw error;
  }
}

export class MalformedCustomIdFormat extends Error {
  constructor(public readonly key: string) {
    super(`Malformed custom ID contains key: ${key}.`);
    this.name = 'MalformedCustomIdFormat';
  }

  static throwNew(key: string): never {
    const error = new MalformedCustomIdFormat(key);
    logger.error(
      error.message,
      'spectro.discord.interaction.custom_id.malformed',
      { 'spectro.discord.custom_id.key': error.key },
      error,
    );
    throw error;
  }
}

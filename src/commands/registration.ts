import { ApplicationCommandType, EntryPointCommandHandlerType } from 'discord.js';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : undefined;
}

export interface EntryPointCommand {
  id: string;
  name: string;
  description: string;
  type: ApplicationCommandType.PrimaryEntryPoint;
  handler: EntryPointCommandHandlerType;
}

export function findEntryPointCommand(commands: unknown): EntryPointCommand | undefined {
  if (!Array.isArray(commands)) return undefined;
  for (const value of commands) {
    const command = record(value);
    if (command?.type !== ApplicationCommandType.PrimaryEntryPoint) continue;
    if (typeof command.id !== 'string' || typeof command.name !== 'string') continue;
    return {
      id: command.id,
      name: command.name,
      description: typeof command.description === 'string' ? command.description : 'Factole 플레이',
      type: ApplicationCommandType.PrimaryEntryPoint,
      handler:
        command.handler === EntryPointCommandHandlerType.AppHandler
          ? EntryPointCommandHandlerType.AppHandler
          : EntryPointCommandHandlerType.DiscordLaunchActivity,
    };
  }
  return undefined;
}

export function preserveEntryPointCommand<T>(
  commands: readonly T[],
  existingCommands: unknown,
): (T | Omit<EntryPointCommand, 'id'>)[] {
  const entryPoint = findEntryPointCommand(existingCommands);
  if (!entryPoint) return [...commands];
  return [
    ...commands,
    {
      name: entryPoint.name,
      description: entryPoint.description,
      type: entryPoint.type,
      handler: entryPoint.handler,
    },
  ];
}

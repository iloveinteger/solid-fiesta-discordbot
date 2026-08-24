import { ApplicationCommandType, EntryPointCommandHandlerType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { findEntryPointCommand, preserveEntryPointCommand } from '../src/commands/registration.js';

describe('Discord 명령 등록', () => {
  it('기존 Activity Entry Point를 전역 명령 일괄 등록에 포함한다', () => {
    const existing = [
      {
        id: 'activity-command-id',
        name: 'factole',
        description: 'Factole 플레이',
        type: ApplicationCommandType.PrimaryEntryPoint,
        handler: EntryPointCommandHandlerType.DiscordLaunchActivity,
      },
    ];

    expect(preserveEntryPointCommand([{ name: 'dice', type: 1 }], existing)).toEqual([
      { name: 'dice', type: 1 },
      {
        name: 'factole',
        description: 'Factole 플레이',
        type: ApplicationCommandType.PrimaryEntryPoint,
        handler: EntryPointCommandHandlerType.DiscordLaunchActivity,
      },
    ]);
  });

  it('Activity Entry Point가 없으면 기존 명령만 유지한다', () => {
    expect(preserveEntryPointCommand([{ name: 'dice' }], [])).toEqual([{ name: 'dice' }]);
    expect(findEntryPointCommand('invalid')).toBeUndefined();
  });
});

import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { CommandHandler, type CommandDependencies } from '../src/commands/command-handler.js';
import { commandData } from '../src/commands/definitions.js';

describe('슬래시 명령 정의', () => {
  it('Factole 링크 명령을 등록한다', () => {
    expect(commandData.map((command) => command.name)).toContain('factole');
  });

  it('제곱수놀이에는 first 옵션이 없다', () => {
    const square = commandData.find((command) => command.name === 'square');
    expect(square).toBeDefined();
    expect(JSON.stringify(square)).not.toContain('"name":"first"');
  });

  it('/factole은 링크 메시지 대신 Discord Activity를 실행한다', async () => {
    const launchActivity = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      commandName: 'factole',
      launchActivity,
    } as unknown as ChatInputCommandInteraction;
    const handler = new CommandHandler({} as CommandDependencies);

    await handler.handleCommand(interaction);

    expect(launchActivity).toHaveBeenCalledOnce();
  });
});

import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
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

  it('사전 상세 버튼은 원본 검색 메시지를 공개 상세 결과로 교체한다', async () => {
    const deferUpdate = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      customId: 'dict:detail:123',
      deferUpdate,
      editReply,
    } as unknown as ButtonInteraction;
    const dependencies = {
      squareGames: { ownsButton: vi.fn(() => false) },
      binaryGames: { ownsButton: vi.fn(() => false) },
      dictionary: {
        detail: vi.fn().mockResolvedValue({
          word: '눈',
          pronunciation: ['눈'],
          origins: [],
          senses: [{ partOfSpeech: '명사', definition: '보는 기관.', examples: [] }],
        }),
      },
    } as unknown as CommandDependencies;

    await new CommandHandler(dependencies).handleButton(interaction);

    expect(deferUpdate).toHaveBeenCalledOnce();
    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({ components: [] }));
  });
});

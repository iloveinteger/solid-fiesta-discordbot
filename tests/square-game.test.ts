import type { ChatInputCommandInteraction, Message } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifySquareSubmission,
  SquareGameManager,
} from '../src/services/square-game-manager.js';

describe('제곱수놀이 채팅 입력', () => {
  it('숫자가 아닌 일반 채팅은 무시한다', () => {
    expect(classifySquareSubmission('안녕하세요', 9n)).toBe('ignore');
  });

  it('정답과 재도전 가능한 오답을 구분한다', () => {
    expect(classifySquareSubmission(' 9 ', 9n)).toBe('correct');
    expect(classifySquareSubmission('8', 9n)).toBe('wrong');
  });
});

describe('제곱수놀이 현황 메시지', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('동시 상태 변경도 직렬화해 매번 직전 현황 하나만 삭제하고 새로 보낸다', async () => {
    vi.useFakeTimers();
    const deleted: string[] = [];
    let sequence = 0;
    const makeStatus = (id: string) => ({
      id,
      delete: vi.fn(() => {
        deleted.push(id);
        return Promise.resolve();
      }),
    });
    const placeholder = makeStatus('status-0');
    const send = vi.fn(() => Promise.resolve(makeStatus(`status-${++sequence}`)));
    const channel = { isSendable: () => true, send };
    const interaction = {
      channelId: 'channel-1',
      channel,
      user: { id: 'user-1' },
      options: { getString: vi.fn(() => 'bot') },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(placeholder),
    } as unknown as ChatInputCommandInteraction;
    const manager = new SquareGameManager();

    await manager.start(interaction);
    const wrongMessage = (content: string) =>
      ({
        author: { bot: false, id: 'user-1' },
        channelId: 'channel-1',
        content,
        inGuild: () => true,
      }) as unknown as Message;
    await Promise.all([
      manager.handleMessage(wrongMessage('2')),
      manager.handleMessage(wrongMessage('3')),
    ]);

    expect(send).toHaveBeenCalledTimes(3);
    expect(deleted).toEqual(['status-0', 'status-1', 'status-2']);
  });

  it('직전 현황 삭제가 실패해도 게임 시작과 새 현황 전송을 유지한다', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const placeholder = {
      id: 'status-0',
      delete: vi.fn().mockRejectedValue(new Error('missing message')),
    };
    const channel = {
      isSendable: () => true,
      send: vi.fn().mockResolvedValue({ id: 'status-1', delete: vi.fn() }),
    };
    const interaction = {
      channelId: 'channel-1',
      channel,
      user: { id: 'user-1' },
      options: { getString: vi.fn(() => 'bot') },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(placeholder),
    } as unknown as ChatInputCommandInteraction;
    const manager = new SquareGameManager();

    await expect(manager.start(interaction)).resolves.toBeUndefined();

    expect(manager.hasGame('channel-1')).toBe(true);
    expect(channel.send).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
  });
});

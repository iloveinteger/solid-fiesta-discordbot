import type { ChatInputCommandInteraction, Message } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BinaryQuizManager,
  generateBinaryAnswer,
  hammingDistance,
} from '../src/services/binary-quiz-manager.js';

describe('5자리 이진수 퀴즈', () => {
  afterEach(() => vi.restoreAllMocks());

  it('crypto.randomInt와 같은 계약으로 0~31 값을 생성하고 선행 0을 채운다', () => {
    const random = vi.fn(() => 3);
    expect(generateBinaryAnswer(random)).toBe('00011');
    expect(random).toHaveBeenCalledWith(0, 32);
  });

  it('일치하지 않는 자릿수를 해밍 거리로 계산한다', () => {
    expect(hammingDistance('10101', '10101')).toBe(0);
    expect(hammingDistance('10101', '00111')).toBe(2);
    expect(hammingDistance('00000', '11111')).toBe(5);
  });

  it('5자리 이진수가 아닌 값은 거부한다', () => {
    expect(() => hammingDistance('101', '00101')).toThrow('5자리 이진수');
    expect(() => hammingDistance('10201', '00101')).toThrow('5자리 이진수');
  });

  it('동시 추측도 새 현황을 보낸 뒤 직전 현황 하나만 순서대로 삭제한다', async () => {
    const events: string[] = [];
    let sequence = 0;
    const makeStatus = (id: string) => ({
      id,
      delete: vi.fn(() => {
        events.push(`delete:${id}`);
        return Promise.resolve();
      }),
    });
    const placeholder = makeStatus('status-0');
    const send = vi.fn(() => {
      const id = `status-${++sequence}`;
      events.push(`send:${id}`);
      return Promise.resolve(makeStatus(id));
    });
    const channel = { isSendable: () => true, send };
    const interaction = {
      channelId: 'channel-1',
      channel,
      user: { id: 'user-1' },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(placeholder),
    } as unknown as ChatInputCommandInteraction;
    const manager = new BinaryQuizManager(
      vi.fn(() => 31),
      0,
    );

    await manager.start(interaction);
    const guess = (content: string) =>
      ({
        author: { bot: false, id: 'user-1' },
        channelId: 'channel-1',
        content,
        inGuild: () => true,
      }) as unknown as Message;
    await Promise.all([
      manager.handleMessage(guess('00000')),
      manager.handleMessage(guess('00001')),
    ]);

    expect(events).toEqual([
      'send:status-1',
      'delete:status-0',
      'send:status-2',
      'delete:status-1',
      'send:status-3',
      'delete:status-2',
    ]);
  });

  it('직전 현황 삭제 실패가 새 현황 전송이나 게임을 중단시키지 않는다', async () => {
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
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(placeholder),
    } as unknown as ChatInputCommandInteraction;
    const manager = new BinaryQuizManager(
      vi.fn(() => 31),
      0,
    );

    await expect(manager.start(interaction)).resolves.toBeUndefined();

    expect(manager.hasGame('channel-1')).toBe(true);
    expect(channel.send).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
  });
});

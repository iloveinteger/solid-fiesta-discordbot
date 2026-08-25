import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { CommandHandler, type CommandDependencies } from '../src/commands/command-handler.js';
import { commandData } from '../src/commands/definitions.js';
import {
  SPELLCHECK_MAX_INPUT_LENGTH,
  SpellcheckNotConfiguredError,
  SpellcheckService,
} from '../src/services/spellcheck-service.js';
import { formatSpellcheckResult } from '../src/utils/spellcheck-format.js';

describe('/spell', () => {
  it('필수 sentence 옵션과 입력 길이 제한으로 등록된다', () => {
    const spell = commandData.find((command) => command.name === 'spell');
    expect(spell).toBeDefined();
    expect(spell?.options?.[0]).toMatchObject({
      name: 'sentence',
      required: true,
      max_length: SPELLCHECK_MAX_INPUT_LENGTH,
    });
  });

  it('Bearer 토큰과 UTF-8 JSON으로 API를 호출한다', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ output: '나는 밥을 먹었어요.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const service = new SpellcheckService('secret-token', 'https://example.test/run', fetcher);

    await expect(service.correct('  나는 밥을 먹었어용.  ')).resolves.toBe('나는 밥을 먹었어요.');
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/run',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer secret-token',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ input: '나는 밥을 먹었어용.' }),
      }),
    );
  });

  it('토큰이 없어도 생성은 성공하고 명령 호출에만 설정 오류를 낸다', async () => {
    const service = new SpellcheckService(undefined);
    await expect(service.correct('검사할 문장')).rejects.toBeInstanceOf(
      SpellcheckNotConfiguredError,
    );
  });

  it('교정 전 원문과 교정 후 문장을 표시한다', () => {
    expect(
      formatSpellcheckResult(
        '나는 밥을 먹었어용. 그래서 죽엇어',
        '나는 밥을 먹었어요. 그래서 죽었어.',
      ),
    ).toBe(
      '**교정 전**\n나는 밥을 먹었어용. 그래서 죽엇어\n' +
        '**교정 후**\n나는 밥을 먹었어요. 그래서 죽었어.',
    );
  });

  it('수정이 없으면 별도로 안내하고 사용자 마크다운을 이스케이프한다', () => {
    expect(formatSpellcheckResult('**맞음**', '**맞음**')).toBe(
      '**교정 결과**\n수정할 부분이 없습니다.\n\\*\\*맞음\\*\\*',
    );
  });

  it('API 호출 전에 응답을 defer하고 멘션 없이 공개 결과를 전송한다', async () => {
    const deferReply = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);
    const correct = vi.fn().mockResolvedValue('고친 문장');
    const interaction = {
      commandName: 'spell',
      options: { getString: vi.fn(() => '틀린 문장') },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await new CommandHandler({
      spellcheckService: { correct },
    } as unknown as CommandDependencies).handleCommand(interaction);

    expect(deferReply).toHaveBeenCalledOnce();
    expect(correct).toHaveBeenCalledWith('틀린 문장');
    expect(editReply).toHaveBeenCalledWith({
      content: '**교정 전**\n틀린 문장\n**교정 후**\n고친 문장',
      allowedMentions: { parse: [] },
    });
  });
});

import {
  ApiError,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type GoogleGenAI,
} from '@google/genai';
import type { ChatInputCommandInteraction } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandHandler, type CommandDependencies } from '../src/commands/command-handler.js';
import { commandData } from '../src/commands/definitions.js';
import {
  ASK_MAX_QUESTION_LENGTH,
  AskNotConfiguredError,
  AskService,
  normalizeAskAnswer,
} from '../src/services/ask-service.js';

describe('/ask', () => {
  afterEach(() => vi.restoreAllMocks());

  it('필수 question 옵션과 입력 길이 제한으로 등록된다', () => {
    const ask = commandData.find((command) => command.name === 'ask');
    expect(ask).toBeDefined();
    expect(ask?.options?.[0]).toMatchObject({
      name: 'question',
      required: true,
      max_length: ASK_MAX_QUESTION_LENGTH,
    });
  });

  it('Discord 응답을 먼저 defer한 뒤 서비스 답변을 전송한다', async () => {
    const deferReply = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);
    const answer = vi.fn().mockResolvedValue('그건 굳이 어렵게 생각할 일은 아닙니다.');
    const interaction = {
      commandName: 'ask',
      options: { getString: vi.fn(() => '**질문** @everyone') },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await new CommandHandler({
      askService: { answer },
    } as unknown as CommandDependencies).handleCommand(interaction);

    expect(deferReply).toHaveBeenCalledOnce();
    expect(answer).toHaveBeenCalledWith('**질문** @everyone');
    expect(editReply).toHaveBeenCalledWith({
      content:
        '**질문:** \\*\\*질문\\*\\* @everyone\n**답변:** 그건 굳이 어렵게 생각할 일은 아닙니다.',
      allowedMentions: { parse: [] },
    });
  });

  it('API 키가 없어도 서비스 생성은 성공하고 /ask 호출에만 안내 오류를 낸다', async () => {
    const service = new AskService(undefined, 'gemini-3.7-flash');
    await expect(service.answer('질문')).rejects.toBeInstanceOf(AskNotConfiguredError);
  });

  it('설정 모델의 400 오류에는 공통 옵션으로 안정 모델을 한 번 재시도한다', async () => {
    const generateContent = vi
      .fn<(params: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockRejectedValueOnce(new ApiError({ status: 400, message: 'invalid model option' }))
      .mockResolvedValueOnce({
        text: '그 정도는 다시 물을 필요도 없습니다.',
      } as GenerateContentResponse);
    const client = { models: { generateContent } } as unknown as Pick<GoogleGenAI, 'models'>;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new AskService('test-key', 'custom-flash', client);

    await expect(service.answer('질문')).resolves.toBe('그 정도는 다시 물을 필요도 없습니다.');

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls.map(([request]) => request.model)).toEqual([
      'custom-flash',
      'gemini-2.5-flash',
    ]);
    expect(generateContent.mock.calls[0]?.[0].config).not.toHaveProperty('temperature');
    expect(generateContent.mock.calls[0]?.[0].config).not.toHaveProperty('thinkingConfig');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('모델 출력을 마크다운 없는 한 문장으로 정리한다', () => {
    expect(normalizeAskAnswer('**첫 문장입니다.**\n둘째 문장입니다.')).toBe('첫 문장입니다.');
    expect(normalizeAskAnswer('짧게 답함')).toBe('짧게 답함.');
    expect(normalizeAskAnswer('Try again.')).toBe(
      '한국어 답변도 못 내놨으니, 그냥 다시 물어보세요.',
    );
  });
});

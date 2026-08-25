import {
  ApiError,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type GoogleGenAI,
  type Model,
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
  parseGeminiResponse,
  selectLowUsageModel,
} from '../src/services/ask-service.js';

function responseWithText(text: string): GenerateContentResponse {
  return {
    candidates: [{ content: { role: 'model', parts: [{ text }] } }],
  } as GenerateContentResponse;
}

function modelPager(...models: Model[]): AsyncIterable<Model> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        next: () => {
          const value = models[index];
          index += 1;
          return Promise.resolve(
            value ? { done: false as const, value } : { done: true as const, value: undefined },
          );
        },
      };
    },
  };
}

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

  it('설정 모델의 404 오류에는 API 목록의 저사용량 모델로 재시도한다', async () => {
    const generateContent = vi
      .fn<(params: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockRejectedValueOnce(new ApiError({ status: 404, message: 'model not found' }))
      .mockResolvedValueOnce(responseWithText('그 정도는 다시 물을 필요도 없습니다.'));
    const list = vi.fn().mockResolvedValue(
      modelPager({
        name: 'models/gemini-3.5-flash-lite',
        supportedActions: ['generateContent'],
      }),
    );
    const client = { models: { generateContent, list } } as unknown as Pick<GoogleGenAI, 'models'>;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new AskService('test-key', 'custom-flash', client);

    await expect(service.answer('질문')).resolves.toBe('그 정도는 다시 물을 필요도 없습니다.');

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls.map(([request]) => request.model)).toEqual([
      'custom-flash',
      'models/gemini-3.5-flash-lite',
    ]);
    expect(generateContent.mock.calls[0]?.[0].contents).toEqual([
      { role: 'user', parts: [{ text: '질문' }] },
    ]);
    expect(generateContent.mock.calls[0]?.[0].config).toMatchObject({
      maxOutputTokens: 128,
      responseMimeType: 'text/plain',
      systemInstruction: {
        role: 'system',
        parts: [
          {
            text: '질문에 반드시 한국어 한 문장으로만 짧게 답해. 말투는 약간 까칠하고 차갑게, 솔직하게 말해. 마크다운과 줄바꿈을 쓰지 마.',
          },
        ],
      },
    });
    expect(generateContent.mock.calls[0]?.[0].config).not.toHaveProperty('temperature');
    expect(generateContent.mock.calls[0]?.[0].config).not.toHaveProperty('thinkingConfig');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('설정 모델의 504 오류에는 새 타임아웃으로 안정 모델을 재시도한다', async () => {
    const generateContent = vi
      .fn<(params: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockRejectedValueOnce(new ApiError({ status: 504, message: 'gateway timeout' }))
      .mockResolvedValueOnce(responseWithText('이제야 제대로 답이 나왔습니다.'));
    const list = vi.fn().mockResolvedValue(
      modelPager({
        name: 'models/gemini-3.5-flash-lite',
        supportedActions: ['generateContent'],
      }),
    );
    const client = { models: { generateContent, list } } as unknown as Pick<GoogleGenAI, 'models'>;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new AskService('test-key', 'gemini-3.7-flash', client);

    await expect(service.answer('질문')).resolves.toBe('이제야 제대로 답이 나왔습니다.');

    expect(generateContent.mock.calls.map(([request]) => request.model)).toEqual([
      'gemini-3.7-flash',
      'models/gemini-3.5-flash-lite',
    ]);
    expect(generateContent.mock.calls[0]?.[0].config?.httpOptions?.timeout).toBe(8_000);
    expect(generateContent.mock.calls[1]?.[0].config?.httpOptions?.timeout).toBe(12_000);
    expect(generateContent.mock.calls[0]?.[0].config?.abortSignal).not.toBe(
      generateContent.mock.calls[1]?.[0].config?.abortSignal,
    );
  });

  it('지원 모델 목록에서 생성 가능한 안정 Flash-Lite를 우선 선택한다', () => {
    expect(
      selectLowUsageModel([
        { name: 'models/gemini-pro', supportedActions: ['generateContent'] },
        { name: 'models/gemini-3.5-flash-preview', supportedActions: ['generateContent'] },
        { name: 'models/gemini-3.1-flash-lite', supportedActions: ['embedContent'] },
        { name: 'models/gemini-3.5-flash-lite', supportedActions: ['generateContent'] },
      ]),
    ).toBe('models/gemini-3.5-flash-lite');
  });

  it('응답 candidates의 일반 텍스트만 합치고 thought 파트는 제외한다', () => {
    expect(
      parseGeminiResponse({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                { text: '내부 추론', thought: true },
                { text: '첫 답변' },
                { text: '둘째 답변' },
              ],
            },
          },
        ],
      } as GenerateContentResponse),
    ).toBe('첫 답변 둘째 답변');
  });

  it('모델 출력을 마크다운 없는 한 문장으로 정리한다', () => {
    expect(normalizeAskAnswer('**첫 문장입니다.**\n둘째 문장입니다.')).toBe('첫 문장입니다.');
    expect(normalizeAskAnswer('짧게 답함')).toBe('짧게 답함.');
    expect(normalizeAskAnswer('Try again.')).toBe(
      '한국어 답변도 못 내놨으니, 그냥 다시 물어보세요.',
    );
  });
});

import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { CommandHandler, type CommandDependencies } from '../src/commands/command-handler.js';
import { commandData } from '../src/commands/definitions.js';
import {
  ASK_MAX_QUESTION_LENGTH,
  AskNotConfiguredError,
  AskService,
  normalizeAskAnswer,
} from '../src/services/ask-service.js';

describe('/ask', () => {
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
      options: { getString: vi.fn(() => '질문') },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await new CommandHandler({
      askService: { answer },
    } as unknown as CommandDependencies).handleCommand(interaction);

    expect(deferReply).toHaveBeenCalledOnce();
    expect(answer).toHaveBeenCalledWith('질문');
    expect(editReply).toHaveBeenCalledWith('그건 굳이 어렵게 생각할 일은 아닙니다.');
  });

  it('API 키가 없어도 서비스 생성은 성공하고 /ask 호출에만 안내 오류를 낸다', async () => {
    const service = new AskService(undefined, 'gemini-3.7-flash');
    await expect(service.answer('질문')).rejects.toBeInstanceOf(AskNotConfiguredError);
  });

  it('모델 출력을 마크다운 없는 한 문장으로 정리한다', () => {
    expect(normalizeAskAnswer('**첫 문장입니다.**\n둘째 문장입니다.')).toBe('첫 문장입니다.');
    expect(normalizeAskAnswer('짧게 답함')).toBe('짧게 답함.');
    expect(normalizeAskAnswer('Try again.')).toBe(
      '한국어 답변도 못 내놨으니, 그냥 다시 물어보세요.',
    );
  });
});

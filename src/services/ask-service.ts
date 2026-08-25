import { GoogleGenAI } from '@google/genai';

export const ASK_MAX_QUESTION_LENGTH = 500;
const ASK_TIMEOUT_MS = 12_000;
const ASK_MAX_RESPONSE_LENGTH = 300;

export class AskNotConfiguredError extends Error {
  public constructor() {
    super('GEMINI_API_KEY가 설정되지 않아 /ask를 사용할 수 없습니다.');
    this.name = 'AskNotConfiguredError';
  }
}

export class AskService {
  readonly #client?: GoogleGenAI;

  public constructor(
    apiKey: string | undefined,
    private readonly model: string,
  ) {
    if (apiKey) {
      this.#client = new GoogleGenAI({
        apiKey,
        httpOptions: { timeout: ASK_TIMEOUT_MS },
      });
    }
  }

  public async answer(question: string): Promise<string> {
    if (!this.#client) throw new AskNotConfiguredError();
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion || normalizedQuestion.length > ASK_MAX_QUESTION_LENGTH) {
      throw new Error(`질문은 1자 이상 ${ASK_MAX_QUESTION_LENGTH}자 이하로 입력하세요.`);
    }

    try {
      const response = await this.#client.models.generateContent({
        model: this.model,
        contents: normalizedQuestion,
        config: {
          systemInstruction:
            '질문에 반드시 한국어 한 문장으로만 짧게 답해. 말투는 약간 까칠하고 차갑게, 솔직하게 말해. 마크다운과 줄바꿈을 쓰지 마.',
          maxOutputTokens: 100,
          temperature: 0.6,
          httpOptions: { timeout: ASK_TIMEOUT_MS },
        },
      });
      return normalizeAskAnswer(response.text ?? '');
    } catch (error: unknown) {
      if (error instanceof AskNotConfiguredError) throw error;
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error('Gemini 응답 시간이 초과되었습니다. 잠시 뒤 다시 시도하세요.', {
          cause: error,
        });
      }
      throw new Error('Gemini가 지금은 답하지 못합니다. 잠시 뒤 다시 시도하세요.', {
        cause: error,
      });
    }
  }
}

export function normalizeAskAnswer(raw: string): string {
  const plain = raw
    .replace(/[*_`#>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) throw new Error('Gemini가 빈 답변을 반환했습니다.');
  if (!/[가-힣]/u.test(plain)) return '한국어 답변도 못 내놨으니, 그냥 다시 물어보세요.';

  const firstSentence = /^.*?[.!?。！？](?=\s|$)/u.exec(plain)?.[0] ?? plain;
  const shortened = firstSentence.slice(0, ASK_MAX_RESPONSE_LENGTH).trim();
  return /[.!?。！？]$/u.test(shortened)
    ? shortened
    : `${shortened.slice(0, ASK_MAX_RESPONSE_LENGTH - 1).trimEnd()}.`;
}

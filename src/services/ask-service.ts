import { ApiError, GoogleGenAI } from '@google/genai';

export const ASK_MAX_QUESTION_LENGTH = 500;
const ASK_TIMEOUT_MS = 12_000;
const ASK_PRIMARY_TIMEOUT_MS = 8_000;
const ASK_MAX_RESPONSE_LENGTH = 300;
const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash';

export class AskNotConfiguredError extends Error {
  public constructor() {
    super('GEMINI_API_KEY가 설정되지 않아 /ask를 사용할 수 없습니다.');
    this.name = 'AskNotConfiguredError';
  }
}

class EmptyGeminiResponseError extends Error {
  public constructor() {
    super('Gemini returned an empty response.');
    this.name = 'EmptyGeminiResponseError';
  }
}

export class AskService {
  readonly #client?: Pick<GoogleGenAI, 'models'>;

  public constructor(
    apiKey: string | undefined,
    private readonly model: string,
    client?: Pick<GoogleGenAI, 'models'>,
  ) {
    if (client) {
      this.#client = client;
    } else if (apiKey) {
      this.#client = new GoogleGenAI({
        apiKey,
        httpOptions: { timeout: ASK_TIMEOUT_MS },
      });
    }
  }

  public async answer(question: string): Promise<string> {
    if (!this.#client) throw new AskNotConfiguredError();
    const client = this.#client;
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion || normalizedQuestion.length > ASK_MAX_QUESTION_LENGTH) {
      throw new Error(`질문은 1자 이상 ${ASK_MAX_QUESTION_LENGTH}자 이하로 입력하세요.`);
    }
    const generate = async (model: string, timeoutMs: number): Promise<string> => {
      const response = await client.models.generateContent({
        model,
        contents: normalizedQuestion,
        config: {
          systemInstruction:
            '질문에 반드시 한국어 한 문장으로만 짧게 답해. 말투는 약간 까칠하고 차갑게, 솔직하게 말해. 마크다운과 줄바꿈을 쓰지 마.',
          maxOutputTokens: 512,
          abortSignal: AbortSignal.timeout(timeoutMs),
          httpOptions: { timeout: timeoutMs },
        },
      });
      if (!response.text?.trim()) throw new EmptyGeminiResponseError();
      return normalizeAskAnswer(response.text);
    };

    try {
      return await generate(this.model, ASK_PRIMARY_TIMEOUT_MS);
    } catch (error: unknown) {
      if (error instanceof AskNotConfiguredError) throw error;
      logGeminiFailure(error, this.model);
      const shouldFallback = this.model !== GEMINI_FALLBACK_MODEL && isFallbackEligible(error);
      if (shouldFallback) {
        try {
          return await generate(GEMINI_FALLBACK_MODEL, ASK_TIMEOUT_MS);
        } catch (fallbackError: unknown) {
          logGeminiFailure(fallbackError, GEMINI_FALLBACK_MODEL);
          throw userFacingGeminiError(fallbackError);
        }
      }
      throw userFacingGeminiError(error);
    }
  }
}

function isFallbackEligible(error: unknown): boolean {
  if (error instanceof EmptyGeminiResponseError) return true;
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return true;
  }
  return (
    error instanceof ApiError &&
    (error.status === 400 || error.status === 404 || (error.status >= 500 && error.status <= 599))
  );
}

function userFacingGeminiError(error: unknown): Error {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new Error('Gemini 응답 시간이 초과되었습니다. 잠시 뒤 다시 시도하세요.', {
      cause: error,
    });
  }
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return new Error(`Gemini API 키 또는 사용 권한을 확인하세요 (HTTP ${error.status}).`, {
      cause: error,
    });
  }
  if (error instanceof ApiError && error.status === 429) {
    return new Error('Gemini 요청 한도를 넘었습니다 (HTTP 429). 잠시 뒤 다시 시도하세요.', {
      cause: error,
    });
  }
  if (error instanceof ApiError && error.status >= 500 && error.status <= 599) {
    return new Error(`Gemini 서버가 응답하지 못했습니다 (HTTP ${error.status}).`, {
      cause: error,
    });
  }
  if (error instanceof ApiError) {
    return new Error(`Gemini 요청에 실패했습니다 (HTTP ${error.status}).`, { cause: error });
  }
  if (error instanceof EmptyGeminiResponseError) {
    return new Error('Gemini가 빈 답변을 반환했습니다. 잠시 뒤 다시 시도하세요.', {
      cause: error,
    });
  }
  return new Error('Gemini 연결에 실패했습니다. 잠시 뒤 다시 시도하세요.', { cause: error });
}

function logGeminiFailure(error: unknown, model: string): void {
  console.warn('Gemini API 요청 실패:', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
    status: error instanceof ApiError ? error.status : undefined,
    model,
  });
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

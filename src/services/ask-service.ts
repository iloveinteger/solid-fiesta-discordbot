import { ApiError, GoogleGenAI, type GenerateContentResponse, type Model } from '@google/genai';

export const ASK_MAX_QUESTION_LENGTH = 500;
const ASK_TIMEOUT_MS = 12_000;
const ASK_PRIMARY_TIMEOUT_MS = 8_000;
const ASK_MAX_RESPONSE_LENGTH = 300;
const GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash-lite';

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
  #resolvedModel?: string;

  public constructor(
    apiKey: string | undefined,
    private readonly model: string,
    client?: Pick<GoogleGenAI, 'models'>,
  ) {
    if (client) this.#client = client;
    else if (apiKey) {
      this.#client = new GoogleGenAI({ apiKey, httpOptions: { timeout: ASK_TIMEOUT_MS } });
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
        contents: [{ role: 'user', parts: [{ text: normalizedQuestion }] }],
        config: {
          systemInstruction: {
            role: 'system',
            parts: [
              {
                text: '질문에 반드시 한국어 한 문장으로만 짧게 답해. 말투는 약간 까칠하고 차갑게, 솔직하게 말해. 마크다운과 줄바꿈을 쓰지 마.',
              },
            ],
          },
          maxOutputTokens: 128,
          responseMimeType: 'text/plain',
          abortSignal: AbortSignal.timeout(timeoutMs),
          httpOptions: { timeout: timeoutMs },
        },
      });
      return normalizeAskAnswer(parseGeminiResponse(response));
    };

    const primaryModel = this.#resolvedModel ?? this.model;
    try {
      const answer = await generate(primaryModel, ASK_PRIMARY_TIMEOUT_MS);
      this.#resolvedModel = primaryModel;
      return answer;
    } catch (error: unknown) {
      logGeminiFailure(error, primaryModel);
      if (isFallbackEligible(error)) {
        const fallbackModel = await resolveLowUsageModel(client, primaryModel);
        try {
          const answer = await generate(fallbackModel, ASK_TIMEOUT_MS);
          this.#resolvedModel = fallbackModel;
          return answer;
        } catch (fallbackError: unknown) {
          logGeminiFailure(fallbackError, fallbackModel);
          throw userFacingGeminiError(fallbackError);
        }
      }
      throw userFacingGeminiError(error);
    }
  }
}

async function resolveLowUsageModel(
  client: Pick<GoogleGenAI, 'models'>,
  excludedModel: string,
): Promise<string> {
  try {
    const pager = await client.models.list({
      config: {
        pageSize: 100,
        queryBase: true,
        abortSignal: AbortSignal.timeout(ASK_PRIMARY_TIMEOUT_MS),
        httpOptions: { timeout: ASK_PRIMARY_TIMEOUT_MS },
      },
    });
    const models: Model[] = [];
    for await (const model of pager) models.push(model);
    return selectLowUsageModel(models, excludedModel) ?? GEMINI_FALLBACK_MODEL;
  } catch (error: unknown) {
    logGeminiFailure(error, 'model-list');
    return GEMINI_FALLBACK_MODEL;
  }
}

export function selectLowUsageModel(
  models: readonly Model[],
  excludedModel?: string,
): string | undefined {
  const excludedId = normalizeModelId(excludedModel ?? '');
  return models
    .filter((model): model is Model & { name: string } => Boolean(model.name))
    .filter((model) => normalizeModelId(model.name) !== excludedId)
    .filter((model) =>
      model.supportedActions?.some((action) => action.toLowerCase().endsWith('generatecontent')),
    )
    .filter((model) => {
      const id = normalizeModelId(model.name);
      return (
        id.includes('gemini') &&
        id.includes('flash') &&
        !/(image|live|tts|audio|preview|experimental)/u.test(id)
      );
    })
    .sort((left, right) => modelUsageScore(left.name) - modelUsageScore(right.name))[0]?.name;
}

function normalizeModelId(model: string): string {
  return model.replace(/^models\//u, '').toLowerCase();
}

function modelUsageScore(model: string): number {
  const id = normalizeModelId(model);
  if (id === GEMINI_FALLBACK_MODEL) return 0;
  if (id.includes('flash-lite')) return 10;
  return 100;
}

export function parseGeminiResponse(response: GenerateContentResponse): string {
  const text = response.candidates?.[0]?.content?.parts
    ?.filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
    .trim();
  if (!text) throw new EmptyGeminiResponseError();
  return text;
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

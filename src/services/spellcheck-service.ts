export const SPELLCHECK_MAX_INPUT_LENGTH = 300;
const SPELLCHECK_TIMEOUT_MS = 190_000;
const SPELLCHECK_MAX_OUTPUT_LENGTH = 1_000;

type UnknownRecord = Record<string, unknown>;

export class SpellcheckNotConfiguredError extends Error {
  public constructor() {
    super('SPELLCHECK_API_TOKEN이 설정되지 않아 /spell을 사용할 수 없습니다.');
    this.name = 'SpellcheckNotConfiguredError';
  }
}

export class SpellcheckService {
  public constructor(
    private readonly apiToken: string | undefined,
    private readonly endpoint = 'https://161.33.175.58/run',
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  public async correct(input: string): Promise<string> {
    if (!this.apiToken) throw new SpellcheckNotConfiguredError();
    const normalized = input.trim();
    if (!normalized || normalized.length > SPELLCHECK_MAX_INPUT_LENGTH) {
      throw new Error(`검사할 문장은 1~${SPELLCHECK_MAX_INPUT_LENGTH}자로 입력해 주세요.`);
    }

    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ input: normalized }),
        signal: AbortSignal.timeout(SPELLCHECK_TIMEOUT_MS),
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new Error('맞춤법 검사 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.', {
          cause: error,
        });
      }
      throw new Error('맞춤법 검사 API에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', {
        cause: error,
      });
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('맞춤법 검사 API 인증에 실패했습니다.');
      }
      if (response.status === 503) {
        throw new Error(
          '맞춤법 검사 서비스를 현재 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        );
      }
      throw new Error(`맞춤법 검사 API 요청에 실패했습니다. (HTTP ${response.status})`);
    }

    let payload: unknown;
    try {
      payload = (await response.json()) as unknown;
    } catch (error: unknown) {
      throw new Error('맞춤법 검사 API가 올바르지 않은 응답을 반환했습니다.', { cause: error });
    }
    const record =
      typeof payload === 'object' && payload !== null ? (payload as UnknownRecord) : undefined;
    const output = typeof record?.output === 'string' ? record.output.trim() : '';
    if (!output || output.length > SPELLCHECK_MAX_OUTPUT_LENGTH) {
      throw new Error('맞춤법 검사 API 응답에 교정 문장이 없습니다.');
    }
    return output;
  }
}

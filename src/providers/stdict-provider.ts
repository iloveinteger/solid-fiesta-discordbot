import { XMLParser } from 'fast-xml-parser';
import { TtlCache } from '../utils/cache.js';
import { truncate } from '../utils/errors.js';

export interface DictionarySearchItem {
  targetCode: string;
  word: string;
  homonymNumber?: string;
  partOfSpeech: string;
  definition: string;
}

export interface DictionaryDetail {
  targetCode: string;
  word: string;
  pronunciation: string[];
  origins: string[];
  senses: { partOfSpeech: string; definition: string; examples: string[] }[];
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : undefined;
}

function array(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function string(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function nested(root: unknown, ...path: string[]): unknown {
  let current: unknown = root;
  for (const key of path) current = record(current)?.[key];
  return current;
}

export function parseSearchResponse(payload: unknown): DictionarySearchItem[] {
  const items = array(nested(payload, 'channel', 'item'));
  return items
    .map((raw): DictionarySearchItem | undefined => {
      const item = record(raw);
      const sense = record(item?.sense);
      const targetCode = string(item?.target_code);
      const word = string(item?.word).replaceAll('-', '');
      if (!targetCode || !word) return undefined;
      const homonymNumber = string(item?.sup_no);
      return {
        targetCode,
        word,
        ...(homonymNumber ? { homonymNumber } : {}),
        partOfSpeech: string(item?.pos) || '품사 정보 없음',
        definition: truncate(string(sense?.definition) || '뜻풀이 없음', 180),
      };
    })
    .filter((item): item is DictionarySearchItem => item !== undefined)
    .slice(0, 10);
}

export function parseDetailResponse(payload: unknown, targetCode: string): DictionaryDetail {
  const root = record(payload)?.xml ?? payload;
  const item = record(array(nested(root, 'channel', 'item'))[0]);
  const wordInfo = record(item?.word_info);
  const word = string(wordInfo?.word).replaceAll('-', '') || string(item?.word).replaceAll('-', '');
  if (!word) throw new Error('상세 응답에 표제어가 없습니다.');

  const pronunciation = array(wordInfo?.pronunciation_info)
    .map((value) => string(record(value)?.pronunciation))
    .filter(Boolean);
  const origins = [
    ...array(wordInfo?.original_language_info)
      .map((value) => {
        const info = record(value);
        return string(info?.original_language) || string(info?.origin);
      })
      .filter(Boolean),
    string(wordInfo?.origin),
  ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
  const senses: DictionaryDetail['senses'] = [];
  for (const rawPos of array(item?.pos_info ?? wordInfo?.pos_info)) {
    const pos = record(rawPos);
    const partOfSpeech = string(pos?.pos) || '품사 정보 없음';
    for (const rawPattern of array(pos?.comm_pattern_info)) {
      const pattern = record(rawPattern);
      for (const rawSense of array(pattern?.sense_info)) {
        const sense = record(rawSense);
        const definition = string(sense?.definition);
        if (!definition) continue;
        const examples = array(sense?.example_info)
          .map((value) => string(record(value)?.example))
          .filter(Boolean)
          .slice(0, 3);
        senses.push({ partOfSpeech, definition, examples });
      }
    }
  }
  return { targetCode, word, pronunciation, origins, senses };
}

const XML_PARSER = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
});

export function parseDetailXmlResponse(xml: string, targetCode: string): DictionaryDetail {
  try {
    const payload = XML_PARSER.parse(xml) as unknown;
    const error = record(record(payload)?.error);
    if (error) {
      throw new Error(string(error.message) || '표준국어대사전 상세 조회에 실패했습니다.');
    }
    return parseDetailResponse(payload, targetCode);
  } catch (error) {
    if (error instanceof Error && error.message !== '상세 응답에 표제어가 없습니다.') {
      throw error;
    }
    throw new Error('표준국어대사전 상세 응답을 해석할 수 없습니다.', { cause: error });
  }
}

export class StdictProvider {
  readonly #searchCache = new TtlCache<string, DictionarySearchItem[]>(3 * 60 * 1_000);
  readonly #detailCache = new TtlCache<string, DictionaryDetail>(5 * 60 * 1_000);

  public constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  public async search(query: string): Promise<DictionarySearchItem[]> {
    const normalized = validateQuery(query);
    const cached = this.#searchCache.get(normalized);
    if (cached) return cached.value;
    const payload = await this.requestJson('https://stdict.korean.go.kr/api/search.do', {
      q: normalized,
      req_type: 'json',
      type_search: 'search',
      num: '10',
    });
    const parsed = parseSearchResponse(payload);
    this.#searchCache.set(normalized, parsed);
    return parsed;
  }

  public async detail(targetCode: string): Promise<DictionaryDetail> {
    if (!/^\d{1,20}$/.test(targetCode)) throw new Error('잘못된 사전 항목 식별자입니다.');
    const cached = this.#detailCache.get(targetCode);
    if (cached) return cached.value;
    const payload = await this.requestText('https://stdict.korean.go.kr/api/view.do', {
      method: 'target_code',
      q: targetCode,
      req_type: 'xml',
    });
    const parsed = parseDetailXmlResponse(payload, targetCode);
    this.#detailCache.set(targetCode, parsed);
    return parsed;
  }

  private async send(
    endpoint: string,
    parameters: Record<string, string>,
    accept: string,
  ): Promise<Response> {
    // 인증 키를 URL에 넣지 않고 POST 본문으로만 전달하며, 본문을 기록하지 않는다.
    const body = new URLSearchParams({ key: this.apiKey, ...parameters });
    const response = await this.fetcher(endpoint, {
      method: 'POST',
      headers: {
        Accept: accept,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'solid-fiesta-discordbot/1.0',
      },
      body,
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok)
      throw new Error(`표준국어대사전 API 요청에 실패했습니다. (HTTP ${response.status})`);
    return response;
  }

  private async requestJson(
    endpoint: string,
    parameters: Record<string, string>,
  ): Promise<unknown> {
    const response = await this.send(endpoint, parameters, 'application/json');
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new Error('표준국어대사전 API가 올바르지 않은 응답을 반환했습니다.');
    }
  }

  private async requestText(endpoint: string, parameters: Record<string, string>): Promise<string> {
    const response = await this.send(endpoint, parameters, 'application/xml, text/xml');
    const body = await response.text();
    if (!body.trim()) throw new Error('표준국어대사전 상세 API가 빈 응답을 반환했습니다.');
    return body;
  }
}

export function validateQuery(query: string): string {
  const normalized = query.trim();
  if (normalized.length < 1 || normalized.length > 50) {
    throw new Error('검색어는 1~50자로 입력해 주세요.');
  }
  // eslint-disable-next-line no-control-regex -- ASCII 제어 문자를 명시적으로 차단한다.
  if (/[\u0000-\u001f\u007f]/.test(normalized))
    throw new Error('검색어에 제어 문자를 사용할 수 없습니다.');
  return normalized;
}

import { describe, expect, it, vi } from 'vitest';
import {
  parseDetailResponse,
  parseSearchResponse,
  StdictProvider,
  validateQuery,
} from '../src/providers/stdict-provider.js';

const searchFixture = {
  channel: {
    item: [
      {
        target_code: '123',
        word: '눈',
        sup_no: '1',
        pos: '명사',
        sense: { definition: '빛을 감지하는 감각 기관.' },
      },
      {
        target_code: 456,
        word: '눈-',
        sup_no: '2',
        pos: '명사',
        sense: { definition: '하늘에서 내리는 얼음 결정.' },
      },
    ],
  },
};

describe('표준국어대사전 응답 파싱', () => {
  it('검색 결과의 동음이의어 정보를 파싱한다', () => {
    expect(parseSearchResponse(searchFixture)).toEqual([
      {
        targetCode: '123',
        word: '눈',
        homonymNumber: '1',
        partOfSpeech: '명사',
        definition: '빛을 감지하는 감각 기관.',
      },
      {
        targetCode: '456',
        word: '눈',
        homonymNumber: '2',
        partOfSpeech: '명사',
        definition: '하늘에서 내리는 얼음 결정.',
      },
    ]);
  });

  it('상세 결과의 발음, 원어, 품사, 뜻풀이와 용례를 파싱한다', () => {
    const payload = {
      channel: {
        item: {
          word_info: {
            word: '사과',
            pronunciation_info: [{ pronunciation: '사과' }],
            original_language_info: [{ original_language: '謝過' }],
            pos_info: [
              {
                pos: '명사',
                comm_pattern_info: {
                  sense_info: {
                    definition: '잘못을 인정하고 용서를 빎.',
                    example_info: [{ example: '정중한 사과' }],
                  },
                },
              },
            ],
          },
        },
      },
    };
    expect(parseDetailResponse(payload, '99')).toMatchObject({
      targetCode: '99',
      word: '사과',
      pronunciation: ['사과'],
      origins: ['謝過'],
      senses: [
        {
          partOfSpeech: '명사',
          definition: '잘못을 인정하고 용서를 빎.',
          examples: ['정중한 사과'],
        },
      ],
    });
  });

  it('입력과 API 오류를 검증한다', async () => {
    expect(() => validateQuery('')).toThrow('1~50자');
    expect(() => validateQuery('가\u0000나')).toThrow('제어 문자');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('fail', { status: 503 }));
    await expect(new StdictProvider('secret', fetcher).search('눈')).rejects.toThrow('HTTP 503');
    expect(fetcher.mock.calls[0]?.[0]).not.toContain('secret');
  });

  it('짧은 메모리 캐시를 사용한다', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(searchFixture), { status: 200 }));
    const provider = new StdictProvider('secret', fetcher);
    await provider.search('눈');
    await provider.search(' 눈 ');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

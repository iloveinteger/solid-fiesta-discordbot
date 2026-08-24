import { describe, expect, it, vi } from 'vitest';
import { generateBinaryAnswer, hammingDistance } from '../src/services/binary-quiz-manager.js';

describe('5자리 이진수 퀴즈', () => {
  it('crypto.randomInt와 같은 계약으로 0~31 값을 생성하고 선행 0을 채운다', () => {
    const random = vi.fn(() => 3);
    expect(generateBinaryAnswer(random)).toBe('00011');
    expect(random).toHaveBeenCalledWith(0, 32);
  });

  it('일치하지 않는 자릿수를 해밍 거리로 계산한다', () => {
    expect(hammingDistance('10101', '10101')).toBe(0);
    expect(hammingDistance('10101', '00111')).toBe(2);
    expect(hammingDistance('00000', '11111')).toBe(5);
  });

  it('5자리 이진수가 아닌 값은 거부한다', () => {
    expect(() => hammingDistance('101', '00101')).toThrow('5자리 이진수');
    expect(() => hammingDistance('10201', '00101')).toThrow('5자리 이진수');
  });
});

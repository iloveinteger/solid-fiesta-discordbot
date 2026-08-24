import { describe, expect, it } from 'vitest';
import {
  factorize,
  formatFactors,
  isPrime,
  parseNaturalNumber,
} from '../src/services/factor/number-theory.js';

describe('소인수분해', () => {
  it('소수는 자기 자신만 반환한다', () => {
    expect(factorize(104_729n)).toEqual([104_729n]);
  });

  it('거듭제곱의 지수를 모아 표시한다', () => {
    const input = 2n ** 12n * 3n ** 3n;
    const factors = factorize(input);
    expect(factors).toHaveLength(15);
    expect(formatFactors(input, factors)).toBe('2¹² × 3³');
  });

  it('큰 semiprime을 Pollard Rho로 분해한다', () => {
    const left = 1_000_000_007n;
    const right = 1_000_000_009n;
    expect(factorize(left * right)).toEqual([left, right]);
  });

  it('64비트 경계 아래 소수를 결정론적으로 판정한다', () => {
    expect(isPrime(18_446_744_073_709_551_557n)).toBe(true);
    expect(isPrime((1n << 64n) - 1n)).toBe(false);
  });

  it('64비트보다 큰 BigInt 소수를 판정하고 처리한다', () => {
    const mersenne127 = (1n << 127n) - 1n;
    expect(isPrime(mersenne127)).toBe(true);
    expect(factorize(mersenne127)).toEqual([mersenne127]);
  });

  it('1 및 입력 제한을 명확히 처리한다', () => {
    expect(formatFactors(1n, factorize(1n))).toBe('1');
    expect(() => parseNaturalNumber('0')).toThrow('자연수');
    expect(() => parseNaturalNumber('1'.repeat(81))).toThrow('최대 80자리');
    expect(() => parseNaturalNumber('12.3')).toThrow('10진수');
  });
});

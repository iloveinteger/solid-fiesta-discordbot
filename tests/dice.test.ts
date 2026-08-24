import { describe, expect, it, vi } from 'vitest';
import { rollDice } from '../src/services/dice.js';

describe('주사위', () => {
  it('crypto.randomInt와 같은 exclusive maximum 계약으로 1, 7을 전달한다', () => {
    const random = vi.fn(() => 6);
    expect(rollDice(random)).toBe(6);
    expect(random).toHaveBeenCalledWith(1, 7);
  });

  it('생성 결과는 항상 1~6 범위다', () => {
    for (let index = 0; index < 1_000; index += 1) {
      expect(rollDice()).toBeGreaterThanOrEqual(1);
      expect(rollDice()).toBeLessThanOrEqual(6);
    }
  });
});

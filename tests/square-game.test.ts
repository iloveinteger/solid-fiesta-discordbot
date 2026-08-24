import { describe, expect, it } from 'vitest';
import { classifySquareSubmission } from '../src/services/square-game-manager.js';

describe('제곱수놀이 채팅 입력', () => {
  it('숫자가 아닌 일반 채팅은 무시한다', () => {
    expect(classifySquareSubmission('안녕하세요', 9n)).toBe('ignore');
  });

  it('정답과 재도전 가능한 오답을 구분한다', () => {
    expect(classifySquareSubmission(' 9 ', 9n)).toBe('correct');
    expect(classifySquareSubmission('8', 9n)).toBe('wrong');
  });
});

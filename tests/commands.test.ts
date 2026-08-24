import { describe, expect, it } from 'vitest';
import { commandData } from '../src/commands/definitions.js';

describe('슬래시 명령 정의', () => {
  it('Factole 링크 명령을 등록한다', () => {
    expect(commandData.map((command) => command.name)).toContain('factole');
  });

  it('제곱수놀이에는 first 옵션이 없다', () => {
    const square = commandData.find((command) => command.name === 'square');
    expect(square).toBeDefined();
    expect(JSON.stringify(square)).not.toContain('"name":"first"');
  });
});

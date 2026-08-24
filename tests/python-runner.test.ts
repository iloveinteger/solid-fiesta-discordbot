import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';

async function run(code: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('python', ['runner/safe_interpreter.py'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    child.once('error', reject);
    child.once('close', (exitCode) => resolve({ stdout, stderr, code: exitCode ?? 1 }));
    child.stdin.end(code, 'utf8');
  });
}

describe('Python AST 화이트리스트', () => {
  it('변수, 반복문, 함수와 print를 해석한다', async () => {
    const result = await run(`
def square(x):
    return x * x
values = []
for i in range(5):
    values = values + [square(i)]
print(values)
`);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('[0, 1, 4, 9, 16]');
    expect(result.stderr).toBe('');
  });

  it.each([
    ['import os', 'Import'],
    ['open("/etc/passwd")', '허용되지 않는 이름'],
    ['x = (1).__class__', 'Attribute'],
    ['class X: pass', 'ClassDef'],
    ['print(__name__)', '허용되지 않는 이름'],
  ])('금지 코드를 실행 전에 거부한다: %s', async (code, reason) => {
    const result = await run(code);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain(reason);
  });
});

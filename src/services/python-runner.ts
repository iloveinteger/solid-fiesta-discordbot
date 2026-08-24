import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const OUTPUT_LIMIT_BYTES = 8 * 1_024;
const TIMEOUT_MS = 2_000;

export type PythonRunStatus = 'ok' | 'error' | 'timeout' | 'output_limit' | 'unavailable';

export interface PythonRunResult {
  status: PythonRunStatus;
  output: string;
}

export class DockerPythonRunner {
  public constructor(private readonly image: string) {}

  public run(code: string): Promise<PythonRunResult> {
    if (Buffer.byteLength(code, 'utf8') > 16 * 1_024) {
      return Promise.resolve({
        status: 'error',
        output: '코드는 최대 16KiB까지 입력할 수 있습니다.',
      });
    }
    return new Promise((resolve) => {
      const name = `solid-fiesta-python-${randomUUID()}`;
      const child = spawn(
        'docker',
        [
          'run',
          '--rm',
          '--name',
          name,
          '--network',
          'none',
          '--read-only',
          '--cap-drop',
          'ALL',
          '--security-opt',
          'no-new-privileges',
          '--cpus',
          '0.5',
          '--memory',
          '64m',
          '--memory-swap',
          '64m',
          '--pids-limit',
          '32',
          '--user',
          '10001:10001',
          '--tmpfs',
          '/tmp:rw,noexec,nosuid,size=1m',
          '-i',
          this.image,
        ],
        { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
      );

      const chunks: Buffer[] = [];
      let byteCount = 0;
      let settled = false;
      const cleanupContainer = (): void => {
        const cleanup = spawn('docker', ['rm', '-f', name], {
          stdio: 'ignore',
          windowsHide: true,
        });
        cleanup.unref();
      };
      const finish = (result: PythonRunResult, force = false): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (force) {
          child.kill('SIGKILL');
          cleanupContainer();
        }
        resolve(result);
      };
      const collect = (chunk: Buffer): void => {
        if (settled) return;
        byteCount += chunk.length;
        if (byteCount > OUTPUT_LIMIT_BYTES) {
          finish(
            { status: 'output_limit', output: '출력 제한 초과 (stdout/stderr 합산 8KiB)' },
            true,
          );
          return;
        }
        chunks.push(chunk);
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.once('error', () => {
        finish({ status: 'unavailable', output: '격리 실행 환경을 시작할 수 없습니다.' });
      });
      child.once('close', (code) => {
        const output = Buffer.concat(chunks).toString('utf8').trim();
        finish({
          status: code === 0 ? 'ok' : 'error',
          output: output || (code === 0 ? '(출력 없음)' : '실행에 실패했습니다.'),
        });
      });
      const timer = setTimeout(() => {
        finish({ status: 'timeout', output: '실행 시간 초과 (최대 2초)' }, true);
      }, TIMEOUT_MS);
      child.stdin.end(code, 'utf8');
    });
  }
}

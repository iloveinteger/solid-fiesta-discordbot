import { randomBytes } from 'node:crypto';

const UINT64_LIMIT = 1n << 64n;
const DETERMINISTIC_BASES_64 = [2n, 325n, 9375n, 28_178n, 450_775n, 9_780_504n, 1_795_265_022n];
const PROBABLE_BASES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

export function generatePrimes(limit: number): number[] {
  const sieve = new Uint8Array(limit + 1);
  const primes: number[] = [];
  for (let value = 2; value <= limit; value += 1) {
    if (sieve[value] === 0) {
      primes.push(value);
      if (value * value <= limit) {
        for (let multiple = value * value; multiple <= limit; multiple += value) {
          sieve[multiple] = 1;
        }
      }
    }
  }
  return primes;
}

const SMALL_PRIMES = generatePrimes(10_000);

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function powMod(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let factor = base % modulus;
  let power = exponent;
  while (power > 0n) {
    if ((power & 1n) === 1n) result = (result * factor) % modulus;
    factor = (factor * factor) % modulus;
    power >>= 1n;
  }
  return result;
}

export function isPrime(value: bigint): boolean {
  if (value < 2n) return false;
  for (const prime of PROBABLE_BASES) {
    if (value === prime) return true;
    if (value % prime === 0n) return false;
  }

  let oddPart = value - 1n;
  let shifts = 0;
  while ((oddPart & 1n) === 0n) {
    oddPart >>= 1n;
    shifts += 1;
  }

  const bases = value < UINT64_LIMIT ? DETERMINISTIC_BASES_64 : PROBABLE_BASES;
  for (const rawBase of bases) {
    const base = rawBase % value;
    if (base === 0n) continue;
    let witness = powMod(base, oddPart, value);
    if (witness === 1n || witness === value - 1n) continue;
    let composite = true;
    for (let round = 1; round < shifts; round += 1) {
      witness = (witness * witness) % value;
      if (witness === value - 1n) {
        composite = false;
        break;
      }
    }
    if (composite) return false;
  }
  return true;
}

function randomBelow(maximum: bigint): bigint {
  const bytes = Math.max(1, Math.ceil(maximum.toString(2).length / 8));
  let candidate: bigint;
  do candidate = BigInt(`0x${randomBytes(bytes).toString('hex')}`);
  while (candidate >= maximum);
  return candidate;
}

function pollardRho(value: bigint): bigint {
  if (value % 2n === 0n) return 2n;
  if (value % 3n === 0n) return 3n;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const constant = randomBelow(value - 1n) + 1n;
    let x = randomBelow(value - 2n) + 2n;
    let y = x;
    let divisor = 1n;
    const step = (current: bigint): bigint => (current * current + constant) % value;
    while (divisor === 1n) {
      x = step(x);
      y = step(step(y));
      divisor = gcd(x - y, value);
    }
    if (divisor !== value) return divisor;
  }
  throw new Error('인수 탐색을 다시 시도해 주세요.');
}

function split(value: bigint, output: bigint[]): void {
  if (value === 1n) return;
  if (isPrime(value)) {
    output.push(value);
    return;
  }
  const divisor = pollardRho(value);
  split(divisor, output);
  split(value / divisor, output);
}

export function factorize(input: bigint): bigint[] {
  if (input < 1n) throw new RangeError('자연수만 소인수분해할 수 있습니다.');
  if (input === 1n) return [];
  let remainder = input;
  const factors: bigint[] = [];
  for (const primeNumber of SMALL_PRIMES) {
    const prime = BigInt(primeNumber);
    while (remainder % prime === 0n) {
      factors.push(prime);
      remainder /= prime;
    }
    if (prime * prime > remainder) break;
  }
  if (remainder > 1n) split(remainder, factors);
  return factors.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

function superscript(value: number): string {
  return String(value)
    .split('')
    .map((digit) => SUPERSCRIPT[digit])
    .join('');
}

export function formatFactors(input: bigint, factors: readonly bigint[]): string {
  if (input === 1n) return '1';
  const groups = new Map<bigint, number>();
  for (const factor of factors) groups.set(factor, (groups.get(factor) ?? 0) + 1);
  return [...groups.entries()]
    .map(([factor, count]) => `${factor}${count > 1 ? superscript(count) : ''}`)
    .join(' × ');
}

export function parseNaturalNumber(raw: string, maximumDigits = 80): bigint {
  const normalized = raw.trim();
  if (!/^\d+$/.test(normalized)) throw new Error('1 이상의 10진수 자연수를 입력해 주세요.');
  const withoutLeadingZeros = normalized.replace(/^0+/, '');
  if (!withoutLeadingZeros) throw new Error('1 이상의 10진수 자연수를 입력해 주세요.');
  if (withoutLeadingZeros.length > maximumDigits) {
    throw new Error(`입력은 최대 ${maximumDigits}자리까지 계산할 수 있습니다.`);
  }
  return BigInt(withoutLeadingZeros);
}

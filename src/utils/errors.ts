export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
}

export function truncate(text: string, maximum: number): string {
  if (text.length <= maximum) return text;
  return `${text.slice(0, maximum - 1)}…`;
}

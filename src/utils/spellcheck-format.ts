import { escapeMarkdown } from 'discord.js';

interface DiffOperation {
  type: 'equal' | 'delete' | 'insert';
  text: string;
}

const GRAPHEME_SEGMENTER = new Intl.Segmenter('ko', { granularity: 'grapheme' });

function graphemes(value: string): string[] {
  return Array.from(GRAPHEME_SEGMENTER.segment(value), ({ segment }) => segment);
}

function diff(original: string, corrected: string): DiffOperation[] {
  const left = graphemes(original);
  const right = graphemes(corrected);
  const columns = right.length + 1;
  const lengths = new Uint16Array((left.length + 1) * columns);

  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      const offset = leftIndex * columns + rightIndex;
      lengths[offset] =
        left[leftIndex] === right[rightIndex]
          ? 1 + (lengths[(leftIndex + 1) * columns + rightIndex + 1] ?? 0)
          : Math.max(
              lengths[(leftIndex + 1) * columns + rightIndex] ?? 0,
              lengths[leftIndex * columns + rightIndex + 1] ?? 0,
            );
    }
  }

  const operations: DiffOperation[] = [];
  const append = (type: DiffOperation['type'], value: string): void => {
    const previous = operations.at(-1);
    if (previous?.type === type) previous.text += value;
    else operations.push({ type, text: value });
  };
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      append('equal', left[leftIndex] ?? '');
      leftIndex += 1;
      rightIndex += 1;
    } else if (
      (lengths[(leftIndex + 1) * columns + rightIndex] ?? 0) >=
      (lengths[leftIndex * columns + rightIndex + 1] ?? 0)
    ) {
      append('delete', left[leftIndex] ?? '');
      leftIndex += 1;
    } else {
      append('insert', right[rightIndex] ?? '');
      rightIndex += 1;
    }
  }
  while (leftIndex < left.length) append('delete', left[leftIndex++] ?? '');
  while (rightIndex < right.length) append('insert', right[rightIndex++] ?? '');
  return operations;
}

export function formatSpellcheckResult(original: string, corrected: string): string {
  if (original === corrected) {
    return `**교정 결과**\n수정할 부분이 없습니다.\n${escapeMarkdown(corrected)}`;
  }

  const operations = diff(original, corrected);
  const markedOriginal = operations
    .map((operation, index) => {
      if (operation.type === 'equal') return escapeMarkdown(operation.text);
      if (operation.type === 'delete') return `~~${escapeMarkdown(operation.text)}~~`;
      const previousIsDelete = operations[index - 1]?.type === 'delete';
      const nextIsDelete = operations[index + 1]?.type === 'delete';
      return previousIsDelete || nextIsDelete ? '' : '~~[누락]~~';
    })
    .join('');

  const result = `**교정 전**\n${markedOriginal}\n**교정 후**\n${escapeMarkdown(corrected)}`;
  if (result.length <= 2_000) return result;
  return `**교정 전**\n~~${escapeMarkdown(original)}~~\n**교정 후**\n${escapeMarkdown(corrected)}`;
}

import { escapeMarkdown } from 'discord.js';

export function formatSpellcheckResult(original: string, corrected: string): string {
  if (original === corrected) {
    return `**교정 결과**\n수정할 부분이 없습니다.\n${escapeMarkdown(corrected)}`;
  }

  return `**교정 전**\n${escapeMarkdown(original)}\n**교정 후**\n${escapeMarkdown(corrected)}`;
}

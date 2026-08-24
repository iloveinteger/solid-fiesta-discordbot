import { randomInt } from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Message,
} from 'discord.js';
import type { RandomInt } from './dice.js';

const CANCEL_ID = 'binary:cancel';
const BINARY_PATTERN = /^[01]{5}$/;

interface Attempt {
  guess: string;
  distance: number;
}

interface BinaryGame {
  channelId: string;
  userId: string;
  answer: string;
  attempts: Attempt[];
  message: Message;
}

export function generateBinaryAnswer(random: RandomInt = randomInt): string {
  return random(0, 32).toString(2).padStart(5, '0');
}

export function hammingDistance(left: string, right: string): number {
  if (!BINARY_PATTERN.test(left) || !BINARY_PATTERN.test(right)) {
    throw new Error('해밍 거리는 5자리 이진수끼리만 계산할 수 있습니다.');
  }
  let distance = 0;
  for (let index = 0; index < 5; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

function controls(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(CANCEL_ID).setLabel('취소').setStyle(ButtonStyle.Danger),
    ),
  ];
}

function history(attempts: readonly Attempt[]): string {
  if (attempts.length === 0) return '아직 시도 기록이 없습니다.';
  const visible = attempts.slice(-20);
  const prefix = attempts.length > visible.length ? `최근 ${visible.length}개 시도\n` : '';
  const offset = attempts.length - visible.length;
  return `${prefix}${visible
    .map(
      (attempt, index) =>
        `${offset + index + 1}. \`${attempt.guess}\` → 불일치 **${attempt.distance}개**`,
    )
    .join('\n')}`;
}

function gameContent(game: BinaryGame): string {
  return [
    '## 5자리 이진수 맞히기',
    `<@${game.userId}>님, 채팅창에 \`00000\`부터 \`11111\` 사이의 5자리 이진수를 입력하세요.`,
    '각 추측에서 정답과 일치하지 않는 자릿수를 알려드립니다.',
    '',
    '### 시도 기록',
    history(game.attempts),
  ].join('\n');
}

export class BinaryQuizManager {
  readonly #games = new Map<string, BinaryGame>();

  public constructor(private readonly random: RandomInt = randomInt) {}

  public hasGame(channelId: string): boolean {
    return this.#games.has(channelId);
  }

  public ownsButton(customId: string): boolean {
    return customId === CANCEL_ID;
  }

  public async start(interaction: ChatInputCommandInteraction): Promise<void> {
    if (this.#games.has(interaction.channelId)) {
      await interaction.reply({
        content: '이 채널에서는 이미 이진수 퀴즈가 진행 중입니다.',
        ephemeral: true,
      });
      return;
    }
    await interaction.deferReply();
    const message = await interaction.editReply('이진수 퀴즈를 준비하고 있습니다…');
    const game: BinaryGame = {
      channelId: interaction.channelId,
      userId: interaction.user.id,
      answer: generateBinaryAnswer(this.random),
      attempts: [],
      message,
    };
    this.#games.set(game.channelId, game);
    await game.message.edit({
      content: gameContent(game),
      components: controls(),
      allowedMentions: { users: [] },
    });
  }

  public async handleMessage(message: Message): Promise<void> {
    if (message.author.bot || !message.inGuild()) return;
    const game = this.#games.get(message.channelId);
    if (game?.userId !== message.author.id) return;
    const guess = message.content.trim();
    if (!BINARY_PATTERN.test(guess)) return;

    const distance = hammingDistance(guess, game.answer);
    game.attempts.push({ guess, distance });
    if (distance === 0) {
      this.#games.delete(game.channelId);
      await game.message.edit({
        content: `${gameContent(game)}\n\n정답은 \`${game.answer}\`입니다. **${game.attempts.length}번째 시도에 맞혔습니다!**`,
        components: [],
        allowedMentions: { users: [] },
      });
      return;
    }
    await game.message.edit({
      content: gameContent(game),
      components: controls(),
      allowedMentions: { users: [] },
    });
  }

  public async handleButton(interaction: ButtonInteraction): Promise<void> {
    const game = this.#games.get(interaction.channelId);
    if (!game) {
      await interaction.reply({ content: '이 퀴즈는 이미 종료되었습니다.', ephemeral: true });
      return;
    }
    if (game.userId !== interaction.user.id) {
      await interaction.reply({
        content: '퀴즈를 시작한 사용자만 취소할 수 있습니다.',
        ephemeral: true,
      });
      return;
    }
    this.#games.delete(game.channelId);
    await interaction.update({
      content: `${gameContent(game)}\n\n퀴즈가 취소되었습니다.`,
      components: [],
    });
  }

  public async shutdown(): Promise<void> {
    const games = [...this.#games.values()];
    this.#games.clear();
    await Promise.allSettled(
      games.map((game) =>
        game.message.edit({
          content: `${gameContent(game)}\n\n봇 종료로 퀴즈가 정리되었습니다.`,
          components: [],
          allowedMentions: { users: [] },
        }),
      ),
    );
  }
}

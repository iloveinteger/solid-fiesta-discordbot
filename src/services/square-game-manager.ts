import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Message,
} from 'discord.js';

type GameMode = 'bot' | 'referee';

interface BaseGame {
  channelId: string;
  hostId: string;
  mode: GameMode;
  expectedIndex: bigint;
  history: string[];
  message: Message;
  timer?: NodeJS.Timeout;
  revision: number;
}

interface BotGame extends BaseGame {
  mode: 'bot';
  userId: string;
  turn: 'bot' | 'user';
}

interface RefereeGame extends BaseGame {
  mode: 'referee';
  phase: 'lobby' | 'playing';
  participants: string[];
  turnIndex: number;
}

type SquareGame = BotGame | RefereeGame;

const IDS = {
  join: 'square:join',
  begin: 'square:begin',
  cancel: 'square:cancel',
} as const;

function mention(userId: string): string {
  return `<@${userId}>`;
}

function expected(game: SquareGame): bigint {
  return game.expectedIndex * game.expectedIndex;
}

export function classifySquareSubmission(
  raw: string,
  target: bigint,
): 'ignore' | 'correct' | 'wrong' {
  const normalized = raw.trim();
  if (!/^\d+$/.test(normalized)) return 'ignore';
  return BigInt(normalized) === target ? 'correct' : 'wrong';
}

function rows(game: SquareGame): ActionRowBuilder<ButtonBuilder>[] {
  if (game.mode === 'referee' && game.phase === 'lobby') {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(IDS.join)
          .setLabel('참가/취소')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(IDS.begin)
          .setLabel('게임 시작')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(IDS.cancel).setLabel('취소').setStyle(ButtonStyle.Danger),
      ),
    ];
  }
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(IDS.cancel).setLabel('취소').setStyle(ButtonStyle.Danger),
    ),
  ];
}

function content(game: SquareGame): string {
  const recent = game.history.length
    ? game.history.slice(-10).join('\n')
    : '아직 제출된 숫자가 없습니다.';
  if (game.mode === 'bot') {
    const turn =
      game.turn === 'user'
        ? `${mention(game.userId)}님의 차례 (10초) · 채팅창에 숫자를 입력하세요.`
        : '봇이 생각하는 중…';
    return `## 제곱수놀이 · 봇 대전\n${turn}\n다음 순서: **${game.expectedIndex}번째 제곱수**\n\n${recent}`;
  }
  if (game.phase === 'lobby') {
    const participants = game.participants.length
      ? game.participants.map(mention).join(', ')
      : '아직 참가자가 없습니다.';
    return `## 제곱수놀이 · 사회자 모드\n참가자: ${participants}\n방장이 2명 이상 모인 뒤 시작할 수 있습니다.`;
  }
  const current = game.participants[game.turnIndex];
  return `## 제곱수놀이 · 사회자 모드\n${current ? mention(current) : '알 수 없음'}님의 차례 (10초) · 채팅창에 숫자를 입력하세요.\n다음 순서: **${game.expectedIndex}번째 제곱수**\n생존자: ${game.participants.map(mention).join(', ')}\n\n${recent}`;
}

export class SquareGameManager {
  readonly #games = new Map<string, SquareGame>();

  public hasGame(channelId: string): boolean {
    return this.#games.has(channelId);
  }

  public async start(interaction: ChatInputCommandInteraction): Promise<void> {
    const channelId = interaction.channelId;
    if (!channelId) {
      await interaction.reply({ content: '서버 채널에서만 시작할 수 있습니다.', ephemeral: true });
      return;
    }
    if (this.#games.has(channelId)) {
      await interaction.reply({
        content: '이 채널에서는 이미 게임이 진행 중입니다.',
        ephemeral: true,
      });
      return;
    }
    const mode = interaction.options.getString('mode', true) as GameMode;
    await interaction.deferReply();
    const placeholder = await interaction.editReply('제곱수놀이를 준비하고 있습니다…');
    const base = {
      channelId,
      hostId: interaction.user.id,
      expectedIndex: 1n,
      history: [],
      message: placeholder,
      revision: 0,
    };
    const game: SquareGame =
      mode === 'bot'
        ? {
            ...base,
            mode,
            userId: interaction.user.id,
            turn: 'user',
          }
        : { ...base, mode, phase: 'lobby', participants: [interaction.user.id], turnIndex: 0 };
    this.#games.set(channelId, game);
    await this.render(game);
    if (game.mode === 'bot') this.scheduleTimeout(game);
  }

  public ownsButton(customId: string): boolean {
    return Object.values(IDS).includes(customId as (typeof IDS)[keyof typeof IDS]);
  }

  public async handleButton(interaction: ButtonInteraction): Promise<void> {
    const game = this.#games.get(interaction.channelId);
    if (!game) {
      await interaction.reply({
        content: '이 게임은 종료되었거나 봇 재시작으로 정리되었습니다.',
        ephemeral: true,
      });
      return;
    }
    switch (interaction.customId) {
      case IDS.join:
        await this.join(interaction, game);
        return;
      case IDS.begin:
        await this.begin(interaction, game);
        return;
      case IDS.cancel:
        await this.cancel(interaction, game);
        return;
    }
  }

  public async handleMessage(message: Message): Promise<void> {
    if (message.author.bot || !message.inGuild()) return;
    const game = this.#games.get(message.channelId);
    if (!game) return;
    const currentUser = game.mode === 'bot' ? game.userId : game.participants[game.turnIndex];
    if (
      currentUser !== message.author.id ||
      (game.mode === 'bot' && game.turn !== 'user') ||
      (game.mode === 'referee' && game.phase !== 'playing')
    ) {
      return;
    }
    const raw = message.content.trim();
    const target = expected(game);
    const submission = classifySquareSubmission(raw, target);
    if (submission === 'ignore') return;
    if (submission === 'wrong') {
      game.history.push(`${mention(message.author.id)}: ${raw.slice(0, 50)} ❌`);
      await this.render(
        game,
        `${mention(message.author.id)}님, 오답입니다. 남은 시간 안에 다시 입력하세요.`,
      );
      return;
    }
    this.clearTimer(game);
    game.history.push(`${mention(message.author.id)}: ${target} ✅`);
    game.expectedIndex += 1n;
    if (game.mode === 'bot') {
      game.turn = 'bot';
      game.revision += 1;
      await this.render(game);
      this.scheduleBot(game);
    } else {
      this.advanceRefereeTurn(game);
      await this.render(game);
      this.scheduleTimeout(game);
    }
  }

  public async shutdown(): Promise<void> {
    const games = [...this.#games.values()];
    this.#games.clear();
    await Promise.allSettled(
      games.map(async (game) => {
        this.clearTimer(game);
        await game.message.edit({
          content: `${content(game)}\n\n봇 종료로 게임이 정리되었습니다.`,
          components: [],
        });
      }),
    );
  }

  private async join(interaction: ButtonInteraction, game: SquareGame): Promise<void> {
    if (game.mode !== 'referee' || game.phase !== 'lobby') {
      await interaction.reply({ content: '참가 등록 시간이 아닙니다.', ephemeral: true });
      return;
    }
    const index = game.participants.indexOf(interaction.user.id);
    if (index >= 0) game.participants.splice(index, 1);
    else if (game.participants.length >= 20) {
      await interaction.reply({ content: '참가자는 최대 20명입니다.', ephemeral: true });
      return;
    } else game.participants.push(interaction.user.id);
    await interaction.update({ content: content(game), components: rows(game) });
  }

  private async begin(interaction: ButtonInteraction, game: SquareGame): Promise<void> {
    if (game.mode !== 'referee' || game.phase !== 'lobby') {
      await interaction.reply({ content: '이미 시작된 게임입니다.', ephemeral: true });
      return;
    }
    if (interaction.user.id !== game.hostId) {
      await interaction.reply({ content: '방장만 게임을 시작할 수 있습니다.', ephemeral: true });
      return;
    }
    if (game.participants.length < 2) {
      await interaction.reply({ content: '참가자가 2명 이상 필요합니다.', ephemeral: true });
      return;
    }
    game.phase = 'playing';
    game.turnIndex = 0;
    game.revision += 1;
    await interaction.update({ content: content(game), components: rows(game) });
    this.scheduleTimeout(game);
  }

  private async cancel(interaction: ButtonInteraction, game: SquareGame): Promise<void> {
    if (interaction.user.id !== game.hostId) {
      await interaction.reply({
        content: '게임을 시작한 사람만 취소할 수 있습니다.',
        ephemeral: true,
      });
      return;
    }
    this.clearTimer(game);
    this.#games.delete(game.channelId);
    await interaction.update({
      content: `${content(game)}\n\n게임이 취소되었습니다.`,
      components: [],
    });
  }

  private scheduleBot(game: BotGame): void {
    this.clearTimer(game);
    const revision = game.revision;
    const delay = 700 + Math.floor(Math.random() * 1_101);
    game.timer = setTimeout(() => {
      void (async () => {
        if (this.#games.get(game.channelId) !== game || game.revision !== revision) return;
        const answer = expected(game);
        game.history.push(`🤖 봇: ${answer} ✅`);
        game.expectedIndex += 1n;
        game.turn = 'user';
        game.revision += 1;
        await this.render(game);
        this.scheduleTimeout(game);
      })().catch((error: unknown) => this.handleAsyncFailure(game, error));
    }, delay);
  }

  private scheduleTimeout(game: SquareGame): void {
    this.clearTimer(game);
    const revision = game.revision;
    game.timer = setTimeout(() => {
      void (async () => {
        if (this.#games.get(game.channelId) !== game || game.revision !== revision) return;
        if (game.mode === 'bot') {
          await this.finish(
            game,
            `${mention(game.userId)}님이 시간 안에 답하지 못했습니다. **봇 승리!**`,
          );
        } else if (game.phase === 'playing') {
          const timedOut = game.participants[game.turnIndex];
          if (timedOut) {
            game.history.push(`${mention(timedOut)}: ⏱️ 시간 초과`);
            await this.eliminateAndContinue(game, timedOut, '시간 초과');
          }
        }
      })().catch((error: unknown) => this.handleAsyncFailure(game, error));
    }, 10_000);
  }

  private async eliminateAndContinue(
    game: RefereeGame,
    userId: string,
    reason: string,
  ): Promise<void> {
    const removedIndex = game.participants.indexOf(userId);
    if (removedIndex >= 0) game.participants.splice(removedIndex, 1);
    if (game.participants.length <= 1) {
      const winner = game.participants[0];
      await this.finish(
        game,
        winner ? `${mention(winner)}님이 마지막 생존자로 **우승!**` : '생존자가 없습니다.',
      );
      return;
    }
    if (removedIndex < game.turnIndex) game.turnIndex -= 1;
    if (game.turnIndex >= game.participants.length) game.turnIndex = 0;
    game.revision += 1;
    await this.render(game, `${mention(userId)}님 탈락 (${reason})`);
    this.scheduleTimeout(game);
  }

  private advanceRefereeTurn(game: RefereeGame): void {
    game.turnIndex = (game.turnIndex + 1) % game.participants.length;
    game.revision += 1;
  }

  private async render(game: SquareGame, notice?: string): Promise<void> {
    await game.message.edit({
      content: `${content(game)}${notice ? `\n\n${notice}` : ''}`,
      components: rows(game),
      allowedMentions: { users: [] },
    });
  }

  private async finish(game: SquareGame, result: string): Promise<void> {
    this.clearTimer(game);
    this.#games.delete(game.channelId);
    await game.message.edit({
      content: `${content(game)}\n\n${result}`,
      components: [],
      allowedMentions: { users: [] },
    });
  }

  private clearTimer(game: SquareGame): void {
    if (game.timer) clearTimeout(game.timer);
    delete game.timer;
  }

  private handleAsyncFailure(game: SquareGame, error: unknown): void {
    this.clearTimer(game);
    this.#games.delete(game.channelId);
    console.error('제곱수놀이 비동기 처리 실패:', error);
    void game.message.edit({
      content: '게임 처리 중 오류가 발생해 안전하게 종료했습니다.',
      components: [],
    });
  }
}

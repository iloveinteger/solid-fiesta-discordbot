import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import type { StdictProvider } from '../providers/stdict-provider.js';
import type { ExchangeService } from '../services/exchange-service.js';
import type { FactorService } from '../services/factor/factor-service.js';
import { DICE_EMOJI, rollDice } from '../services/dice.js';
import type { DockerPythonRunner } from '../services/python-runner.js';
import type { SquareGameManager } from '../services/square-game-manager.js';
import { errorMessage, truncate } from '../utils/errors.js';

export interface CommandDependencies {
  factorService: FactorService;
  exchangeService: ExchangeService;
  dictionary: StdictProvider;
  pythonRunner: DockerPythonRunner;
  pythonEnabled: boolean;
  squareGames: SquareGameManager;
}

export class CommandHandler {
  public constructor(private readonly dependencies: CommandDependencies) {}

  public async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      switch (interaction.commandName) {
        case 'square':
          await this.dependencies.squareGames.start(interaction);
          break;
        case 'factor':
          await this.factor(interaction);
          break;
        case 'exchange':
          await this.exchange(interaction);
          break;
        case 'dice':
          await this.dice(interaction);
          break;
        case 'dict':
          await this.dictionary(interaction);
          break;
        case 'python':
          await this.python(interaction);
          break;
      }
    } catch (error) {
      await this.sendError(interaction, error);
    }
  }

  public async handleButton(interaction: ButtonInteraction): Promise<void> {
    try {
      if (this.dependencies.squareGames.ownsButton(interaction.customId)) {
        await this.dependencies.squareGames.handleButton(interaction);
      } else if (interaction.customId.startsWith('dict:detail:')) {
        await this.dictionaryDetail(interaction);
      }
    } catch (error) {
      await this.sendError(interaction, error);
    }
  }

  private async factor(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const result = await this.dependencies.factorService.calculate(
      interaction.options.getString('number', true),
    );
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('소인수분해')
          .setDescription(`**${result.input} = ${result.formatted}**`)
          .setFooter({ text: result.cached ? 'SQLite 캐시 결과' : '새로 계산한 결과' }),
      ],
    });
  }

  private async exchange(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const rates = await this.dependencies.exchangeService.getRates();
    const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 });
    const embed = new EmbedBuilder()
      .setTitle('환율')
      .addFields(
        { name: '1 USD', value: `${number.format(rates.usdKrw)} KRW`, inline: true },
        { name: '1 JPY', value: `${number.format(rates.jpyKrw)} KRW`, inline: true },
        { name: '100 JPY', value: `${number.format(rates.jpyKrw * 100)} KRW`, inline: true },
      )
      .setDescription('은행 고시환율 및 실제 거래 환율과 차이가 날 수 있습니다.')
      .setFooter({
        text: `${rates.source} · 기준일 ${rates.dataDate} · 조회 ${rates.fetchedAt.toLocaleString('ko-KR')}${rates.stale ? ' · 공급자 오류로 마지막 정상 캐시 표시' : ''}`,
      });
    await interaction.editReply({ embeds: [embed] });
  }

  private async dice(interaction: ChatInputCommandInteraction): Promise<void> {
    const value = rollDice();
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${DICE_EMOJI[value]}  ${value}`)
          .setDescription('1부터 6까지 · 암호학적 난수로 균등 추출'),
      ],
    });
  }

  private async dictionary(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const results = await this.dependencies.dictionary.search(
      interaction.options.getString('word', true),
    );
    if (results.length === 0) {
      await interaction.editReply('표준국어대사전에서 일치하는 결과를 찾지 못했습니다.');
      return;
    }
    const embed = new EmbedBuilder().setTitle('표준국어대사전 검색 결과').setFooter({
      text: '출처: 국립국어원 표준국어대사전 Open API',
    });
    for (const [index, item] of results.entries()) {
      const shoulder = item.homonymNumber ? ` ${item.homonymNumber}` : '';
      embed.addFields({
        name: `${index + 1}. ${item.word}${shoulder} · ${item.partOfSpeech}`,
        value: item.definition,
      });
    }
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let offset = 0; offset < results.length; offset += 5) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          ...results.slice(offset, offset + 5).map((item, index) =>
            new ButtonBuilder()
              .setCustomId(`dict:detail:${item.targetCode}`)
              .setLabel(`${offset + index + 1}번 상세 보기`)
              .setStyle(ButtonStyle.Secondary),
          ),
        ),
      );
    }
    await interaction.editReply({ embeds: [embed], components: rows });
  }

  private async dictionaryDetail(interaction: ButtonInteraction): Promise<void> {
    const targetCode = interaction.customId.slice('dict:detail:'.length);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const detail = await this.dependencies.dictionary.detail(targetCode);
    const descriptions = detail.senses.slice(0, 8).map((sense, index) => {
      const examples = sense.examples.length ? `\n예: ${sense.examples.join(' / ')}` : '';
      return `**${index + 1}. [${sense.partOfSpeech}]** ${sense.definition}${examples}`;
    });
    const metadata = [
      detail.pronunciation.length ? `발음: ${detail.pronunciation.join(', ')}` : '',
      detail.origins.length ? `어원/원어: ${detail.origins.join(', ')}` : '',
    ].filter(Boolean);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(detail.word)
          .setDescription(
            truncate([...metadata, ...descriptions].join('\n\n') || '상세 정보가 없습니다.', 4_000),
          )
          .setFooter({ text: '출처: 국립국어원 표준국어대사전 Open API' }),
      ],
    });
  }

  private async python(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.dependencies.pythonEnabled) {
      await interaction.reply({
        content: 'Python 실행 기능이 비활성화되어 있습니다.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await this.dependencies.pythonRunner.run(
      interaction.options.getString('code', true),
    );
    await interaction.editReply(
      `**${result.status}**\n\n\`\`\`text\n${truncate(result.output.replaceAll('```', '``\\`'), 7_500)}\n\`\`\``,
    );
  }

  private async sendError(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    error: unknown,
  ): Promise<void> {
    const content = `오류: ${truncate(errorMessage(error), 1_500)}`;
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content });
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

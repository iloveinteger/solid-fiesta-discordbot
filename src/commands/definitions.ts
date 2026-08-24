import { SlashCommandBuilder } from 'discord.js';

export const commandBuilders = [
  new SlashCommandBuilder()
    .setName('square')
    .setDescription('순서대로 제곱수를 말하는 게임')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('start')
        .setDescription('제곱수놀이를 시작합니다')
        .addStringOption((option) =>
          option
            .setName('mode')
            .setDescription('게임 방식')
            .setRequired(true)
            .addChoices(
              { name: '봇 대전', value: 'bot' },
              { name: '사회자 모드', value: 'referee' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('first')
            .setDescription('봇 대전에서 먼저 시작할 쪽 (기본: 사용자)')
            .addChoices({ name: '사용자', value: 'user' }, { name: '봇', value: 'bot' }),
        ),
    ),
  new SlashCommandBuilder()
    .setName('factor')
    .setDescription('자연수를 소인수분해합니다')
    .addStringOption((option) =>
      option.setName('number').setDescription('10진수 자연수 (최대 80자리)').setRequired(true),
    ),
  new SlashCommandBuilder().setName('exchange').setDescription('원화 기준 주요 환율을 조회합니다'),
  new SlashCommandBuilder().setName('dice').setDescription('공정한 6면체 주사위를 굴립니다'),
  new SlashCommandBuilder()
    .setName('dict')
    .setDescription('표준국어대사전에서 단어를 찾습니다')
    .addStringOption((option) =>
      option.setName('word').setDescription('검색할 단어').setRequired(true).setMaxLength(50),
    ),
  new SlashCommandBuilder()
    .setName('python')
    .setDescription('격리 환경에서 제한된 Python 코드를 실행합니다')
    .addStringOption((option) =>
      option
        .setName('code')
        .setDescription('실행할 Python 코드')
        .setRequired(true)
        .setMaxLength(4_000),
    ),
];

export const commandData = commandBuilders.map((command) => command.toJSON());

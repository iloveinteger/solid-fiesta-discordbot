import { SlashCommandBuilder } from 'discord.js';
import { ASK_MAX_QUESTION_LENGTH } from '../services/ask-service.js';
import { SPELLCHECK_MAX_INPUT_LENGTH } from '../services/spellcheck-service.js';

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
    .setName('binary')
    .setDescription('랜덤한 5자리 이진수를 해밍 거리로 맞힙니다'),
  new SlashCommandBuilder()
    .setName('factole')
    .setDescription('워들형 퍼즐 Factole Activity를 실행합니다'),
  new SlashCommandBuilder()
    .setName('dict')
    .setDescription('표준국어대사전에서 단어를 찾습니다')
    .addStringOption((option) =>
      option.setName('word').setDescription('검색할 단어').setRequired(true).setMaxLength(50),
    ),
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Gemini에게 짧게 질문합니다')
    .addStringOption((option) =>
      option
        .setName('question')
        .setDescription('질문 내용')
        .setRequired(true)
        .setMaxLength(ASK_MAX_QUESTION_LENGTH),
    ),
  new SlashCommandBuilder()
    .setName('spell')
    .setDescription('한국어 문장의 맞춤법을 검사합니다')
    .addStringOption((option) =>
      option
        .setName('sentence')
        .setDescription('검사할 문장')
        .setRequired(true)
        .setMaxLength(SPELLCHECK_MAX_INPUT_LENGTH),
    ),
];

export const commandData = commandBuilders.map((command) => command.toJSON());

import { Client, Events, GatewayIntentBits } from 'discord.js';
import { CommandHandler } from './commands/command-handler.js';
import { loadConfig } from './config.js';
import { FrankfurterProvider } from './providers/exchange-provider.js';
import { StdictProvider } from './providers/stdict-provider.js';
import { BinaryQuizManager } from './services/binary-quiz-manager.js';
import { AskService } from './services/ask-service.js';
import { ExchangeService } from './services/exchange-service.js';
import { FactorService } from './services/factor/factor-service.js';
import { SquareGameManager } from './services/square-game-manager.js';
import { SpellcheckService } from './services/spellcheck-service.js';

const config = loadConfig();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const squareGames = new SquareGameManager();
const binaryGames = new BinaryQuizManager();
const handler = new CommandHandler({
  factorService: new FactorService(),
  exchangeService: new ExchangeService(new FrankfurterProvider()),
  dictionary: new StdictProvider(config.stdictApiKey),
  squareGames,
  binaryGames,
  askService: new AskService(config.geminiApiKey, config.geminiModel),
  spellcheckService: new SpellcheckService(config.spellcheckApiToken),
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`${readyClient.user.tag} 로그인 완료 (게임 채널의 숫자 메시지만 처리)`);
});

client.on(Events.InteractionCreate, (interaction) => {
  void (async () => {
    if (interaction.isChatInputCommand()) await handler.handleCommand(interaction);
    else if (interaction.isButton()) await handler.handleButton(interaction);
  })().catch((error: unknown) => console.error('상호작용 처리 실패:', error));
});

client.on(Events.MessageCreate, (message) => {
  void Promise.all([squareGames.handleMessage(message), binaryGames.handleMessage(message)]).catch(
    (error: unknown) => console.error('게임 메시지 처리 실패:', error),
  );
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} 수신: 진행 중 게임과 메모리 상태를 정리합니다.`);
  await Promise.all([squareGames.shutdown(), binaryGames.shutdown()]);
  await client.destroy();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await client.login(config.discordToken);

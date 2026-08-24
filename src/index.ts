import { Client, Events, GatewayIntentBits } from 'discord.js';
import { CommandHandler } from './commands/command-handler.js';
import { loadConfig } from './config.js';
import { FrankfurterProvider } from './providers/exchange-provider.js';
import { StdictProvider } from './providers/stdict-provider.js';
import { openDatabase } from './repositories/database.js';
import { SqliteExchangeCacheRepository } from './repositories/exchange-cache-repository.js';
import { SqliteFactorCacheRepository } from './repositories/factor-cache-repository.js';
import { ExchangeService } from './services/exchange-service.js';
import { FactorService } from './services/factor/factor-service.js';
import { DockerPythonRunner } from './services/python-runner.js';
import { SquareGameManager } from './services/square-game-manager.js';

const config = loadConfig();
const database = openDatabase(config.databasePath);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const squareGames = new SquareGameManager();
const handler = new CommandHandler({
  factorService: new FactorService(new SqliteFactorCacheRepository(database)),
  exchangeService: new ExchangeService(
    new FrankfurterProvider(),
    new SqliteExchangeCacheRepository(database),
  ),
  dictionary: new StdictProvider(config.stdictApiKey),
  pythonRunner: new DockerPythonRunner(config.pythonRunnerImage),
  pythonEnabled: config.enablePythonRunner,
  squareGames,
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`${readyClient.user.tag} 로그인 완료 (일반 메시지 내용 인텐트 미사용)`);
});

client.on(Events.InteractionCreate, (interaction) => {
  void (async () => {
    if (interaction.isChatInputCommand()) await handler.handleCommand(interaction);
    else if (interaction.isButton()) await handler.handleButton(interaction);
    else if (interaction.isModalSubmit() && squareGames.ownsModal(interaction.customId)) {
      await squareGames.handleModal(interaction);
    }
  })().catch((error: unknown) => console.error('상호작용 처리 실패:', error));
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} 수신: 게임과 데이터베이스를 정리합니다.`);
  await squareGames.shutdown();
  await client.destroy();
  database.close();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await client.login(config.discordToken);

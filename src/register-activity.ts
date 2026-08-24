import { EntryPointCommandHandlerType, REST, Routes } from 'discord.js';
import { findEntryPointCommand } from './commands/registration.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const rest = new REST({ version: '10' }).setToken(config.discordToken);
const commands = await rest.get(Routes.applicationCommands(config.applicationId));
const entryPoint = findEntryPointCommand(commands);

if (!entryPoint) {
  throw new Error(
    'Activity Entry Point가 없습니다. Discord Developer Portal에서 Activities를 먼저 활성화하세요.',
  );
}

await rest.patch(Routes.applicationCommand(config.applicationId, entryPoint.id), {
  body: {
    name: 'factole',
    description: 'Factole 퍼즐을 Discord 안에서 플레이합니다',
    handler: EntryPointCommandHandlerType.DiscordLaunchActivity,
  },
});
console.log('Factole Activity Entry Point를 등록했습니다.');

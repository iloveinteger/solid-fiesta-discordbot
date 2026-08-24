import { REST, Routes } from 'discord.js';
import { commandData } from './commands/definitions.js';
import { preserveEntryPointCommand } from './commands/registration.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const rest = new REST({ version: '10' }).setToken(config.discordToken);
const route = config.guildId
  ? Routes.applicationGuildCommands(config.applicationId, config.guildId)
  : Routes.applicationCommands(config.applicationId);
const body = config.guildId
  ? commandData
  : preserveEntryPointCommand(commandData, await rest.get(route));

await rest.put(route, { body });
console.log(
  config.guildId
    ? `개발 서버에 슬래시 명령어 ${commandData.length}개를 등록했습니다.`
    : `전역 명령어 ${body.length}개를 등록했습니다. 기존 Activity Entry Point는 유지됩니다. 반영까지 시간이 걸릴 수 있습니다.`,
);

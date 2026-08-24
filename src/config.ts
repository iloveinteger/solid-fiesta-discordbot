import 'dotenv/config';

export interface Config {
  discordToken: string;
  applicationId: string;
  guildId?: string;
  stdictApiKey: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`필수 환경변수 ${name}이(가) 설정되지 않았습니다.`);
  return value;
}

export function loadConfig(): Config {
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  return {
    discordToken: required('DISCORD_BOT_TOKEN'),
    applicationId: required('DISCORD_APPLICATION_ID'),
    ...(guildId ? { guildId } : {}),
    stdictApiKey: required('STDICT_API_KEY'),
  };
}

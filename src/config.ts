import 'dotenv/config';

export interface Config {
  discordToken: string;
  applicationId: string;
  guildId?: string;
  stdictApiKey: string;
  geminiApiKey?: string;
  geminiModel: string;
  spellcheckApiToken?: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`필수 환경변수 ${name}이(가) 설정되지 않았습니다.`);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  return value;
}

export function loadConfig(): Config {
  const guildId = optional('DISCORD_GUILD_ID');
  const geminiApiKey = optional('GEMINI_API_KEY');
  const geminiModel = optional('GEMINI_MODEL');
  const spellcheckApiToken = optional('SPELLCHECK_API_TOKEN');
  return {
    discordToken: required('DISCORD_BOT_TOKEN'),
    applicationId: required('DISCORD_APPLICATION_ID'),
    ...(guildId ? { guildId } : {}),
    stdictApiKey: required('STDICT_API_KEY'),
    ...(geminiApiKey ? { geminiApiKey } : {}),
    geminiModel: geminiModel ?? 'gemini-3.5-flash-lite',
    ...(spellcheckApiToken ? { spellcheckApiToken } : {}),
  };
}

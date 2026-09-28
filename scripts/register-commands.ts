import { readFile } from "node:fs/promises";
import { commands } from "../src/discord/commands";

const API_BASE = "https://discord.com/api/v10";

async function loadEnvironment(): Promise<Record<string, string>> {
  const environment = { ...process.env } as Record<string, string>;

  try {
    const contents = await readFile(".env", "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const separator = line.indexOf("=");
      if (separator < 1) continue;

      const name = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
      environment[name] ??= value;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  return environment;
}

function required(environment: Record<string, string>, name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`Missing ${name} in .env or the process environment.`);
  return value;
}

const environment = await loadEnvironment();
const applicationId = required(environment, "DISCORD_APPLICATION_ID");
const botToken = required(environment, "DISCORD_BOT_TOKEN");
const guildId = environment.DISCORD_GUILD_ID;
const path = guildId
  ? `/applications/${applicationId}/guilds/${guildId}/commands`
  : `/applications/${applicationId}/commands`;

const response = await fetch(`${API_BASE}${path}`, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(commands),
});

if (!response.ok) {
  throw new Error(`Discord command registration failed (${response.status}): ${await response.text()}`);
}

const registered = (await response.json()) as Array<{ name: string }>;
const scope = guildId ? `guild ${guildId}` : "global application";
console.log(`Registered ${registered.length} commands for ${scope}:`);
for (const command of registered) console.log(`- ${command.name}`);

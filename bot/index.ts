import {
  Client,
  ClientOptions,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { Pool } from "pg";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extend Client to include commands collection
interface FeatherQuestClient extends Client {
  commands: Collection<string, {
    data: SlashCommandBuilder;
    execute: (interaction: any, pool: Pool) => Promise<void>;
  }>;
}

// Database connection (same PostgreSQL the web app uses)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Bot client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
}) as FeatherQuestClient;

// Command collection
client.commands = new Collection();

// Load commands from the commands directory
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

const commands: any[] = [];

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = await import(filePath);
  const cmd = command.default;
  client.commands.set(cmd.data.name, cmd);
  commands.push(cmd.data.toJSON());
}

// Register slash commands with Discord
async function registerCommands() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token || !clientId) {
    console.error("Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID");
    process.exit(1);
  }

  const rest = new REST({ version: "10" }).setToken(token);

  try {
    console.log(`Registering ${commands.length} slash commands...`);

    await rest.put(Routes.applicationCommands(clientId), {
      body: commands,
    });

    console.log("Slash commands registered successfully.");
  } catch (error) {
    console.error("Failed to register commands:", error);
  }
}

// Handle interactions
client.on("interactionCreate", async (interaction) => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, pool);
    } catch (error) {
      console.error(`Error executing ${interaction.commandName}:`, error);

      const reply = {
        content: "Something went wrong executing that command.",
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
    return;
  }

  // Handle button clicks and select menus
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    try {
      const { handleInteraction } = await import("./interactions.js");
      await handleInteraction(interaction, pool);
    } catch (error) {
      console.error("Error handling interaction:", error);
      const reply = {
        content: "Something went wrong.",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  }
});

// Bot ready event
client.once("ready", async () => {
  console.log(`Feather Quest bot is online as ${client.user?.tag}`);
  await registerCommands();
});

// Start the bot
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error("DISCORD_BOT_TOKEN is not set.");
  process.exit(1);
}

client.login(token);

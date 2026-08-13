# FeatherQuest Bot

A Discord bot for the **FeatherQuest** D&D 5e multiplayer RPG. Players can create characters, go on quests, fight in combat, trade items, form parties, run dungeons, battle in PvP, and chat — all from Discord.

## Bot Type

**Application Bot** (Slash Commands)

This is a Discord Application Bot that uses **slash commands** (`/command`) for all interactions. It does not respond to regular messages. It uses:

- **discord.js v14** for the Discord API
- **PostgreSQL** (shared with the web app) for all game data
- **tsx** for running TypeScript directly in development

## Required Environment Variables

| Variable | Description | Where to Get It |
|----------|-------------|-----------------|
| `DISCORD_BOT_TOKEN` | Bot token for authentication | [Discord Developer Portal](https://discord.com/developers/applications) → Your App → Bot → Token |
| `DISCORD_CLIENT_ID` | Application/Client ID | [Discord Developer Portal](https://discord.com/developers/applications) → Your App → General Information |
| `DATABASE_URL` | PostgreSQL connection string | Same as the web app's Vercel Postgres database |

### Getting Your Discord Bot Token

1. Go to https://discord.com/developers/applications
2. Click **New Application** → name it → **Create**
3. Go to **Bot** tab → click **Reset Token** → copy the token
4. Under **Privileged Gateway Intents**, enable:
   - Message Content Intent
5. Go to **OAuth2** → **URL Generator**
6. Select scopes: `bot`, `applications.commands`
7. Select permissions: Send Messages, Use Slash Commands, Embed Links, Attach Files
8. Copy the generated URL and invite the bot to your server

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create .env from template
cp .env.example .env

# 3. Edit .env with your values
# DISCORD_BOT_TOKEN=your_token_here
# DISCORD_CLIENT_ID=your_client_id_here
# DATABASE_URL=your_db_url_here

# 4. Run the bot
npm run start
```

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Create a new character (race → class → abilities → background) |
| `/character` | View your character sheet |
| `/play` | Browse and accept quests |
| `/attack` | Attack with equipped weapon |
| `/cast` | Cast a known spell |
| `/rest` | Take a short or long rest |
| `/inventory` | View your inventory |
| `/roll` | Roll dice (D&D notation like `2d6+3`) |
| `/party` | Create, join, manage parties |
| `/trade` | Send, accept, decline trades |
| `/chat` | Send messages to party/faction/global chat |
| `/nearby` | See online players |
| `/leaderboard` | View rankings by level/gold/quests/xp |
| `/faction` | Join and manage factions |
| `/dungeon` | Run 5-room dungeons with your party |
| `/pvp` | Challenge other players to PvP combat |

## Shared Game Logic

The bot shares game mechanics with the web app through `../lib/game/`:

- `dice.ts` — NdS+M roller, 4d6kh3, ability score generation
- `combat.ts` — Attack rolls, damage, healing, leveling
- `classes.ts` — Class/race/background data
- `character.ts` — Character creation, validation

## Running alongside the Web App

Both the bot and web app connect to the **same PostgreSQL database**, so:
- Characters created on the web appear in Discord
- Quest progress syncs between platforms
- Party members see each other on both web and Discord
- Trading works cross-platform

## Scripts

| Script | Description |
|--------|-------------|
| `npm run start` | Start the bot (development) |
| `npm run dev` | Start with auto-reload on file changes |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run start:prod` | Run compiled JavaScript (production) |

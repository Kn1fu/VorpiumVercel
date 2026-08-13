import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { Pool } from "pg";
import { RACES, CLASSES, BACKGROUNDS } from "../../../lib/game/classes";
import { generateAbilityScores } from "../../../lib/game/character";
import { abilityMod } from "../../../lib/game/combat";

export default {
  data: new SlashCommandBuilder()
    .setName("start")
    .setDescription("Begin your Feather Quest adventure!")
    .addStringOption((opt) =>
      opt
        .setName("name")
        .setDescription("Your character's name")
        .setRequired(true)
        .setMaxLength(24)
    ),

  async execute(interaction: any, pool: Pool) {
    const discordId = interaction.user.id;
    const name = interaction.options.getString("name");

    // Check if user already has a character
    const existing = await pool.query(
      "SELECT id FROM characters WHERE user_id = (SELECT id FROM users WHERE discord_id = $1)",
      [discordId]
    );

    if (existing.rows.length > 0) {
      return interaction.reply({
        content:
          "You already have a character! Use `/character` to view them.",
        ephemeral: true,
      });
    }

    // Make sure user exists in DB
    const userResult = await pool.query(
      "SELECT id FROM users WHERE discord_id = $1",
      [discordId]
    );

    let userId: number;

    if (userResult.rows.length === 0) {
      // Create user from Discord info
      const user = await interaction.user.fetch();
      const insertResult = await pool.query(
        `INSERT INTO users (discord_id, username, avatar, created_at, last_login)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (discord_id) DO UPDATE SET last_login = NOW()
         RETURNING id`,
        [discordId, user.username, user.avatarURL() || null]
      );
      userId = insertResult.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
    }

    // Show race selection
    const raceMenu = new StringSelectMenuBuilder()
      .setCustomId("create_race")
      .setPlaceholder("Choose your race...")
      .addOptions(
        RACES.map((r) => ({
          label: r.name,
          description: `${r.speed}ft speed | ${Object.entries(r.bonuses)
            .map(([k, v]) => `+${v} ${k.toUpperCase()}`)
            .join(", ")}`,
          value: String(r.id),
        }))
      );

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(raceMenu);

    const embed = new EmbedBuilder()
      .setTitle("Feather Quest — Character Creation")
      .setDescription(
        `Welcome, **${name}**! Let's create your character.\n\n**Step 1/4:** Choose your race.`
      )
      .setColor(0x6366f1);

    // Store creation state in a temp map (use a Map in production with TTL)
    const stateMap = (globalThis as any).__createState =
      (globalThis as any).__createState || new Map();

    stateMap.set(discordId, {
      step: "race",
      name,
      userId,
    });

    await interaction.reply({
      embeds: [embed],
      components: [selectRow],
      ephemeral: true,
    });
  },
};

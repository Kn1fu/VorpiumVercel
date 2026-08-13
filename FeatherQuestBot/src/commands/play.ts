import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { Pool } from "pg";

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("See available quests and start your adventure"),

  async execute(interaction: any, pool: Pool) {
    const discordId = interaction.user.id;

    // Get character
    const charResult = await pool.query(
      `
        SELECT c.id, c.name, c.level, c.xp, c.location, c.status, c.current_hp
        FROM characters c
        WHERE c.user_id = (SELECT id FROM users WHERE discord_id = $1)
        LIMIT 1
      `,
      [discordId]
    );

    if (charResult.rows.length === 0) {
      return interaction.reply({
        content:
          "You don't have a character yet! Use `/start` to begin.",
        ephemeral: true,
      });
    }

    const char = charResult.rows[0];

    if (char.current_hp <= 0) {
      return interaction.reply({
        content:
          "You are unconscious or dead! Use `/rest` to recover or ask for healing.",
        ephemeral: true,
      });
    }

    // Get available quests for this level
    const questResult = await pool.query(
      `
        SELECT q.id, q.name, q.description, q.min_level, q.max_level,
               q.xp_reward, q.gp_reward, q.type, q.difficulty
        FROM quests q
        WHERE q.min_level <= $1 AND q.max_level >= $1
        ORDER BY q.min_level ASC
      `,
      [char.level]
    );

    if (questResult.rows.length === 0) {
      return interaction.reply({
        content: "No quests available for your level right now.",
        ephemeral: true,
      });
    }

    // Get active quests
    const activeResult = await pool.query(
      `
        SELECT pq.id, pq.status, q.name AS quest_name
        FROM player_quests pq
        JOIN quests q ON pq.quest_id = q.id
        WHERE pq.character_id = $1 AND pq.status = 'active'
      `,
      [char.id]
    );

    const embed = new EmbedBuilder()
      .setTitle(`${char.name}'s Quest Log`)
      .setDescription(
        `Level ${char.level} — ${char.location || "Town Square"}`
      )
      .setColor(0x6366f1);

    // Active quests section
    if (activeResult.rows.length > 0) {
      const activeText = activeResult.rows
        .map(
          (q: any) =>
            `• **${q.quest_name}** — Progress: ${q.status}`
        )
        .join("\n");
      embed.addFields({
        name: "📜 Active Quests",
        value: activeText,
        inline: false,
      });
    }

    // Available quests
    const buttons: any[] = [];
    const availableText = questResult.rows
      .map((q: any, i: number) => {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`quest_${q.id}`)
            .setLabel(q.name.substring(0, 25))
            .setStyle(ButtonStyle.Primary)
        );
        return (
          `**${q.name}** (${q.difficulty})\n` +
          `${q.description}\n` +
          `Reward: ${q.xp_reward} XP, ${q.gp_reward} GP\n` +
          `Type: ${q.type} | Level ${q.min_level}-${q.max_level}`
        );
      })
      .join("\n\n");

    embed.addFields({
      name: "⚔️ Available Quests",
      value: availableText || "No quests available.",
      inline: false,
    });

    // Limit to 5 buttons per row
    const rows: any[] = [];
    for (let i = 0; i < buttons.length; i += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        buttons.slice(i, i + 5)
      );
      rows.push(row);
    }

    await interaction.reply({ embeds: [embed], components: rows });
  },
};

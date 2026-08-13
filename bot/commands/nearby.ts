import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Pool } from "pg";

export default {
  data: new SlashCommandBuilder()
    .setName("nearby")
    .setDescription("Show nearby online players"),

  async execute(interaction: any, pool: Pool) {
    const res = await pool.query(
      `SELECT c.name, c.level, cl.name as class_name, c.race, c.location
       FROM characters c
       LEFT JOIN classes cl ON c.class_id = cl.id
       WHERE c.status = 'alive'
       ORDER BY c.level DESC
       LIMIT 25`
    );

    if (res.rows.length === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setDescription("No online players found."),
        ],
        ephemeral: true,
      });
    }

    const list = res.rows
      .map(
        (r: any) =>
          `**${r.name}** — Lv${r.level} ${r.race} ${r.class_name || "Unknown"} @ ${r.location || "Unknown"}`
      )
      .join("\n");

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("Online Players")
          .setDescription(list),
      ],
      ephemeral: true,
    });
  },
};

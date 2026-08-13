import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Pool } from "pg";

export default {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View leaderboards")
    .addSubcommand((sub) => sub.setName("level").setDescription("Top players by level"))
    .addSubcommand((sub) => sub.setName("gold").setDescription("Top players by gold"))
    .addSubcommand((sub) =>
      sub.setName("quests").setDescription("Top players by completed quests")
    )
    .addSubcommand((sub) => sub.setName("xp").setDescription("Top players by total XP")),

  async execute(interaction: any, pool: Pool) {
    const sub = interaction.options.getSubcommand();

    let query = "";
    let statLabel = "";

    if (sub === "level") {
      query = `SELECT c.name, c.level, cl.name as class_name, c.xp as stat
               FROM characters c
               LEFT JOIN classes cl ON c.class_id = cl.id
               ORDER BY c.level DESC, c.xp DESC
               LIMIT 20`;
      statLabel = "Level";
    } else if (sub === "gold") {
      query = `SELECT c.name, c.level, cl.name as class_name, c.gold as stat
               FROM characters c
               LEFT JOIN classes cl ON c.class_id = cl.id
               ORDER BY c.gold DESC
               LIMIT 20`;
      statLabel = "Gold";
    } else if (sub === "quests") {
      query = `SELECT c.name, c.level, cl.name as class_name, COUNT(pq.id) AS stat
               FROM characters c
               LEFT JOIN classes cl ON c.class_id = cl.id
               LEFT JOIN player_quests pq ON pq.character_id = c.id AND pq.status = 'completed'
               GROUP BY c.id, c.name, c.level, cl.name
               ORDER BY stat DESC
               LIMIT 20`;
      statLabel = "Quests Completed";
    } else if (sub === "xp") {
      query = `SELECT c.name, c.level, cl.name as class_name, c.xp as stat
               FROM characters c
               LEFT JOIN classes cl ON c.class_id = cl.id
               ORDER BY c.xp DESC
               LIMIT 20`;
      statLabel = "Total XP";
    }

    const res = await pool.query(query);

    if (res.rows.length === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffd700)
            .setDescription("No characters found on the leaderboard."),
        ],
        ephemeral: true,
      });
    }

    const medals = ["🥇", "🥈", "🥉"];
    const list = res.rows
      .map(
        (r: any, i: number) =>
          `${medals[i] || `#${i + 1}`} **${r.name}** — Lv${r.level} ${r.class_name || "Unknown"} | ${statLabel}: ${r.stat.toLocaleString()}`
      )
      .join("\n");

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle(`Leaderboard — ${statLabel}`)
          .setDescription(list),
      ],
      ephemeral: true,
    });
  },
};

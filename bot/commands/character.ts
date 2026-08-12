import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Pool } from "pg";

export default {
  data: new SlashCommandBuilder()
    .setName("character")
    .setDescription("View your character sheet"),

  async execute(interaction: any, pool: Pool) {
    const discordId = interaction.user.id;

    const result = await pool.query(
      `
          c.id, c.name, c.level, c.xp, c.hp, c.max_hp, c.current_hp,
          c.ac, c.speed, c.gold, c.alignment, c.location, c.status,
          cl.name AS class_name, cl.hit_die,
          r.name AS race_name, r.speed AS race_speed,
          b.name AS background_name,
          a.str, a.dex, a."con", a.int, a.wis, a.cha
        FROM characters c
        LEFT JOIN classes cl ON c.class_id = cl.id
        LEFT JOIN races r ON c.race_id = r.id
        LEFT JOIN backgrounds b ON c.background_id = b.id
        LEFT JOIN ability_scores a ON c.id = a.character_id
        WHERE c.user_id = (SELECT id FROM users WHERE discord_id = $1)
        LIMIT 1
      `,
      [discordId]
    );

    if (result.rows.length === 0) {
      return interaction.reply({
        content:
          "You don't have a character yet! Use `/start` to begin your adventure.",
        ephemeral: true,
      });
    }

    const c = result.rows[0];

    const abilityMod = (score: number) =>
      Math.floor((score - 10) / 2);

    const modStr = (score: number) => {
      const mod = abilityMod(score);
      return mod >= 0 ? `+${mod}` : `${mod}`;
    };

    const hpBar = (() => {
      const length = 10;
      const current = c.current_hp || c.hp;
      const filled = Math.round((current / c.max_hp) * length);
      const empty = length - filled;
      return "█".repeat(filled) + "░".repeat(empty);
    })();

    const embed = new EmbedBuilder()
      .setTitle(c.name)
      .setDescription(
        `**Level ${c.level}** ${c.race_name || "Unknown"} ${c.class_name || "Unknown"}`
      )
      .setColor(0x6366f1)
      .addFields(
        {
          name: "❤️ HP",
          value: `${hpBar}\n${c.current_hp || c.hp} / ${c.max_hp}`,
          inline: true,
        },
        {
          name: "🛡️ AC",
          value: String(c.ac),
          inline: true,
        },
        {
          name: "⚡ Speed",
          value: `${c.speed || c.race_speed || 30} ft`,
          inline: true,
        },
        {
          name: "💰 Gold",
          value: String(c.gold || 0),
          inline: true,
        },
        {
          name: "📍 Location",
          value: c.location || "Town Square",
          inline: true,
        },
        {
          name: "⚔️ XP",
          value: String(c.xp || 0),
          inline: true,
        },
        {
          name: "─── Abilities ───",
          value: "\u200b",
          inline: false,
        },
        {
          name: "STR",
          value: `${c.str} (${modStr(c.str)})`,
          inline: true,
        },
        {
          name: "DEX",
          value: `${c.dex} (${modStr(c.dex)})`,
          inline: true,
        },
        {
          name: "CON",
          value: `${c.con} (${modStr(c.con)})`,
          inline: true,
        },
        {
          name: "INT",
          value: `${c.int} (${modStr(c.int)})`,
          inline: true,
        },
        {
          name: "WIS",
          value: `${c.wis} (${modStr(c.wis)})`,
          inline: true,
        },
        {
          name: "CHA",
          value: `${c.cha} (${modStr(c.cha)})`,
          inline: true,
        }
      )
      .setFooter({ text: `${c.alignment || "True Neutral"} — ${c.background_name || "Unknown"} background` });

    await interaction.reply({ embeds: [embed] });
  },
};

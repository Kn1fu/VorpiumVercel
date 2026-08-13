import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Pool } from "pg";

export default {
  data: new SlashCommandBuilder()
    .setName("faction")
    .setDescription("Manage your faction")
    .addSubcommand((sub) => sub.setName("list").setDescription("Show all factions"))
    .addSubcommand((sub) =>
      sub
        .setName("join")
        .setDescription("Join a faction")
        .addStringOption((opt) =>
          opt.setName("faction_name").setDescription("Faction name").setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName("leave").setDescription("Leave your faction"))
    .addSubcommand((sub) =>
      sub.setName("info").setDescription("Show your faction details")
    )
    .addSubcommand((sub) =>
      sub.setName("roster").setDescription("Show faction members")
    ),

  async execute(interaction: any, pool: Pool) {
    const sub = interaction.options.getSubcommand();
    const discordId = interaction.user.id;

    if (sub === "list") {
      const res = await pool.query(
        `SELECT f.id, f.name, f.description, COUNT(fm.character_id) as member_count
         FROM factions f
         LEFT JOIN faction_members fm ON f.id = fm.faction_id
         GROUP BY f.id, f.name, f.description
         ORDER BY f.id`
      );

      if (res.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setDescription("No factions exist yet."),
          ],
          ephemeral: true,
        });
      }

      const list = res.rows
        .map(
          (f: any) =>
            `**${f.name}** — ${f.member_count} members\n_${f.description || "No description"}_`
        )
        .join("\n\n");

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("Factions")
            .setDescription(list),
        ],
        ephemeral: true,
      });
    }

    if (sub === "join") {
      const factionName = interaction.options.getString("faction_name");

      const existing = await pool.query(
        `SELECT fm.faction_id FROM faction_members fm
         JOIN characters c ON fm.character_id = c.id
         JOIN users u ON c.user_id = u.id
         WHERE u.discord_id = $1`,
        [discordId]
      );
      if (existing.rows.length > 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You are already in a faction. Leave first."),
          ],
          ephemeral: true,
        });
      }

      const factionRes = await pool.query(
        `SELECT id FROM factions WHERE LOWER(name) = LOWER($1)`,
        [factionName]
      );
      if (factionRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("Faction not found."),
          ],
          ephemeral: true,
        });
      }

      const userRes = await pool.query(
        `SELECT c.id as character_id FROM users u
         JOIN characters c ON u.id = c.user_id
         WHERE u.discord_id = $1`,
        [discordId]
      );
      if (userRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You don't have a character yet."),
          ],
          ephemeral: true,
        });
      }

      await pool.query(
        `INSERT INTO faction_members (faction_id, character_id) VALUES ($1, $2)`,
        [factionRes.rows[0].id, userRes.rows[0].character_id]
      );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff00)
            .setDescription(`You joined **${factionName}**!`),
        ],
        ephemeral: true,
      });
    }

    if (sub === "leave") {
      const userRes = await pool.query(
        `SELECT c.id as character_id FROM users u
         JOIN characters c ON u.id = c.user_id
         WHERE u.discord_id = $1`,
        [discordId]
      );
      if (userRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You don't have a character yet."),
          ],
          ephemeral: true,
        });
      }

      const leaveRes = await pool.query(
        `DELETE FROM faction_members WHERE character_id = $1 RETURNING faction_id`,
        [userRes.rows[0].character_id]
      );

      if (leaveRes.rowCount === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You are not in any faction."),
          ],
          ephemeral: true,
        });
      }

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffff00)
            .setDescription("You left your faction."),
        ],
        ephemeral: true,
      });
    }

    if (sub === "info") {
      const res = await pool.query(
        `SELECT f.name, f.description, f.id
         FROM faction_members fm
         JOIN factions f ON fm.faction_id = f.id
         JOIN characters c ON fm.character_id = c.id
         JOIN users u ON c.user_id = u.id
         WHERE u.discord_id = $1`,
        [discordId]
      );

      if (res.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You are not in any faction."),
          ],
          ephemeral: true,
        });
      }

      const { name, description, id } = res.rows[0];

      const memberRes = await pool.query(
        `SELECT c.name, c.level, cl.name as class_name
         FROM faction_members fm
         JOIN characters c ON fm.character_id = c.id
         LEFT JOIN classes cl ON c.class_id = cl.id
         WHERE fm.faction_id = $1`,
        [id]
      );

      const memberList = memberRes.rows
        .map((m: any) => `**${m.name}** — Lv${m.level} ${m.class_name || "Unknown"}`)
        .join("\n");

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`Faction: ${name}`)
            .setDescription(
              `_${description || "No description"}_\n\n**Members:**\n${memberList}`
            ),
        ],
        ephemeral: true,
      });
    }

    if (sub === "roster") {
      const factionRes = await pool.query(
        `SELECT fm.faction_id, f.name
         FROM faction_members fm
         JOIN factions f ON fm.faction_id = f.id
         JOIN characters c ON fm.character_id = c.id
         JOIN users u ON c.user_id = u.id
         WHERE u.discord_id = $1`,
        [discordId]
      );

      if (factionRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You are not in any faction."),
          ],
          ephemeral: true,
        });
      }

      const { faction_id: factionId, name: factionName } = factionRes.rows[0];

      const memberRes = await pool.query(
        `SELECT c.name, c.level, cl.name as class_name, c.race_id
         FROM faction_members fm
         JOIN characters c ON fm.character_id = c.id
         LEFT JOIN classes cl ON c.class_id = cl.id
         WHERE fm.faction_id = $1
         ORDER BY c.level DESC`,
        [factionId]
      );

      const list = memberRes.rows
        .map(
          (m: any) =>
            `**${m.name}** — Lv${m.level} ${m.class_name || "Unknown"}`
        )
        .join("\n");

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`${factionName} Roster`)
            .setDescription(list || "No members found."),
        ],
        ephemeral: true,
      });
    }
  },
};

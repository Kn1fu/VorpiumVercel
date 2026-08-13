import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Pool } from "pg";

export default {
  data: new SlashCommandBuilder()
    .setName("party")
    .setDescription("Manage your party")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a new party")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Party name").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("join")
        .setDescription("Join an existing party")
        .addIntegerOption((opt) =>
          opt
            .setName("party_id")
            .setDescription("The party ID to join")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName("leave").setDescription("Leave your current party"))
    .addSubcommand((sub) => sub.setName("info").setDescription("Show your current party"))
    .addSubcommand((sub) =>
      sub
        .setName("invite")
        .setDescription("Invite a user to your party")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("The user to invite").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("kick")
        .setDescription("Kick a member from your party")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("The user to kick").setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List all parties")),

  async execute(interaction: any, pool: Pool) {
    const sub = interaction.options.getSubcommand();

    if (sub === "create") {
      const name = interaction.options.getString("name");
      const discordId = interaction.user.id;

      const existing = await pool.query(
        `SELECT p.id FROM party_members pm
         JOIN parties p ON pm.party_id = p.id
         JOIN characters c ON pm.character_id = c.id
         JOIN users u ON c.user_id = u.id
         WHERE u.discord_id = $1`,
        [discordId]
      );
      if (existing.rows.length > 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You are already in a party! Leave first."),
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
              .setDescription("You don't have a character yet. Use `/create` first."),
          ],
          ephemeral: true,
        });
      }
      const characterId = userRes.rows[0].character_id;

      const partyRes = await pool.query(
        `INSERT INTO parties (name, leader_id) VALUES ($1, $2) RETURNING id`,
        [name, characterId]
      );
      const partyId = partyRes.rows[0].id;

      await pool.query(
        `INSERT INTO party_members (party_id, character_id) VALUES ($1, $2)`,
        [partyId, characterId]
      );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle("Party Created!")
            .setDescription(`**${name}** has been created. Party ID: \`${partyId}\``),
        ],
        ephemeral: true,
      });
    }

    if (sub === "join") {
      const partyId = interaction.options.getInteger("party_id");
      const discordId = interaction.user.id;

      const existing = await pool.query(
        `SELECT pm.party_id FROM party_members pm
         JOIN characters c ON pm.character_id = c.id
         JOIN users u ON c.user_id = u.id
         WHERE u.discord_id = $1`,
        [discordId]
      );
      if (existing.rows.length > 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You are already in a party! Leave first."),
          ],
          ephemeral: true,
        });
      }

      const partyRes = await pool.query(
        `SELECT p.id, COUNT(pm.character_id) as member_count FROM parties p
         LEFT JOIN party_members pm ON p.id = pm.party_id
         WHERE p.id = $1 GROUP BY p.id`,
        [partyId]
      );
      if (partyRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("Party not found."),
          ],
          ephemeral: true,
        });
      }
      if (parseInt(partyRes.rows[0].member_count) >= 5) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("That party is full (max 5 members)."),
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
        `INSERT INTO party_members (party_id, character_id) VALUES ($1, $2)`,
        [partyId, userRes.rows[0].character_id]
      );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff00)
            .setDescription(`You joined party \`${partyId}\`!`),
        ],
        ephemeral: true,
      });
    }

    if (sub === "leave") {
      const discordId = interaction.user.id;

      const memberRes = await pool.query(
        `SELECT pm.party_id, p.leader_id, p.name, pm.character_id
         FROM party_members pm
         JOIN characters c ON pm.character_id = c.id
         JOIN users u ON c.user_id = u.id
         JOIN parties p ON pm.party_id = p.id
         WHERE u.discord_id = $1`,
        [discordId]
      );
      if (memberRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You are not in any party."),
          ],
          ephemeral: true,
        });
      }

      const { party_id: partyId, leader_id: leaderId, name: partyName, character_id: characterId } = memberRes.rows[0];

      await pool.query(
        `DELETE FROM party_members WHERE party_id = $1 AND character_id = $2`,
        [partyId, characterId]
      );

      if (leaderId === characterId) {
        const remaining = await pool.query(
          `SELECT character_id FROM party_members WHERE party_id = $1 ORDER BY joined_at ASC LIMIT 1`,
          [partyId]
        );
        if (remaining.rows.length > 0) {
          await pool.query(`UPDATE parties SET leader_id = $1 WHERE id = $2`, [
            remaining.rows[0].character_id,
            partyId,
          ]);
        } else {
          await pool.query(`DELETE FROM parties WHERE id = $1`, [partyId]);
        }
      }

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffff00)
            .setDescription(`You left party **${partyName}**.`),
        ],
        ephemeral: true,
      });
    }

    if (sub === "info") {
      const discordId = interaction.user.id;

      const memberRes = await pool.query(
        `SELECT pm.party_id, p.name, p.leader_id, pm.character_id
         FROM party_members pm
         JOIN characters c ON pm.character_id = c.id
         JOIN users u ON c.user_id = u.id
         JOIN parties p ON pm.party_id = p.id
         WHERE u.discord_id = $1`,
        [discordId]
      );
      if (memberRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You are not in any party."),
          ],
          ephemeral: true,
        });
      }

      const { party_id: partyId, name: partyName, leader_id: leaderId } =
        memberRes.rows[0];

      const membersRes = await pool.query(
        `SELECT c.name, c.level, cl.name as class_name, c.current_hp, c.max_hp
         FROM party_members pm
         JOIN characters c ON pm.character_id = c.id
         LEFT JOIN classes cl ON c.class_id = cl.id
         WHERE pm.party_id = $1`,
        [partyId]
      );

      const memberList = membersRes.rows
        .map(
          (m: any) =>
            `**${m.name}** (Lv${m.level} ${m.class_name || "Unknown"}) — HP: ${m.current_hp}/${m.max_hp}${m.name === leaderId ? " 👑" : ""}`
        )
        .join("\n");

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`Party: ${partyName}`)
            .setDescription(`Party ID: \`${partyId}\`\n\n${memberList}`),
        ],
        ephemeral: true,
      });
    }

    if (sub === "invite") {
      const targetUser = interaction.options.getUser("user");
      const discordId = interaction.user.id;

      const leaderRes = await pool.query(
        `SELECT p.id, p.leader_id FROM party_members pm
         JOIN characters c ON pm.character_id = c.id
         JOIN users u ON c.user_id = u.id
         JOIN parties p ON pm.party_id = p.id
         WHERE u.discord_id = $1`,
        [discordId]
      );
      if (leaderRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You are not in any party."),
          ],
          ephemeral: true,
        });
      }

      const { id: partyId, leader_id: leaderId } = leaderRes.rows[0];
      const userRes = await pool.query(
        `SELECT c.id as character_id FROM users u
         JOIN characters c ON u.id = c.user_id
         WHERE u.discord_id = $1`,
        [discordId]
      );
      if (leaderId !== userRes.rows[0].character_id) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("Only the party leader can invite members."),
          ],
          ephemeral: true,
        });
      }

      const targetCharRes = await pool.query(
        `SELECT c.id as character_id, c.name FROM characters c
         JOIN users u ON c.user_id = u.id
         WHERE u.discord_id = $1`,
        [targetUser.id]
      );
      if (targetCharRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("That user doesn't have a character yet."),
          ],
          ephemeral: true,
        });
      }

      const targetExisting = await pool.query(
        `SELECT pm.party_id FROM party_members pm
         JOIN characters c ON pm.character_id = c.id
         JOIN users u ON c.user_id = u.id
         WHERE u.discord_id = $1`,
        [targetUser.id]
      );
      if (targetExisting.rows.length > 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("That user is already in a party."),
          ],
          ephemeral: true,
        });
      }

      await pool.query(`INSERT INTO party_members (party_id, character_id) VALUES ($1, $2)`, [
        partyId,
        targetCharRes.rows[0].character_id,
      ]);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff00)
            .setDescription(`<@${targetUser.id}> has been added to your party!`),
        ],
        ephemeral: true,
      });
    }

    if (sub === "kick") {
      const targetUser = interaction.options.getUser("user");
      const discordId = interaction.user.id;

      const leaderRes = await pool.query(
        `SELECT p.id, p.leader_id FROM party_members pm
         JOIN characters c ON pm.character_id = c.id
         JOIN users u ON c.user_id = u.id
         JOIN parties p ON pm.party_id = p.id
         WHERE u.discord_id = $1`,
        [discordId]
      );
      if (leaderRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You are not in any party."),
          ],
          ephemeral: true,
        });
      }

      const { id: partyId, leader_id: leaderId } = leaderRes.rows[0];
      const userRes = await pool.query(
        `SELECT c.id as character_id FROM users u
         JOIN characters c ON u.id = c.user_id
         WHERE u.discord_id = $1`,
        [discordId]
      );
      if (leaderId !== userRes.rows[0].character_id) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("Only the party leader can kick members."),
          ],
          ephemeral: true,
        });
      }

      const targetCharRes = await pool.query(
        `SELECT c.id as character_id FROM characters c
         JOIN users u ON c.user_id = u.id
         WHERE u.discord_id = $1`,
        [targetUser.id]
      );
      if (targetCharRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("That user doesn't have an account."),
          ],
          ephemeral: true,
        });
      }

      const kickRes = await pool.query(
        `DELETE FROM party_members WHERE party_id = $1 AND character_id = $2`,
        [partyId, targetCharRes.rows[0].character_id]
      );
      if (kickRes.rowCount === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("That user is not in your party."),
          ],
          ephemeral: true,
        });
      }

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffff00)
            .setDescription(`<@${targetUser.id}> has been kicked from the party.`),
        ],
        ephemeral: true,
      });
    }

    if (sub === "list") {
      const partiesRes = await pool.query(
        `SELECT p.id, p.name, COUNT(pm.character_id) as member_count
         FROM parties p
         LEFT JOIN party_members pm ON p.id = pm.party_id
         GROUP BY p.id, p.name
         ORDER BY p.id`
      );

      if (partiesRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setDescription("No parties exist yet. Create one with `/party create`!"),
          ],
          ephemeral: true,
        });
      }

      const list = partiesRes.rows
        .map((p: any) => `\`${p.id}\` **${p.name}** — ${p.member_count}/5 members`)
        .join("\n");

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("All Parties")
            .setDescription(list),
        ],
        ephemeral: true,
      });
    }
  },
};

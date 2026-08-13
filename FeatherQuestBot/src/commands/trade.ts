import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Pool } from "pg";

export default {
  data: new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Trade items with other players")
    .addSubcommand((sub) =>
      sub
        .setName("offer")
        .setDescription("Offer a trade to another player")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("The user to trade with").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("accept")
        .setDescription("Accept a pending trade")
        .addIntegerOption((opt) =>
          opt.setName("trade_id").setDescription("The trade ID to accept").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("decline")
        .setDescription("Decline a pending trade")
        .addIntegerOption((opt) =>
          opt.setName("trade_id").setDescription("The trade ID to decline").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("history").setDescription("Show your recent trades")
    ),

  async execute(interaction: any, pool: Pool) {
    const sub = interaction.options.getSubcommand();
    const discordId = interaction.user.id;

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

    if (sub === "offer") {
      const targetUser = interaction.options.getUser("user");
      if (targetUser.id === discordId) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You can't trade with yourself."),
          ],
          ephemeral: true,
        });
      }

      const targetRes = await pool.query(
        `SELECT c.id as character_id FROM users u
         JOIN characters c ON u.id = c.user_id
         WHERE u.discord_id = $1`,
        [targetUser.id]
      );
      if (targetRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("That user doesn't have an account yet."),
          ],
          ephemeral: true,
        });
      }

      const pendingRes = await pool.query(
        `SELECT id FROM trades
         WHERE status = 'pending'
         AND ((from_char_id = $1) OR (to_char_id = $1))`,
        [characterId]
      );
      if (pendingRes.rows.length > 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription(
                "You already have a pending trade. Complete or decline it first."
              ),
          ],
          ephemeral: true,
        });
      }

      const tradeRes = await pool.query(
        `INSERT INTO trades (from_char_id, to_char_id, status)
         VALUES ($1, $2, 'pending') RETURNING id`,
        [characterId, targetRes.rows[0].character_id]
      );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle("Trade Offered!")
            .setDescription(
              `Trade \`${tradeRes.rows[0].id}\` created with <@${targetUser.id}>.\nUse \`/trade accept ${tradeRes.rows[0].id}\` to accept, or use \`/trade decline ${tradeRes.rows[0].id}\` to decline.`
            ),
        ],
        ephemeral: true,
      });
    }

    if (sub === "accept") {
      const tradeId = interaction.options.getInteger("trade_id");

      const tradeRes = await pool.query(
        `SELECT * FROM trades WHERE id = $1 AND status = 'pending' AND to_char_id = $2`,
        [tradeId, characterId]
      );
      if (tradeRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription(
                "No pending trade found with that ID for you."
              ),
          ],
          ephemeral: true,
        });
      }

      await pool.query(`UPDATE trades SET status = 'completed' WHERE id = $1`, [tradeId]);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle("Trade Accepted!")
            .setDescription(`Trade \`${tradeId}\` has been completed.`),
        ],
        ephemeral: true,
      });
    }

    if (sub === "decline") {
      const tradeId = interaction.options.getInteger("trade_id");

      const tradeRes = await pool.query(
        `SELECT * FROM trades WHERE id = $1 AND status = 'pending' AND (from_char_id = $2 OR to_char_id = $2)`,
        [tradeId, characterId]
      );
      if (tradeRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription(
                "No pending trade found with that ID involving you."
              ),
          ],
          ephemeral: true,
        });
      }

      await pool.query(`UPDATE trades SET status = 'declined' WHERE id = $1`, [tradeId]);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffff00)
            .setTitle("Trade Declined")
            .setDescription(`Trade \`${tradeId}\` has been declined.`),
        ],
        ephemeral: true,
      });
    }

    if (sub === "history") {
      const historyRes = await pool.query(
        `SELECT t.id, t.status, t.created_at,
          c1.name as from_name,
          c2.name as to_name
         FROM trades t
         JOIN characters c1 ON t.from_char_id = c1.id
         JOIN characters c2 ON t.to_char_id = c2.id
         WHERE t.from_char_id = $1 OR t.to_char_id = $1
         ORDER BY t.created_at DESC
         LIMIT 10`,
        [characterId]
      );

      if (historyRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setDescription("No trade history yet."),
          ],
          ephemeral: true,
        });
      }

      const list = historyRes.rows
        .map(
          (t: any) =>
            `\`${t.id}\` — **${t.from_name}** → **${t.to_name}** | **${t.status}** | ${new Date(t.created_at).toLocaleDateString()}`
        )
        .join("\n");

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("Trade History")
            .setDescription(list),
        ],
        ephemeral: true,
      });
    }
  },
};

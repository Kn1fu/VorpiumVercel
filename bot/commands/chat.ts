import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Pool } from "pg";

export default {
  data: new SlashCommandBuilder()
    .setName("chat")
    .setDescription("Chat with other players")
    .addSubcommand((sub) =>
      sub
        .setName("message")
        .setDescription("Send a chat message")
        .addStringOption((opt) =>
          opt.setName("text").setDescription("Your message").setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Chat channel")
            .setRequired(true)
            .addChoices(
              { name: "Global", value: "global" },
              { name: "Party", value: "party" },
              { name: "Faction", value: "faction" }
            )
        )
    ),

  async execute(interaction: any, pool: Pool) {
    const sub = interaction.options.getSubcommand();
    const discordId = interaction.user.id;

    if (sub === "message") {
      const text = interaction.options.getString("text");
      const channel = interaction.options.getString("channel");

      const userRes = await pool.query(
        `SELECT c.id as character_id, c.name as char_name
         FROM users u
         JOIN characters c ON u.id = c.user_id
         WHERE u.discord_id = $1`,
        [discordId]
      );
      if (userRes.rows.length === 0 || !userRes.rows[0].char_name) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You don't have a character yet. Use `/create` first."),
          ],
          ephemeral: true,
        });
      }

      const { character_id: characterId, char_name: charName } = userRes.rows[0];

      let targetChannelId: number | null = null;
      let channelLabel = "";

      if (channel === "global") {
        targetChannelId = 0;
        channelLabel = "Global";
      } else if (channel === "party") {
        const partyRes = await pool.query(
          `SELECT pm.party_id FROM party_members pm
           JOIN characters c ON pm.character_id = c.id
           JOIN users u ON c.user_id = u.id
           WHERE u.discord_id = $1`,
          [discordId]
        );
        if (partyRes.rows.length === 0) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xff0000)
                .setDescription("You are not in a party."),
            ],
            ephemeral: true,
          });
        }
        targetChannelId = partyRes.rows[0].party_id;
        channelLabel = "Party";
      } else if (channel === "faction") {
        const factionRes = await pool.query(
          `SELECT fm.faction_id FROM faction_members fm
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
                .setDescription("You are not in a faction."),
            ],
            ephemeral: true,
          });
        }
        targetChannelId = factionRes.rows[0].faction_id;
        channelLabel = "Faction";
      }

      await pool.query(
        `INSERT INTO chat_messages (sender_id, channel, channel_id, message)
         VALUES ($1, $2, $3, $4)`,
        [characterId, channel, targetChannelId, text]
      );

      const historyRes = await pool.query(
        `SELECT cm.message, cm.created_at, c.name as char_name
         FROM chat_messages cm
         JOIN characters c ON cm.sender_id = c.id
         WHERE cm.channel = $1 AND cm.channel_id = $2
         ORDER BY cm.created_at DESC
         LIMIT 10`,
        [channel, targetChannelId]
      );

      const messages = historyRes.rows.reverse();
      const msgList = messages
        .map(
          (m: any) =>
            `**${m.char_name || "Unknown"}** — ${m.message}\n_${new Date(m.created_at).toLocaleTimeString()}_`
        )
        .join("\n\n");

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`${channelLabel} Chat`)
        .setDescription(msgList || "No messages yet.");

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};

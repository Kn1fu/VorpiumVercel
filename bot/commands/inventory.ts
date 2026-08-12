import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Pool } from "pg";

export default {
  data: new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your inventory and equipped items"),

  async execute(interaction: any, pool: Pool) {
    const discordId = interaction.user.id;

    // Get character
    const charResult = await pool.query(
      `
        SELECT c.id, c.name, c.gold
        FROM characters c
        WHERE c.user_id = (SELECT id FROM users WHERE discord_id = $1)
        LIMIT 1
      `,
      [discordId]
    );

    if (charResult.rows.length === 0) {
      return interaction.reply({
        content: "You don't have a character! Use `/start` first.",
        ephemeral: true,
      });
    }

    const char = charResult.rows[0];

    // Get inventory
    const invResult = await pool.query(
      `
        SELECT i.quantity, i.equipped, it.name, it.type, it.damage, it.ac_bonus, it.rarity
        FROM inventory i
        JOIN items it ON i.item_id = it.id
        WHERE i.character_id = $1
        ORDER BY it.type, it.name
      `,
      [char.id]
    );

    if (invResult.rows.length === 0) {
      return interaction.reply({
        content: "Your inventory is empty.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`${char.name}'s Inventory`)
      .setColor(0x6366f1)
      .setFooter({ text: `Gold: ${char.gold || 0} GP` });

    // Group items by type
    const grouped: Record<string, any[]> = {};
    for (const item of invResult.rows) {
      if (!grouped[item.type]) grouped[item.type] = [];
      grouped[item.type].push(item);
    }

    const typeLabels: Record<string, string> = {
      weapon: "⚔️ Weapons",
      armor: "🛡️ Armor",
      potion: "🧪 Potions",
      scroll: "📜 Scrolls",
      misc: "📦 Miscellaneous",
    };

    for (const [type, items] of Object.entries(grouped)) {
      const text = items
        .map((item) => {
          const equipped = item.equipped ? " *(equipped)*" : "";
          const dmg = item.damage ? ` [${item.damage}]` : "";
          const ac = item.ac_bonus ? ` [AC +${item.ac_bonus}]` : "";
          return `• ${item.name} ×${item.quantity}${dmg}${ac}${equipped}`;
        })
        .join("\n");

      embed.addFields({
        name: typeLabels[type] || type,
        value: text,
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};

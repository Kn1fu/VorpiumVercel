import { SlashCommandBuilder } from "discord.js";
import { Pool } from "pg";
import { rollDice } from "../../../lib/game/dice";

export default {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll dice using D&D 5e notation (e.g. 2d6+3, 1d20)")
    .addStringOption((opt) =>
      opt
        .setName("dice")
        .setDescription("Dice notation: NdS+M (e.g. 2d6+3)")
        .setRequired(true)
    ),

  async execute(interaction: any, _pool: Pool) {
    const notation = interaction.options.getString("dice");

    try {
      const result = rollDice(notation);

      const embed = {
        title: `Dice Roll: ${notation}`,
        description: result.breakdown,
        color: 0x6366f1,
        fields: [
          { name: "Total", value: `**${result.total}**`, inline: true },
          {
            name: "Rolls",
            value: result.rolls.join(", "),
            inline: true,
          },
        ],
        footer: {
          text: `Rolled by ${interaction.user.username}`,
        },
      };

      await interaction.reply({ embeds: [embed] });
    } catch (err: any) {
      await interaction.reply({
        content: `Invalid dice notation: \`${notation}\`\nUse format like \`2d6+3\`, \`1d20\`, \`4d6\``,
        ephemeral: true,
      });
    }
  },
};

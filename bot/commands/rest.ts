import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Pool } from "pg";
import { rollDice } from "../../lib/game/dice";

export default {
  data: new SlashCommandBuilder()
    .setName("rest")
    .setDescription("Take a short or long rest to recover HP and abilities")
    .addStringOption((opt) =>
      opt
        .setName("type")
        .setDescription("Type of rest")
        .addChoices(
          { name: "Short Rest", value: "short" },
          { name: "Long Rest", value: "long" }
        )
    ),

  async execute(interaction: any, pool: Pool) {
    const discordId = interaction.user.id;
    const restType = interaction.options.getString("type") || "short";

    const charResult = await pool.query(
      `
        SELECT c.id, c.name, c.level, c.current_hp, c.max_hp,
               cl.hit_die, a.con
        FROM characters c
        LEFT JOIN classes cl ON c.class_id = cl.id
        LEFT JOIN ability_scores a ON c.id = a.character_id
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

    if (char.current_hp >= char.max_hp) {
      return interaction.reply({
        content: "You're already at full health!",
        ephemeral: true,
      });
    }

    const conMod = Math.floor((char.con - 10) / 2);

    if (restType === "short") {
      // Short rest: roll hit dice to recover
      const hitDiceCount = char.level;
      const diceRoll = rollDice(`${hitDiceCount}d${char.hit_die}`);
      const healing = Math.max(1, diceRoll.total + conMod * hitDiceCount);
      const newHp = Math.min(char.max_hp, char.current_hp + healing);

      await pool.query(
        "UPDATE characters SET current_hp = $1 WHERE id = $2",
        [newHp, char.id]
      );

      const embed = new EmbedBuilder()
        .setTitle(`${char.name} takes a Short Rest`)
        .setDescription(
          `You rest for an hour and spend some time catching your wind.\n\n` +
            `Rolled ${hitDiceCount}d${char.hit_die}: ${diceRoll.rolls.join(", ")}\n` +
            `**Healed ${healing} HP** (${char.current_hp} → ${newHp}/${char.max_hp})`
        )
        .setColor(0x22c55e);

      return interaction.reply({ embeds: [embed] });
    }

    // Long rest: full HP recovery
    const oldHp = char.current_hp;
    await pool.query(
      "UPDATE characters SET current_hp = max_hp WHERE id = $1",
      [char.id]
    );

    const embed = new EmbedBuilder()
      .setTitle(`${char.name} takes a Long Rest`)
      .setDescription(
        `You rest for 8 hours and recover fully.\n\n` +
          `**HP restored:** ${char.current_hp} → ${char.max_hp}/${char.max_hp}\n` +
          `All spell slots and abilities are restored.`
      )
      .setColor(0x22c55e);

    await interaction.reply({ embeds: [embed] });
  },
};

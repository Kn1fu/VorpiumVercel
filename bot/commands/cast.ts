import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Pool } from "pg";
import { rollDice } from "../../lib/game/dice";
import { abilityMod } from "../../lib/game/combat";

export default {
  data: new SlashCommandBuilder()
    .setName("cast")
    .setDescription("Cast a spell")
    .addStringOption((opt) =>
      opt
        .setName("spell")
        .setDescription("Spell name (e.g. 'Fire Bolt', 'Cure Wounds')")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("target")
        .setDescription("Target of the spell (optional)")
        .setRequired(false)
    ),

  async execute(interaction: any, pool: Pool) {
    const discordId = interaction.user.id;
    const spellName = interaction.options.getString("spell");
    const targetName = interaction.options.getString("target");

    // Get character with spell info
    const charResult = await pool.query(
      `
        SELECT c.id, c.name, c.level, c.current_hp, c.max_hp,
               cl.name AS class_name,
               a.str, a.dex, a."con", a.int, a.wis, a.cha
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

    if (char.current_hp <= 0) {
      return interaction.reply({
        content: "You can't cast spells while unconscious!",
        ephemeral: true,
      });
    }

    // Look up spell
    const spellResult = await pool.query(
      `SELECT * FROM spells WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [spellName]
    );

    if (spellResult.rows.length === 0) {
      return interaction.reply({
        content: `Unknown spell: \`${spellName}\`\nUse \`/spellbook\` to see known spells.`,
        ephemeral: true,
      });
    }

    const spell = spellResult.rows[0];

    // Determine spellcasting ability based on class
    const classAbilityMap: Record<string, string> = {
      Wizard: "int",
      Sorcerer: "cha",
      Bard: "cha",
      Warlock: "cha",
      Cleric: "wis",
      Druid: "wis",
      Paladin: "cha",
      Ranger: "wis",
    };

    const spellAbility =
      classAbilityMap[char.class_name] || "int";
    const abilityScore = char[spellAbility] || 10;
    const spellMod = abilityMod(abilityScore);
    const prof = profBonus(char.level);
    const spellDC = 8 + prof + spellMod;
    const spellAttack = prof + spellMod;

    const embed = new EmbedBuilder()
      .setTitle(`${char.name} casts ${spell.name}!`)
      .setColor(0x8b5cf6);

    // Cantrips - no slot tracking
    if (spell.level === 0) {
      // Attack roll cantrips
      if (spell.damage && !spell.save_type) {
        const attackRoll = rollDice("1d20");
        const hit = attackRoll.rolls[0] === 20 || (attackRoll.rolls[0] !== 1 && attackRoll.total + spellAttack >= 13);

        embed.addFields({
          name: "Attack Roll",
          value: `🎲 ${attackRoll.total} + ${spellAttack} = **${attackRoll.total + spellAttack}**`,
          inline: true,
        });

        if (hit) {
          const dmg = rollDice(spell.damage);
          const isCrit = attackRoll.rolls[0] === 20;
          let totalDmg = dmg.total;
          if (isCrit) {
            const critDmg = rollDice(spell.damage);
            totalDmg += critDmg.total;
          }
          embed.addFields({
            name: "Damage",
            value: `${dmg.rolls.join(", ")}${isCrit ? " (CRIT!)" : ""} = **${totalDmg}**`,
            inline: true,
          });
        } else {
          embed.addFields({
            name: "Result",
            value: "Miss!",
            inline: true,
          });
        }
      } else if (spell.save_type) {
        // Save-based cantrip
        const saveRoll = rollDice("1d20");
        embed.addFields({
          name: `Target saves (${spell.save_type})`,
          value: `🎲 ${saveRoll.total} (DC ${spellDC})`,
          inline: true,
        });

        if (saveRoll.total < spellDC && spell.damage) {
          const dmg = rollDice(spell.damage);
          embed.addFields({
            name: "Damage (half on save)",
            value: `${dmg.rolls.join(", ")} = **${dmg.total}**`,
            inline: true,
          });
        } else {
          embed.addFields({
            name: "Result",
            value: "Target succeeds — half or no damage.",
            inline: true,
          });
        }
      } else {
        // Utility cantrip
        embed.setDescription(`You cast ${spell.name}.\n${spell.description || ""}`);
      }
    } else {
      // Leveled spell - costs a slot
      embed.addFields({
        name: "Spell Level",
        value: String(spell.level),
        inline: true,
      });
      embed.setDescription(spell.description || `Casts ${spell.name}.`);
    }

    embed.setFooter({
      text: `${char.name} (Level ${char.level} ${char.class_name}) | Spell DC: ${spellDC}`,
    });

    await interaction.reply({ embeds: [embed] });
  },
};

function profBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

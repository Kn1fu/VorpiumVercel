import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Pool } from "pg";
import { rollDice } from "../../../lib/game/dice";
import { abilityMod, profBonus } from "../../../lib/game/combat";

export default {
  data: new SlashCommandBuilder()
    .setName("attack")
    .setDescription("Make an attack roll against a target")
    .addStringOption((opt) =>
      opt
        .setName("target")
        .setDescription("What are you attacking? (name or 'goblin')")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("weapon")
        .setDescription("Weapon to use (e.g. 'longsword', 'shortbow')")
        .setRequired(false)
    ),

  async execute(interaction: any, pool: Pool) {
    const discordId = interaction.user.id;
    const targetName = interaction.options.getString("target");
    const weaponName = interaction.options.getString("weapon") || "longsword";

    // Get character data
    const charResult = await pool.query(
      `
        SELECT c.id, c.name, c.level, c.current_hp, c.max_hp, c.ac,
               cl.name AS class_name, cl.primary_stat,
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
        content: "You can't attack while unconscious!",
        ephemeral: true,
      });
    }

    // Determine attack stat based on weapon
    const meleeWeapons = [
      "longsword",
      "shortsword",
      "battleaxe",
      "greatsword",
      "dagger",
      "warhammer",
      "quarterstaff",
    ];
    const rangedWeapons = [
      "longbow",
      "shortbow",
      "light crossbow",
    ];

    let attackAbility = "str";
    if (rangedWeapons.includes(weaponName.toLowerCase())) {
      attackAbility = "dex";
    } else if (weaponName.toLowerCase() === "dagger") {
      // Dagger can use STR or DEX
      attackAbility =
        char.dex >= char.str ? "dex" : "str";
    }

    const abilityScore = char[attackAbility] || 10;
    const attackMod = abilityMod(abilityScore);
    const prof = profBonus(char.level);

    // Roll attack
    const attackRoll = rollDice("1d20");
    const attackTotal = attackRoll.total + attackMod + prof;
    const isCrit = attackRoll.rolls[0] === 20;
    const isFumble = attackRoll.rolls[0] === 1;

    // Determine target AC (for now, use generic enemy AC)
    const enemyAC = Math.floor(Math.random() * 8) + 10; // 10-17

    const hit = isCrit || (!isFumble && attackTotal >= enemyAC);

    // Weapon damage dice
    const weaponDamageMap: Record<string, string> = {
      dagger: "1d4",
      shortsword: "1d6",
      longsword: "1d8",
      battleaxe: "1d8",
      warhammer: "1d8",
      quarterstaff: "1d6",
      greatsword: "2d6",
      longbow: "1d8",
      shortbow: "1d6",
      "light crossbow": "1d8",
    };

    const damageDice = weaponDamageMap[weaponName.toLowerCase()] || "1d6";
    let finalDamage = 0;
    let damageBreakdown = "";

    if (hit) {
      const damageRoll = rollDice(damageDice);
      finalDamage = damageRoll.total + attackMod;
      if (isCrit) {
        // On crit, roll damage dice twice
        const critDamage = rollDice(damageDice);
        finalDamage += critDamage.total;
        damageBreakdown = `${damageRoll.rolls.join("+")} + ${critDamage.rolls.join("+")} + ${attackMod} = **${finalDamage}**`;
      } else {
        damageBreakdown = `${damageRoll.total} + ${attackMod} = **${finalDamage}**`;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`${char.name} attacks ${targetName}!`)
      .setColor(isCrit ? 0xffd700 : hit ? 0x22c55e : 0xef4444)
      .addFields(
        {
          name: "Attack Roll",
          value: `🎲 ${attackRoll.total} + ${attackMod + prof} = **${attackTotal}** vs AC ${enemyAC}`,
          inline: true,
        },
        {
          name: "Result",
          value: isCrit
            ? "**CRITICAL HIT!**"
            : isFumble
              ? "**NATURAL 1 — MISS!**"
              : hit
                ? "**HIT!**"
                : "**MISS!**",
          inline: true,
        }
      );

    if (hit) {
      embed.addFields({
        name: "Damage",
        value: `${weaponName}: ${damageBreakdown}`,
        inline: false,
      });
    }

    embed.setFooter({
      text: `${char.name} (Level ${char.level} ${char.class_name})`,
    });

    await interaction.reply({ embeds: [embed] });
  },
};

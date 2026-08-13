import { EmbedBuilder } from "discord.js";
import { Pool } from "pg";
import { rollDice } from "../../lib/game/dice";
import { abilityMod, profBonus } from "../../lib/game/combat";
import type { ClassData, RaceData } from "../../lib/game/classes";

interface BackgroundData {
  id: number;
  name: string;
  skills: string[];
}

/**
 * Handle all button and select menu interactions for Feather Quest.
 * Called from the main bot's interactionCreate handler.
 */
export async function handleInteraction(interaction: any, pool: Pool) {
  const customId = interaction.customId;

  // ============================================================
  // CHARACTER CREATION: Race selection
  // ============================================================
  if (customId === "create_race") {
    const discordId = interaction.user.id;
    const raceId = interaction.values[0];

    const stateMap: Map<string, any> =
      (globalThis as any).__createState || new Map();
    const state = stateMap.get(discordId);

    if (!state || state.step !== "race") {
      return interaction.reply({
        content: "Session expired. Use `/start` again.",
        ephemeral: true,
      });
    }

    state.raceId = parseInt(raceId);
    state.step = "class";
    stateMap.set(discordId, state);

    const { CLASSES } = await import("../../lib/game/classes") as { CLASSES: ClassData[] };
    const classMenu = {
      type: 3,
      custom_id: "create_class",
      placeholder: "Choose your class...",
      options: CLASSES.map((c: ClassData) => ({
        label: c.name,
        description: `d${c.hitDie} hit die | ${c.primaryStat} primary`,
        value: String(c.id),
      })),
    };

    const embed = new EmbedBuilder()
      .setTitle("Feather Quest — Character Creation")
      .setDescription("**Step 2/4:** Choose your class.")
      .setColor(0x6366f1);

    await interaction.update({
      embeds: [embed],
      components: [{ type: 1, components: [classMenu] }],
    });
    return;
  }

  // ============================================================
  // CHARACTER CREATION: Class selection
  // ============================================================
  if (customId === "create_class") {
    const discordId = interaction.user.id;
    const classId = interaction.values[0];

    const stateMap: Map<string, any> =
      (globalThis as any).__createState || new Map();
    const state = stateMap.get(discordId);

    if (!state || state.step !== "class") {
      return interaction.reply({
        content: "Session expired. Use `/start` again.",
        ephemeral: true,
      });
    }

    state.classId = parseInt(classId);
    state.step = "ability";
    stateMap.set(discordId, state);

    // Generate ability scores
    const scores = Array.from({ length: 6 }, () => {
      const rolls = Array.from({ length: 4 }, () =>
        Math.floor(Math.random() * 6) + 1
      );
      rolls.sort((a, b) => b - a);
      return rolls[0] + rolls[1] + rolls[2];
    });

    state.abilityScores = scores;
    stateMap.set(discordId, state);

    const modStr = (score: number) => {
      const mod = abilityMod(score);
      return mod >= 0 ? `+${mod}` : `${mod}`;
    };

    const embed = new EmbedBuilder()
      .setTitle("Feather Quest — Character Creation")
      .setDescription(
        "**Step 3/4:** Your ability scores (4d6 drop lowest):\n\n" +
          `**STR:** ${scores[0]} (${modStr(scores[0])})\n` +
          `**DEX:** ${scores[1]} (${modStr(scores[1])})\n` +
          `**CON:** ${scores[2]} (${modStr(scores[2])})\n` +
          `**INT:** ${scores[3]} (${modStr(scores[3])})\n` +
          `**WIS:** ${scores[4]} (${modStr(scores[4])})\n` +
          `**CHA:** ${scores[5]} (${modStr(scores[5])})`
      )
      .setColor(0x6366f1);

    // Background selection
    const { BACKGROUNDS } = await import("../../lib/game/classes") as { BACKGROUNDS: BackgroundData[] };
    const bgMenu = {
      type: 3,
      custom_id: "create_background",
      placeholder: "Choose your background...",
      options: BACKGROUNDS.slice(0, 25).map((b: BackgroundData) => ({
        label: b.name,
        description: b.skills.join(", "),
        value: String(b.id),
      })),
    };

    await interaction.update({
      embeds: [embed],
      components: [{ type: 1, components: [bgMenu] }],
    });
    return;
  }

  // ============================================================
  // CHARACTER CREATION: Background selection → Finalize
  // ============================================================
  if (customId === "create_background") {
    const discordId = interaction.user.id;
    const bgId = interaction.values[0];

    const stateMap: Map<string, any> =
      (globalThis as any).__createState || new Map();
    const state = stateMap.get(discordId);

    if (!state || state.step !== "ability") {
      return interaction.reply({
        content: "Session expired. Use `/start` again.",
        ephemeral: true,
      });
    }

    state.backgroundId = parseInt(bgId);
    state.step = "done";

    // Create the character in the database
    const { RACES, CLASSES, BACKGROUNDS } = await import(
      "../../lib/game/classes"
    ) as { RACES: RaceData[]; CLASSES: ClassData[]; BACKGROUNDS: BackgroundData[] };
    const race = RACES.find((r: RaceData) => r.id === state.raceId);
    const cls = CLASSES.find((c: ClassData) => c.id === state.classId);
    const bg = BACKGROUNDS.find((b: BackgroundData) => b.id === state.backgroundId);

    if (!race || !cls) {
      return interaction.reply({
        content: "Error creating character. Try `/start` again.",
        ephemeral: true,
      });
    }

    const scores = state.abilityScores;
    const conMod = abilityMod(scores[2]);
    const hp = cls.hitDie + conMod;
    const dexMod = abilityMod(scores[1]);
    const ac = 10 + dexMod;

    // Insert character
    const charResult = await pool.query(
      `
        INSERT INTO characters
          (user_id, name, race, class_id, race_id, background_id, level, xp,
           hp, max_hp, current_hp, ac, speed, gold, location, status)
        VALUES
          ((SELECT id FROM users WHERE discord_id = $1), $2, $3, $4, $5, $6,
           1, 0, $7, $7, $7, $8, $9, 50, 'Town Square', 'alive')
        RETURNING id
      `,
      [
        discordId,
        state.name,
        race.name,
        state.classId,
        state.raceId,
        state.backgroundId || null,
        hp,
        ac,
        race.speed,
      ]
    );

    const charId = charResult.rows[0].id;

    // Insert ability scores with racial bonuses
    const strFinal = scores[0] + (race.bonuses.str || 0);
    const dexFinal = scores[1] + (race.bonuses.dex || 0);
    const conFinal = scores[2] + (race.bonuses.con || 0);
    const intFinal = scores[3] + (race.bonuses.int || 0);
    const wisFinal = scores[4] + (race.bonuses.wis || 0);
    const chaFinal = scores[5] + (race.bonuses.cha || 0);

    await pool.query(
      `
        INSERT INTO ability_scores
          (character_id, str, dex, "con", int, wis, cha,
           str_save, dex_save, con_save, int_save, wis_save, cha_save)
        VALUES ($1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12, $13)
      `,
      [
        charId,
        strFinal,
        dexFinal,
        conFinal,
        intFinal,
        wisFinal,
        chaFinal,
        abilityMod(strFinal),
        abilityMod(dexFinal),
        abilityMod(conFinal),
        abilityMod(intFinal),
        abilityMod(wisFinal),
        abilityMod(chaFinal),
      ]
    );

    // Give starting equipment based on class
    const starterWeapons: Record<number, string> = {
      1: "Longsword",     // Fighter
      2: "Shortsword",    // Rogue
      3: "Quarterstaff",  // Wizard
      4: "Warhammer",     // Cleric
      5: "Longsword",     // Ranger
      6: "Longsword",     // Paladin
      7: "Greatsword",    // Barbarian
      8: "Shortsword",    // Bard
      9: "Quarterstaff",  // Druid
      10: "Quarterstaff", // Monk
    };

    const weaponName = starterWeapons[cls.id] || "Dagger";
    await pool.query(
      `
        INSERT INTO inventory (character_id, item_id, quantity, equipped)
        SELECT $1, id, 1, true FROM items WHERE name = $2
      `,
      [charId, weaponName]
    );

    // Give leather armor to appropriate classes
    if (
      ["Fighter", "Cleric", "Paladin", "Ranger", "Barbarian", "Druid"].includes(
        cls.name
      )
    ) {
      await pool.query(
        `
          INSERT INTO inventory (character_id, item_id, quantity, equipped)
          SELECT $1, id, 1, true FROM items WHERE name = 'Leather Armor'
        `,
        [charId]
      );
    }

    // Give healing potion
    await pool.query(
      `
        INSERT INTO inventory (character_id, item_id, quantity, equipped)
        SELECT $1, id, 2, false FROM items WHERE name = 'Potion of Healing'
      `,
      [charId]
    );

    stateMap.delete(discordId);

    const modStr = (score: number) => {
      const mod = abilityMod(score);
      return mod >= 0 ? `+${mod}` : `${mod}`;
    };

    const embed = new EmbedBuilder()
      .setTitle(`${state.name} is Born!`)
      .setDescription(
        `**Level 1** ${race.name} ${cls.name}\n` +
          `Background: ${bg?.name || "None"}\n\n` +
          `❤️ HP: **${hp}** | 🛡️ AC: **${ac}** | ⚡ Speed: **${race.speed}ft**\n\n` +
          `**STR:** ${strFinal} (${modStr(strFinal)})  ` +
          `**DEX:** ${dexFinal} (${modStr(dexFinal)})  ` +
          `**CON:** ${conFinal} (${modStr(conFinal)})\n` +
          `**INT:** ${intFinal} (${modStr(intFinal)})  ` +
          `**WIS:** ${wisFinal} (${modStr(wisFinal)})  ` +
          `**CHA:** ${chaFinal} (${modStr(chaFinal)})\n\n` +
          `Your adventure begins in the **Town Square**.\n` +
          `Use \`/play\` to see available quests!`
      )
      .setColor(0x22c55e);

    await interaction.update({ embeds: [embed], components: [] });
    return;
  }

  // ============================================================
  // QUEST ACCEPT
  // ============================================================
  if (customId.startsWith("quest_")) {
    const questId = parseInt(customId.replace("quest_", ""));
    const discordId = interaction.user.id;

    // Get character
    const charResult = await pool.query(
      `
        SELECT c.id, c.name, c.level
        FROM characters c
        WHERE c.user_id = (SELECT id FROM users WHERE discord_id = $1)
        LIMIT 1
      `,
      [discordId]
    );

    if (charResult.rows.length === 0) {
      return interaction.reply({
        content: "Character not found.",
        ephemeral: true,
      });
    }

    const char = charResult.rows[0];

    // Check if already on this quest
    const existingQuest = await pool.query(
      `SELECT id FROM player_quests WHERE character_id = $1 AND quest_id = $2 AND status = 'active'`,
      [char.id, questId]
    );

    if (existingQuest.rows.length > 0) {
      return interaction.reply({
        content: "You're already on this quest!",
        ephemeral: true,
      });
    }

    // Get quest details
    const questResult = await pool.query(
      `SELECT * FROM quests WHERE id = $1`,
      [questId]
    );

    if (questResult.rows.length === 0) {
      return interaction.reply({
        content: "Quest not found.",
        ephemeral: true,
      });
    }

    const quest = questResult.rows[0];

    // Start the quest
    await pool.query(
      `
        INSERT INTO player_quests (character_id, quest_id, status, progress)
        VALUES ($1, $2, 'active', 0)
      `,
      [char.id, questId]
    );

    // Generate encounter based on quest difficulty
    const difficultyHP: Record<string, [number, number]> = {
      Easy: [8, 15],
      Normal: [15, 30],
      Hard: [30, 50],
      Deadly: [50, 100],
    };

    const hpRange = difficultyHP[quest.difficulty] || [10, 20];
    const enemyHp =
      Math.floor(Math.random() * (hpRange[1] - hpRange[0])) + hpRange[0];
    const enemyAc = Math.floor(Math.random() * 5) + 10;

    // Store encounter in world_state temporarily
    await pool.query(
      `
        INSERT INTO world_state (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = $2
      `,
      [
        `encounter:${char.id}`,
        JSON.stringify({
          questId,
          questName: quest.name,
          enemyHp,
          enemyMaxHp: enemyHp,
          enemyAc,
          enemyName: quest.name.includes("Rat")
            ? "Giant Rat"
            : quest.name.includes("Goblin")
              ? "Goblin"
              : quest.name.includes("Bandit")
                ? "Bandit"
                : quest.name.includes("Dragon")
                  ? "Ancient Dragon"
                  : "Enemy",
        }),
      ]
    );

    const embed = new EmbedBuilder()
      .setTitle(`Quest Started: ${quest.name}`)
      .setDescription(quest.description)
      .addFields(
        {
          name: "Difficulty",
          value: quest.difficulty,
          inline: true,
        },
        {
          name: "Reward",
          value: `${quest.xp_reward} XP, ${quest.gp_reward} GP`,
          inline: true,
        }
      )
      .setColor(0xf59e0b);

    await interaction.reply({ embeds: [embed] });
    return;
  }

  // ============================================================
  // COMBAT ACTION
  // ============================================================
  if (customId.startsWith("combat_")) {
    const action = customId.replace("combat_", "");
    const discordId = interaction.user.id;

    const charResult = await pool.query(
      `
        SELECT c.id, c.name, c.level, c.current_hp, c.max_hp, c.ac,
               cl.name AS class_name, cl.primary_stat,
               a.str, a.dex, a."con"
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
        content: "Character not found.",
        ephemeral: true,
      });
    }

    const char = charResult.rows[0];

    // Get active encounter
    const encounterResult = await pool.query(
      `SELECT value FROM world_state WHERE key = $1`,
      [`encounter:${char.id}`]
    );

    if (encounterResult.rows.length === 0) {
      return interaction.reply({
        content: "No active encounter. Use `/play` to find a quest.",
        ephemeral: true,
      });
    }

    const encounter = encounterResult.rows[0].value;

    if (action === "attack") {
      const attackMod = abilityMod(char.str);
      const prof = profBonus(char.level);
      const attackRoll = rollDice("1d20");
      const total = attackRoll.total + attackMod + prof;
      const isCrit = attackRoll.rolls[0] === 20;
      const isFumble = attackRoll.rolls[0] === 1;
      const hit = isCrit || (!isFumble && total >= encounter.enemyAc);

      let damage = 0;
      let dmgText = "";

      if (hit) {
        const dmgRoll = rollDice("1d8");
        damage = dmgRoll.total + attackMod;
        if (isCrit) {
          const critRoll = rollDice("1d8");
          damage += critRoll.total;
          dmgText = `Crit: ${dmgRoll.total}+${critRoll.total}+${attackMod} = **${damage}**`;
        } else {
          dmgText = `${dmgRoll.total}+${attackMod} = **${damage}**`;
        }

        encounter.enemyHp = Math.max(0, encounter.enemyHp - damage);

        // Update encounter
        await pool.query(
          `UPDATE world_state SET value = $1 WHERE key = $2`,
          [JSON.stringify(encounter), `encounter:${char.id}`]
        );
      }

      // Enemy attacks back
      let enemyAtkText = "";
      if (hit) {
        const enemyRoll = rollDice("1d20");
        const enemyTotal = enemyRoll.total + 4;
        if (enemyTotal >= char.ac) {
          const enemyDmg = rollDice("1d6");
          const newHp = Math.max(0, char.current_hp - enemyDmg.total);
          await pool.query(
            `UPDATE characters SET current_hp = $1 WHERE id = $2`,
            [newHp, char.id]
          );
          char.current_hp = newHp;
          enemyAtkText = `\n⚔️ **${encounter.enemyName}** strikes back for **${enemyDmg.total}** damage! (HP: ${newHp}/${char.max_hp})`;
        } else {
          enemyAtkText = `\n⚔️ **${encounter.enemyName}** misses! (AC ${char.ac})`;
        }
      }

      const embed = new EmbedBuilder()
        .setTitle(
          hit
            ? isCrit
              ? "💥 CRITICAL HIT!"
              : "⚔️ Hit!"
            : "❌ Miss!"
        )
        .setDescription(
          `You swing at **${encounter.enemyName}**!\n` +
            `Attack: ${attackRoll.total}+${attackMod + prof} = **${total}** vs AC ${encounter.enemyAc}\n` +
            (hit ? `Damage: ${dmgText}` : "") +
            enemyAtkText +
            `\n\n**${encounter.enemyName}:** ${encounter.enemyHp}/${encounter.enemyMaxHp} HP`
        )
        .setColor(hit ? 0x22c55e : 0xef4444);

      if (encounter.enemyHp <= 0) {
        embed.setDescription(
          `You defeated the **${encounter.enemyName}**!\n` +
            `Quest complete!`
        );
        embed.setColor(0xffd700);

        // Award XP and gold
        await pool.query(
          `UPDATE characters SET xp = xp + $1, gold = gold + $2 WHERE id = $3`,
          [100, 50, char.id]
        );
        await pool.query(
          `UPDATE player_quests SET status = 'completed', progress = 1, completed_at = NOW() WHERE character_id = $1 AND quest_id = $2`,
          [char.id, encounter.questId]
        );
        await pool.query(
          `DELETE FROM world_state WHERE key = $1`,
          [`encounter:${char.id}`]
        );
      }

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (action === "flee") {
      await pool.query(
        `DELETE FROM world_state WHERE key = $1`,
        [`encounter:${char.id}`]
      );

      const embed = new EmbedBuilder()
        .setTitle("🏃 Fled!")
        .setDescription("You retreated from combat. The quest remains active.")
        .setColor(0xf59e0b);

      await interaction.reply({ embeds: [embed] });
      return;
    }
  }
}

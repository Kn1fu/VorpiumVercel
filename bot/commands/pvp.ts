import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Pool } from "pg";

export default {
  data: new SlashCommandBuilder()
    .setName("pvp")
    .setDescription("Player vs Player combat")
    .addSubcommand((sub) =>
      sub
        .setName("challenge")
        .setDescription("Challenge another player to PvP")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("The player to challenge")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("accept")
        .setDescription("Accept a PvP challenge")
        .addIntegerOption((opt) =>
          opt
            .setName("match_id")
            .setDescription("The match ID to accept")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("decline")
        .setDescription("Decline a PvP challenge")
        .addIntegerOption((opt) =>
          opt
            .setName("match_id")
            .setDescription("The match ID to decline")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("attack")
        .setDescription("Attack in an active PvP match")
        .addIntegerOption((opt) =>
          opt
            .setName("match_id")
            .setDescription("The match ID")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("history").setDescription("Show your recent PvP matches")
    ),

  async execute(interaction: any, pool: Pool) {
    const sub = interaction.options.getSubcommand();
    const discordId = interaction.user.id;

    const userRes = await pool.query(
      `SELECT u.id, c.id as character_id, c.name as char_name, c.level, c.current_hp, c.max_hp
       FROM users u
       LEFT JOIN characters c ON u.id = c.user_id
       WHERE u.discord_id = $1`,
      [discordId]
    );
    if (userRes.rows.length === 0 || !userRes.rows[0].character_id) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setDescription("You don't have a character yet. Use `/create` first."),
        ],
        ephemeral: true,
      });
    }

    const {
      id: userId,
      character_id: characterId,
      char_name: charName,
      level,
      current_hp,
      max_hp,
    } = userRes.rows[0];

    const abilityMod = (score: number) => Math.floor((score - 10) / 2);
    const profBonus = (lvl: number) => Math.ceil(lvl / 4) + 1;

    if (sub === "challenge") {
      const targetUser = interaction.options.getUser("user");
      if (targetUser.id === discordId) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You can't challenge yourself."),
          ],
          ephemeral: true,
        });
      }

      const targetRes = await pool.query(
        `SELECT u.id, c.id as character_id, c.name as char_name
         FROM users u
         LEFT JOIN characters c ON u.id = c.user_id
         WHERE u.discord_id = $1`,
        [targetUser.id]
      );
      if (targetRes.rows.length === 0 || !targetRes.rows[0].character_id) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("That user doesn't have a character yet."),
          ],
          ephemeral: true,
        });
      }

      const { id: targetUserId, character_id: targetCharId } = targetRes.rows[0];

      const activeRes = await pool.query(
        `SELECT id FROM pvp_matches
         WHERE status = 'active'
         AND (challenger_id = $1 OR defender_id = $1)`,
        [characterId]
      );
      if (activeRes.rows.length > 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You already have an active PvP match."),
          ],
          ephemeral: true,
        });
      }

      const targetActive = await pool.query(
        `SELECT id FROM pvp_matches
         WHERE status IN ('pending', 'active')
         AND (challenger_id = $1 OR defender_id = $1)`,
        [targetCharId]
      );
      if (targetActive.rows.length > 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("That player is already in a match."),
          ],
          ephemeral: true,
        });
      }

      const matchRes = await pool.query(
        `INSERT INTO pvp_matches (challenger_id, defender_id, status)
         VALUES ($1, $2, 'pending') RETURNING id`,
        [characterId, targetCharId]
      );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("PvP Challenge!")
            .setDescription(
              `**${charName}** has challenged <@${targetUser.id}> to PvP!\nMatch ID: \`${matchRes.rows[0].id}\`\nUse \`/pvp accept ${matchRes.rows[0].id}\` to accept.`
            ),
        ],
        ephemeral: true,
      });
    }

    if (sub === "accept") {
      const matchId = interaction.options.getInteger("match_id");

      const matchRes = await pool.query(
        `SELECT * FROM pvp_matches
         WHERE id = $1 AND status = 'pending' AND defender_id = $2`,
        [matchId, characterId]
      );
      if (matchRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("No pending PvP challenge found for you with that ID."),
          ],
          ephemeral: true,
        });
      }

      await pool.query(
        `UPDATE pvp_matches SET status = 'active', started_at = NOW() WHERE id = $1`,
        [matchId]
      );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle("PvP Match Started!")
            .setDescription(`The match is on! Use \`/pvp attack ${matchId}\` to fight.`),
        ],
        ephemeral: true,
      });
    }

    if (sub === "decline") {
      const matchId = interaction.options.getInteger("match_id");

      const matchRes = await pool.query(
        `SELECT * FROM pvp_matches
         WHERE id = $1 AND status = 'pending' AND defender_id = $2`,
        [matchId, characterId]
      );
      if (matchRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("No pending PvP challenge found for you with that ID."),
          ],
          ephemeral: true,
        });
      }

      await pool.query(`UPDATE pvp_matches SET status = 'declined' WHERE id = $1`, [matchId]);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffff00)
            .setTitle("Challenge Declined")
            .setDescription("You declined the PvP challenge."),
        ],
        ephemeral: true,
      });
    }

    if (sub === "attack") {
      const matchId = interaction.options.getInteger("match_id");

      const matchRes = await pool.query(
        `SELECT * FROM pvp_matches
         WHERE id = $1 AND status = 'active'
         AND (challenger_id = $2 OR defender_id = $2)`,
        [matchId, characterId]
      );
      if (matchRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("No active PvP match found with that ID for you."),
          ],
          ephemeral: true,
        });
      }

      const match = matchRes.rows[0];
      const isChallenger = match.challenger_id === characterId;
      const opponentCharId = isChallenger ? match.defender_id : match.challenger_id;

      const abilityRes = await pool.query(
        `SELECT a.str, a.dex, a."con", a.int, a.wis, a.cha
         FROM ability_scores a WHERE a.character_id = $1`,
        [characterId]
      );
      const abilities = abilityRes.rows[0] || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

      const attackRoll = Math.floor(Math.random() * 20) + 1;
      const strMod = abilityMod(abilities.str);
      const prof = profBonus(level);
      const totalAttack = attackRoll + strMod + prof;
      const damage = Math.max(1, Math.floor(Math.random() * 8) + 1 + strMod);
      const hit = attackRoll === 20 || (attackRoll !== 1 && totalAttack >= 10);
      const crit = attackRoll === 20;
      const finalDamage = crit ? damage * 2 : damage;

      if (hit) {
        const opponentRes = await pool.query(
          `SELECT current_hp FROM characters WHERE id = $1`,
          [opponentCharId]
        );
        const opponentHp = opponentRes.rows[0]?.current_hp || 0;
        const newOpponentHp = Math.max(0, opponentHp - finalDamage);
        await pool.query(`UPDATE characters SET current_hp = $1 WHERE id = $2`, [
          newOpponentHp,
          opponentCharId,
        ]);

        if (newOpponentHp <= 0) {
          await pool.query(
            `UPDATE pvp_matches SET status = 'completed', winner_id = $1, completed_at = NOW() WHERE id = $2`,
            [characterId, matchId]
          );

          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xffd700)
                .setTitle("PvP Victory!")
                .setDescription(
                  `**${charName}** wins!\nAttack: ${attackRoll} ${crit ? "CRIT!" : "Hit!"} → ${finalDamage} damage\nOpponent defeated!`
                ),
            ],
            ephemeral: true,
          });
        }
      }

      let counterDmg = 0;
      const opponentAbilityRes = await pool.query(
        `SELECT a.str, a.dex, a."con"
         FROM ability_scores a WHERE a.character_id = $1`,
        [opponentCharId]
      );
      const oppAbilities = opponentAbilityRes.rows[0] || { str: 10, dex: 10, con: 10 };
      const oppStrMod = abilityMod(oppAbilities.str);
      const oppConMod = abilityMod(oppAbilities.con);
      const oppLevelRes = await pool.query(
        `SELECT level FROM characters WHERE id = $1`,
        [opponentCharId]
      );
      const oppLevel = oppLevelRes.rows[0]?.level || 1;
      const oppProf = profBonus(oppLevel);

      const oppRoll = Math.floor(Math.random() * 20) + 1;
      const oppTotal = oppRoll + oppStrMod + oppProf;
      const oppHit = oppRoll === 20 || (oppRoll !== 1 && oppTotal >= 10 + oppConMod + oppProf);

      if (oppHit) {
        counterDmg = Math.max(1, Math.floor(Math.random() * 8) + 1 + oppStrMod);
        const newHp = Math.max(0, current_hp - counterDmg);
        await pool.query(`UPDATE characters SET current_hp = $1 WHERE id = $2`, [newHp, characterId]);
      }

      const embed = new EmbedBuilder()
        .setColor(hit ? 0x00ff00 : 0xff0000)
        .setTitle("PvP Combat")
        .setDescription(
          `**Your Attack:** ${attackRoll} ${hit ? (crit ? "CRIT!" : "Hit!") : "Miss!"}\n` +
            `**Damage:** ${hit ? finalDamage : 0}\n\n` +
            `**Opponent Attack:** ${oppRoll} ${oppHit ? "Hit!" : "Miss!"}\n` +
            `**Damage Taken:** ${oppHit ? counterDmg : 0}\n\n` +
            `**Your HP:** ${Math.max(0, current_hp - counterDmg)}/${max_hp}`
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "history") {
      const historyRes = await pool.query(
        `SELECT pm.*, 
           c1.name as challenger_name,
           c2.name as defender_name,
           c3.name as winner_name
         FROM pvp_matches pm
         JOIN characters c1 ON pm.challenger_id = c1.id
         JOIN characters c2 ON pm.defender_id = c2.id
         LEFT JOIN characters c3 ON pm.winner_id = c3.id
         WHERE pm.challenger_id = $1 OR pm.defender_id = $1
         ORDER BY pm.created_at DESC
         LIMIT 10`,
        [characterId]
      );

      if (historyRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setDescription("No PvP history yet."),
          ],
          ephemeral: true,
        });
      }

      const list = historyRes.rows
        .map(
          (m: any) =>
            `\`${m.id}\` **${m.challenger_name}** vs **${m.defender_name}** — **${m.status}** ${m.winner_name ? `(Winner: ${m.winner_name})` : ""}`
        )
        .join("\n");

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("PvP History")
            .setDescription(list),
        ],
        ephemeral: true,
      });
    }
  },
};

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Pool } from "pg";

const ROOM_ENEMIES: Record<number, { name: string; hp: number; damage: number }> = {
  1: { name: "Goblin Scout", hp: 15, damage: 4 },
  2: { name: "Skeleton Warrior", hp: 25, damage: 6 },
  3: { name: "Dark Elf Mage", hp: 20, damage: 8 },
  4: { name: "Orc Berserker", hp: 35, damage: 10 },
  5: { name: "Dungeon Boss - Lich", hp: 60, damage: 14 },
};

const LOOT_TABLE = [
  { name: "Iron Sword", type: "weapon", power: 3 },
  { name: "Steel Shield", type: "armor", power: 2 },
  { name: "Health Potion", type: "consumable", power: 10 },
  { name: "Magic Ring", type: "accessory", power: 4 },
  { name: "Enchanted Boots", type: "armor", power: 3 },
  { name: "Flame Dagger", type: "weapon", power: 5 },
];

export default {
  data: new SlashCommandBuilder()
    .setName("dungeon")
    .setDescription("Dungeon exploration")
    .addSubcommand((sub) => sub.setName("start").setDescription("Start a dungeon run"))
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Show dungeon progress")
    )
    .addSubcommand((sub) =>
      sub.setName("advance").setDescription("Move to the next room")
    )
    .addSubcommand((sub) =>
      sub.setName("fight").setDescription("Fight the current room's enemy")
    )
    .addSubcommand((sub) =>
      sub.setName("loot").setDescription("Take dungeon loot")
    ),

  async execute(interaction: any, pool: Pool) {
    const sub = interaction.options.getSubcommand();
    const discordId = interaction.user.id;

    const userRes = await pool.query(
      `SELECT u.id, c.id as character_id, c.name as char_name, c.current_hp, c.max_hp, c.level
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

    const { id: userId, character_id: characterId, char_name: charName, current_hp, max_hp, level } =
      userRes.rows[0];

    if (sub === "start") {
      const partyRes = await pool.query(
        `SELECT p.id as party_id, p.leader_id
         FROM party_members pm
         JOIN parties p ON pm.party_id = p.id
         JOIN users u ON pm.user_id = u.id
         WHERE u.discord_id = $1`,
        [discordId]
      );
      if (partyRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You must be in a party to enter a dungeon."),
          ],
          ephemeral: true,
        });
      }

      const { party_id: partyId, leader_id: leaderId } = partyRes.rows[0];
      if (leaderId !== userId) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("Only the party leader can start a dungeon."),
          ],
          ephemeral: true,
        });
      }

      const activeRes = await pool.query(
        `SELECT id FROM dungeon_runs WHERE party_id = $1 AND status = 'active'`,
        [partyId]
      );
      if (activeRes.rows.length > 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription(
                "Your party already has an active dungeon run. Use `/dungeon status`."
              ),
          ],
          ephemeral: true,
        });
      }

      const rooms = Array.from({ length: 5 }, (_, i) => {
        const roomNum = i + 1;
        const enemy = ROOM_ENEMIES[roomNum];
        return { room_number: roomNum, enemy_name: enemy.name, enemy_hp: enemy.hp, enemy_max_hp: enemy.hp, enemy_damage: enemy.damage, cleared: false };
      });

      await pool.query(
        `INSERT INTO dungeon_runs (party_id, current_room, status, rooms)
         VALUES ($1, 1, 'active', $2)`,
        [partyId, JSON.stringify(rooms)]
      );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle("Dungeon Entered!")
            .setDescription(
              `**${charName}** and their party have entered the dungeon!\nRoom 1: ${ROOM_ENEMIES[1].name}\nUse \`/dungeon fight\` to battle.`
            ),
        ],
        ephemeral: true,
      });
    }

    if (sub === "status") {
      const dungeonRes = await pool.query(
        `SELECT dr.* FROM dungeon_runs dr
         JOIN party_members pm ON dr.party_id = pm.party_id
         JOIN users u ON pm.user_id = u.id
         WHERE u.discord_id = $1 AND dr.status = 'active'`,
        [discordId]
      );

      if (dungeonRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You have no active dungeon run."),
          ],
          ephemeral: true,
        });
      }

      const dungeon = dungeonRes.rows[0];
      const rooms = JSON.parse(dungeon.rooms);
      const currentRoom = rooms[dungeon.current_room - 1];

      const membersRes = await pool.query(
        `SELECT c.name, c.current_hp, c.max_hp
         FROM party_members pm
         JOIN users u ON pm.user_id = u.id
         JOIN characters c ON u.id = c.user_id
         WHERE pm.party_id = $1`,
        [dungeon.party_id]
      );

      const memberHP = membersRes.rows
        .map((m: any) => `**${m.name}**: ${m.current_hp}/${m.max_hp} HP`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("Dungeon Status")
        .setDescription(
          `Room ${dungeon.current_room}/5\n\n**Enemy:** ${currentRoom.enemy_name} (HP: ${currentRoom.enemy_hp}/${currentRoom.enemy_max_hp})\n**Cleared:** ${currentRoom.cleared ? "Yes" : "No"}\n\n**Party HP:**\n${memberHP}`
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "advance") {
      const dungeonRes = await pool.query(
        `SELECT dr.* FROM dungeon_runs dr
         JOIN party_members pm ON dr.party_id = pm.party_id
         JOIN users u ON pm.user_id = u.id
         WHERE u.discord_id = $1 AND dr.status = 'active'`,
        [discordId]
      );

      if (dungeonRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You have no active dungeon run."),
          ],
          ephemeral: true,
        });
      }

      const dungeon = dungeonRes.rows[0];
      const rooms = JSON.parse(dungeon.rooms);
      const current = rooms[dungeon.current_room - 1];

      if (!current.cleared) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You must clear the current room first!"),
          ],
          ephemeral: true,
        });
      }

      if (dungeon.current_room >= 5) {
        await pool.query(`UPDATE dungeon_runs SET status = 'completed' WHERE id = $1`, [
          dungeon.id,
        ]);
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xffd700)
              .setTitle("Dungeon Complete!")
              .setDescription("You've conquered the dungeon! Use `/dungeon loot` to claim your rewards."),
          ],
          ephemeral: true,
        });
      }

      await pool.query(`UPDATE dungeon_runs SET current_room = $1 WHERE id = $2`, [
        dungeon.current_room + 1,
        dungeon.id,
      ]);

      const nextRoom = rooms[dungeon.current_room];
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle("Room Advanced!")
            .setDescription(
              `Room ${dungeon.current_room + 1}: **${nextRoom.enemy_name}**\nHP: ${nextRoom.enemy_hp}/${nextRoom.enemy_max_hp}\nUse \`/dungeon fight\` to battle.`
            ),
        ],
        ephemeral: true,
      });
    }

    if (sub === "fight") {
      const dungeonRes = await pool.query(
        `SELECT dr.* FROM dungeon_runs dr
         JOIN party_members pm ON dr.party_id = pm.party_id
         JOIN users u ON pm.user_id = u.id
         WHERE u.discord_id = $1 AND dr.status = 'active'`,
        [discordId]
      );

      if (dungeonRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You have no active dungeon run."),
          ],
          ephemeral: true,
        });
      }

      const dungeon = dungeonRes.rows[0];
      const rooms = JSON.parse(dungeon.rooms);
      const room = rooms[dungeon.current_room - 1];

      if (room.cleared) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("This room is already cleared!"),
          ],
          ephemeral: true,
        });
      }

      const abilityMod = (score: number) => Math.floor((score - 10) / 2);
      const profBonus = (lvl: number) => Math.ceil(lvl / 4) + 1;

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

      let enemyDmg = 0;
      if (hit) {
        room.enemy_hp = Math.max(0, room.enemy_hp - finalDamage);
        rooms[dungeon.current_room - 1] = room;
      }

      const enemyRoll = Math.floor(Math.random() * 20) + 1;
      const conMod = abilityMod(abilities.con);
      const enemyHit = enemyRoll === 20 || (enemyRoll !== 1 && enemyRoll + 2 >= 10 + conMod + prof);

      if (enemyHit) {
        enemyDmg = Math.max(1, room.enemy_damage + Math.floor(Math.random() * 4));
        const newHp = Math.max(0, current_hp - enemyDmg);
        await pool.query(`UPDATE characters SET current_hp = $1 WHERE id = $2`, [newHp, characterId]);
      }

      if (room.enemy_hp <= 0) {
        room.cleared = true;
        rooms[dungeon.current_room - 1] = room;
      }

      await pool.query(`UPDATE dungeon_runs SET rooms = $1 WHERE id = $2`, [
        JSON.stringify(rooms),
        dungeon.id,
      ]);

      const embed = new EmbedBuilder()
        .setColor(hit ? 0x00ff00 : 0xff0000)
        .setTitle("Dungeon Combat")
        .setDescription(
          `**Attack:** ${attackRoll} ${hit ? (crit ? "CRITICAL HIT!" : "Hit!") : "Miss!"}\n` +
            `**Damage:** ${hit ? finalDamage : 0}${crit ? " (crit!)" : ""}\n` +
            `**Enemy:** ${room.enemy_name} HP: ${room.enemy_hp}/${room.enemy_max_hp}\n\n` +
            `**Enemy Attack:** ${enemyRoll} ${enemyHit ? "Hit!" : "Miss!"}\n` +
            `**Damage Taken:** ${enemyHit ? enemyDmg : 0}\n` +
            `**Your HP:** ${Math.max(0, current_hp - enemyDmg)}/${max_hp}${room.enemy_hp <= 0 ? "\n\n🎉 **Enemy defeated!**" : ""}`
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "loot") {
      const dungeonRes = await pool.query(
        `SELECT dr.* FROM dungeon_runs dr
         JOIN party_members pm ON dr.party_id = pm.party_id
         JOIN users u ON pm.user_id = u.id
         WHERE u.discord_id = $1 AND dr.status = 'completed'`,
        [discordId]
      );

      if (dungeonRes.rows.length === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("You have no completed dungeon run to collect loot from."),
          ],
          ephemeral: true,
        });
      }

      const dungeon = dungeonRes.rows[0];
      const rooms = JSON.parse(dungeon.rooms);
      const bossLoot = rooms[4]?.cleared;

      const availableLoot = bossLoot
        ? LOOT_TABLE
        : LOOT_TABLE.filter((l) => l.power <= 3);
      const lootItem = availableLoot[Math.floor(Math.random() * availableLoot.length)];

      await pool.query(
        `INSERT INTO inventory (character_id, item_name, item_type, power)
         VALUES ($1, $2, $3, $4)`,
        [characterId, lootItem.name, lootItem.type, lootItem.power]
      );

      const xpReward = bossLoot ? 100 : 30;
      const goldReward = bossLoot ? 50 : 15;
      await pool.query(
        `UPDATE characters
         SET experience = experience + $1, gold = gold + $2
         WHERE id = $3`,
        [xpReward, goldReward, characterId]
      );

      await pool.query(`UPDATE dungeon_runs SET status = 'looted' WHERE id = $1`, [dungeon.id]);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle("Dungeon Loot!")
            .setDescription(
              `**Item:** ${lootItem.name} (${lootItem.type}, +${lootItem.power})\n**XP:** +${xpReward}\n**Gold:** +${goldReward}`
            ),
        ],
        ephemeral: true,
      });
    }
  },
};

import { NextRequest, NextResponse } from "next/server";
import pool from "lib/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "lib/session";
import { rollDice } from "lib/game/dice";

export const dynamic = "force-dynamic";

async function getCharacter(discordId: string) {
  const result = await pool.query(
    `SELECT c.* FROM characters c WHERE c.user_id = (SELECT id FROM users WHERE discord_id = $1) LIMIT 1`,
    [discordId]
  );
  return result.rows[0] || null;
}

function generateRooms(partyAvgLevel: number) {
  const enemyTemplates = [
    { name: "Goblin Scout", hpBase: 8, acBase: 10, xp: 25, gp: 10 },
    { name: "Skeleton Warrior", hpBase: 13, acBase: 13, xp: 50, gp: 20 },
    { name: "Dark Elf Mage", hpBase: 16, acBase: 12, xp: 75, gp: 35 },
    { name: "Orc Berserker", hpBase: 21, acBase: 13, xp: 100, gp: 50 },
    { name: "Troll Brute", hpBase: 30, acBase: 15, xp: 150, gp: 75 },
    { name: "Shadow Wraith", hpBase: 22, acBase: 14, xp: 120, gp: 60 },
    { name: "Fire Elemental", hpBase: 35, acBase: 16, xp: 200, gp: 100 },
    { name: "Bone Dragon Whelp", hpBase: 50, acBase: 17, xp: 300, gp: 150 },
  ];

  const rooms = [];
  for (let i = 0; i < 5; i++) {
    const template = enemyTemplates[Math.floor(Math.random() * enemyTemplates.length)];
    const scale = 1 + partyAvgLevel * 0.15;
    const hp = Math.floor(template.hpBase * scale);
    const ac = template.acBase + Math.floor(partyAvgLevel / 5);

    rooms.push({
      roomNumber: i + 1,
      enemyName: template.name,
      enemyHp: hp,
      enemyMaxHp: hp,
      enemyAc: ac,
      xpReward: template.xp,
      gpReward: template.gp,
      cleared: false,
    });
  }
  return rooms;
}

/**
 * GET /api/game/dungeon — Get active dungeon run
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const discordId = verifySessionToken(token);

    if (!discordId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const char = await getCharacter(discordId);
    if (!char) {
      return NextResponse.json(
        { error: "No character found" },
        { status: 404 }
      );
    }

    // Find party
    const partyResult = await pool.query(
      `SELECT party_id FROM party_members WHERE character_id = $1`,
      [char.id]
    );

    if (partyResult.rows.length === 0) {
      return NextResponse.json(
        { error: "You must be in a party to enter dungeons" },
        { status: 400 }
      );
    }

    const partyId = partyResult.rows[0].party_id;

    // Check for active dungeon run
    const dungeonResult = await pool.query(
      `SELECT * FROM dungeon_runs WHERE party_id = $1 AND status = 'active' LIMIT 1`,
      [partyId]
    );

    if (dungeonResult.rows.length === 0) {
      return NextResponse.json({ dungeon: null });
    }

    const dungeon = dungeonResult.rows[0];

    // Get party loot
    const lootResult = await pool.query(
      `
        SELECT pl.*, it.name AS item_name, it.type AS item_type
        FROM party_loot pl
        JOIN items it ON pl.item_id = it.id
        WHERE pl.party_id = $1
        ORDER BY pl.created_at DESC
      `,
      [partyId]
    );

    // Get party members
    const membersResult = await pool.query(
      `
        SELECT c.id, c.name, c.level, c.current_hp, c.max_hp
        FROM party_members pm
        JOIN characters c ON pm.character_id = c.id
        WHERE pm.party_id = $1
      `,
      [partyId]
    );

    return NextResponse.json({
      dungeon: {
        id: dungeon.id,
        dungeonName: dungeon.dungeon_name,
        currentRoom: dungeon.current_room,
        maxRooms: dungeon.max_rooms,
        status: dungeon.status,
        totalXp: dungeon.total_xp,
        totalGp: dungeon.total_gp,
        roomData: dungeon.room_data,
        startedAt: dungeon.started_at,
        completedAt: dungeon.completed_at,
        party: membersResult.rows,
        partyLoot: lootResult.rows.map((l) => ({
          id: l.id,
          itemName: l.item_name,
          itemType: l.item_type,
          quantity: l.quantity,
          addedBy: l.added_by,
        })),
      },
    });
  } catch (error) {
    console.error("Get dungeon failed:", error);
    return NextResponse.json(
      { error: "Failed to get dungeon" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/game/dungeon — Dungeon actions
 * Body: { action: "start" | "advance" | "loot" | "takeLoot", lootId?, itemId? }
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const discordId = verifySessionToken(token);

    if (!discordId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const char = await getCharacter(discordId);
    if (!char) {
      return NextResponse.json(
        { error: "No character found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { action, lootId, itemId } = body;

    if (!action) {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 }
      );
    }

    // Find party
    const partyResult = await pool.query(
      `SELECT p.* FROM party_members pm JOIN parties p ON pm.party_id = p.id WHERE pm.character_id = $1`,
      [char.id]
    );

    if (partyResult.rows.length === 0) {
      return NextResponse.json(
        { error: "You must be in a party" },
        { status: 400 }
      );
    }

    const party = partyResult.rows[0];

    // ============================================================
    // START
    // ============================================================
    if (action === "start") {
      if (party.leader_id !== char.id) {
        return NextResponse.json(
          { error: "Only the party leader can start a dungeon" },
          { status: 403 }
        );
      }

      // Check if already in a dungeon
      const existing = await pool.query(
        `SELECT id FROM dungeon_runs WHERE party_id = $1 AND status = 'active'`,
        [party.id]
      );

      if (existing.rows.length > 0) {
        return NextResponse.json(
          { error: "Already in a dungeon" },
          { status: 400 }
        );
      }

      // Calculate party average level
      const avgResult = await pool.query(
        `SELECT AVG(level)::int AS avg_level FROM characters c JOIN party_members pm ON c.id = pm.character_id WHERE pm.party_id = $1`,
        [party.id]
      );

      const avgLevel = avgResult.rows[0].avg_level || 1;
      const rooms = generateRooms(avgLevel);

      const dungeonNames = [
        "The Sunken Catacombs",
        "Goblin Warrens",
        "The Shadow Crypt",
        "Dragon's Lair",
        "The Forbidden Tower",
        "Underdark Caverns",
        "The Haunted Crypt",
      ];

      const dungeonName = dungeonNames[Math.floor(Math.random() * dungeonNames.length)];

      const result = await pool.query(
        `
          INSERT INTO dungeon_runs (party_id, dungeon_name, current_room, max_rooms, room_data, status)
          VALUES ($1, $2, 1, 5, $3, 'active')
          RETURNING *
        `,
        [party.id, dungeonName, JSON.stringify(rooms)]
      );

      return NextResponse.json({
        dungeon: {
          id: result.rows[0].id,
          dungeonName,
          currentRoom: 1,
          maxRooms: 5,
          roomData: rooms,
          status: "active",
        },
        message: `Entering ${dungeonName}! Room 1 begins.`,
      });
    }

    // ============================================================
    // ADVANCE
    // ============================================================
    if (action === "advance") {
      const dungeonResult = await pool.query(
        `SELECT * FROM dungeon_runs WHERE party_id = $1 AND status = 'active'`,
        [party.id]
      );

      if (dungeonResult.rows.length === 0) {
        return NextResponse.json(
          { error: "No active dungeon run" },
          { status: 400 }
        );
      }

      const dungeon = dungeonResult.rows[0];
      const rooms = dungeon.room_data;

      // Check current room is cleared
      const currentRoom = rooms[dungeon.current_room - 1];
      if (currentRoom && !currentRoom.cleared) {
        return NextResponse.json(
          { error: "Current room must be cleared before advancing" },
          { status: 400 }
        );
      }

      if (dungeon.current_room >= dungeon.max_rooms) {
        // Dungeon complete
        await pool.query(
          `UPDATE dungeon_runs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
          [dungeon.id]
        );

        // Calculate total rewards
        let totalXp = 0;
        let totalGp = 0;
        for (const room of rooms) {
          totalXp += room.xpReward;
          totalGp += room.gpReward;
        }

        // Award to party members
        const members = await pool.query(
          `SELECT character_id FROM party_members WHERE party_id = $1`,
          [party.id]
        );

        for (const m of members.rows) {
          await pool.query(
            `UPDATE characters SET xp = xp + $1, gold = gold + $2 WHERE id = $3`,
            [totalXp, totalGp, m.character_id]
          );
        }

        return NextResponse.json({
          message: "Dungeon complete!",
          totalXp,
          totalGp,
          status: "completed",
        });
      }

      // Advance to next room
      const nextRoom = dungeon.current_room + 1;
      await pool.query(
        `UPDATE dungeon_runs SET current_room = $1 WHERE id = $2`,
        [nextRoom, dungeon.id]
      );

      return NextResponse.json({
        message: `Advancing to room ${nextRoom}`,
        currentRoom: nextRoom,
        room: rooms[nextRoom - 1],
      });
    }

    // ============================================================
    // LOOT / TAKELOOT
    // ============================================================
    if (action === "loot" || action === "takeLoot") {
      const targetLootId = lootId || itemId;

      if (!targetLootId) {
        return NextResponse.json(
          { error: "lootId is required" },
          { status: 400 }
        );
      }

      // Check loot exists
      const lootResult = await pool.query(
        `SELECT * FROM party_loot WHERE id = $1 AND party_id = $2`,
        [targetLootId, party.id]
      );

      if (lootResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Loot not found" },
          { status: 404 }
        );
      }

      const loot = lootResult.rows[0];

      // Add to character inventory
      const existingItem = await pool.query(
        `SELECT id, quantity FROM inventory WHERE character_id = $1 AND item_id = $2`,
        [char.id, loot.item_id]
      );

      if (existingItem.rows.length > 0) {
        await pool.query(
          `UPDATE inventory SET quantity = quantity + $1 WHERE id = $2`,
          [loot.quantity, existingItem.rows[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO inventory (character_id, item_id, quantity, equipped, attuned) VALUES ($1, $2, $3, false, false)`,
          [char.id, loot.item_id, loot.quantity]
        );
      }

      // Remove from party loot
      await pool.query(
        `DELETE FROM party_loot WHERE id = $1`,
        [targetLootId]
      );

      // Get item name
      const itemResult = await pool.query(
        `SELECT name FROM items WHERE id = $1`,
        [loot.item_id]
      );

      return NextResponse.json({
        success: true,
        message: `Took ${itemResult.rows[0]?.name || "item"} from party loot`,
        itemName: itemResult.rows[0]?.name,
      });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Dungeon action failed:", error);
    return NextResponse.json(
      { error: "Failed to perform dungeon action" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/game/dungeon — Fight current room enemy
 * Body: { action: "fight", dungeonRunId? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const discordId = verifySessionToken(token);

    if (!discordId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const char = await getCharacter(discordId);
    if (!char) {
      return NextResponse.json(
        { error: "No character found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { action, dungeonRunId } = body;

    if (action !== "fight") {
      return NextResponse.json(
        { error: "Invalid action" },
        { status: 400 }
      );
    }

    // Find party
    const partyResult = await pool.query(
      `SELECT party_id FROM party_members WHERE character_id = $1`,
      [char.id]
    );

    if (partyResult.rows.length === 0) {
      return NextResponse.json(
        { error: "You must be in a party" },
        { status: 400 }
      );
    }

    const partyId = partyResult.rows[0].party_id;

    // Find active dungeon
    const dungeonQuery = dungeonRunId
      ? `SELECT * FROM dungeon_runs WHERE id = $1 AND party_id = $2 AND status = 'active'`
      : `SELECT * FROM dungeon_runs WHERE party_id = $1 AND status = 'active'`;
    const dungeonParams = dungeonRunId ? [dungeonRunId, partyId] : [partyId];

    const dungeonResult = await pool.query(dungeonQuery, dungeonParams);

    if (dungeonResult.rows.length === 0) {
      return NextResponse.json(
        { error: "No active dungeon run" },
        { status: 400 }
      );
    }

    const dungeon = dungeonResult.rows[0];
    const rooms = dungeon.room_data;
    const currentRoom = rooms[dungeon.current_room - 1];

    if (!currentRoom || currentRoom.cleared) {
      return NextResponse.json(
        { error: "No enemy to fight in current room" },
        { status: 400 }
      );
    }

    // Check player is alive
    if (char.current_hp <= 0) {
      return NextResponse.json(
        { error: "You are unconscious! Take a rest first." },
        { status: 400 }
      );
    }

    // Player attacks
    const attackRoll = rollDice("1d20");
    const attackMod = 3; // Base attack modifier
    const prof = Math.ceil(char.level / 4) + 1;
    const total = attackRoll.total + attackMod + prof;
    const isCrit = attackRoll.rolls[0] === 20;
    const isFumble = attackRoll.rolls[0] === 1;
    const hit = isCrit || (!isFumble && total >= currentRoom.enemyAc);

    let damage = 0;

    if (hit) {
      const dmgRoll = rollDice("1d8");
      damage = dmgRoll.total + attackMod;
      if (isCrit) {
        const critRoll = rollDice("1d8");
        damage += critRoll.total;
      }

      currentRoom.enemyHp = Math.max(0, currentRoom.enemyHp - damage);

      // Update room data
      rooms[dungeon.current_room - 1] = currentRoom;
      await pool.query(
        `UPDATE dungeon_runs SET room_data = $1 WHERE id = $2`,
        [JSON.stringify(rooms), dungeon.id]
      );
    }

    // Enemy attacks
    let enemyAttack = null;
    if (hit && currentRoom.enemyHp > 0) {
      const enemyRoll = rollDice("1d20");
      const enemyTotal = enemyRoll.total + 4;
      const enemyHit = enemyTotal >= char.ac;

      if (enemyHit) {
        const enemyDmg = rollDice("1d6");
        const newHp = Math.max(0, char.current_hp - enemyDmg.total);

        await pool.query(
          `UPDATE characters SET current_hp = $1 WHERE id = $2`,
          [newHp, char.id]
        );

        enemyAttack = {
          roll: enemyTotal,
          hit: true,
          damage: enemyDmg.total,
          message: `${currentRoom.enemyName} strikes for **${enemyDmg.total}** damage!`,
        };
      } else {
        enemyAttack = {
          roll: enemyTotal,
          hit: false,
          damage: 0,
          message: `${currentRoom.enemyName} misses!`,
        };
      }
    }

    // Check if room cleared
    let roomCleared = false;
    if (currentRoom.enemyHp <= 0) {
      roomCleared = true;
      currentRoom.cleared = true;
      rooms[dungeon.current_room - 1] = currentRoom;
      await pool.query(
        `UPDATE dungeon_runs SET room_data = $1 WHERE id = $2`,
        [JSON.stringify(rooms), dungeon.id]
      );

      // Generate loot drops
      const lootTables = [
        { itemId: 1, chance: 0.3 },  // Dagger
        { itemId: 2, chance: 0.3 },  // Shortsword
        { itemId: 11, chance: 0.2 }, // Potion of Healing
        { itemId: 12, chance: 0.1 }, // Potion of Greater Healing
      ];

      for (const lootEntry of lootTables) {
        if (Math.random() < lootEntry.chance) {
          const quantity = Math.ceil(Math.random() * 2);
          await pool.query(
            `INSERT INTO party_loot (party_id, item_id, quantity, added_by) VALUES ($1, $2, $3, $4)`,
            [dungeon.party_id, lootEntry.itemId, quantity, char.id]
          );
        }
      }
    }

    return NextResponse.json({
      playerAttack: {
        roll: attackRoll.total + attackMod + prof,
        isCrit,
        isFumble,
        hit,
        damage,
      },
      enemyAttack,
      enemy: {
        name: currentRoom.enemyName,
        hp: currentRoom.enemyHp,
        maxHp: currentRoom.enemyMaxHp,
        ac: currentRoom.enemyAc,
      },
      roomCleared,
      playerHp: char.current_hp,
      playerMaxHp: char.max_hp,
    });
  } catch (error) {
    console.error("Dungeon fight failed:", error);
    return NextResponse.json(
      { error: "Failed to fight dungeon enemy" },
      { status: 500 }
    );
  }
}

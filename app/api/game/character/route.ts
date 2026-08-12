import { NextRequest, NextResponse } from "next/server";
import pool from "lib/db";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "lib/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/game/character — Create a new character
 * Body: { name, classId, raceId, backgroundId, abilityScores?, method }
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

    // Check if character already exists
    const existing = await pool.query(
      "SELECT id FROM characters WHERE user_id = (SELECT id FROM users WHERE discord_id = $1)",
      [discordId]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "Character already exists" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      name,
      classId,
      raceId,
      backgroundId,
      abilityScores,
      method,
    } = body;

    if (!name || !classId || !raceId) {
      return NextResponse.json(
        { error: "Missing required fields: name, classId, raceId" },
        { status: 400 }
      );
    }

    const race = RACES.find((r) => r.id === parseInt(raceId));
    const cls = CLASSES.find((c) => c.id === parseInt(classId));
    const bg = BACKGROUNDS.find(
      (b) => b.id === parseInt(backgroundId)
    );

    if (!race || !cls) {
      return NextResponse.json(
        { error: "Invalid race or class" },
        { status: 400 }
      );
    }

    // Generate ability scores
    const scores = generateAbilityScores(
      method || "roll",
      abilityScores
    );

    // Apply racial bonuses
    const finalScores = {
      str: scores.str + (race.bonuses.str || 0),
      dex: scores.dex + (race.bonuses.dex || 0),
      con: scores.con + (race.bonuses.con || 0),
      int: scores.int + (race.bonuses.int || 0),
      wis: scores.wis + (race.bonuses.wis || 0),
      cha: scores.cha + (race.bonuses.cha || 0),
    };

    const conMod = abilityMod(finalScores.con);
    const dexMod = abilityMod(finalScores.dex);

    // Level 1 HP = hit die + CON modifier
    const hp = cls.hitDie + conMod;
    // Base AC = 10 + DEX modifier (no armor)
    const ac = 10 + dexMod;

    // Insert character
    const charResult = await pool.query(
      `
        INSERT INTO characters
          (user_id, name, class_id, race_id, background_id, level, xp,
           hp, max_hp, current_hp, ac, speed, gold, location, status)
        VALUES
          ((SELECT id FROM users WHERE discord_id = $1), $2, $3, $4, $5,
           1, 0, $6, $6, $6, $7, $8, 50, 'Town Square', 'alive')
        RETURNING id
      `,
      [
        discordId,
        name,
        cls.id,
        race.id,
        bg?.id || null,
        hp,
        ac,
        race.speed,
      ]
    );

    const charId = charResult.rows[0].id;

    // Insert ability scores
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
        finalScores.str,
        finalScores.dex,
        finalScores.con,
        finalScores.int,
        finalScores.wis,
        finalScores.cha,
        abilityMod(finalScores.str),
        abilityMod(finalScores.dex),
        abilityMod(finalScores.con),
        abilityMod(finalScores.int),
        abilityMod(finalScores.wis),
        abilityMod(finalScores.cha),
      ]
    );

    // Give starting weapon
    const starterWeapons: Record<number, string> = {
      1: "Longsword",
      2: "Shortsword",
      3: "Quarterstaff",
      4: "Warhammer",
      5: "Longsword",
      6: "Longsword",
      7: "Greatsword",
      8: "Shortsword",
      9: "Quarterstaff",
      10: "Quarterstaff",
    };

    const weaponName = starterWeapons[cls.id] || "Dagger";
    await pool.query(
      `
        INSERT INTO inventory (character_id, item_id, quantity, equipped)
        SELECT $1, id, 1, true FROM items WHERE name = $2
      `,
      [charId, weaponName]
    );

    // Give healing potion
    await pool.query(
      `
        INSERT INTO inventory (character_id, item_id, quantity, equipped)
        SELECT $1, id, 2, false FROM items WHERE name = 'Potion of Healing'
      `,
      [charId]
    );

    return NextResponse.json({
      character: {
        id: charId,
        name,
        className: cls.name,
        raceName: race.name,
        backgroundName: bg?.name || null,
        level: 1,
        hp,
        maxHp: hp,
        ac,
        speed: race.speed,
        abilityScores: finalScores,
        gold: 50,
        location: "Town Square",
      },
    });
  } catch (error) {
    console.error("Character creation failed:", error);
    return NextResponse.json(
      { error: "Failed to create character" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/game/character — Get current character data
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

    const result = await pool.query(
      `
        SELECT
          c.id, c.name, c.level, c.xp, c.hp, c.max_hp, c.current_hp,
          c.temp_hp, c.ac, c.speed, c.gold, c.alignment, c.location,
          c.status, c.death_save_successes, c.death_save_failures,
          c.backstory, c.created_at,
          cl.id AS class_id, cl.name AS class_name, cl.hit_die, cl.primary_stat,
          r.id AS race_id, r.name AS race_name, r.speed AS race_speed,
          b.name AS background_name,
          a.str, a.dex, a."con", a.int, a.wis, a.cha,
          a.str_save, a.dex_save, a.con_save, a.int_save, a.wis_save, a.cha_save
        FROM characters c
        LEFT JOIN classes cl ON c.class_id = cl.id
        LEFT JOIN races r ON c.race_id = r.id
        LEFT JOIN backgrounds b ON c.background_id = b.id
        LEFT JOIN ability_scores a ON c.id = a.character_id
        WHERE c.user_id = (SELECT id FROM users WHERE discord_id = $1)
        LIMIT 1
      `,
      [discordId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "No character found" },
        { status: 404 }
      );
    }

    const c = result.rows[0];

    return NextResponse.json({
      character: {
        id: c.id,
        name: c.name,
        level: c.level,
        xp: c.xp,
        hp: c.hp,
        maxHp: c.max_hp,
        currentHp: c.current_hp,
        tempHp: c.temp_hp,
        ac: c.ac,
        speed: c.speed || c.race_speed,
        gold: c.gold,
        alignment: c.alignment,
        location: c.location,
        status: c.status,
        deathSaveSuccesses: c.death_save_successes,
        deathSaveFailures: c.death_save_failures,
        backstory: c.backstory,
        createdAt: c.created_at,
        className: c.class_name,
        hitDie: c.hit_die,
        primaryStat: c.primary_stat,
        raceName: c.race_name,
        backgroundName: c.background_name,
        abilityScores: {
          str: c.str,
          dex: c.dex,
          con: c.con,
          int: c.int,
          wis: c.wis,
          cha: c.cha,
        },
        savingThrows: {
          str: c.str_save,
          dex: c.dex_save,
          con: c.con_save,
          int: c.int_save,
          wis: c.wis_save,
          cha: c.cha_save,
        },
      },
    });
  } catch (error) {
    console.error("Get character failed:", error);
    return NextResponse.json(
      { error: "Failed to get character" },
      { status: 500 }
    );
  }
}

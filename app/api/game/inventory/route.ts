import { NextRequest, NextResponse } from "next/server";
import pool from "lib/db";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/game/inventory — Get character inventory
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
      return NextResponse.json(
        { error: "No character found" },
        { status: 404 }
      );
    }

    const char = charResult.rows[0];

    const invResult = await pool.query(
      `
        SELECT i.id, i.quantity, i.equipped, i.attuned,
               it.id AS item_id, it.name, it.type, it.rarity,
               it.damage, it.ac_bonus, it.description, it.price_gp
        FROM inventory i
        JOIN items it ON i.item_id = it.id
        WHERE i.character_id = $1
        ORDER BY it.type, it.name
      `,
      [char.id]
    );

    return NextResponse.json({
      inventory: invResult.rows,
      gold: char.gold || 0,
      characterName: char.name,
    });
  } catch (error) {
    console.error("Get inventory failed:", error);
    return NextResponse.json(
      { error: "Failed to get inventory" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/game/inventory — Equip/unequip item
 * Body: { inventoryId, equipped: boolean }
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

    const body = await request.json();
    const { inventoryId, equipped } = body;

    if (!inventoryId) {
      return NextResponse.json(
        { error: "Missing inventoryId" },
        { status: 400 }
      );
    }

    // Verify ownership
    const charResult = await pool.query(
      `
        SELECT c.id
        FROM characters c
        WHERE c.user_id = (SELECT id FROM users WHERE discord_id = $1)
        LIMIT 1
      `,
      [discordId]
    );

    if (charResult.rows.length === 0) {
      return NextResponse.json(
        { error: "No character found" },
        { status: 404 }
      );
    }

    const charId = charResult.rows[0].id;

    // Check if item belongs to character
    const itemResult = await pool.query(
      `SELECT * FROM inventory WHERE id = $1 AND character_id = $2`,
      [inventoryId, charId]
    );

    if (itemResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Item not found in your inventory" },
        { status: 404 }
      );
    }

    const item = itemResult.rows[0];

    // If equipping armor, unequip other armor
    if (equipped) {
      const itemDetails = await pool.query(
        `SELECT type FROM items WHERE id = $1`,
        [item.item_id]
      );

      if (itemDetails.rows.length > 0) {
        const itemType = itemDetails.rows[0].type;

        if (itemType === "armor") {
          // Unequip other armor (not shields)
          await pool.query(
            `
              UPDATE inventory SET equipped = false
              WHERE character_id = $1
              AND id != $2
              AND item_id IN (SELECT id FROM items WHERE type = 'armor' AND properties->>'type' != 'shield')
            `,
            [charId, inventoryId]
          );
        } else if (itemType === "weapon") {
          // Unequip other weapons
          await pool.query(
            `
              UPDATE inventory SET equipped = false
              WHERE character_id = $1
              AND id != $2
              AND item_id IN (SELECT id FROM items WHERE type = 'weapon')
            `,
            [charId, inventoryId]
          );
        }
      }
    }

    await pool.query(
      `UPDATE inventory SET equipped = $1 WHERE id = $2`,
      [equipped, inventoryId]
    );

    return NextResponse.json({
      success: true,
      equipped,
      inventoryId,
    });
  } catch (error) {
    console.error("Equip item failed:", error);
    return NextResponse.json(
      { error: "Failed to equip item" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/game/inventory — Use item (e.g. potion)
 * Body: { inventoryId }
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

    const body = await request.json();
    const { inventoryId } = body;

    // Get character
    const charResult = await pool.query(
      `
        SELECT c.id, c.current_hp, c.max_hp
        FROM characters c
        WHERE c.user_id = (SELECT id FROM users WHERE discord_id = $1)
        LIMIT 1
      `,
      [discordId]
    );

    if (charResult.rows.length === 0) {
      return NextResponse.json(
        { error: "No character found" },
        { status: 404 }
      );
    }

    const char = charResult.rows[0];

    // Get item details
    const itemResult = await pool.query(
      `
        SELECT i.*, it.name, it.type, it.description
        FROM inventory i
        JOIN items it ON i.item_id = it.id
        WHERE i.id = $1 AND i.character_id = $2
      `,
      [inventoryId, char.id]
    );

    if (itemResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      );
    }

    const item = itemResult.rows[0];

    // Only potions can be "used"
    if (item.type !== "potion") {
      return NextResponse.json(
        { error: "This item cannot be used" },
        { status: 400 }
      );
    }

    // Apply potion effect
    let healAmount = 0;
    let message = "";

    if (item.name === "Potion of Healing") {
      healAmount = Math.floor(Math.random() * 9) + 2; // 2d4+2 average
      message = `You drink the Potion of Healing and recover **${healAmount}** HP!`;
    } else if (item.name === "Potion of Greater Healing") {
      healAmount = Math.floor(Math.random() * 17) + 4; // 4d4+4 average
      message = `You drink the Potion of Greater Healing and recover **${healAmount}** HP!`;
    } else {
      return NextResponse.json(
        { error: "Unknown potion effect" },
        { status: 400 }
      );
    }

    const newHp = Math.min(char.max_hp, char.current_hp + healAmount);

    await pool.query(
      `UPDATE characters SET current_hp = $1 WHERE id = $2`,
      [newHp, char.id]
    );

    // Remove one item from inventory
    if (item.quantity > 1) {
      await pool.query(
        `UPDATE inventory SET quantity = quantity - 1 WHERE id = $1`,
        [inventoryId]
      );
    } else {
      await pool.query(
        `DELETE FROM inventory WHERE id = $1`,
        [inventoryId]
      );
    }

    return NextResponse.json({
      success: true,
      message,
      healed: healAmount,
      currentHp: newHp,
      maxHp: char.max_hp,
    });
  } catch (error) {
    console.error("Use item failed:", error);
    return NextResponse.json(
      { error: "Failed to use item" },
      { status: 500 }
    );
  }
}

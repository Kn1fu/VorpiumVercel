import { NextRequest, NextResponse } from "next/server";
import pool from "lib/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "lib/session";

export const dynamic = "force-dynamic";

async function getCharacter(discordId: string) {
  const result = await pool.query(
    `SELECT c.* FROM characters c WHERE c.user_id = (SELECT id FROM users WHERE discord_id = $1) LIMIT 1`,
    [discordId]
  );
  return result.rows[0] || null;
}

/**
 * GET /api/game/trade — Get pending trades and trade history
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

    // Get pending trades where I'm sender or receiver
    const pendingResult = await pool.query(
      `
        SELECT t.*,
               fc.name AS from_char_name,
               tc.name AS to_char_name
        FROM trades t
        JOIN characters fc ON t.from_char_id = fc.id
        JOIN characters tc ON t.to_char_id = tc.id
        WHERE (t.from_char_id = $1 OR t.to_char_id = $1)
          AND t.status = 'pending'
        ORDER BY t.created_at DESC
      `,
      [char.id]
    );

    // Enrich with item names
    const trades = await Promise.all(
      pendingResult.rows.map(async (trade) => {
        // Get from items names
        const fromItemIds = (trade.from_items || []).map(
          (i: { inventoryId: number }) => i.inventoryId
        );
        const toItemIds = (trade.to_items || []).map(
          (i: { inventoryId: number }) => i.inventoryId
        );

        let fromItems = [];
        let toItems = [];

        if (fromItemIds.length > 0) {
          const result = await pool.query(
            `
              SELECT i.id AS inventory_id, it.name, i.quantity
              FROM inventory i
              JOIN items it ON i.item_id = it.id
              WHERE i.id = ANY($1)
            `,
            [fromItemIds]
          );
          fromItems = result.rows;
        }

        if (toItemIds.length > 0) {
          const result = await pool.query(
            `
              SELECT i.id AS inventory_id, it.name, i.quantity
              FROM inventory i
              JOIN items it ON i.item_id = it.id
              WHERE i.id = ANY($1)
            `,
            [toItemIds]
          );
          toItems = result.rows;
        }

        return {
          ...trade,
          from_items: fromItems,
          to_items: toItems,
        };
      })
    );

    return NextResponse.json({ trades });
  } catch (error) {
    console.error("Get trades failed:", error);
    return NextResponse.json(
      { error: "Failed to get trades" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/game/trade — Send trade request
 * Body: { toCharId, fromItems, toItems, fromGold, toGold }
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
    const {
      toCharId,
      fromItems = [],
      toItems = [],
      fromGold = 0,
      toGold = 0,
    } = body;

    if (!toCharId) {
      return NextResponse.json(
        { error: "toCharId is required" },
        { status: 400 }
      );
    }

    // Can't trade with yourself
    if (toCharId === char.id) {
      return NextResponse.json(
        { error: "Cannot trade with yourself" },
        { status: 400 }
      );
    }

    // Check target character exists
    const targetResult = await pool.query(
      `SELECT id, name FROM characters WHERE id = $1`,
      [toCharId]
    );

    if (targetResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Target character not found" },
        { status: 404 }
      );
    }

    // Validate gold amounts
    if (fromGold < 0 || toGold < 0) {
      return NextResponse.json(
        { error: "Gold amounts cannot be negative" },
        { status: 400 }
      );
    }

    // Check sender has enough gold
    if (fromGold > char.gold) {
      return NextResponse.json(
        { error: "Not enough gold" },
        { status: 400 }
      );
    }

    // Validate from items exist in sender's inventory
    for (const item of fromItems) {
      const invResult = await pool.query(
        `SELECT id, quantity FROM inventory WHERE id = $1 AND character_id = $2`,
        [item.inventoryId, char.id]
      );

      if (invResult.rows.length === 0) {
        return NextResponse.json(
          { error: `Item ${item.inventoryId} not found in your inventory` },
          { status: 400 }
        );
      }

      if (item.quantity > invResult.rows[0].quantity) {
        return NextResponse.json(
          { error: `Not enough quantity for item ${item.inventoryId}` },
          { status: 400 }
        );
      }
    }

    // Validate to items exist in target's inventory
    for (const item of toItems) {
      const invResult = await pool.query(
        `SELECT id, quantity FROM inventory WHERE id = $1 AND character_id = $2`,
        [item.inventoryId, toCharId]
      );

      if (invResult.rows.length === 0) {
        return NextResponse.json(
          { error: `Item ${item.inventoryId} not found in target's inventory` },
          { status: 400 }
        );
      }

      if (item.quantity > invResult.rows[0].quantity) {
        return NextResponse.json(
          { error: `Target doesn't have enough of item ${item.inventoryId}` },
          { status: 400 }
        );
      }
    }

    // Check target has enough gold
    const targetChar = await pool.query(
      `SELECT gold FROM characters WHERE id = $1`,
      [toCharId]
    );

    if (toGold > targetChar.rows[0].gold) {
      return NextResponse.json(
        { error: "Target doesn't have enough gold" },
        { status: 400 }
      );
    }

    // Create trade
    const tradeResult = await pool.query(
      `
        INSERT INTO trades (from_char_id, to_char_id, from_items, to_items, from_gold, to_gold, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        RETURNING *
      `,
      [
        char.id,
        toCharId,
        JSON.stringify(fromItems),
        JSON.stringify(toItems),
        fromGold,
        toGold,
      ]
    );

    return NextResponse.json({
      trade: tradeResult.rows[0],
      message: "Trade request sent",
    });
  } catch (error) {
    console.error("Create trade failed:", error);
    return NextResponse.json(
      { error: "Failed to create trade" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/game/trade — Accept or decline trade
 * Body: { tradeId, action: "accept" | "decline" }
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
    const { tradeId, action } = body;

    if (!tradeId || !action) {
      return NextResponse.json(
        { error: "tradeId and action are required" },
        { status: 400 }
      );
    }

    // Get trade
    const tradeResult = await pool.query(
      `SELECT * FROM trades WHERE id = $1`,
      [tradeId]
    );

    if (tradeResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Trade not found" },
        { status: 404 }
      );
    }

    const trade = tradeResult.rows[0];

    if (trade.status !== "pending") {
      return NextResponse.json(
        { error: "Trade is no longer pending" },
        { status: 400 }
      );
    }

    // Only receiver can accept/decline
    if (trade.to_char_id !== char.id) {
      return NextResponse.json(
        { error: "Only the receiver can accept or decline" },
        { status: 403 }
      );
    }

    // ============================================================
    // DECLINE
    // ============================================================
    if (action === "decline") {
      await pool.query(
        `UPDATE trades SET status = 'declined' WHERE id = $1`,
        [tradeId]
      );

      return NextResponse.json({
        success: true,
        message: "Trade declined",
      });
    }

    // ============================================================
    // ACCEPT
    // ============================================================
    if (action === "accept") {
      // Re-validate items still exist and quantities are sufficient
      for (const item of trade.from_items) {
        const invResult = await pool.query(
          `SELECT quantity FROM inventory WHERE id = $1 AND character_id = $2`,
          [item.inventoryId, trade.from_char_id]
        );

        if (invResult.rows.length === 0 || invResult.rows[0].quantity < item.quantity) {
          return NextResponse.json(
            { error: `Trade can no longer be completed: item ${item.inventoryId} is no longer available` },
            { status: 400 }
          );
        }
      }

      for (const item of trade.to_items) {
        const invResult = await pool.query(
          `SELECT quantity FROM inventory WHERE id = $1 AND character_id = $2`,
          [item.inventoryId, trade.to_char_id]
        );

        if (invResult.rows.length === 0 || invResult.rows[0].quantity < item.quantity) {
          return NextResponse.json(
            { error: `Trade can no longer be completed: item ${item.inventoryId} is no longer available` },
            { status: 400 }
          );
        }
      }

      // Re-validate gold
      const fromChar = await pool.query(
        `SELECT gold FROM characters WHERE id = $1`,
        [trade.from_char_id]
      );
      const toChar = await pool.query(
        `SELECT gold FROM characters WHERE id = $1`,
        [trade.to_char_id]
      );

      if (trade.from_gold > fromChar.rows[0].gold) {
        return NextResponse.json(
          { error: "Sender no longer has enough gold" },
          { status: 400 }
        );
      }

      if (trade.to_gold > toChar.rows[0].gold) {
        return NextResponse.json(
          { error: "Receiver no longer has enough gold" },
          { status: 400 }
        );
      }

      // Transfer items from sender to receiver
      for (const item of trade.from_items) {
        // Reduce sender's inventory
        const senderInv = await pool.query(
          `SELECT quantity FROM inventory WHERE id = $1`,
          [item.inventoryId]
        );

        if (senderInv.rows[0].quantity <= item.quantity) {
          await pool.query(
            `DELETE FROM inventory WHERE id = $1`,
            [item.inventoryId]
          );
        } else {
          await pool.query(
            `UPDATE inventory SET quantity = quantity - $1 WHERE id = $2`,
            [item.quantity, item.inventoryId]
          );
        }

        // Add to receiver's inventory (check if they already have the item)
        const existingItem = await pool.query(
          `SELECT id, quantity FROM inventory WHERE character_id = $1 AND item_id = (SELECT item_id FROM inventory WHERE id = $2)`,
          [trade.to_char_id, item.inventoryId]
        );

        if (existingItem.rows.length > 0) {
          await pool.query(
            `UPDATE inventory SET quantity = quantity + $1 WHERE id = $2`,
            [item.quantity, existingItem.rows[0].id]
          );
        } else {
          const invItem = await pool.query(
            `SELECT item_id, equipped, attuned FROM inventory WHERE id = $1`,
            [item.inventoryId]
          );
          await pool.query(
            `INSERT INTO inventory (character_id, item_id, quantity, equipped, attuned) VALUES ($1, $2, $3, false, false)`,
            [trade.to_char_id, invItem.rows[0].item_id, item.quantity]
          );
        }
      }

      // Transfer items from receiver to sender
      for (const item of trade.to_items) {
        const receiverInv = await pool.query(
          `SELECT quantity FROM inventory WHERE id = $1`,
          [item.inventoryId]
        );

        if (receiverInv.rows[0].quantity <= item.quantity) {
          await pool.query(
            `DELETE FROM inventory WHERE id = $1`,
            [item.inventoryId]
          );
        } else {
          await pool.query(
            `UPDATE inventory SET quantity = quantity - $1 WHERE id = $2`,
            [item.quantity, item.inventoryId]
          );
        }

        const existingItem = await pool.query(
          `SELECT id, quantity FROM inventory WHERE character_id = $1 AND item_id = (SELECT item_id FROM inventory WHERE id = $2)`,
          [trade.from_char_id, item.inventoryId]
        );

        if (existingItem.rows.length > 0) {
          await pool.query(
            `UPDATE inventory SET quantity = quantity + $1 WHERE id = $2`,
            [item.quantity, existingItem.rows[0].id]
          );
        } else {
          const invItem = await pool.query(
            `SELECT item_id FROM inventory WHERE id = $1`,
            [item.inventoryId]
          );
          await pool.query(
            `INSERT INTO inventory (character_id, item_id, quantity, equipped, attuned) VALUES ($1, $2, $3, false, false)`,
            [trade.from_char_id, invItem.rows[0].item_id, item.quantity]
          );
        }
      }

      // Transfer gold
      if (trade.from_gold > 0) {
        await pool.query(
          `UPDATE characters SET gold = gold - $1 WHERE id = $2`,
          [trade.from_gold, trade.from_char_id]
        );
        await pool.query(
          `UPDATE characters SET gold = gold + $1 WHERE id = $2`,
          [trade.from_gold, trade.to_char_id]
        );
      }

      if (trade.to_gold > 0) {
        await pool.query(
          `UPDATE characters SET gold = gold - $1 WHERE id = $2`,
          [trade.to_gold, trade.to_char_id]
        );
        await pool.query(
          `UPDATE characters SET gold = gold + $1 WHERE id = $2`,
          [trade.to_gold, trade.from_char_id]
        );
      }

      // Mark trade as completed
      await pool.query(
        `UPDATE trades SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [tradeId]
      );

      return NextResponse.json({
        success: true,
        message: "Trade completed",
        trade: {
          ...trade,
          status: "completed",
        },
      });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Trade action failed:", error);
    return NextResponse.json(
      { error: "Failed to process trade" },
      { status: 500 }
    );
  }
}

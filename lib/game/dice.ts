export interface DiceResult {
  notation: string;
  rolls: number[];
  modifier: number;
  total: number;
  breakdown: string;
}

/**
 * Roll dice using standard D&D notation: NdS+M
 * e.g. "2d6+3", "1d20", "4d6kh3" (drop lowest)
 */
export function rollDice(notation: string): DiceResult {
  const cleaned = notation.replace(/\s/g, "").toLowerCase();

  // Parse: (count)d(sides)(kh/drop)(+/- modifier)
  const match = cleaned.match(
    /^(\d+)d(\d+)(?:kh(\d+))?\s*([+-]\s*\d+)?$/
  );

  if (!match) {
    // Try plain number (e.g. "5" or "+3")
    const plain = parseInt(cleaned, 10);
    if (!isNaN(plain)) {
      return {
        notation,
        rolls: [plain],
        modifier: 0,
        total: plain,
        breakdown: `${plain}`,
      };
    }
    throw new Error(`Invalid dice notation: ${notation}`);
  }

  const count = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const keepHighest = match[3] ? parseInt(match[3], 10) : null;
  const modifier = match[4]
    ? parseInt(match[4].replace(/\s/g, ""), 10)
    : 0;

  if (count > 100 || sides > 1000) {
    throw new Error("Dice count or sides too large");
  }

  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }

  let keptRolls = [...rolls];
  let droppedRolls: number[] = [];

  if (keepHighest !== null && keepHighest < count) {
    const sorted = [...rolls]
      .map((r, i) => ({ r, i }))
      .sort((a, b) => b.r - a.r);
    const keepIndices = new Set(
      sorted.slice(0, keepHighest).map((s) => s.i)
    );
    keptRolls = rolls.filter((_, i) => keepIndices.has(i));
    droppedRolls = rolls.filter((_, i) => !keepIndices.has(i));
  }

  const rollSum = keptRolls.reduce((a, b) => a + b, 0);
  const total = rollSum + modifier;

  const breakdownParts: string[] = [];
  if (rolls.length > 1) {
    breakdownParts.push(`[${rolls.join(", ")}]`);
  }
  if (droppedRolls.length > 0) {
    breakdownParts.push(`(dropped [${droppedRolls.join(", ")}])`);
  }
  if (modifier !== 0) {
    breakdownParts.push(`${modifier >= 0 ? "+" : ""}${modifier}`);
  }

  return {
    notation,
    rolls,
    modifier,
    total: Math.max(0, total),
    breakdown: `**${total}** ${breakdownParts.join(" ")}`.trim(),
  };
}

/**
 * Roll NdS and keep the highest N results (4d6 drop lowest)
 */
export function roll4d6DropLowest(): DiceResult {
  const rolls: number[] = [];
  for (let i = 0; i < 4; i++) {
    rolls.push(Math.floor(Math.random() * 6) + 1);
  }
  const sorted = [...rolls].sort((a, b) => b - a);
  const kept = sorted.slice(0, 3);
  const total = kept.reduce((a, b) => a + b, 0);

  return {
    notation: "4d6kh3",
    rolls,
    modifier: 0,
    total,
    breakdown: `**${total}** [${rolls.join(", ")}] dropped lowest ${sorted[3]}`,
  };
}

/**
 * Roll standard ability scores (6 attributes)
 */
export function rollAbilityScores(): number[] {
  return Array.from({ length: 6 }, () => {
    const result = roll4d6DropLowest();
    return result.total;
  });
}

/**
 * Roll 3d6 (standard array alternative)
 */
export function roll3d6(): DiceResult {
  const rolls: number[] = [];
  for (let i = 0; i < 3; i++) {
    rolls.push(Math.floor(Math.random() * 6) + 1);
  }
  const total = rolls.reduce((a, b) => a + b, 0);

  return {
    notation: "3d6",
    rolls,
    modifier: 0,
    total,
    breakdown: `**${total}** [${rolls.join(", ")}]`,
  };
}

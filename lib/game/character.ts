import { Ability, ABILITIES } from "./abilities";
import { rollAbilityScores, abilityMod } from "./combat";
import { ClassData, RaceData, BACKGROUNDS } from "./classes";

export interface CharacterStats {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface CreateCharacterInput {
  name: string;
  className: string;
  raceName: string;
  backgroundName?: string;
  abilityScores?: Partial<CharacterStats>; // if user wants to assign
  method: "roll" | "pointbuy" | "standard";
}

export interface CreatedCharacter {
  name: string;
  classId: number;
  className: string;
  raceId: number;
  raceName: string;
  backgroundId: number | null;
  level: number;
  hp: number;
  maxHp: number;
  ac: number;
  speed: number;
  abilityScores: CharacterStats;
  abilityModifiers: Record<string, number>;
}

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

const POINT_BUY_COSTS: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

/**
 * Generate ability scores using the chosen method
 */
export function generateAbilityScores(
  method: "roll" | "standard" | "pointbuy",
  assign?: Partial<CharacterStats>
): CharacterStats {
  let scores: number[];

  switch (method) {
    case "roll": {
      const rolled = rollAbilityScores();
      scores = rolled;
      break;
    }
    case "standard":
      scores = [...STANDARD_ARRAY];
      break;
    case "pointbuy":
      // For point buy, use default 10s and let the user assign
      // (validation of 27-point budget happens elsewhere)
      scores = [10, 10, 10, 10, 10, 10];
      break;
    default:
      scores = rollAbilityScores();
  }

  // If user provided explicit assignments, use those
  if (assign) {
    const result: CharacterStats = {
      str: assign.str ?? scores[0],
      dex: assign.dex ?? scores[1],
      con: assign.con ?? scores[2],
      int: assign.int ?? scores[3],
      wis: assign.wis ?? scores[4],
      cha: assign.cha ?? scores[5],
    };
    return result;
  }

  return {
    str: scores[0],
    dex: scores[1],
    con: scores[2],
    int: scores[3],
    wis: scores[4],
    cha: scores[5],
  };
}

/**
 * Calculate all character stats from inputs
 */
export function calculateCharacter(
  input: CreateCharacterInput,
  _classData: ClassData,
  raceData: RaceData
): CreatedCharacter {
  const baseScores = generateAbilityScores(
    input.method,
    input.abilityScores
  );

  // Apply racial bonuses
  const finalScores: CharacterStats = {
    str: baseScores.str + (raceData.bonuses.str || 0),
    dex: baseScores.dex + (raceData.bonuses.dex || 0),
    con: baseScores.con + (raceData.bonuses.con || 0),
    int: baseScores.int + (raceData.bonuses.int || 0),
    wis: baseScores.wis + (raceData.bonuses.wis || 0),
    cha: baseScores.cha + (raceData.bonuses.cha || 0),
  };

  // Clamp scores to 3-20
  for (const key of ABILITIES) {
    finalScores[key] = Math.max(3, Math.min(20, finalScores[key]));
  }

  const conMod = abilityMod(finalScores.con);

  // Level 1 HP = hit die max + CON modifier
  const hp = _classData.hitDie + conMod;

  // Base AC = 10 + DEX modifier (no armor)
  const ac = 10 + abilityMod(finalScores.dex);

  // Background
  const bg = BACKGROUNDS.find(
    (b) =>
      b.name.toLowerCase() ===
      (input.backgroundName?.toLowerCase() || "")
  );

  const abilityModifiers: Record<string, number> = {};
  for (const key of ABILITIES) {
    abilityModifiers[key] = abilityMod(finalScores[key]);
  }

  return {
    name: input.name,
    classId: _classData.id,
    className: _classData.name,
    raceId: raceData.id,
    raceName: raceData.name,
    backgroundId: bg?.id ?? null,
    level: 1,
    hp,
    maxHp: hp,
    ac,
    speed: raceData.speed,
    abilityScores: finalScores,
    abilityModifiers,
  };
}

/**
 * Point buy validation: returns total cost and whether valid
 */
export function validatePointBuy(scores: CharacterStats): {
  cost: number;
  valid: boolean;
  remaining: number;
} {
  let cost = 0;
  for (const key of ABILITIES) {
    const score = scores[key];
    if (score < 8 || score > 15) {
      return { cost, valid: false, remaining: 27 - cost };
    }
    cost += POINT_BUY_COSTS[score] || 0;
  }
  return { cost, valid: cost <= 27, remaining: 27 - cost };
}

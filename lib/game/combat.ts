import { rollDice, DiceResult } from "./dice";

export interface Combatant {
  characterId: number;
  name: string;
  hp: number;
  maxHp: number;
  tempHp: number;
  ac: number;
  initiative: number;
  isPlayer: boolean;
  conditions: string[];
  deathSaveSuccesses: number;
  deathSaveFailures: number;
}

export interface AttackResult {
  attacker: string;
  target: string;
  attackRoll: DiceResult;
  damageRoll?: DiceResult;
  hit: boolean;
  critical: boolean;
  message: string;
}

/**
 * Calculate ability modifier from score
 */
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Calculate proficiency bonus by level
 */
export function profBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

/**
 * Roll initiative (d20 + DEX modifier)
 */
export function rollInitiative(dexScore: number): number {
  const result = rollDice("1d20");
  return result.total + abilityMod(dexScore);
}

/**
 * Make an attack roll: d20 + proficiency (if proficient) + ability modifier
 */
export function makeAttackRoll(
  proficiencyBonus: number,
  isProficient: boolean,
  abilityModifier: number,
  advantage: boolean = false,
  disadvantage: boolean = false
): DiceResult {
  let notation = "1d20";
  let modifier = abilityModifier;
  if (isProficient) {
    modifier += proficiencyBonus;
  }

  // Advantage/disadvantage: roll 2d20 and pick higher/lower
  if (advantage && !disadvantage) {
    notation = "2d20kh1";
  } else if (disadvantage && !advantage) {
    notation = "2d20kl1";
  }

  const result = rollDice(notation);
  // Apply modifier to the raw roll sum
  result.modifier = modifier;
  result.total = result.rolls.reduce((a, b) => a + b, 0) + modifier;
  if (result.total < 0) result.total = 0;

  return result;
}

/**
 * Roll damage for an attack
 */
export function rollDamage(
  diceNotation: string,
  abilityModifier: number,
  critical: boolean
): DiceResult {
  let result = rollDice(diceNotation);

  if (critical) {
    // On crit, double the number of dice rolled
    const match = diceNotation.match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if (match) {
      const originalCount = parseInt(match[1], 10);
      const sides = match[2];
      const critResult = rollDice(`${originalCount * 2}d${sides}${match[3] || ""}`);
      result = critResult;
    }
  }

  result.modifier = abilityModifier;
  result.total += abilityModifier;
  if (result.total < 0) result.total = 0;

  return result;
}

/**
 * Process a full attack action
 */
export function resolveAttack(
  attacker: Combatant,
  target: Combatant,
  attackModifier: number,
  damageDice: string,
  damageAbilityMod: number,
  isProficient: boolean = true
): AttackResult {
  const attackRoll = makeAttackRoll(0, isProficient, attackModifier);
  const isCrit = attackRoll.rolls[0] === 20;
  const isFumble = attackRoll.rolls[0] === 1;

  // Natural 1 always misses, natural 20 always hits (crit)
  const hit = isCrit || (!isFumble && attackRoll.total >= target.ac);

  let damageRoll: DiceResult | undefined;
  let finalDamage = 0;

  if (hit) {
    damageRoll = rollDamage(damageDice, damageAbilityMod, isCrit);
    finalDamage = damageRoll.total;
  }

  let message: string;
  if (isFumble) {
    message = `${attacker.name} attacks ${target.name} and **misses** (natural 1)!`;
  } else if (isCrit && hit) {
    message =
      `${attacker.name} attacks ${target.name} — **CRITICAL HIT!** ` +
      `Attack: ${attackRoll.breakdown} vs AC ${target.ac}. ` +
      `Damage: ${damageRoll!.breakdown} = **${finalDamage}**`;
  } else if (hit) {
    message =
      `${attacker.name} attacks ${target.name} — **Hit!** ` +
      `Attack: ${attackRoll.breakdown} vs AC ${target.ac}. ` +
      `Damage: ${damageRoll!.breakdown} = **${finalDamage}**`;
  } else {
    message =
      `${attacker.name} attacks ${target.name} — **Miss!** ` +
      `Attack: ${attackRoll.breakdown} vs AC ${target.ac}.`;
  }

  return {
    attacker: attacker.name,
    target: target.name,
    attackRoll,
    damageRoll,
    hit,
    critical: isCrit,
    message,
  };
}

/**
 * Apply damage to a combatant, handling death saves
 */
export function applyDamage(
  combatant: Combatant,
  damage: number
): { combatant: Combatant; message: string } {
  const updated = { ...combatant };
  let message = "";

  if (damage <= 0) return { combatant: updated, message: "No damage dealt." };

  // If already at 0 HP, apply death save failure
  if (updated.hp <= 0) {
    updated.deathSaveFailures += 1;
    if (updated.deathSaveFailures >= 3) {
      updated.conditions = [...updated.conditions, "dead"];
      message = `${updated.name} takes a death save failure (${updated.deathSaveFailures}/3). **${updated.name} is dead!**`;
    } else {
      message = `${updated.name} takes a death save failure (${updated.deathSaveFailures}/3).`;
    }
    return { combatant: updated, message };
  }

  // Apply damage
  if (updated.tempHp > 0) {
    const absorbed = Math.min(updated.tempHp, damage);
    updated.tempHp -= absorbed;
    const remaining = damage - absorbed;
    updated.hp = Math.max(0, updated.hp - remaining);
    message = `${updated.name} takes **${damage}** damage (${absorbed} absorbed by temp HP, ${remaining} to HP). HP: ${updated.hp}/${updated.maxHp}`;
  } else {
    updated.hp = Math.max(0, updated.hp - damage);
    message = `${updated.name} takes **${damage}** damage. HP: ${updated.hp}/${updated.maxHp}`;
  }

  if (updated.hp <= 0) {
    updated.conditions = [...updated.conditions, "unconscious"];
    message += ` — **${updated.name} falls unconscious!**`;
  }

  return { combatant: updated, message };
}

/**
 * Healing: restore HP (cannot exceed max)
 */
export function applyHealing(
  combatant: Combatant,
  amount: number
): { combatant: Combatant; message: string } {
  const updated = { ...combatant };
  let message = "";

  if (amount <= 0) return { combatant: updated, message: "No healing applied." };

  const wasDown = updated.hp <= 0;
  updated.hp = Math.min(updated.maxHp, updated.hp + amount);

  if (wasDown && updated.hp > 0) {
    updated.conditions = updated.conditions.filter(
      (c) => c !== "unconscious" && c !== "dead"
    );
    updated.deathSaveSuccesses = 0;
    updated.deathSaveFailures = 0;
    message = `${updated.name} is healed for **${amount}** HP and regains consciousness! HP: ${updated.hp}/${updated.maxHp}`;
  } else {
    message = `${updated.name} heals for **${amount}** HP. HP: ${updated.hp}/${updated.maxHp}`;
  }

  return { combatant: updated, message };
}

/**
 * XP thresholds for each level (cumulative)
 */
export const XP_THRESHOLDS: number[] = [
  0,       // level 1
  300,     // level 2
  900,     // level 3
  2700,    // level 4
  6500,    // level 5
  14000,   // level 6
  23000,   // level 7
  34000,   // level 8
  48000,   // level 9
  64000,   // level 10
  85000,   // level 11
  100000,  // level 12
  120000,  // level 13
  140000,  // level 14
  165000,  // level 15
  195000,  // level 16
  225000,  // level 17
  265000,  // level 18
  305000,  // level 19
  355000,  // level 20
];

/**
 * Check if a character can level up
 */
export function canLevelUp(
  currentLevel: number,
  currentXp: number
): { canLevel: boolean; xpNeeded: number; newLevel: number } {
  if (currentLevel >= 20) {
    return { canLevel: false, xpNeeded: 0, newLevel: currentLevel };
  }

  const xpNeeded = XP_THRESHOLDS[currentLevel] || XP_THRESHOLDS[XP_THRESHOLDS.length - 1];

  if (currentXp >= xpNeeded) {
    return {
      canLevel: true,
      xpNeeded,
      newLevel: currentLevel + 1,
    };
  }

  return {
    canLevel: false,
    xpNeeded: xpNeeded - currentXp,
    newLevel: currentLevel,
  };
}

/**
 * Calculate hit points gained on level up
 * Average of hit die + CON modifier
 */
export function calculateLevelUpHp(
  hitDie: number,
  conModifier: number,
  isMaxLevel: boolean
): number {
  if (isMaxLevel) return hitDie + conModifier;
  const avg = Math.ceil(hitDie / 2) + 1;
  return avg + conModifier;
}

/**
 * Format a combatant's status for display
 */
export function formatCombatant(c: Combatant): string {
  const hpBar = formatHpBar(c.hp, c.maxHp);
  const condStr =
    c.conditions.length > 0 ? ` [${c.conditions.join(", ")}]` : "";
  return `${c.name} — HP: ${hpBar} (${c.hp}/${c.maxHp}) | AC: ${c.ac}${condStr}`;
}

function formatHpBar(current: number, max: number): string {
  const length = 10;
  const filled = Math.round((current / max) * length);
  const empty = length - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

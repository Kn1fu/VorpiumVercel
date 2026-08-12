export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";

export const ABILITIES: Ability[] = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
];

export const SKILLS: Record<string, Ability> = {
  Athletics: "str",
  Acrobatics: "dex",
  SleightOfHand: "dex",
  Stealth: "dex",
  Arcana: "int",
  History: "int",
  Investigation: "int",
  Nature: "int",
  Religion: "int",
  AnimalHandling: "wis",
  Insight: "wis",
  Medicine: "wis",
  Perception: "wis",
  Survival: "wis",
  Deception: "cha",
  Intimidation: "cha",
  Performance: "cha",
  Persuasion: "cha",
};

export const SAVING_THROWS: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

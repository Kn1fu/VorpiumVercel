export interface ClassData {
  id: number;
  name: string;
  hitDie: number;
  primaryStat: string;
  description: string;
  savingThrows: string[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  hitDiceCount: (level: number) => number;
}

export interface RaceData {
  id: number;
  name: string;
  speed: number;
  bonuses: Record<string, number>;
  description: string;
}

export const CLASSES: ClassData[] = [
  {
    id: 1,
    name: "Fighter",
    hitDie: 10,
    primaryStat: "STR",
    description:
      "A master of martial combat, skilled with a variety of weapons and armor.",
    savingThrows: ["str", "con"],
    armorProficiencies: ["All armor", "Shields"],
    weaponProficiencies: ["Simple weapons", "Martial weapons"],
    hitDiceCount: (level) => level,
  },
  {
    id: 2,
    name: "Rogue",
    hitDie: 8,
    primaryStat: "DEX",
    description:
      "A scoundrel who uses stealth and trickery to overcome obstacles.",
    savingThrows: ["dex", "int"],
    armorProficiencies: ["Light armor"],
    weaponProficiencies: [
      "Simple weapons",
      "Hand crossbows",
      "Longswords",
      "Rapiers",
      "Shortswords",
    ],
    hitDiceCount: (level) => level,
  },
  {
    id: 3,
    name: "Wizard",
    hitDie: 6,
    primaryStat: "INT",
    description:
      "A scholarly magic-user capable of manipulating the structures of reality.",
    savingThrows: ["int", "wis"],
    armorProficiencies: [],
    weaponProficiencies: ["Daggers", "Darts", "Slings", "Quarterstaffs", "Light crossbows"],
    hitDiceCount: (level) => level,
  },
  {
    id: 4,
    name: "Cleric",
    hitDie: 8,
    primaryStat: "WIS",
    description:
      "A priestly champion who wields divine magic in service of a higher power.",
    savingThrows: ["wis", "cha"],
    armorProficiencies: ["Light armor", "Medium armor", "Shields"],
    weaponProficiencies: ["Simple weapons"],
    hitDiceCount: (level) => level,
  },
  {
    id: 5,
    name: "Ranger",
    hitDie: 10,
    primaryStat: "DEX",
    description:
      "A warrior of the wilds, skilled in tracking and fighting nature's foes.",
    savingThrows: ["str", "dex"],
    armorProficiencies: ["Light armor", "Medium armor", "Shields"],
    weaponProficiencies: ["Simple weapons", "Martial weapons"],
    hitDiceCount: (level) => level,
  },
  {
    id: 6,
    name: "Paladin",
    hitDie: 10,
    primaryStat: "CHA",
    description:
      "A holy warrior bound to a sacred oath, combining martial prowess with divine magic.",
    savingThrows: ["wis", "cha"],
    armorProficiencies: ["All armor", "Shields"],
    weaponProficiencies: ["Simple weapons", "Martial weapons"],
    hitDiceCount: (level) => level,
  },
  {
    id: 7,
    name: "Barbarian",
    hitDie: 12,
    primaryStat: "STR",
    description:
      "A fierce warrior who can enter a battle rage, shrugging off pain.",
    savingThrows: ["str", "con"],
    armorProficiencies: ["Light armor", "Medium armor", "Shields"],
    weaponProficiencies: ["Simple weapons", "Martial weapons"],
    hitDiceCount: (level) => level,
  },
  {
    id: 8,
    name: "Bard",
    hitDie: 8,
    primaryStat: "CHA",
    description:
      "An inspiring magician whose power echoes the music of creation.",
    savingThrows: ["dex", "cha"],
    armorProficiencies: ["Light armor"],
    weaponProficiencies: [
      "Simple weapons",
      "Hand crossbows",
      "Longswords",
      "Rapiers",
      "Shortswords",
    ],
    hitDiceCount: (level) => level,
  },
  {
    id: 9,
    name: "Druid",
    hitDie: 8,
    primaryStat: "WIS",
    description:
      "A priest of the Old Faith, wielding the powers of nature and shape-shifting.",
    savingThrows: ["int", "wis"],
    armorProficiencies: [
      "Light armor",
      "Medium armor",
      "Shields",
    ],
    weaponProficiencies: [
      "Clubs",
      "Daggers",
      "Darts",
      "Javelins",
      "Maces",
      "Quarterstaffs",
      "Scimitars",
      "Sickles",
      "Slings",
      "Spears",
    ],
    hitDiceCount: (level) => level,
  },
  {
    id: 10,
    name: "Monk",
    hitDie: 8,
    primaryStat: "DEX",
    description:
      "A master of martial arts, harnessing the power of the body and the universe.",
    savingThrows: ["str", "dex"],
    armorProficiencies: [],
    weaponProficiencies: [
      "Simple weapons",
      "Shortswords",
    ],
    hitDiceCount: (level) => level,
  },
];

export const RACES: RaceData[] = [
  {
    id: 1,
    name: "Human",
    speed: 30,
    bonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    description: "The most adaptable and ambitious of all races.",
  },
  {
    id: 2,
    name: "Elf",
    speed: 30,
    bonuses: { dex: 2, wis: 1 },
    description: "Graceful and long-lived, elves are at home in nature.",
  },
  {
    id: 3,
    name: "Dwarf",
    speed: 25,
    bonuses: { str: 2, con: 2 },
    description: "Stout and hardy, dwarves are known for their craftsmanship.",
  },
  {
    id: 4,
    name: "Halfling",
    speed: 25,
    bonuses: { dex: 2, con: 1 },
    description: "Small but resourceful, halflings are brave beyond their size.",
  },
  {
    id: 5,
    name: "Dragonborn",
    speed: 30,
    bonuses: { str: 2, cha: 1 },
    description: "Dragonborn carry the blood of dragons, wielding breath weapons.",
  },
  {
    id: 6,
    name: "Tiefling",
    speed: 30,
    bonuses: { int: 1, cha: 2 },
    description:
      "Tieflings are descendants of infernal beings, marked by their heritage.",
  },
  {
    id: 7,
    name: "Half-Elf",
    speed: 30,
    bonuses: { int: 1, wis: 1, cha: 2 },
    description: "Half-elves combine human curiosity with elven grace.",
  },
  {
    id: 8,
    name: "Half-Orc",
    speed: 30,
    bonuses: { str: 2, con: 1 },
    description: "Half-orcs blend human versatility with orcish strength.",
  },
];

export const BACKGROUNDS = [
  { id: 1, name: "Acolyte", skills: ["Insight", "Religion"] },
  { id: 2, name: "Criminal", skills: ["Deception", "Stealth"] },
  { id: 3, name: "Folk Hero", skills: ["Animal Handling", "Survival"] },
  { id: 4, name: "Noble", skills: ["History", "Persuasion"] },
  { id: 5, name: "Sage", skills: ["Arcana", "History"] },
  { id: 6, name: "Soldier", skills: ["Athletics", "Intimidation"] },
  { id: 7, name: "Charlatan", skills: ["Deception", "Sleight of Hand"] },
  { id: 8, name: "Entertainer", skills: ["Acrobatics", "Performance"] },
  { id: 9, name: "Guild Artisan", skills: ["Insight", "Persuasion"] },
  { id: 10, name: "Hermit", skills: ["Medicine", "Religion"] },
  { id: 11, name: "Outlander", skills: ["Athletics", "Survival"] },
  { id: 12, name: "Sailor", skills: ["Athletics", "Perception"] },
  { id: 13, name: "Urchin", skills: ["Sleight of Hand", "Stealth"] },
];

export function getClassByName(name: string): ClassData | undefined {
  return CLASSES.find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );
}

export function getRaceByName(name: string): RaceData | undefined {
  return RACES.find(
    (r) => r.name.toLowerCase() === name.toLowerCase()
  );
}

export function getClassById(id: number): ClassData | undefined {
  return CLASSES.find((c) => c.id === id);
}

export function getRaceById(id: number): RaceData | undefined {
  return RACES.find((r) => r.id === id);
}

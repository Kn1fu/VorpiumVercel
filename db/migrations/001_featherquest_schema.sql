-- Feather Quest: D&D 5e Schema
-- Run this migration to set up all game tables.

-- ============================================================
-- CLASSES
-- ============================================================
CREATE TABLE IF NOT EXISTS classes (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  hit_die       INT NOT NULL,            -- d6, d8, d10, d12
  primary_stat  TEXT NOT NULL,           -- e.g. 'STR', 'DEX', 'INT'
  description   TEXT
);

INSERT INTO classes (name, hit_die, primary_stat, description) VALUES
  ('Fighter',    10, 'STR', 'A master of martial combat, skilled with a variety of weapons and armor.'),
  ('Rogue',      8,  'DEX', 'A scoundrel who uses stealth and trickery to overcome obstacles.'),
  ('Wizard',     6,  'INT', 'A scholarly magic-user capable of manipulating the structures of reality.'),
  ('Cleric',     8,  'WIS', 'A priestly champion who wields divine magic in service of a higher power.'),
  ('Ranger',     10, 'DEX', 'A warrior of the wilds, skilled in tracking and fighting nature''s foes.'),
  ('Paladin',    10, 'CHA', 'A holy warrior bound to a sacred oath, combining martial prowess with divine magic.'),
  ('Barbarian',  12, 'STR', 'A fierce warrior who can enter a battle rage, shrugging off pain.'),
  ('Bard',       8,  'CHA', 'An inspiring magician whose power echoes the music of creation.'),
  ('Druid',      8,  'WIS', 'A priest of the Old Faith, wielding the powers of nature and shape-shifting.'),
  ('Monk',       8,  'DEX', 'A master of martial arts, harnessing the power of the body and the universe.');

-- ============================================================
-- RACES
-- ============================================================
CREATE TABLE IF NOT EXISTS races (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  speed           INT NOT NULL DEFAULT 30,
  str_bonus       INT NOT NULL DEFAULT 0,
  dex_bonus       INT NOT NULL DEFAULT 0,
  con_bonus       INT NOT NULL DEFAULT 0,
  int_bonus       INT NOT NULL DEFAULT 0,
  wis_bonus       INT NOT NULL DEFAULT 0,
  cha_bonus       INT NOT NULL DEFAULT 0,
  description     TEXT
);

INSERT INTO races (name, speed, str_bonus, dex_bonus, con_bonus, int_bonus, wis_bonus, cha_bonus, description) VALUES
  ('Human',      30, 1, 1, 1, 1, 1, 1, 'The most adaptable and ambitious of all races.'),
  ('Elf',        30, 0, 2, 0, 0, 1, 0, 'Graceful and long-lived, elves are at home in nature.'),
  ('Dwarf',      25, 2, 0, 2, 0, 0, 0, 'Stout and hardy, dwarves are known for their craftsmanship.'),
  ('Halfling',   25, 0, 2, 1, 0, 0, 0, 'Small but resourceful, halflings are brave beyond their size.'),
  ('Dragonborn', 30, 2, 0, 0, 0, 0, 1, 'Dragonborn carry the blood of dragons, wielding breath weapons.'),
  ('Tiefling',   30, 0, 0, 0, 1, 0, 2, 'Tieflings are descendants of infernal beings, marked by their heritage.'),
  ('Half-Elf',   30, 0, 0, 0, 1, 1, 2, 'Half-elves combine human curiosity with elven grace.'),
  ('Half-Orc',   30, 2, 0, 1, 0, 0, 0, 'Half-orcs blend human versatility with orcish strength.');

-- ============================================================
-- BACKGROUNDS
-- ============================================================
CREATE TABLE IF NOT EXISTS backgrounds (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  skill_prof  TEXT[],           -- proficiency skills
  description TEXT
);

INSERT INTO backgrounds (name, skill_prof, description) VALUES
  ('Acolyte',        ARRAY['Insight','Religion'],         'You have spent your life in service to a temple.'),
  ('Criminal',       ARRAY['Deception','Stealth'],        'You are an experienced criminal with contacts in the underworld.'),
  ('Folk Hero',      ARRAY['Animal Handling','Survival'], 'You come from a humble social rank but are destined for more.'),
  ('Noble',          ARRAY['History','Persuasion'],       'You understand wealth, power, and privilege.'),
  ('Sage',           ARRAY['Arcana','History'],           'You spent years learning the lore of the multiverse.'),
  ('Soldier',        ARRAY['Athletics','Intimidation'],   'War has been your life for as long as you care to remember.'),
  ('Charlatan',      ARRAY['Deception','Sleight of Hand'],'You have always had a way with people.'),
  ('Entertainer',    ARRAY['Acrobatics','Performance'],    'You thrive in front of an audience.'),
  ('Guild Artisan',  ARRAY['Insight','Persuasion'],       'You are a member of an artisan guild.'),
  ('Hermit',         ARRAY['Medicine','Religion'],         'You lived in seclusion for a formative part of your life.'),
  ('Outlander',      ARRAY['Athletics','Survival'],       'You grew up in the wilds, far from civilization.'),
  ('Sailor',         ARRAY['Athletics','Perception'],     'You sailed on a seagoing vessel for years.'),
  ('Urchin',         ARRAY['Sleight of Hand','Stealth'],  'You grew up on the streets alone, orphaned, and poor.');

-- ============================================================
-- SPELLS
-- ============================================================
CREATE TABLE IF NOT EXISTS spells (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  level         INT NOT NULL DEFAULT 0,  -- 0 = cantrip
  school        TEXT NOT NULL,            -- Evocation, Necromancy, etc.
  casting_time  TEXT NOT NULL DEFAULT '1 action',
  range         TEXT NOT NULL DEFAULT 'Self',
  components    TEXT,                     -- V, S, M
  duration      TEXT NOT NULL DEFAULT 'Instantaneous',
  description   TEXT,
  damage        TEXT,                     -- e.g. '2d10 fire' or '8d6 radiant'
  save_type     TEXT,                     -- DEX, WIS, etc. for saving throws
  spell_level_class TEXT                  -- which class list it belongs to
);

-- Cantrips
INSERT INTO spells (name, level, school, damage, description) VALUES
  ('Fire Bolt',      0, 'Evocation',     '1d10 fire',    'You hurl a mote of fire at a creature or object within range.'),
  ('Light',          0, 'Evocation',     NULL,            'You touch an object and it sheds bright light.'),
  ('Mending',        0, 'Transmutation', NULL,            'This spell repairs a single break or tear in an object.'),
  ('Sacred Flame',   0, 'Evocation',     '1d8 radiant',  'A flame-like radiance descends on a target.'),
  ('Eldritch Blast', 0, 'Evocation',     '1d10 force',   'A beam of crackling energy streaks toward a creature.');

-- Level 1
INSERT INTO spells (name, level, school, damage, description, save_type) VALUES
  ('Magic Missile',    1, 'Evocation',     '1d4+1 force',  'You create three glowing darts of magical force.', NULL),
  ('Shield',           1, 'Abjuration',    NULL,            'An invisible barrier appears in front of you.', NULL),
  ('Thunderwave',      1, 'Evocation',     '2d8 thunder',  'A wave of thunderous force sweeps outward.', 'CON'),
  ('Cure Wounds',      1, 'Evocation',     NULL,            'A creature you touch regains 1d8+mod HP.', NULL),
  ('Detect Magic',     1, 'Divination',    NULL,            'You sense the presence of magic within 30 feet.', NULL),
  ('Sleep',            1, 'Enchantment',   NULL,            'Send creatures into a magical slumber.', 'WIS'),
  ('Mage Hand',        1, 'Conjuration',   NULL,            'A spectral, floating hand appears.', NULL),
  ('Thunder Smite',    1, 'Evocation',     '2d6 thunder',  'Your weapon rings with thunder on a hit.', NULL);

-- Level 2
INSERT INTO spells (name, level, school, damage, description, save_type) VALUES
  ('Scorching Ray',   2, 'Evocation',     '2d6 fire',     'You create three rays of fire.', NULL),
  ('Mirror Image',    2, 'Illusion',      NULL,            'Three illusory duplicates of yourself appear.', NULL),
  ('Spiritual Weapon',2, 'Evocation',     '1d8+mod force','A spectral weapon attacks creatures you choose.', NULL),
  ('Misty Step',      2, 'Conjuration',   NULL,            'You teleport up to 30 feet to a spot you can see.', NULL);

-- ============================================================
-- ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS items (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL,          -- weapon, armor, potion, scroll, misc
  rarity      TEXT NOT NULL DEFAULT 'Common',
  price_gp    INT NOT NULL DEFAULT 0,
  description TEXT,
  ac_bonus    INT DEFAULT 0,
  damage      TEXT,                   -- e.g. '1d8 slashing'
  weight_lbs  NUMERIC(4,1) DEFAULT 0,
  properties  JSONB                   -- flexible extra data
);

-- Weapons
INSERT INTO items (name, type, rarity, price_gp, damage, weight_lbs, properties) VALUES
  ('Dagger',        'weapon', 'Common', 2,   '1d4 piercing', 1.0,  '{"finesse":true,"light":true}'),
  ('Shortsword',    'weapon', 'Common', 10,  '1d6 piercing', 2.0,  '{"finesse":true,"light":true}'),
  ('Longsword',     'weapon', 'Common', 15,  '1d8 slashing', 3.0,  '{"versatile":"1d10"}'),
  ('Battleaxe',     'weapon', 'Common', 10,  '1d8 slashing', 4.0,  '{"versatile":"1d10"}'),
  ('Greatsword',    'weapon', 'Common', 50,  '2d6 slashing', 6.0,  '{"heavy":true,"two-handed":true}'),
  ('Longbow',       'weapon', 'Common', 50,  '1d8 piercing', 2.0,  '{"heavy":true,"two-handed":true,"range":"150/600"}'),
  ('Shortbow',      'weapon', 'Common', 25,  '1d6 piercing', 1.0,  '{"range":"80/320"}'),
  ('Light Crossbow','weapon', 'Common', 25,  '1d8 piercing', 5.0,  '{"loading":true,"range":"80/320"}'),
  ('Quarterstaff',  'weapon', 'Common', 5,   '1d6 bludgeoning', 4.0,'{"versatile":"1d8"}'),
  ('Warhammer',     'weapon', 'Common', 15,  '1d8 bludgeoning',2.0,'{"versatile":"1d10"}');

-- Armor
INSERT INTO items (name, type, rarity, price_gp, ac_bonus, weight_lbs, properties) VALUES
  ('Leather Armor',     'armor', 'Common', 10,  11, 10.0, '{"type":"light"}'),
  ('Studded Leather',   'armor', 'Common', 45,  12, 13.0, '{"type":"light"}'),
  ('Chain Shirt',       'armor', 'Common', 75,  13, 20.0, '{"type":"medium","stealth_disadv":true}'),
  ('Scale Mail',        'armor', 'Common', 100, 14, 45.0, '{"type":"medium","stealth_disadv":true}'),
  ('Breastplate',       'armor', 'Common', 400, 14, 20.0, '{"type":"medium"}'),
  ('Half Plate',        'armor', 'Common', 750, 15, 40.0, '{"type":"medium","stealth_disadv":true}'),
  ('Chain Mail',        'armor', 'Common', 150, 16, 55.0, '{"type":"heavy","stealth_disadv":true}'),
  ('Splint',            'armor', 'Common', 600, 17, 60.0, '{"type":"heavy","stealth_disadv":true}'),
  ('Plate',             'armor', 'Rare',   1500,18, 65.0, '{"type":"heavy","stealth_disadv":true}'),
  ('Shield',            'armor', 'Common', 10,  2,  6.0,  '{"type":"shield"}');

-- Potions
INSERT INTO items (name, type, rarity, price_gp, description, weight_lbs) VALUES
  ('Potion of Healing',    'potion', 'Common',   50,   'Regain 2d4+2 hit points.', 0.5),
  ('Potion of Greater Healing', 'potion', 'Uncommon', 150, 'Regain 4d4+4 hit points.', 0.5),
  ('Potion of Fire Breath','potion', 'Uncommon', 500,  'Exhale fire in a 15-foot cone for 4d6 fire damage.', 0.5);

-- Misc
INSERT INTO items (name, type, rarity, price_gp, description, weight_lbs) VALUES
  ('Rations (1 day)',  'misc', 'Common', 1,   'Food and water for one day.', 2.0),
  ('Rope (50 ft)',     'misc', 'Common', 1,   'Hempen rope, 50 feet long.', 10.0),
  ('Torch',            'misc', 'Common', 1,   'Burns for 1 hour, sheds bright light.', 1.0),
  ('Healer''s Kit',    'misc', 'Common', 5,   'Stabilizing creature with zero HP.', 3.0),
  ('Lockpicks',        'misc', 'Common', 25,  'Thieves'' tools for picking locks.', 1.0);

-- ============================================================
-- QUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS quests (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  min_level     INT NOT NULL DEFAULT 1,
  max_level     INT NOT NULL DEFAULT 20,
  xp_reward     INT NOT NULL DEFAULT 0,
  gp_reward     INT NOT NULL DEFAULT 0,
  type          TEXT NOT NULL DEFAULT 'solo',  -- solo, party, guild
  difficulty    TEXT NOT NULL DEFAULT 'Normal',-- Easy, Normal, Hard, Deadly
  content       JSONB,                          -- quest steps, encounters, choices
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Starter quests
INSERT INTO quests (name, description, min_level, max_level, xp_reward, gp_reward, type, difficulty) VALUES
  ('The Lost Hen',        'A farmer has lost his prized hen. Find it in the nearby woods.', 1, 3, 50, 10, 'solo', 'Easy'),
  ('Rat Infestation',     'The tavern basement is overrun with rats. Clear them out.', 1, 3, 75, 15, 'solo', 'Easy'),
  ('The Missing Merchant', 'A merchant disappeared on the road to the next town. Investigate.', 2, 5, 200, 50, 'solo', 'Normal'),
  ('Bandit Ambush',       'Bandits are raiding travelers on the King''s Road. Stop them.', 3, 6, 350, 100, 'party', 'Normal'),
  ('The Goblin Cave',     'A goblin warband has been spotted in the hills. Clear the cave.', 3, 8, 500, 150, 'party', 'Hard'),
  ('Dragon''s Hoard',     'An ancient dragon terrorizes the region. Slay it and claim its hoard.', 10, 20, 5000, 2000, 'guild', 'Deadly');

-- ============================================================
-- MAIN CHARACTER TABLE (expand existing)
-- ============================================================
-- Assuming the existing `characters` table has: id, user_id, name, race, gender
-- We add all D&D 5e stats.

ALTER TABLE characters ADD COLUMN IF NOT EXISTS class_id INT REFERENCES classes(id);
ALTER TABLE characters ADD COLUMN IF NOT EXISTS background_id INT REFERENCES backgrounds(id);
ALTER TABLE characters ADD COLUMN IF NOT EXISTS race_id INT REFERENCES races(id);
ALTER TABLE characters ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 1;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS xp INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS hp INT NOT NULL DEFAULT 10;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS max_hp INT NOT NULL DEFAULT 10;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS temp_hp INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS ac INT NOT NULL DEFAULT 10;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS initiative INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS speed INT NOT NULL DEFAULT 30;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS gold INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS current_hp INT NOT NULL DEFAULT 10;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS death_save_successes INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS death_save_failures INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS alignment TEXT DEFAULT 'True Neutral';
ALTER TABLE characters ADD COLUMN IF NOT EXISTS backstory TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS location TEXT DEFAULT 'Town Square';
ALTER TABLE characters ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'alive';
ALTER TABLE characters ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE characters ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ============================================================
-- ABILITY SCORES (one row per character)
-- ============================================================
CREATE TABLE IF NOT EXISTS ability_scores (
  character_id  INT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  str           INT NOT NULL DEFAULT 10,
  dex           INT NOT NULL DEFAULT 10,
  con           INT NOT NULL DEFAULT 10,
  int           INT NOT NULL DEFAULT 10,
  wis           INT NOT NULL DEFAULT 10,
  cha           INT NOT NULL DEFAULT 10,
  str_save      INT NOT NULL DEFAULT 0,
  dex_save      INT NOT NULL DEFAULT 0,
  con_save      INT NOT NULL DEFAULT 0,
  int_save      INT NOT NULL DEFAULT 0,
  wis_save      INT NOT NULL DEFAULT 0,
  cha_save      INT NOT NULL DEFAULT 0
);

-- ============================================================
-- PROFICIENCIES (skills, saving throws, tools, languages)
-- ============================================================
CREATE TABLE IF NOT EXISTS character_proficiencies (
  character_id  INT REFERENCES characters(id) ON DELETE CASCADE,
  proficiency   TEXT NOT NULL,  -- e.g. 'Athletics', 'Stealth', 'Dagger', 'Elvish'
  type          TEXT NOT NULL,  -- 'skill', 'save', 'tool', 'language', 'weapon', 'armor'
  PRIMARY KEY (character_id, proficiency)
);

-- ============================================================
-- CHARACTER SPELLS (known/prepared spells per character)
-- ============================================================
CREATE TABLE IF NOT EXISTS character_spells (
  character_id  INT REFERENCES characters(id) ON DELETE CASCADE,
  spell_id      INT REFERENCES spells(id) ON DELETE CASCADE,
  prepared      BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (character_id, spell_id)
);

-- ============================================================
-- SPELL SLOTS (per character, per level)
-- ============================================================
CREATE TABLE IF NOT EXISTS spell_slots (
  character_id  INT REFERENCES characters(id) ON DELETE CASCADE,
  slot_level    INT NOT NULL,       -- spell level 1-9
  max_slots     INT NOT NULL DEFAULT 0,
  used_slots    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, slot_level)
);

-- ============================================================
-- INVENTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory (
  id            SERIAL PRIMARY KEY,
  character_id  INT REFERENCES characters(id) ON DELETE CASCADE,
  item_id       INT REFERENCES items(id) ON DELETE CASCADE,
  quantity      INT NOT NULL DEFAULT 1,
  equipped      BOOLEAN NOT NULL DEFAULT false,
  attuned       BOOLEAN NOT NULL DEFAULT false
);

-- ============================================================
-- PLAYER QUESTS (progress tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS player_quests (
  id            SERIAL PRIMARY KEY,
  character_id  INT REFERENCES characters(id) ON DELETE CASCADE,
  quest_id      INT REFERENCES quests(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'active',  -- active, completed, failed
  progress      INT NOT NULL DEFAULT 0,          -- steps completed
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  UNIQUE(character_id, quest_id)
);

-- ============================================================
-- COMBAT ENCOUNTERS (active battles)
-- ============================================================
CREATE TABLE IF NOT EXISTS combat_encounters (
  id            SERIAL PRIMARY KEY,
  quest_id      INT REFERENCES quests(id),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  round         INT NOT NULL DEFAULT 1,
  current_turn  INT,                          -- character_id whose turn it is
  participants  JSONB NOT NULL DEFAULT '[]',   -- [{character_id, hp, ac, initiative, conditions}]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- WORLD STATE (shared persistent world changes)
-- ============================================================
CREATE TABLE IF NOT EXISTS world_state (
  key           TEXT PRIMARY KEY,
  value         JSONB NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- GUILD / PARTY SYSTEM
-- ============================================================
CREATE TABLE IF NOT EXISTS parties (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  leader_id     INT REFERENCES characters(id),
  max_members   INT NOT NULL DEFAULT 4,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS party_members (
  character_id  INT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  party_id      INT REFERENCES parties(id) ON DELETE CASCADE,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- HELPER: Calculate ability modifier
-- ============================================================
CREATE OR REPLACE FUNCTION ability_modifier(score INT)
RETURNS INT AS $$
BEGIN
  RETURN FLOOR((score - 10) / 2.0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- HELPER: Proficiency bonus by level
-- ============================================================
CREATE OR REPLACE FUNCTION prof_bonus(character_level INT)
RETURNS INT AS $$
BEGIN
  RETURN CEIL(character_level / 4.0)::INT + 1;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_char ON inventory(character_id);
CREATE INDEX IF NOT EXISTS idx_player_quests_char ON player_quests(character_id);
CREATE INDEX IF NOT EXISTS idx_combat_encounters_active ON combat_encounters(is_active);

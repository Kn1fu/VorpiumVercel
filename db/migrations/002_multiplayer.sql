-- Feather Quest Multiplayer Migration
-- Adds trading, chat, world events, factions, party loot, dungeons, and PvP

CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    from_char_id INT REFERENCES characters(id) NOT NULL,
    to_char_id INT REFERENCES characters(id) NOT NULL,
    from_items JSONB DEFAULT '[]',
    to_items JSONB DEFAULT '[]',
    from_gold INT DEFAULT 0,
    to_gold INT DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    sender_id INT REFERENCES characters(id) NOT NULL,
    channel TEXT NOT NULL DEFAULT 'party',
    channel_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS world_events (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    event_type TEXT NOT NULL,
    difficulty TEXT DEFAULT 'Normal',
    enemy_name TEXT,
    enemy_hp INT DEFAULT 50,
    enemy_max_hp INT DEFAULT 50,
    enemy_ac INT DEFAULT 12,
    xp_reward INT DEFAULT 100,
    gp_reward INT DEFAULT 50,
    is_active BOOLEAN DEFAULT true,
    starts_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_participants (
    event_id INT REFERENCES world_events(id) ON DELETE CASCADE,
    character_id INT REFERENCES characters(id) ON DELETE CASCADE,
    damage_dealt INT DEFAULT 0,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (event_id, character_id)
);

CREATE TABLE IF NOT EXISTS factions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    leader_id INT REFERENCES characters(id),
    max_members INT DEFAULT 20,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faction_members (
    character_id INT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    faction_id INT REFERENCES factions(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS party_loot (
    id SERIAL PRIMARY KEY,
    party_id INT REFERENCES parties(id) ON DELETE CASCADE,
    item_id INT REFERENCES items(id) ON DELETE CASCADE,
    quantity INT DEFAULT 1,
    added_by INT REFERENCES characters(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dungeon_runs (
    id SERIAL PRIMARY KEY,
    party_id INT REFERENCES parties(id) ON DELETE CASCADE,
    dungeon_name TEXT NOT NULL,
    current_room INT DEFAULT 0,
    max_rooms INT DEFAULT 5,
    status TEXT DEFAULT 'active',
    total_xp INT DEFAULT 0,
    total_gp INT DEFAULT 0,
    room_data JSONB DEFAULT '[]',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pvp_matches (
    id SERIAL PRIMARY KEY,
    challenger_id INT REFERENCES characters(id) NOT NULL,
    defender_id INT REFERENCES characters(id) NOT NULL,
    status TEXT DEFAULT 'pending',
    challenger_hp INT,
    defender_hp INT,
    winner_id INT REFERENCES characters(id),
    xp_reward INT DEFAULT 50,
    gold_reward INT DEFAULT 25,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO factions (name, description) VALUES
    ('The Obsidian Order', 'A militant order that seeks to impose order through strength.'),
    ('Crimson Circle', 'A secretive cabal of mages and warlocks pursuing forbidden knowledge.'),
    ('The Verdant Circle', 'Druids and rangers devoted to protecting the natural world.'),
    ('Silver Hand', 'Paladins and clerics dedicated to fighting evil and protecting the innocent.'),
    ('The Ashen Pact', 'Rogues, assassins, and spies who operate in the shadows.')
ON CONFLICT (name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_trades_from ON trades(from_char_id);
CREATE INDEX IF NOT EXISTS idx_trades_to ON trades(to_char_id);
CREATE INDEX IF NOT EXISTS idx_trades_pending ON trades(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_chat_channel ON chat_messages(channel, channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_world_events_active ON world_events(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_event_participants_event ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_faction_members_faction ON faction_members(faction_id);
CREATE INDEX IF NOT EXISTS idx_party_loot_party ON party_loot(party_id);
CREATE INDEX IF NOT EXISTS idx_dungeon_runs_party ON dungeon_runs(party_id);
CREATE INDEX IF NOT EXISTS idx_dungeon_runs_active ON dungeon_runs(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pvp_pending ON pvp_matches(status) WHERE status = 'pending';

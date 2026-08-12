"use client";

import { useState, useEffect, useCallback } from "react";

interface Character {
  id: number;
  name: string;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  currentHp: number;
  tempHp: number;
  ac: number;
  speed: number;
  gold: number;
  location: string;
  status: string;
  className: string;
  raceName: string;
  backgroundName: string;
  abilityScores: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  savingThrows: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
}

interface Quest {
  id: number;
  name: string;
  description: string;
  difficulty: string;
  xp_reward: number;
  gp_reward: number;
  type: string;
}

interface InventoryItem {
  id: number;
  item_id: number;
  name: string;
  type: string;
  quantity: number;
  equipped: boolean;
  damage: string | null;
  ac_bonus: number | null;
  description: string | null;
  rarity: string;
}

interface Encounter {
  enemyName: string;
  enemyHp: number;
  enemyMaxHp: number;
  enemyAc: number;
}

interface CombatLog {
  message: string;
  timestamp: number;
}

type Tab = "quests" | "combat" | "inventory" | "character" | "shop";

export default function GameClient() {
  const [character, setCharacter] = useState<Character | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("quests");
  const [quests, setQuests] = useState<{
    available: Quest[];
    active: any[];
    completed: any[];
  }>({ available: [], active: [], completed: [] });
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [combatLog, setCombatLog] = useState<CombatLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abilityMod = (score: number) => Math.floor((score - 10) / 2);

  const modStr = (score: number) => {
    const mod = abilityMod(score);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };

  const hpPercent = character
    ? Math.round((character.currentHp / character.maxHp) * 100)
    : 0;

  const hpBarColor =
    hpPercent > 60
      ? "bg-green-500"
      : hpPercent > 30
        ? "bg-yellow-500"
        : "bg-red-500";

  const fetchCharacter = useCallback(async () => {
    try {
      const res = await fetch("/api/game/character");
      if (res.ok) {
        const data = await res.json();
        setCharacter(data.character);
      } else if (res.status === 404) {
        setCharacter(null);
      }
    } catch (err) {
      console.error("Failed to fetch character:", err);
    }
  }, []);

  const fetchQuests = useCallback(async () => {
    try {
      const res = await fetch("/api/game/quests");
      if (res.ok) {
        const data = await res.json();
        setQuests({
          available: data.available,
          active: data.active,
          completed: data.completed,
        });
      }
    } catch (err) {
      console.error("Failed to fetch quests:", err);
    }
  }, []);

  const fetchInventory = useCallback(async () => {
    try {
      const res = await fetch("/api/game/inventory");
      if (res.ok) {
        const data = await res.json();
        setInventory(data.inventory);
      }
    } catch (err) {
      console.error("Failed to fetch inventory:", err);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      await fetchCharacter();
      setLoading(false);
    };
    load();
  }, [fetchCharacter]);

  useEffect(() => {
    if (character) {
      fetchQuests();
      fetchInventory();
    }
  }, [character, fetchQuests, fetchInventory]);

  const startQuest = async (questId: number) => {
    try {
      const res = await fetch("/api/game/quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questId }),
      });

      if (res.ok) {
        const data = await res.json();
        setEncounter(data.encounter);
        setActiveTab("combat");
        setCombatLog([
          {
            message: `Combat started with ${data.encounter.enemyName}! (HP: ${data.encounter.enemyHp}, AC: ${data.encounter.enemyAc})`,
            timestamp: Date.now(),
          },
        ]);
        fetchQuests();
      }
    } catch (err) {
      console.error("Failed to start quest:", err);
    }
  };

  const attack = async () => {
    if (!encounter) return;

    try {
      const res = await fetch("/api/game/combat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "attack" }),
      });

      if (res.ok) {
        const data = await res.json();
        const newLogs: CombatLog[] = [];

        const atk = data.playerAttack;
        let atkMsg = `You attack: rolled ${atk.roll}`;
        if (atk.isCrit) atkMsg += " (CRITICAL!)";
        if (atk.hit) {
          atkMsg += ` — Hit! Dealt ${atk.damage} damage.`;
        } else {
          atkMsg += " — Miss!";
        }
        newLogs.push({ message: atkMsg, timestamp: Date.now() });

        if (data.enemyAttack) {
          newLogs.push({
            message: data.enemyAttack.message,
            timestamp: Date.now(),
          });
        }

        if (data.deathSave) {
          newLogs.push({
            message: `Death save: rolled ${data.deathSave.roll} — ${data.deathSave.success ? "Success" : "Failure"} (${data.deathSave.successes}/${data.deathSave.failures})`,
            timestamp: Date.now(),
          });
        }

        if (data.questComplete) {
          newLogs.push({
            message: `Quest complete! Earned ${data.xpAward} XP and ${data.gpAward} GP!`,
            timestamp: Date.now(),
          });
          setEncounter(null);
          fetchQuests();
          fetchCharacter();
        } else {
          setEncounter(data.encounter);
        }

        if (data.playerHp !== undefined && character) {
          setCharacter({
            ...character,
            currentHp: data.playerHp,
          });
        }

        setCombatLog((prev) => [...newLogs, ...prev]);
      }
    } catch (err) {
      console.error("Attack failed:", err);
    }
  };

  const flee = async () => {
    if (!encounter) return;

    try {
      const res = await fetch("/api/game/combat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flee" }),
      });

      if (res.ok) {
        const data = await res.json();
        setCombatLog((prev) => [
          {
            message: data.fled
              ? "You fled successfully!"
              : "Failed to flee! " +
                (data.enemyAttack?.message || ""),
            timestamp: Date.now(),
          },
          ...prev,
        ]);

        if (data.fled) {
          setEncounter(null);
          setActiveTab("quests");
          fetchQuests();
        }

        if (data.playerHp !== undefined && character) {
          setCharacter({
            ...character,
            currentHp: data.playerHp,
          });
        }
      }
    } catch (err) {
      console.error("Flee failed:", err);
    }
  };

  const rest = async (type: "short" | "long") => {
    try {
      const res = await fetch("/api/game/rest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });

      if (res.ok) {
        const data = await res.json();
        setCombatLog((prev) => [
          { message: data.message, timestamp: Date.now() },
          ...prev,
        ]);
        fetchCharacter();
      }
    } catch (err) {
      console.error("Rest failed:", err);
    }
  };

  const useItem = async (inventoryId: number) => {
    try {
      const res = await fetch("/api/game/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryId }),
      });

      if (res.ok) {
        const data = await res.json();
        setCombatLog((prev) => [
          { message: data.message, timestamp: Date.now() },
          ...prev,
        ]);
        fetchInventory();
        fetchCharacter();
      }
    } catch (err) {
      console.error("Use item failed:", err);
    }
  };

  const equipItem = async (inventoryId: number, equipped: boolean) => {
    try {
      const res = await fetch("/api/game/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryId, equipped }),
      });

      if (res.ok) {
        fetchInventory();
      }
    } catch (err) {
      console.error("Equip failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading...</div>
      </div>
    );
  }

  if (!character) {
    return (
      <main className="min-h-screen bg-gray-950 text-white">
        <nav className="border-b border-white/10">
          <div className="max-w-6xl mx-auto px-6 py-5">
            <div className="text-xl font-bold tracking-[0.25em]">
              FEATHER QUEST
            </div>
          </div>
        </nav>
        <section className="max-w-4xl mx-auto px-6 py-24 text-center">
          <p className="text-sm tracking-[0.35em] text-indigo-400 mb-4">
            CREATE YOUR CHARACTER
          </p>
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Who will you become?
          </h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto mb-10">
            Every story begins with a name. Choose the name your character
            will carry throughout the world of Feather Quest.
          </p>
          <a
            href="/play/create"
            className="px-8 py-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 transition font-semibold inline-block"
          >
            BEGIN CHARACTER CREATION
          </a>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar - Character Sheet */}
      <aside className="w-72 border-r border-white/10 p-4 flex flex-col">
        <div className="mb-4">
          <h2 className="text-lg font-bold">{character.name}</h2>
          <p className="text-sm text-gray-400">
            Level {character.level} {character.raceName}{" "}
            {character.className}
          </p>
        </div>

        {/* HP Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>HP</span>
            <span>
              {character.currentHp}/{character.maxHp}
            </span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${hpBarColor} transition-all`}
              style={{ width: `${hpPercent}%` }}
            />
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <div className="bg-white/5 rounded-lg p-2">
            <div className="text-xs text-gray-400">AC</div>
            <div className="font-bold">{character.ac}</div>
          </div>
          <div className="bg-white/5 rounded-lg p-2">
            <div className="text-xs text-gray-400">Speed</div>
            <div className="font-bold">{character.speed}ft</div>
          </div>
          <div className="bg-white/5 rounded-lg p-2">
            <div className="text-xs text-gray-400">Gold</div>
            <div className="font-bold">{character.gold}</div>
          </div>
        </div>

        {/* Ability Scores */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-400 mb-2">
            ABILITIES
          </h3>
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(character.abilityScores).map(
              ([key, value]) => (
                <div
                  key={key}
                  className="flex justify-between bg-white/5 rounded px-2 py-1 text-sm"
                >
                  <span className="uppercase text-gray-400">
                    {key}
                  </span>
                  <span>
                    {value} ({modStr(value)})
                  </span>
                </div>
              )
            )}
          </div>
        </div>

        {/* Location */}
        <div className="text-sm text-gray-400 mb-4">
          📍 {character.location}
        </div>

        {/* Rest Buttons */}
        <div className="mt-auto space-y-2">
          <button
            onClick={() => rest("short")}
            className="w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm transition"
          >
            Short Rest
          </button>
          <button
            onClick={() => rest("long")}
            className="w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm transition"
          >
            Long Rest
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Tab Bar */}
        <nav className="border-b border-white/10 flex">
          {(
            ["quests", "combat", "inventory", "character"] as Tab[]
          ).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium transition ${
                activeTab === tab
                  ? "text-white border-b-2 border-indigo-500"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* QUESTS TAB */}
          {activeTab === "quests" && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Quest Log</h2>

              {quests.active.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-400 mb-2">
                    ACTIVE QUESTS
                  </h3>
                  {quests.active.map((q) => (
                    <div
                      key={q.id}
                      className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-2"
                    >
                      <div className="flex justify-between">
                        <span className="font-semibold">
                          {q.name}
                        </span>
                        <span className="text-sm text-yellow-400">
                          {q.difficulty}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        {q.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <h3 className="text-sm font-semibold text-gray-400 mb-2">
                AVAILABLE QUESTS
              </h3>
              <div className="grid gap-3">
                {quests.available.map((q) => (
                  <div
                    key={q.id}
                    className="bg-white/5 rounded-lg p-4 flex justify-between items-center"
                  >
                    <div>
                      <div className="font-semibold">{q.name}</div>
                      <div className="text-sm text-gray-400">
                        {q.description}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {q.difficulty} • {q.xp_reward} XP •{" "}
                        {q.gp_reward} GP • {q.type}
                      </div>
                    </div>
                    <button
                      onClick={() => startQuest(q.id)}
                      className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm transition"
                    >
                      Start
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* COMBAT TAB */}
          {activeTab === "combat" && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Combat</h2>

              {encounter ? (
                <div>
                  {/* Enemy Display */}
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 mb-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold mb-2">
                        ⚔️ {encounter.enemyName}
                      </div>
                      <div className="flex justify-center gap-6 text-sm">
                        <div>
                          <span className="text-gray-400">HP:</span>{" "}
                          <span className="font-bold">
                            {encounter.enemyHp}/{encounter.enemyMaxHp}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">AC:</span>{" "}
                          <span className="font-bold">
                            {encounter.enemyAc}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 h-3 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-500 transition-all"
                          style={{
                            width: `${Math.round((encounter.enemyHp / encounter.enemyMaxHp) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Combat Actions */}
                  <div className="flex gap-3 mb-6">
                    <button
                      onClick={attack}
                      className="px-6 py-3 rounded-lg bg-red-500 hover:bg-red-600 font-semibold transition"
                    >
                      ⚔️ Attack
                    </button>
                    <button
                      onClick={flee}
                      className="px-6 py-3 rounded-lg bg-gray-600 hover:bg-gray-500 transition"
                    >
                      🏃 Flee
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-gray-400 mb-6">
                  No active encounter. Start a quest to enter combat.
                </div>
              )}

              {/* Combat Log */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">
                  COMBAT LOG
                </h3>
                <div className="bg-black/30 rounded-lg p-4 max-h-96 overflow-auto">
                  {combatLog.length === 0 ? (
                    <div className="text-gray-500 text-sm">
                      No combat yet.
                    </div>
                  ) : (
                    combatLog.map((log, i) => (
                      <div
                        key={i}
                        className="text-sm border-b border-white/5 py-1"
                      >
                        {log.message}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* INVENTORY TAB */}
          {activeTab === "inventory" && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Inventory</h2>
              <div className="mb-4 text-sm text-gray-400">
                Gold: {character.gold} GP
              </div>

              {inventory.length === 0 ? (
                <div className="text-gray-400">Your bag is empty.</div>
              ) : (
                <div className="grid gap-2">
                  {inventory.map((item) => (
                    <div
                      key={item.id}
                      className={`bg-white/5 rounded-lg p-3 flex justify-between items-center ${item.equipped ? "border border-indigo-500/30" : ""}`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">
                            {item.name}
                          </span>
                          {item.equipped && (
                            <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded">
                              Equipped
                            </span>
                          )}
                          {item.quantity > 1 && (
                            <span className="text-xs text-gray-400">
                              ×{item.quantity}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.type}
                          {item.damage && ` • ${item.damage}`}
                          {item.ac_bonus && ` • AC +${item.ac_bonus}`}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {item.type === "potion" && (
                          <button
                            onClick={() => useItem(item.id)}
                            className="px-3 py-1 rounded bg-green-500/20 text-green-300 text-xs hover:bg-green-500/30"
                          >
                            Use
                          </button>
                        )}
                        {(item.type === "weapon" ||
                          item.type === "armor") && (
                          <button
                            onClick={() =>
                              equipItem(item.id, !item.equipped)
                            }
                            className="px-3 py-1 rounded bg-white/10 text-xs hover:bg-white/20"
                          >
                            {item.equipped
                              ? "Unequip"
                              : "Equip"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CHARACTER TAB */}
          {activeTab === "character" && (
            <div>
              <h2 className="text-2xl font-bold mb-4">
                Character Sheet
              </h2>

              <div className="grid grid-cols-2 gap-6">
                {/* Stats */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 mb-2">
                    ABILITY SCORES
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(character.abilityScores).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="flex justify-between bg-white/5 rounded-lg px-4 py-2"
                        >
                          <span className="uppercase font-medium">
                            {key}
                          </span>
                          <span>
                            {value} ({modStr(value)})
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Saving Throws */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 mb-2">
                    SAVING THROWS
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(character.savingThrows).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="flex justify-between bg-white/5 rounded-lg px-4 py-2"
                        >
                          <span className="uppercase font-medium">
                            {key}
                          </span>
                          <span>
                            {value >= 0 ? `+${value}` : value}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-xs text-gray-400">Class</div>
                  <div className="font-semibold">
                    {character.className}
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-xs text-gray-400">Race</div>
                  <div className="font-semibold">
                    {character.raceName}
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-xs text-gray-400">
                    Background
                  </div>
                  <div className="font-semibold">
                    {character.backgroundName || "None"}
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-xs text-gray-400">XP</div>
                  <div className="font-semibold">{character.xp}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

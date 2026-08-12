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
  abilityScores: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  savingThrows: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
}

interface Quest { id: number; name: string; description: string; difficulty: string; xp_reward: number; gp_reward: number; type: string; }
interface InventoryItem { id: number; item_id: number; name: string; type: string; quantity: number; equipped: boolean; damage: string | null; ac_bonus: number | null; description: string | null; rarity: string; }
interface Encounter { enemyName: string; enemyHp: number; enemyMaxHp: number; enemyAc: number; }
interface CombatLog { message: string; timestamp: number; }
type Tab = "quests" | "combat" | "inventory" | "character";

export default function GameClient() {
  const [character, setCharacter] = useState<Character | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("quests");
  const [quests, setQuests] = useState<{ available: Quest[]; active: any[]; completed: any[] }>({ available: [], active: [], completed: [] });
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [combatLog, setCombatLog] = useState<CombatLog[]>([]);
  const [loading, setLoading] = useState(true);

  const abilityMod = (score: number) => Math.floor((score - 10) / 2);
  const modStr = (score: number) => { const m = abilityMod(score); return m >= 0 ? `+${m}` : `${m}`; };
  const hpPercent = character ? Math.round((character.currentHp / character.maxHp) * 100) : 0;
  const hpClass = hpPercent > 60 ? "healthy" : hpPercent > 30 ? "wounded" : "danger";

  const fetchCharacter = useCallback(async () => { const res = await fetch("/api/game/character"); if (res.ok) { const d = await res.json(); setCharacter(d.character); } }, []);
  const fetchQuests = useCallback(async () => { const res = await fetch("/api/game/quests"); if (res.ok) { const d = await res.json(); setQuests({ available: d.available, active: d.active, completed: d.completed }); } }, []);
  const fetchInventory = useCallback(async () => { const res = await fetch("/api/game/inventory"); if (res.ok) { const d = await res.json(); setInventory(d.inventory); } }, []);

  useEffect(() => { (async () => { await fetchCharacter(); setLoading(false); })(); }, [fetchCharacter]);
  useEffect(() => { if (character) { fetchQuests(); fetchInventory(); } }, [character, fetchQuests, fetchInventory]);

  const startQuest = async (questId: number) => {
    const res = await fetch("/api/game/quests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questId }) });
    if (res.ok) { const d = await res.json(); setEncounter(d.encounter); setActiveTab("combat"); setCombatLog([{ message: `Combat started with ${d.encounter.enemyName}! (HP: ${d.encounter.enemyHp}, AC: ${d.encounter.enemyAc})`, timestamp: Date.now() }]); fetchQuests(); }
  };

  const attack = async () => {
    if (!encounter) return;
    const res = await fetch("/api/game/combat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "attack" }) });
    if (res.ok) {
      const d = await res.json();
      const logs: CombatLog[] = [];
      const atk = d.playerAttack;
      let msg = `You attack: rolled ${atk.roll}`;
      if (atk.isCrit) msg += " (CRITICAL!)";
      msg += atk.hit ? ` — Hit! Dealt ${atk.damage} damage.` : " — Miss!";
      logs.push({ message: msg, timestamp: Date.now() });
      if (d.enemyAttack) logs.push({ message: d.enemyAttack.message, timestamp: Date.now() });
      if (d.deathSave) logs.push({ message: `Death save: rolled ${d.deathSave.roll} — ${d.deathSave.success ? "Success" : "Failure"} (${d.deathSave.successes}/${d.deathSave.failures})`, timestamp: Date.now() });
      if (d.questComplete) { logs.push({ message: `Quest complete! Earned ${d.xpAward} XP and ${d.gpAward} GP!`, timestamp: Date.now() }); setEncounter(null); fetchQuests(); fetchCharacter(); } else { setEncounter(d.encounter); }
      if (d.playerHp !== undefined && character) setCharacter({ ...character, currentHp: d.playerHp });
      setCombatLog((prev) => [...logs, ...prev]);
    }
  };

  const flee = async () => {
    if (!encounter) return;
    const res = await fetch("/api/game/combat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "flee" }) });
    if (res.ok) {
      const d = await res.json();
      setCombatLog((prev) => [{ message: d.fled ? "You fled successfully!" : "Failed to flee! " + (d.enemyAttack?.message || ""), timestamp: Date.now() }, ...prev]);
      if (d.fled) { setEncounter(null); setActiveTab("quests"); fetchQuests(); }
      if (d.playerHp !== undefined && character) setCharacter({ ...character, currentHp: d.playerHp });
    }
  };

  const rest = async (type: "short" | "long") => {
    const res = await fetch("/api/game/rest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) });
    if (res.ok) { const d = await res.json(); setCombatLog((prev) => [{ message: d.message, timestamp: Date.now() }, ...prev]); fetchCharacter(); }
  };

  const useItem = async (inventoryId: number) => {
    const res = await fetch("/api/game/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inventoryId }) });
    if (res.ok) { const d = await res.json(); setCombatLog((prev) => [{ message: d.message, timestamp: Date.now() }, ...prev]); fetchInventory(); fetchCharacter(); }
  };

  const equipItem = async (inventoryId: number, equipped: boolean) => {
    await fetch("/api/game/inventory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inventoryId, equipped }) });
    fetchInventory();
  };

  if (loading) return <div className="game-layout"><div style={{ margin: "auto", color: "var(--mist)", fontSize: 16 }}>Loading...</div></div>;

  if (!character) return <main className="min-h-screen" style={{ background: "var(--obsidian)", color: "var(--parchment)" }}><section className="hero"><p className="eyebrow">CREATE YOUR CHARACTER</p><h1 style={{ fontFamily: "Cinzel, serif", fontSize: "clamp(40px, 8vw, 80px)", letterSpacing: 8, marginBottom: 20, background: "linear-gradient(180deg, var(--gold-light), var(--gold-dim))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Who will you become?</h1><p className="subtitle">Every story begins with a name.</p><div className="buttons"><a href="/play/create" className="button primary">BEGIN CHARACTER CREATION</a></div></section></main>;

  return (
    <div className="game-layout">
      <aside className="game-sidebar">
        <div className="sidebar-header">
          <h2>{character.name}</h2>
          <div className="sidebar-subtitle">Level {character.level} {character.raceName} {character.className}</div>
        </div>

        <div className="sidebar-section">
          <div className="hp-bar-header"><span>HP</span><span>{character.currentHp}/{character.maxHp}</span></div>
          <div className="hp-bar-track"><div className={`hp-bar-fill ${hpClass}`} style={{ width: `${hpPercent}%` }} /></div>
        </div>

        <div className="sidebar-section">
          <div className="quick-stats">
            <div className="stat-box"><div className="stat-label">AC</div><div className="stat-value">{character.ac}</div></div>
            <div className="stat-box"><div className="stat-label">Speed</div><div className="stat-value">{character.speed}ft</div></div>
            <div className="stat-box"><div className="stat-label">Gold</div><div className="stat-value">{character.gold}</div></div>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">Abilities</div>
          <div className="ability-list">
            {Object.entries(character.abilityScores).map(([k, v]) => (
              <div key={k} className="ability-row"><span className="a-name">{k}</span><span className="a-value">{v} ({modStr(v)})</span></div>
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-location">Location: {character.location}</div>
        </div>

        <div className="sidebar-actions">
          <button className="rest-btn" onClick={() => rest("short")}>Short Rest</button>
          <button className="rest-btn" onClick={() => rest("long")}>Long Rest</button>
        </div>
      </aside>

      <div className="game-main">
        <nav className="game-tabs">
          {(["quests", "combat", "inventory", "character"] as Tab[]).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`game-tab ${activeTab === tab ? "active" : ""}`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>

        <div className="game-content">
          {activeTab === "quests" && (
            <div>
              <h2>Quest Log</h2>
              {quests.active.length > 0 && (
                <div style={{ marginBottom: 30 }}>
                  <div className="section-label">Active Quests</div>
                  {quests.active.map((q) => (
                    <div key={q.id} className="quest-active-card">
                      <div className="quest-name">{q.name}</div>
                      <div className="quest-diff">{q.difficulty}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="section-label">Available Quests</div>
              {quests.available.map((q) => (
                <div key={q.id} className="quest-card">
                  <div className="quest-info">
                    <div className="quest-name">{q.name}</div>
                    <div className="quest-desc">{q.description}</div>
                    <div className="quest-meta">
                      <span>{q.difficulty}</span><span>{q.xp_reward} XP</span><span>{q.gp_reward} GP</span><span>{q.type}</span>
                    </div>
                  </div>
                  <button className="quest-start-btn" onClick={() => startQuest(q.id)}>Begin</button>
                </div>
              ))}
            </div>
          )}

          {activeTab === "combat" && (
            <div>
              <h2>Combat</h2>
              {encounter ? (
                <div>
                  <div className="enemy-display">
                    <div className="enemy-name">{encounter.enemyName}</div>
                    <div className="enemy-stats">
                      <div className="stat"><div className="stat-label">HP</div><div className="stat-value">{encounter.enemyHp}/{encounter.enemyMaxHp}</div></div>
                      <div className="stat"><div className="stat-label">AC</div><div className="stat-value">{encounter.enemyAc}</div></div>
                    </div>
                    <div className="enemy-hp-track"><div className="enemy-hp-fill" style={{ width: `${Math.round((encounter.enemyHp / encounter.enemyMaxHp) * 100)}%` }} /></div>
                  </div>
                  <div className="combat-actions">
                    <button className="combat-btn attack" onClick={attack}>Attack</button>
                    <button className="combat-btn flee" onClick={flee}>Flee</button>
                  </div>
                </div>
              ) : <p style={{ color: "var(--mist)", marginBottom: 30 }}>No active encounter. Start a quest to enter combat.</p>}

              <div className="section-label">Combat Log</div>
              <div className="combat-log">
                {combatLog.length === 0 ? <div className="log-empty">No combat yet.</div> : combatLog.map((log, i) => (
                  <div key={i} className="log-entry" dangerouslySetInnerHTML={{ __html: log.message.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--gold-light)">$1</strong>') }} />
                ))}
              </div>
            </div>
          )}

          {activeTab === "inventory" && (
            <div>
              <h2>Inventory</h2>
              <div style={{ marginBottom: 20, fontSize: 14, color: "var(--mist)" }}>Gold: {character.gold} GP</div>
              {inventory.length === 0 ? <p style={{ color: "var(--mist)" }}>Your bag is empty.</p> : inventory.map((item) => (
                <div key={item.id} className={`inv-item ${item.equipped ? "equipped" : ""}`}>
                  <div>
                    <div className="inv-name">
                      {item.name}
                      {item.equipped && <span className="inv-tag equipped-tag">Equipped</span>}
                      {item.quantity > 1 && <span className="inv-tag qty">x{item.quantity}</span>}
                    </div>
                    <div className="inv-meta">{item.type}{item.damage && ` · ${item.damage}`}{item.ac_bonus && ` · AC +${item.ac_bonus}`}</div>
                  </div>
                  <div className="inv-actions">
                    {item.type === "potion" && <button className="inv-action-btn use" onClick={() => useItem(item.id)}>Use</button>}
                    {(item.type === "weapon" || item.type === "armor") && <button className="inv-action-btn" onClick={() => equipItem(item.id, !item.equipped)}>{item.equipped ? "Unequip" : "Equip"}</button>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "character" && (
            <div>
              <h2>Character Sheet</h2>
              <div className="sheet-grid">
                <div className="sheet-section">
                  <h3>Ability Scores</h3>
                  {Object.entries(character.abilityScores).map(([k, v]) => (
                    <div key={k} className="sheet-stat-row">
                      <span className="s-name">{k}</span>
                      <span><span className="s-value">{v}</span><span className="s-mod">({modStr(v)})</span></span>
                    </div>
                  ))}
                </div>
                <div className="sheet-section">
                  <h3>Saving Throws</h3>
                  {Object.entries(character.savingThrows).map(([k, v]) => (
                    <div key={k} className="sheet-stat-row">
                      <span className="s-name">{k}</span>
                      <span className="s-value">{v >= 0 ? `+${v}` : v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="sheet-section" style={{ marginTop: 20 }}>
                <h3>Info</h3>
                <div className="sheet-info-grid">
                  <div className="sheet-info-box"><div className="info-label">Class</div><div className="info-value">{character.className}</div></div>
                  <div className="sheet-info-box"><div className="info-label">Race</div><div className="info-value">{character.raceName}</div></div>
                  <div className="sheet-info-box"><div className="info-label">Background</div><div className="info-value">{character.backgroundName || "None"}</div></div>
                  <div className="sheet-info-box"><div className="info-label">XP</div><div className="info-value">{character.xp}</div></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

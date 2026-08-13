"use client";

import { useState, useEffect, useCallback } from "react";

interface Character {
  id: number; name: string; level: number; xp: number; hp: number; maxHp: number; currentHp: number; tempHp: number; ac: number; speed: number; gold: number; location: string; status: string; className: string; raceName: string; backgroundName: string; abilityScores: { str: number; dex: number; con: number; int: number; wis: number; cha: number }; savingThrows: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
}
interface Quest { id: number; name: string; description: string; difficulty: string; xp_reward: number; gp_reward: number; type: string; }
interface InventoryItem { id: number; item_id: number; name: string; type: string; quantity: number; equipped: boolean; damage: string | null; ac_bonus: number | null; description: string | null; rarity: string; }
interface Encounter { enemyName: string; enemyHp: number; enemyMaxHp: number; enemyAc: number; }
interface CombatLog { message: string; timestamp: number; }
interface PartyMember { id: number; name: string; level: number; className: string; raceName: string; currentHp: number; maxHp: number; location: string; status: string; }
interface Party { id: number; name: string; leaderId: number; maxMembers: number; members: PartyMember[]; }
interface Trade { id: number; fromCharName: string; toCharName: string; fromItems: any[]; toItems: any[]; fromGold: number; toGold: number; status: string; createdAt: string; }
interface ChatMessage { id: number; senderName: string; message: string; channel: string; createdAt: string; }
interface LeaderboardEntry { rank: number; charName: string; level: number; className: string; raceName: string; value: number; isMe: boolean; }
interface WorldEvent { id: number; name: string; description: string; eventType: string; difficulty: string; enemyName: string; enemyHp: number; enemyMaxHp: number; enemyAc: number; participantCount: number; totalDamage: number; xpReward: number; gpReward: number; expiresAt: string; }

type Tab = "quests" | "combat" | "inventory" | "character" | "party" | "trade" | "chat" | "leaderboard" | "world events";

export default function GameClient() {
  const [character, setCharacter] = useState<Character | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("quests");
  const [quests, setQuests] = useState<{ available: Quest[]; active: any[]; completed: any[] }>({ available: [], active: [], completed: [] });
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [combatLog, setCombatLog] = useState<CombatLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [party, setParty] = useState<Party | null>(null);
  const [pendingTrades, setPendingTrades] = useState<Trade[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatChannel, setChatChannel] = useState<"party" | "faction" | "global">("party");
  const [leaderboardType, setLeaderboardType] = useState<"level" | "gold" | "quests" | "xp">("level");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [worldEvents, setWorldEvents] = useState<WorldEvent[]>([]);
  const [partyList, setPartyList] = useState<{ id: number; name: string; memberCount: number; maxMembers: number; leaderName: string }[]>([]);
  const [tradeMessage, setTradeMessage] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [leaderboardRange, setLeaderboardRange] = useState<"all" | "10" | "20">("all");

  const [partyName, setPartyName] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [tradeTarget, setTradeTarget] = useState("");
  const [tradeGold, setTradeGold] = useState(0);
  const [tradeItems, setTradeItems] = useState<number[]>([]);
  const [activeEvent, setActiveEvent] = useState<WorldEvent | null>(null);

  const abilityMod = (score: number) => Math.floor((score - 10) / 2);
  const modStr = (score: number) => { const m = abilityMod(score); return m >= 0 ? `+${m}` : `${m}`; };
  const hpPercent = character ? Math.round((character.currentHp / character.maxHp) * 100) : 0;
  const hpClass = hpPercent > 60 ? "healthy" : hpPercent > 30 ? "wounded" : "danger";

  const fetchCharacter = useCallback(async () => { const res = await fetch("/api/game/character"); if (res.ok) { const d = await res.json(); setCharacter(d.character); } }, []);
  const fetchQuests = useCallback(async () => { const res = await fetch("/api/game/quests"); if (res.ok) { const d = await res.json(); setQuests({ available: d.available, active: d.active, completed: d.completed }); } }, []);
  const fetchInventory = useCallback(async () => { const res = await fetch("/api/game/inventory"); if (res.ok) { const d = await res.json(); setInventory(d.inventory); } }, []);
  const fetchParty = useCallback(async () => { const res = await fetch("/api/game/party"); if (res.ok) { const d = await res.json(); setParty(d.party); setPartyList(d.allParties || []); } }, []);
  const fetchTrades = useCallback(async () => { const res = await fetch("/api/game/trade"); if (res.ok) { const d = await res.json(); setPendingTrades(d.trades || []); } }, []);
  const fetchChat = useCallback(async () => { const res = await fetch(`/api/game/chat?channel=${chatChannel}&limit=50`); if (res.ok) { const d = await res.json(); setChatMessages(d.messages || []); } }, [chatChannel]);
  const fetchLeaderboard = useCallback(async () => { const res = await fetch(`/api/game/leaderboard?type=${leaderboardType}`); if (res.ok) { const d = await res.json(); setLeaderboard(d.entries || []); } }, [leaderboardType]);
  const fetchWorldEvents = useCallback(async () => { const res = await fetch("/api/game/world-events"); if (res.ok) { const d = await res.json(); setWorldEvents(d.events || []); } }, []);

  useEffect(() => { (async () => { await fetchCharacter(); setLoading(false); })(); }, [fetchCharacter]);
  useEffect(() => { if (character) { fetchQuests(); fetchInventory(); } }, [character, fetchQuests, fetchInventory]);
  useEffect(() => { if (activeTab === "party") fetchParty(); }, [activeTab, fetchParty]);
  useEffect(() => { if (activeTab === "trade") fetchTrades(); }, [activeTab, fetchTrades]);
  useEffect(() => { if (activeTab === "chat") fetchChat(); }, [activeTab, fetchChat]);
  useEffect(() => { if (activeTab === "leaderboard") fetchLeaderboard(); }, [activeTab, fetchLeaderboard]);
  useEffect(() => { if (activeTab === "world events") fetchWorldEvents(); }, [activeTab, fetchWorldEvents]);

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

  const createParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyName.trim()) return;
    await fetch("/api/game/party", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: partyName }) });
    setPartyName("");
    fetchParty();
  };

  const joinParty = async (partyId: number) => {
    await fetch("/api/game/party", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", partyId }) });
    fetchParty();
  };

  const leaveParty = async () => {
    await fetch("/api/game/party", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "leave" }) });
    setParty(null);
    fetchParty();
  };

  const disbandParty = async () => {
    await fetch("/api/game/party", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disband" }) });
    setParty(null);
    fetchParty();
  };

  const invitePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim()) return;
    await fetch("/api/game/party", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", name: inviteName }) });
    setInviteName("");
    fetchParty();
  };

  const sendTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeTarget.trim()) return;
    await fetch("/api/game/trade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toCharName: tradeTarget, fromItems: tradeItems, fromGold: tradeGold }) });
    setTradeTarget("");
    setTradeGold(0);
    setTradeItems([]);
    setTradeMessage("Trade request sent!");
    fetchTrades();
  };

  const respondTrade = async (tradeId: number, accept: boolean) => {
    await fetch("/api/game/trade", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tradeId, accept }) });
    fetchTrades();
    fetchCharacter();
    fetchInventory();
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    await fetch("/api/game/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: chatInput, channel: chatChannel }) });
    setChatInput("");
    fetchChat();
  };

  const joinWorldEvent = async (eventId: number) => {
    await fetch("/api/game/world-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, action: "join" }) });
    fetchWorldEvents();
  };

  const attackWorldEvent = async (eventId: number) => {
    const res = await fetch("/api/game/world-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, action: "attack" }) });
    if (res.ok) { const d = await res.json(); setActiveEvent(d.event || null); if (d.playerHp !== undefined && character) setCharacter({ ...character, currentHp: d.playerHp }); fetchWorldEvents(); }
  };

  if (loading) return <div className="game-layout"><div style={{ margin: "auto", color: "var(--mist)", fontSize: 16 }}>Loading...</div></div>;

  if (!character) return <main className="min-h-screen" style={{ background: "var(--obsidian)", color: "var(--parchment)" }}><section className="hero"><p className="eyebrow">CREATE YOUR CHARACTER</p><h1 style={{ fontFamily: "Cinzel, serif", fontSize: "clamp(40px, 8vw, 80px)", letterSpacing: 8, marginBottom: 20, background: "linear-gradient(180deg, var(--gold-light), var(--gold-dim))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Who will you become?</h1><p className="subtitle">Every story begins with a name.</p><div className="buttons"><a href="/play/create" className="button primary">BEGIN CHARACTER CREATION</a></div></section></main>;

  return (
    <div className="game-layout">
      <aside className="game-sidebar">
        <div className="sidebar-header"><h2>{character.name}</h2><div className="sidebar-subtitle">Level {character.level} {character.raceName} {character.className}</div></div>
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
            {Object.entries(character.abilityScores).map(([k, v]) => (<div key={k} className="ability-row"><span className="a-name">{k}</span><span className="a-value">{v} ({modStr(v)})</span></div>))}
          </div>
        </div>
        <div className="sidebar-section"><div className="sidebar-location">Location: {character.location}</div></div>
        <div className="sidebar-actions"><button className="rest-btn" onClick={() => rest("short")}>Short Rest</button><button className="rest-btn" onClick={() => rest("long")}>Long Rest</button></div>
      </aside>

      <div className="game-main">
        <nav className="game-tabs">
          {(["quests", "combat", "inventory", "character", "party", "trade", "chat", "leaderboard", "world events"] as Tab[]).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`game-tab ${activeTab === tab ? "active" : ""}`}>{tab === "world events" ? "Events" : tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
          ))}
        </nav>

        <div className="game-content">
          {activeTab === "quests" && (
            <div>
              <h2>Quest Log</h2>
              {quests.active.length > 0 && <div style={{ marginBottom: 30 }}><div className="section-label">Active Quests</div>{quests.active.map((q) => <div key={q.id} className="quest-active-card"><div className="quest-name">{q.name}</div><div className="quest-diff">{q.difficulty}</div></div>)}</div>}
              <div className="section-label">Available Quests</div>
              {quests.available.map((q) => (<div key={q.id} className="quest-card"><div className="quest-info"><div className="quest-name">{q.name}</div><div className="quest-desc">{q.description}</div><div className="quest-meta"><span>{q.difficulty}</span><span>{q.xp_reward} XP</span><span>{q.gp_reward} GP</span><span>{q.type}</span></div></div><button className="quest-start-btn" onClick={() => startQuest(q.id)}>Begin</button></div>))}
            </div>
          )}

          {activeTab === "combat" && (
            <div>
              <h2>Combat</h2>
              {encounter ? (
                <div>
                  <div className="enemy-display"><div className="enemy-name">{encounter.enemyName}</div><div className="enemy-stats"><div className="stat"><div className="stat-label">HP</div><div className="stat-value">{encounter.enemyHp}/{encounter.enemyMaxHp}</div></div><div className="stat"><div className="stat-label">AC</div><div className="stat-value">{encounter.enemyAc}</div></div></div><div className="enemy-hp-track"><div className="enemy-hp-fill" style={{ width: `${Math.round((encounter.enemyHp / encounter.enemyMaxHp) * 100)}%` }} /></div></div>
                  <div className="combat-actions"><button className="combat-btn attack" onClick={attack}>Attack</button><button className="combat-btn flee" onClick={flee}>Flee</button></div>
                </div>
              ) : <p style={{ color: "var(--mist)", marginBottom: 30 }}>No active encounter. Start a quest to enter combat.</p>}
              <div className="section-label">Combat Log</div>
              <div className="combat-log">
                {combatLog.length === 0 ? <div className="log-empty">No combat yet.</div> : combatLog.map((log, i) => (<div key={i} className="log-entry" dangerouslySetInnerHTML={{ __html: log.message.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--gold-light)">$1</strong>') }} />))}
              </div>
            </div>
          )}

          {activeTab === "inventory" && (
            <div>
              <h2>Inventory</h2>
              <div style={{ marginBottom: 20, fontSize: 14, color: "var(--mist)" }}>Gold: {character.gold} GP</div>
              {inventory.length === 0 ? <p style={{ color: "var(--mist)" }}>Your bag is empty.</p> : inventory.map((item) => (
                <div key={item.id} className={`inv-item ${item.equipped ? "equipped" : ""}`}>
                  <div><div className="inv-name">{item.name}{item.equipped && <span className="inv-tag equipped-tag">Equipped</span>}{item.quantity > 1 && <span className="inv-tag qty">x{item.quantity}</span>}</div><div className="inv-meta">{item.type}{item.damage && ` · ${item.damage}`}{item.ac_bonus && ` · AC +${item.ac_bonus}`}</div></div>
                  <div className="inv-actions">{item.type === "potion" && <button className="inv-action-btn use" onClick={() => useItem(item.id)}>Use</button>}{(item.type === "weapon" || item.type === "armor") && <button className="inv-action-btn" onClick={() => equipItem(item.id, !item.equipped)}>{item.equipped ? "Unequip" : "Equip"}</button>}</div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "character" && (
            <div>
              <h2>Character Sheet</h2>
              <div className="sheet-grid">
                <div className="sheet-section"><h3>Ability Scores</h3>{Object.entries(character.abilityScores).map(([k, v]) => (<div key={k} className="sheet-stat-row"><span className="s-name">{k}</span><span><span className="s-value">{v}</span><span className="s-mod">({modStr(v)})</span></span></div>))}</div>
                <div className="sheet-section"><h3>Saving Throws</h3>{Object.entries(character.savingThrows).map(([k, v]) => (<div key={k} className="sheet-stat-row"><span className="s-name">{k}</span><span className="s-value">{v >= 0 ? `+${v}` : v}</span></div>))}</div>
              </div>
              <div className="sheet-section" style={{ marginTop: 20 }}><h3>Info</h3><div className="sheet-info-grid"><div className="sheet-info-box"><div className="info-label">Class</div><div className="info-value">{character.className}</div></div><div className="sheet-info-box"><div className="info-label">Race</div><div className="info-value">{character.raceName}</div></div><div className="sheet-info-box"><div className="info-label">Background</div><div className="info-value">{character.backgroundName || "None"}</div></div><div className="sheet-info-box"><div className="info-label">XP</div><div className="info-value">{character.xp}</div></div></div></div>
            </div>
          )}

          {activeTab === "party" && (
            <div>
              <h2>Party</h2>
              {!party ? (
                <div>
                  <form onSubmit={createParty} style={{ marginBottom: 20, display: "flex", gap: 10 }}><input className="game-input" placeholder="Party name..." value={partyName} onChange={(e) => setPartyName(e.target.value)} /><button className="button primary" type="submit">Create Party</button></form>
                  <div className="section-label">Available Parties</div>
                  {partyList.length === 0 ? <p style={{ color: "var(--mist)" }}>No parties yet.</p> : partyList.map((p) => (
                    <div key={p.id} className="quest-card"><div className="quest-info"><div className="quest-name">{p.name}</div><div className="quest-meta"><span>{p.memberCount}/{p.maxMembers} members</span><span>Leader: {p.leaderName}</span></div></div><button className="quest-start-btn" onClick={() => joinParty(p.id)}>Join</button></div>
                  ))}
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><h3 style={{ color: "var(--gold-light)" }}>{party.name}</h3><div style={{ display: "flex", gap: 10 }}><button className="combat-btn flee" onClick={leaveParty}>Leave</button>{party.leaderId === character.id && <button className="combat-btn flee" onClick={disbandParty}>Disband</button>}</div></div>
                  <div className="section-label">Members ({party.members.length}/{party.maxMembers})</div>
                  {party.members.map((m) => {
                    const mHpPct = Math.round((m.currentHp / m.maxHp) * 100);
                    const mHpCls = mHpPct > 60 ? "healthy" : mHpPct > 30 ? "wounded" : "danger";
                    return (
                      <div key={m.id} className="quest-active-card"><div className="quest-name">{party.leaderId === m.id && "👑 "}{m.name} <span style={{ fontSize: 12, color: "var(--mist)" }}>Lv{m.level} {m.raceName} {m.className}</span></div><div className="hp-bar-track" style={{ marginTop: 8 }}><div className={`hp-bar-fill ${mHpCls}`} style={{ width: `${mHpPct}%` }} /></div><div style={{ fontSize: 12, color: "var(--mist)", marginTop: 4 }}>HP {m.currentHp}/{m.maxHp} · {m.location} · {m.status}</div></div>
                    );
                  })}
                  <form onSubmit={invitePlayer} style={{ marginTop: 20, display: "flex", gap: 10 }}><input className="game-input" placeholder="Player name to invite..." value={inviteName} onChange={(e) => setInviteName(e.target.value)} /><button className="button primary" type="submit">Invite</button></form>
                </div>
              )}
            </div>
          )}

          {activeTab === "trade" && (
            <div>
              <h2>Trade</h2>
              {tradeMessage && <p style={{ color: "var(--gold-light)", marginBottom: 10 }}>{tradeMessage}</p>}
              <div className="section-label">Pending Trades</div>
              {pendingTrades.length === 0 ? <p style={{ color: "var(--mist)", marginBottom: 20 }}>No pending trades.</p> : pendingTrades.map((t) => (
                <div key={t.id} className="quest-card"><div className="quest-info"><div className="quest-name">{t.fromCharName} → {t.toCharName}</div><div className="quest-meta"><span>Gold: {t.fromGold}↔{t.toGold}</span><span>Status: {t.status}</span><span>{new Date(t.createdAt).toLocaleString()}</span></div></div><div style={{ display: "flex", gap: 8 }}><button className="combat-btn attack" onClick={() => respondTrade(t.id, true)}>Accept</button><button className="combat-btn flee" onClick={() => respondTrade(t.id, false)}>Decline</button></div></div>
              ))}
              <div className="section-label" style={{ marginTop: 20 }}>Send Trade Request</div>
              <form onSubmit={sendTrade}>
                <input className="game-input" placeholder="Target player name..." value={tradeTarget} onChange={(e) => setTradeTarget(e.target.value)} style={{ marginBottom: 10, width: "100%" }} />
                <div style={{ marginBottom: 10 }}><span style={{ color: "var(--mist)", fontSize: 13 }}>Offer Gold:</span><input type="number" className="game-input" value={tradeGold} onChange={(e) => setTradeGold(Number(e.target.value))} style={{ width: 120, marginLeft: 10 }} /></div>
                <div style={{ marginBottom: 10, color: "var(--mist)", fontSize: 13 }}>Offer Items:</div>
                {inventory.filter(i => !i.equipped).map((item) => (
                  <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, color: "var(--parchment)", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={tradeItems.includes(item.id)} onChange={(e) => setTradeItems(e.target.checked ? [...tradeItems, item.id] : tradeItems.filter((id) => id !== item.id))} />
                    {item.name} {item.quantity > 1 ? `x${item.quantity}` : ""}
                  </label>
                ))}
                <button className="button primary" type="submit" style={{ marginTop: 10 }}>Send Trade</button>
              </form>
            </div>
          )}

          {activeTab === "chat" && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <h2>Chat</h2>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {(["party", "faction", "global"] as const).map((ch) => (
                  <button key={ch} className={`game-tab ${chatChannel === ch ? "active" : ""}`} onClick={() => setChatChannel(ch)}>{ch.charAt(0).toUpperCase() + ch.slice(1)}</button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: "auto", maxHeight: 400, background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                {chatMessages.length === 0 ? <p style={{ color: "var(--mist)", textAlign: "center" }}>No messages yet.</p> : chatMessages.map((m) => (
                  <div key={m.id} style={{ marginBottom: 10 }}><span style={{ color: "var(--gold-light)", fontWeight: 600 }}>{m.senderName}</span><span style={{ color: "var(--mist)", fontSize: 11, marginLeft: 8 }}>{new Date(m.createdAt).toLocaleTimeString()}</span><div style={{ color: "var(--parchment)", fontSize: 14, marginTop: 2 }}>{m.message}</div></div>
                ))}
              </div>
              <form onSubmit={sendChat} style={{ display: "flex", gap: 8 }}><input className="game-input" placeholder="Type a message..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} style={{ flex: 1 }} /><button className="button primary" type="submit">Send</button></form>
            </div>
          )}

          {activeTab === "leaderboard" && (
            <div>
              <h2>Leaderboard</h2>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {(["level", "gold", "quests", "xp"] as const).map((t) => (<button key={t} className={`game-tab ${leaderboardType === t ? "active" : ""}`} onClick={() => setLeaderboardType(t)}>{t.toUpperCase()}</button>))}
              </div>
              {leaderboard.map((e) => (
                <div key={e.rank} className={e.isMe ? "quest-active-card" : "quest-card"} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div className="stat-box" style={{ minWidth: 50 }}><div className="stat-label">Rank</div><div className="stat-value">#{e.rank}</div></div>
                  <div className="quest-info"><div className="quest-name">{e.isMe ? "⭐ " : ""}{e.charName}</div><div className="quest-meta"><span>Lv{e.level}</span><span>{e.raceName} {e.className}</span><span style={{ color: "var(--gold-light)" }}>{e.value.toLocaleString()}</span></div></div>
                </div>
              ))}
              {leaderboard.length === 0 && <p style={{ color: "var(--mist)" }}>No entries.</p>}
            </div>
          )}

          {activeTab === "world events" && (
            <div>
              <h2>World Events</h2>
              {activeEvent && (
                <div style={{ marginBottom: 24, padding: 16, background: "rgba(139,0,0,0.15)", border: "1px solid var(--blood)", borderRadius: 8 }}>
                  <h3 style={{ color: "var(--blood)", marginBottom: 8 }}>⚔️ {activeEvent.name}</h3>
                  <div className="enemy-display">
                    <div className="enemy-name">{activeEvent.enemyName}</div>
                    <div className="enemy-stats"><div className="stat"><div className="stat-label">HP</div><div className="stat-value">{activeEvent.enemyHp}/{activeEvent.enemyMaxHp}</div></div><div className="stat"><div className="stat-label">AC</div><div className="stat-value">{activeEvent.enemyAc}</div></div></div>
                    <div className="enemy-hp-track"><div className="enemy-hp-fill" style={{ width: `${Math.round((activeEvent.enemyHp / activeEvent.enemyMaxHp) * 100)}%` }} /></div>
                  </div>
                  <div style={{ marginTop: 8, color: "var(--mist)", fontSize: 13 }}>Participants: {activeEvent.participantCount} · Total Damage: {activeEvent.totalDamage}</div>
                  <button className="combat-btn attack" onClick={() => attackWorldEvent(activeEvent.id)} style={{ marginTop: 12 }}>Attack</button>
                </div>
              )}
              <div className="section-label">Active Events</div>
              {worldEvents.length === 0 ? <p style={{ color: "var(--mist)" }}>No active events.</p> : worldEvents.map((ev) => (
                <div key={ev.id} className="quest-card">
                  <div className="quest-info">
                    <div className="quest-name">{ev.name}</div>
                    <div className="quest-desc">{ev.description}</div>
                    <div className="quest-meta">
                      <span>{ev.difficulty}</span><span>{ev.enemyName}</span><span>{ev.participantCount} joined</span><span>{ev.xpReward} XP</span><span>{ev.gpReward} GP</span>
                      <span style={{ color: "var(--mist)" }}>Expires: {new Date(ev.expiresAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <button className="quest-start-btn" onClick={() => { setActiveEvent(ev); joinWorldEvent(ev.id); }}>Join</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

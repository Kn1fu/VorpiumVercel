"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const RACES = [
  { id: 1, name: "Human", speed: 30, bonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 } },
  { id: 2, name: "Elf", speed: 30, bonuses: { dex: 2, wis: 1 } },
  { id: 3, name: "Dwarf", speed: 25, bonuses: { str: 2, con: 2 } },
  { id: 4, name: "Halfling", speed: 25, bonuses: { dex: 2, con: 1 } },
  { id: 5, name: "Dragonborn", speed: 30, bonuses: { str: 2, cha: 1 } },
  { id: 6, name: "Tiefling", speed: 30, bonuses: { int: 1, cha: 2 } },
  { id: 7, name: "Half-Elf", speed: 30, bonuses: { int: 1, wis: 1, cha: 2 } },
  { id: 8, name: "Half-Orc", speed: 30, bonuses: { str: 2, con: 1 } },
];

const CLASSES = [
  { id: 1, name: "Fighter", hitDie: 10, primaryStat: "STR" },
  { id: 2, name: "Rogue", hitDie: 8, primaryStat: "DEX" },
  { id: 3, name: "Wizard", hitDie: 6, primaryStat: "INT" },
  { id: 4, name: "Cleric", hitDie: 8, primaryStat: "WIS" },
  { id: 5, name: "Ranger", hitDie: 10, primaryStat: "DEX" },
  { id: 6, name: "Paladin", hitDie: 10, primaryStat: "CHA" },
  { id: 7, name: "Barbarian", hitDie: 12, primaryStat: "STR" },
  { id: 8, name: "Bard", hitDie: 8, primaryStat: "CHA" },
  { id: 9, name: "Druid", hitDie: 8, primaryStat: "WIS" },
  { id: 10, name: "Monk", hitDie: 8, primaryStat: "DEX" },
];

const BACKGROUNDS = [
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

type Step = "name" | "race" | "class" | "background" | "abilities" | "review";
const STEPS: Step[] = ["name", "race", "class", "background", "abilities", "review"];
const ABILITY_LABELS = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

export default function CreateCharacterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [selectedRace, setSelectedRace] = useState<number | null>(null);
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [selectedBackground, setSelectedBackground] = useState<number | null>(null);
  const [abilities, setAbilities] = useState([10, 10, 10, 10, 10, 10]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abilityMod = (score: number) => Math.floor((score - 10) / 2);
  const modStr = (score: number) => { const m = abilityMod(score); return m >= 0 ? `+${m}` : `${m}`; };

  const rollScores = () => {
    setAbilities(Array.from({ length: 6 }, () => {
      const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
      rolls.sort((a, b) => b - a);
      return rolls[0] + rolls[1] + rolls[2];
    }));
  };

  const race = RACES.find((r) => r.id === selectedRace);
  const cls = CLASSES.find((c) => c.id === selectedClass);
  const bg = BACKGROUNDS.find((b) => b.id === selectedBackground);

  const finalScores = race ? {
    str: abilities[0] + (race.bonuses.str || 0),
    dex: abilities[1] + (race.bonuses.dex || 0),
    con: abilities[2] + (race.bonuses.con || 0),
    int: abilities[3] + (race.bonuses.int || 0),
    wis: abilities[4] + (race.bonuses.wis || 0),
    cha: abilities[5] + (race.bonuses.cha || 0),
  } : null;

  const stepIdx = STEPS.indexOf(step);

  const createCharacter = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/game/character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, classId: selectedClass, raceId: selectedRace, backgroundId: selectedBackground, abilityScores: { str: abilities[0], dex: abilities[1], con: abilities[2], int: abilities[3], wis: abilities[4], cha: abilities[5] }, method: "roll" }),
      });
      if (res.ok) { router.push("/play"); } else { const d = await res.json(); setError(d.error || "Failed to create character"); }
    } catch { setError("Network error"); } finally { setSubmitting(false); }
  };

  return (
    <main style={{ background: "var(--obsidian)", minHeight: "100vh" }}>
      <nav className="create-nav">
        <div className="create-nav-inner">
          <div style={{ fontFamily: "Cinzel, serif", fontSize: 16, fontWeight: 800, letterSpacing: 6, color: "var(--gold)" }}>FEATHER QUEST</div>
          <div className="create-progress">
            {STEPS.map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div className={`progress-dot ${step === s ? "active" : i < stepIdx ? "done" : ""}`}>{i < stepIdx ? "✓" : i + 1}</div>
                {i < 5 && <div className={`progress-line ${i < stepIdx ? "done" : ""}`} />}
              </div>
            ))}
          </div>
        </div>
      </nav>

      {error && <div className="error-box" style={{ maxWidth: 700, margin: "30px auto 0" }}>{error}</div>}

      <section className="create-section">
        {step === "name" && (
          <div>
            <h1>Name Your Character</h1>
            <p className="subtitle-text">Choose a name that will be known throughout the realm.</p>
            <input className="name-input" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Enter your character's name..." />
            <p className="name-hint">3-24 characters</p>
            <div className="create-nav-buttons">
              <button className="btn-next" disabled={name.length < 3} onClick={() => setStep("race")}>Continue</button>
            </div>
          </div>
        )}

        {step === "race" && (
          <div>
            <h1>Choose Your Race</h1>
            <p className="subtitle-text">Your race determines your innate abilities and speed.</p>
            <div className="selection-grid">
              {RACES.map((r) => (
                <button key={r.id} onClick={() => setSelectedRace(r.id)} className={`selection-card ${selectedRace === r.id ? "selected" : ""}`}>
                  <div className="card-name">{r.name}</div>
                  <div className="card-meta">{r.speed}ft · {Object.entries(r.bonuses).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(", ")}</div>
                </button>
              ))}
            </div>
            <div className="create-nav-buttons">
              <button className="btn-back" onClick={() => setStep("name")}>Back</button>
              <button className="btn-next" disabled={!selectedRace} onClick={() => setStep("class")}>Continue</button>
            </div>
          </div>
        )}

        {step === "class" && (
          <div>
            <h1>Choose Your Class</h1>
            <p className="subtitle-text">Your class determines your combat style and special abilities.</p>
            <div className="selection-grid">
              {CLASSES.map((c) => (
                <button key={c.id} onClick={() => setSelectedClass(c.id)} className={`selection-card ${selectedClass === c.id ? "selected" : ""}`}>
                  <div className="card-name">{c.name}</div>
                  <div className="card-meta">d{c.hitDie} · {c.primaryStat}</div>
                </button>
              ))}
            </div>
            <div className="create-nav-buttons">
              <button className="btn-back" onClick={() => setStep("race")}>Back</button>
              <button className="btn-next" disabled={!selectedClass} onClick={() => setStep("background")}>Continue</button>
            </div>
          </div>
        )}

        {step === "background" && (
          <div>
            <h1>Choose Your Background</h1>
            <p className="subtitle-text">Your background gives you skill proficiencies and shapes your story.</p>
            <div className="selection-grid">
              {BACKGROUNDS.map((b) => (
                <button key={b.id} onClick={() => setSelectedBackground(b.id)} className={`selection-card ${selectedBackground === b.id ? "selected" : ""}`}>
                  <div className="card-name">{b.name}</div>
                  <div className="card-meta">{b.skills.join(", ")}</div>
                </button>
              ))}
            </div>
            <div className="create-nav-buttons">
              <button className="btn-back" onClick={() => setStep("class")}>Back</button>
              <button className="btn-next" disabled={!selectedBackground} onClick={() => { rollScores(); setStep("abilities"); }}>Continue</button>
            </div>
          </div>
        )}

        {step === "abilities" && (
          <div>
            <h1>Ability Scores</h1>
            <p className="subtitle-text">Roll 4d6 drop lowest for each ability score, or reroll all.</p>
            <div className="ability-grid">
              {abilities.map((score, i) => {
                const bonus = race?.bonuses ? Object.values(race.bonuses)[i] || 0 : 0;
                const final = score + bonus;
                return (
                  <div key={i} className="ability-box">
                    <div className="ability-label">{ABILITY_LABELS[i]}</div>
                    <div className="ability-score">{score}</div>
                    <div className="ability-mod">{modStr(final)}</div>
                    {bonus > 0 && <div className="ability-racial">+{bonus} racial</div>}
                  </div>
                );
              })}
            </div>
            <button className="reroll-btn" onClick={rollScores}>Reroll All</button>
            <div className="create-nav-buttons">
              <button className="btn-back" onClick={() => setStep("background")}>Back</button>
              <button className="btn-next" onClick={() => setStep("review")}>Continue</button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div>
            <h1>Review Your Character</h1>
            <p className="subtitle-text">Make sure everything looks right before entering the world.</p>
            <div className="review-panel">
              <h2>{name}</h2>
              <div className="review-subtitle">Level 1 {race?.name} {cls?.name}</div>
              <div className="review-bg">Background: {bg?.name}</div>
              {finalScores && (
                <div className="review-abilities">
                  {ABILITY_LABELS.map((label, i) => (
                    <div key={i} className="review-ability">
                      <div className="r-label">{label}</div>
                      <div className="r-score">{Object.values(finalScores)[i]}</div>
                      <div className="r-mod">{modStr(Object.values(finalScores)[i])}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="create-nav-buttons">
              <button className="btn-back" onClick={() => setStep("abilities")}>Back</button>
              <button className="btn-create" disabled={submitting} onClick={createCharacter}>{submitting ? "Creating..." : "Create Character"}</button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

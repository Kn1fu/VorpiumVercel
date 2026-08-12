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
  const modStr = (score: number) => {
    const mod = abilityMod(score);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };

  const rollScores = () => {
    const newScores = Array.from({ length: 6 }, () => {
      const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
      rolls.sort((a, b) => b - a);
      return rolls[0] + rolls[1] + rolls[2];
    });
    setAbilities(newScores);
  };

  const race = RACES.find((r) => r.id === selectedRace);
  const cls = CLASSES.find((c) => c.id === selectedClass);

  const finalScores = race
    ? {
        str: abilities[0] + (race.bonuses.str || 0),
        dex: abilities[1] + (race.bonuses.dex || 0),
        con: abilities[2] + (race.bonuses.con || 0),
        int: abilities[3] + (race.bonuses.int || 0),
        wis: abilities[4] + (race.bonuses.wis || 0),
        cha: abilities[5] + (race.bonuses.cha || 0),
      }
    : null;

  const createCharacter = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/game/character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          classId: selectedClass,
          raceId: selectedRace,
          backgroundId: selectedBackground,
          abilityScores: {
            str: abilities[0],
            dex: abilities[1],
            con: abilities[2],
            int: abilities[3],
            wis: abilities[4],
            cha: abilities[5],
          },
          method: "roll",
        }),
      });

      if (res.ok) {
        router.push("/play");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create character");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const abilityLabels = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="text-xl font-bold tracking-[0.25em]">
            FEATHER QUEST
          </div>
        </div>
      </nav>

      <section className="max-w-3xl mx-auto px-6 py-12">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-10">
          {(["name", "race", "class", "background", "abilities", "review"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  step === s
                    ? "bg-indigo-500"
                    : i < ["name", "race", "class", "background", "abilities", "review"].indexOf(step)
                      ? "bg-green-500"
                      : "bg-white/10"
                }`}
              >
                {i + 1}
              </div>
              {i < 5 && <div className="w-8 h-px bg-white/20" />}
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 text-red-400">
            {error}
          </div>
        )}

        {/* STEP: Name */}
        {step === "name" && (
          <div>
            <h1 className="text-4xl font-bold mb-4">Name Your Character</h1>
            <p className="text-gray-400 mb-8">
              Choose a name that will be known throughout the realm.
            </p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder="Enter your character's name..."
              className="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-white placeholder:text-gray-600 outline-none focus:border-indigo-400 transition text-lg"
            />
            <p className="text-xs text-gray-500 mt-2">3-24 characters</p>
            <button
              onClick={() => name.length >= 3 && setStep("race")}
              disabled={name.length < 3}
              className="mt-8 px-8 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
            >
              CONTINUE
            </button>
          </div>
        )}

        {/* STEP: Race */}
        {step === "race" && (
          <div>
            <h1 className="text-4xl font-bold mb-4">Choose Your Race</h1>
            <p className="text-gray-400 mb-8">
              Your race determines your innate abilities and speed.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {RACES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRace(r.id)}
                  className={`text-left p-4 rounded-xl border transition ${
                    selectedRace === r.id
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {r.speed}ft •{" "}
                    {Object.entries(r.bonuses)
                      .map(([k, v]) => `+${v} ${k.toUpperCase()}`)
                      .join(", ")}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setStep("name")}
                className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition"
              >
                Back
              </button>
              <button
                onClick={() => selectedRace && setStep("class")}
                disabled={!selectedRace}
                className="px-8 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
              >
                CONTINUE
              </button>
            </div>
          </div>
        )}

        {/* STEP: Class */}
        {step === "class" && (
          <div>
            <h1 className="text-4xl font-bold mb-4">Choose Your Class</h1>
            <p className="text-gray-400 mb-8">
              Your class determines your combat style and special abilities.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {CLASSES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClass(c.id)}
                  className={`text-left p-4 rounded-xl border transition ${
                    selectedClass === c.id
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    d{c.hitDie} • {c.primaryStat}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setStep("race")}
                className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition"
              >
                Back
              </button>
              <button
                onClick={() => selectedClass && setStep("background")}
                disabled={!selectedClass}
                className="px-8 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
              >
                CONTINUE
              </button>
            </div>
          </div>
        )}

        {/* STEP: Background */}
        {step === "background" && (
          <div>
            <h1 className="text-4xl font-bold mb-4">Choose Your Background</h1>
            <p className="text-gray-400 mb-8">
              Your background gives you skill proficiencies and shapes your story.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {BACKGROUNDS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBackground(b.id)}
                  className={`text-left p-4 rounded-xl border transition ${
                    selectedBackground === b.id
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <div className="font-semibold">{b.name}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {b.skills.join(", ")}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setStep("class")}
                className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition"
              >
                Back
              </button>
              <button
                onClick={() => selectedBackground && setStep("abilities")}
                disabled={!selectedBackground}
                className="px-8 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
              >
                CONTINUE
              </button>
            </div>
          </div>
        )}

        {/* STEP: Abilities */}
        {step === "abilities" && (
          <div>
            <h1 className="text-4xl font-bold mb-4">Ability Scores</h1>
            <p className="text-gray-400 mb-8">
              Roll 4d6 drop lowest for each ability score, or reroll all.
            </p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              {abilities.map((score, i) => {
                const bonus = race?.bonuses ? Object.values(race.bonuses)[i] || 0 : 0;
                const final = score + bonus;
                return (
                  <div key={i} className="bg-white/5 rounded-xl p-4 text-center">
                    <div className="text-xs text-gray-400 mb-1">{abilityLabels[i]}</div>
                    <div className="text-3xl font-bold">{score}</div>
                    {bonus > 0 && (
                      <div className="text-xs text-green-400">+{bonus} racial</div>
                    )}
                    <div className="text-sm text-gray-400 mt-1">
                      Final: {final} ({modStr(final)})
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={rollScores}
              className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition mb-8"
            >
              🎲 Reroll All
            </button>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("background")}
                className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition"
              >
                Back
              </button>
              <button
                onClick={() => setStep("review")}
                className="px-8 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 transition font-semibold"
              >
                CONTINUE
              </button>
            </div>
          </div>
        )}

        {/* STEP: Review */}
        {step === "review" && (
          <div>
            <h1 className="text-4xl font-bold mb-4">Review Your Character</h1>
            <p className="text-gray-400 mb-8">
              Make sure everything looks right before entering the world.
            </p>

            <div className="bg-white/5 rounded-xl p-6 mb-6">
              <h2 className="text-2xl font-bold mb-2">{name}</h2>
              <p className="text-gray-400">
                Level 1 {race?.name} {cls?.name}
              </p>
              <p className="text-sm text-gray-500">
                Background: {BACKGROUNDS.find((b) => b.id === selectedBackground)?.name}
              </p>
            </div>

            {finalScores && (
              <div className="grid grid-cols-3 gap-3 mb-6">
                {abilityLabels.map((label, i) => (
                  <div key={i} className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-400">{label}</div>
                    <div className="text-xl font-bold">{Object.values(finalScores)[i]}</div>
                    <div className="text-xs text-gray-400">{modStr(Object.values(finalScores)[i])}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep("abilities")}
                className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition"
              >
                Back
              </button>
              <button
                onClick={createCharacter}
                disabled={submitting}
                className="px-8 py-3 rounded-xl bg-green-500 hover:bg-green-600 disabled:opacity-50 transition font-semibold"
              >
                {submitting ? "CREATING..." : "CREATE CHARACTER"}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

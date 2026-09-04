"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatLoad } from "../../lib/load";
import { Sparkline } from "../components/Sparkline";
import type { HistoryPoint } from "../../lib/progress";
import type { PlanRow } from "../../lib/plans";
import type { LoadType, MetricType, PlanItem } from "../../lib/types";
import { fmtDay } from "../../lib/date-format";

export interface RegistryRow {
  id: number;
  canonical_name: string;
  family: string | null;
  default_load_type: LoadType;
  primary_metric: MetricType;
}

type Card = {
  key: string;
  block: string | null;
  label: string | null;
  exercise: string;
  // The prescription, kept verbatim so the delta against what was done stays visible.
  presc: { sets: number | null; reps: string | null; tempo: string | null; cue: string | null } | null;
  sets: string;
  reps: string;
  load_type: LoadType;
  load_value: string;   // always entered positive; assisted is negated on submit
  metric_type: MetricType;
  skipped: boolean;
  note: string;
};

// Three buttons, not four. `added` and `external` are the same thing to every
// query that reads them — the sign is what carries meaning: positive is load,
// negative is assistance. `external` survives in the DB and in what the
// generator prescribes, so it maps onto the same button rather than vanishing.
const LOAD_TYPES: Array<{ v: LoadType; l: string }> = [
  { v: "bodyweight", l: "BW" },
  { v: "added", l: "kg" },
  { v: "assisted", l: "assist" },
];
const loadButton = (t: LoadType): LoadType => (t === "external" ? "added" : t);

let seq = 0;
const nextKey = () => `c${seq++}`;

function blankCard(exercise: string, reg?: RegistryRow): Card {
  return {
    key: nextKey(), block: null, label: null, exercise,
    presc: null, sets: "", reps: "",
    load_type: reg?.default_load_type ?? "bodyweight", load_value: "",
    metric_type: reg?.primary_metric ?? "reps",
    skipped: false, note: "",
  };
}

// `body` carries no loads and the older plans carry no items at all, so a lift's
// last logged load stands in — that is the number he is most likely to repeat or
// nudge, and the whole point is that he arrives at a form he only has to tweak.
// A load is always the total lifted, however many hands carry it.
function seedLoad(i: PlanItem, last?: HistoryPoint):
  { load_type: LoadType; load_value: string } {
  if (i.load_type && i.load_type !== "bodyweight") {
    return {
      load_type: i.load_type,
      load_value: i.load_value != null ? String(Math.abs(i.load_value)) : "",
    };
  }
  if (i.load_type === "bodyweight") return { load_type: "bodyweight", load_value: "" };
  if (last) {
    return {
      load_type: last.load_type as LoadType,
      load_value: last.load_value != null ? String(Math.abs(last.load_value)) : "",
    };
  }
  return { load_type: "bodyweight", load_value: "" };
}

function cardsFromPlan(items: PlanItem[], history: Record<string, HistoryPoint[]>): Card[] {
  return items.map((i) => ({
    key: nextKey(),
    block: i.block ?? null,
    label: i.label ?? null,
    exercise: i.exercise,
    presc: { sets: i.sets ?? null, reps: i.reps ?? null, tempo: i.tempo ?? null, cue: i.cue ?? null },
    sets: i.sets != null ? String(i.sets) : "",
    // Pre-fill reps with the top of the prescribed range — the number he's aiming at.
    reps: topOfRange(i.reps) ?? "",
    ...seedLoad(i, history[i.exercise]?.[0]),
    metric_type: i.metric_type ?? "reps",
    skipped: false,
    note: "",
  }));
}

function topOfRange(reps?: string | null): string | null {
  const nums = reps?.match(/\d+/g);
  return nums?.length ? nums[nums.length - 1] : null;
}

function prescriptionLine(p: Card["presc"]): string | null {
  if (!p) return null;
  const bits: string[] = [];
  if (p.sets != null && p.reps) bits.push(`${p.sets} × ${p.reps}`);
  else if (p.sets != null) bits.push(`${p.sets} sets`);
  else if (p.reps) bits.push(p.reps);
  if (p.tempo) bits.push(`@ ${p.tempo}`);
  return bits.length ? bits.join(" ") : null;
}

function signedLoad(c: Card): number | null {
  if (c.load_type === "bodyweight" || c.load_value === "") return null;
  const n = Math.abs(Number(c.load_value));
  return c.load_type === "assisted" ? -n : n;
}

const fmtDate = (d: string) => fmtDay(d);

type EntryResult = {
  canonical_name: string | null;
  resolution: string;
  written: boolean;
  is_pr: boolean;
  display: string;
  input: { exercise: string };
  candidates?: string[];
};

export function LogForm({ date, plan, items, registry, history }: {
  date: string;
  plan: PlanRow | null;
  items: PlanItem[];
  registry: RegistryRow[];
  history: Record<string, HistoryPoint[]>;
}) {
  const [cards, setCards] = useState<Card[]>(() => cardsFromPlan(items, history));
  const [region, setRegion] = useState<"U" | "L">((plan?.region as "U" | "L") ?? "U");
  const [type, setType] = useState<string>(plan?.stimulus ?? "");
  const [rpe, setRpe] = useState("");
  const [feel, setFeel] = useState("");
  const [muNote, setMuNote] = useState("");
  const [hist, setHist] = useState(history);
  const [results, setResults] = useState<EntryResult[] | null>(null);
  // Set once every entry is written. The form is torn down at that point so a
  // second tap can't re-submit a session that is already in the database.
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsPasscode, setNeedsPasscode] = useState(false);
  // The footer is sticky, so it must stay thumb-sized: RPE and the submit button
  // are always up; the rest of the session fields expand on demand.
  const [showSession, setShowSession] = useState(false);
  const [passcode, setPasscode] = useState("");
  const restored = useRef(false);

  const draftKey = `wa-log-draft:${date}:${region}`;

  // Draft survives a phone lock or an accidental reload mid-workout.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.cards?.length) setCards(d.cards);
      if (d.type) setType(d.type);
      if (d.rpe) setRpe(d.rpe);
      if (d.feel) setFeel(d.feel);
      if (d.muNote) setMuNote(d.muNote);
    } catch { /* a corrupt draft must never block logging */ }
  }, [draftKey]);

  useEffect(() => {
    if (!restored.current) return;
    // Clearing the form after a successful log would otherwise persist an empty
    // draft, and a reload would come back blank instead of re-rendering the plan.
    if (logged) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ cards, type, rpe, feel, muNote }));
    } catch { /* private mode / quota — not worth failing over */ }
  }, [draftKey, cards, type, rpe, feel, muNote, logged]);

  const byFamily = useMemo(() => {
    const groups = new Map<string, RegistryRow[]>();
    for (const r of registry) {
      const k = r.family ?? "Other";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [registry]);

  const patch = useCallback((key: string, p: Partial<Card>) => {
    setCards((cs) => cs.map((c) => (c.key === key ? { ...c, ...p } : c)));
  }, []);

  // Swapping a lift re-points the history strip; the fetch is per-swap, not per-card.
  const swapExercise = useCallback(async (key: string, name: string) => {
    const reg = registry.find((r) => r.canonical_name === name);
    patch(key, {
      exercise: name,
      load_type: reg?.default_load_type ?? "bodyweight",
      metric_type: reg?.primary_metric ?? "reps",
    });
    if (hist[name]) return;
    try {
      const res = await fetch(`/api/history?exercises=${encodeURIComponent(name)}`);
      const rows: Array<{ canonical_name: string; points: HistoryPoint[] }> = await res.json();
      setHist((h) => ({ ...h, ...Object.fromEntries(rows.map((r) => [r.canonical_name, r.points])) }));
    } catch { /* history is a nicety; never block logging on it */ }
  }, [hist, patch, registry]);

  async function submit() {
    setBusy(true);
    setError(null);
    const payload = {
      date, region,
      type: type || undefined,
      rpe: rpe === "" ? undefined : Number(rpe),
      feel: feel || undefined,
      mu_note: muNote || undefined,
      entries: cards
        .filter((c) => c.exercise && (c.skipped || c.reps !== ""))
        .map((c) => ({
          exercise: c.exercise,
          metric: c.skipped ? 0 : Number(c.reps),
          metric_type: c.metric_type,
          load_type: c.load_type,
          load_value: signedLoad(c),
          sets: c.sets === "" ? null : Number(c.sets),
          skipped: c.skipped,
          notes: c.note.trim() || undefined,
        })),
    };
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) { setNeedsPasscode(true); setBusy(false); return; }
      if (!res.ok) { setError((await res.json())?.error ?? `failed (${res.status})`); setBusy(false); return; }
      const json = await res.json();
      setResults(json.results as EntryResult[]);
      // Only a clean sweep clears the form; if anything needs confirmation the
      // cards have to stay put so it can be fixed and re-sent.
      if (json.results.every((r: EntryResult) => r.written)) {
        try { localStorage.removeItem(draftKey); } catch { /* nothing to clear */ }
        setLogged(true);
        setCards([]);
        setRpe(""); setFeel(""); setMuNote("");
      }
    } catch {
      setError("network error — nothing was written");
    }
    setBusy(false);
  }

  async function unlock() {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    if (res.ok) { setNeedsPasscode(false); setPasscode(""); await submit(); return; }
    const j = await res.json().catch(() => ({}));
    setError(res.status === 429 ? `locked out — retry in ${j.retry_after_minutes ?? 15} min` : "wrong passcode");
  }

  const blocks = useMemo(() => {
    const out: Array<{ block: string | null; cards: Card[] }> = [];
    for (const c of cards) {
      const last = out[out.length - 1];
      if (last && last.block === c.block) last.cards.push(c);
      else out.push({ block: c.block, cards: [c] });
    }
    return out;
  }, [cards]);

  return (
    <>
      {!plan && (
        <p className="empty center rise" style={{ marginBottom: 18 }}>
          No plan logged for {date}. Add exercises below.
        </p>
      )}
      {/* Only when nothing could be parsed out of the body — otherwise the cards
          are the prescription and repeating it as text is noise. */}
      {plan && !items.length && (
        <section className="card rise" style={{ marginBottom: 18 }}>
          <div className="card-title">Prescribed</div>
          <pre className="log-plan-body">{plan.body}</pre>
        </section>
      )}

      {!logged && blocks.map((b, bi) => (
        <section key={`${b.block ?? "x"}-${bi}`}>
          {b.block && <div className="log-block-title">Block {b.block}</div>}
          {b.cards.map((c) => (
            <LogCard
              key={c.key}
              card={c}
              byFamily={byFamily}
              points={hist[c.exercise] ?? []}
              result={results?.find((r) => r.input.exercise === c.exercise)}
              onPatch={(p) => patch(c.key, p)}
              onSwap={(name) => swapExercise(c.key, name)}
              onRemove={() => setCards((cs) => cs.filter((x) => x.key !== c.key))}
            />
          ))}
        </section>
      ))}

      {!logged && (
        <button
          type="button"
          className="log-add"
          onClick={() => setCards((cs) => [...cs, blankCard(registry[0]?.canonical_name ?? "", registry[0])])}
        >
          ＋ add exercise
        </button>
      )}

      {results && (
        <section className="card rise log-results">
          <div className="card-title">Logged {date}</div>
          {results.map((r, i) => (
            <div key={i} className={`log-result${r.written ? "" : " warn"}`}>
              {r.written ? r.display : `${r.input.exercise} — needs confirmation${r.candidates?.length ? ` (did you mean ${r.candidates[0]}?)` : ""}`}
              {r.is_pr && <span className="log-pr">⬆ PR</span>}
            </div>
          ))}
          {logged && (
            <div className="log-done">
              <span>Saved. The form is cleared so this session can&rsquo;t be logged twice.</span>
              <a className="log-done-link" href="/">Dashboard &rarr;</a>
            </div>
          )}
        </section>
      )}

      {!logged && (
      <div className="log-footer">
        {showSession && (
          <>
            <div className="log-footer-row">
              <Segmented
                value={region}
                options={[{ v: "U", l: "Upper" }, { v: "L", l: "Lower" }]}
                onChange={(v) => setRegion(v as "U" | "L")}
              />
              <Segmented
                value={type}
                options={[{ v: "Strength", l: "Str" }, { v: "Hypertrophy", l: "Hyp" }, { v: "Volume", l: "Vol" }]}
                onChange={setType}
              />
            </div>
            <label className="log-field">
              <span>Feel</span>
              <input value={feel} placeholder="how it went, any niggles"
                onChange={(e) => setFeel(e.target.value)} />
            </label>
            {region === "U" && (
              <label className="log-field">
                <span>MU note</span>
                <input value={muNote} placeholder="chest to bar? where did the rep break?"
                  onChange={(e) => setMuNote(e.target.value)} />
              </label>
            )}
          </>
        )}
        <div className="log-footer-row">
          <label className={`log-field rpe${rpe === "" ? " required" : ""}`}>
            <span>RPE</span>
            <input
              inputMode="numeric" value={rpe} placeholder="1-10"
              onChange={(e) => setRpe(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
            />
          </label>
          <button type="button" className="log-details" onClick={() => setShowSession((v) => !v)}>
            {showSession ? "hide" : `${region === "U" ? "Upper" : "Lower"}${type ? ` · ${type}` : ""} ▾`}
          </button>
        </div>
        {error && <div className="log-error">{error}</div>}
        <button type="button" className="log-submit" disabled={busy} onClick={submit}>
          {busy ? "Logging…" : "Log session"}
        </button>
      </div>
      )}

      {needsPasscode && (
        <div className="log-overlay">
          <div className="card">
            <div className="card-title">Passcode</div>
            <input
              className="log-passcode" autoFocus inputMode="numeric" type="password"
              value={passcode} placeholder="······"
              onChange={(e) => setPasscode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
              onKeyDown={(e) => { if (e.key === "Enter") unlock(); }}
            />
            {error && <div className="log-error">{error}</div>}
            <button type="button" className="log-submit" onClick={unlock}>Unlock &amp; log</button>
          </div>
        </div>
      )}
    </>
  );
}

function Segmented({ value, options, onChange }: {
  value: string;
  options: Array<{ v: string; l: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="log-seg">
      {options.map((o) => (
        <button
          key={o.v} type="button"
          className={value === o.v ? "active" : ""}
          onClick={() => onChange(o.v)}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function LogCard({ card: c, byFamily, points, result, onPatch, onSwap, onRemove }: {
  card: Card;
  byFamily: Array<[string, RegistryRow[]]>;
  points: HistoryPoint[];
  result?: EntryResult;
  onPatch: (p: Partial<Card>) => void;
  onSwap: (name: string) => void;
  onRemove: () => void;
}) {
  const [showNote, setShowNote] = useState(false);
  const presc = prescriptionLine(c.presc);
  const spark = points
    .map((p) => ({ t: new Date(p.date).getTime(), label: fmtDate(p.date), v: Number(p.metric_value) }))
    .reverse();

  return (
    <div className={`log-card${c.skipped ? " skipped" : ""}`}>
      <div className="log-card-head">
        {c.label && <span className="log-slot">{c.label}</span>}
        <select
          className="log-select" value={c.exercise}
          onChange={(e) => onSwap(e.target.value)}
        >
          {!c.exercise && <option value="">— pick a lift —</option>}
          {byFamily.map(([family, rows]) => (
            <optgroup key={family} label={family}>
              {rows.map((r) => <option key={r.id} value={r.canonical_name}>{r.canonical_name}</option>)}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          className={`log-skip${c.skipped ? " on" : ""}`}
          onClick={() => onPatch({ skipped: !c.skipped })}
        >
          {c.skipped ? "skipped" : "skip"}
        </button>
        {!c.presc && (
          <button type="button" className="log-skip" onClick={onRemove} aria-label="remove">✕</button>
        )}
      </div>

      {(presc || c.presc?.cue) && (
        <div className="log-presc">
          {presc && <span className="log-presc-spec">{presc}</span>}
          {/* Cue on its own line: the spec is what he reads mid-set, the cue is prose. */}
          {c.presc?.cue && <span className="log-presc-cue">{c.presc.cue}</span>}
        </div>
      )}

      {!c.skipped && (
        <>
          <div className="log-fields">
            <label className="log-field">
              <span>Sets</span>
              <input inputMode="numeric" value={c.sets}
                onChange={(e) => onPatch({ sets: e.target.value.replace(/[^\d]/g, "") })} />
            </label>
            <label className="log-field">
              <span>{c.metric_type === "reps" ? "Max reps" : c.metric_type === "seconds" ? "Seconds" : "Metres"}</span>
              <input inputMode="numeric" value={c.reps}
                onChange={(e) => onPatch({ reps: e.target.value.replace(/[^\d.]/g, "") })} />
            </label>
            {c.load_type !== "bodyweight" && (
              <label className="log-field">
                <span>{c.load_type === "assisted" ? "Assist kg" : "Load kg"}</span>
                <input inputMode="decimal" value={c.load_value}
                  onChange={(e) => onPatch({ load_value: e.target.value.replace(/[^\d.]/g, "") })} />
              </label>
            )}
          </div>

          <div className="log-fields">
            <Segmented
              value={loadButton(c.load_type)}
              options={LOAD_TYPES.map((t) => ({ v: t.v, l: t.l }))}
              // Tapping "kg" on a lift the generator prescribed as external leaves
              // it external — same button, no need to rewrite what it asked for.
              onChange={(v) => onPatch({
                load_type: v === "added" && c.load_type === "external" ? "external" : (v as LoadType),
              })}
            />
          </div>

          {showNote || c.note ? (
            <input
              className="log-note" value={c.note} placeholder="note"
              onChange={(e) => onPatch({ note: e.target.value })}
            />
          ) : (
            <button type="button" className="log-note-add" onClick={() => setShowNote(true)}>＋ note</button>
          )}

          <div className="log-hist">
            {points.length ? (
              <>
                <div className="log-hist-rows">
                  {points.slice(0, 5).map((p, i) => (
                    <div key={i} className="log-hist-row">
                      <span>{fmtDate(p.date)}</span>
                      <span>{formatLoad(p.load_type as LoadType, p.load_value, "kg")}</span>
                      <span>
                        {p.sets ? `${p.sets} × ` : ""}{p.metric_value}
                        {p.metric_type === "seconds" ? "s" : p.metric_type === "meters" ? "m" : ""}
                      </span>
                    </div>
                  ))}
                  {points[0]?.notes && <div className="log-hist-note">{points[0].notes}</div>}
                </div>
                {spark.length > 1 && (
                  <div className="log-hist-spark"><Sparkline data={spark} fmt={(v) => `${v}`} /></div>
                )}
              </>
            ) : (
              <div className="log-hist-empty">no history yet</div>
            )}
          </div>
        </>
      )}

      {result && !result.written && (
        <div className="log-error">
          unmatched{result.candidates?.length ? ` — did you mean ${result.candidates[0]}?` : ""}
        </div>
      )}
    </div>
  );
}

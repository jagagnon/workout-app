import { muscleUpLadder, stalledLifts, prBoard, recentSessions } from "../lib/progress";
import { LadderChart } from "./components/LadderChart";
import { StalledList } from "./components/StalledList";
import { PrBoard } from "./components/PrBoard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [ladder, stalled, prs, sessions] = await Promise.all([
    muscleUpLadder(), stalledLifts(), prBoard(), recentSessions(10),
  ]);
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Muscle-up ladder</h1>
      <LadderChart data={ladder as any} />
      <h2>Stalled lifts</h2>
      <StalledList rows={stalled as any} />
      <h2>PR board</h2>
      <PrBoard rows={prs as any} />
      <h2>Recent sessions</h2>
      <ul>
        {(sessions as any[]).map((s) => (
          <li key={s.id}>{s.date} {s.region ?? ""} {s.type ?? ""} — {(s.entries as any[]).length} exercises</li>
        ))}
      </ul>
    </main>
  );
}

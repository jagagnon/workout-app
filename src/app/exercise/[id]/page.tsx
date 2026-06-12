import { exerciseProgression } from "../../../lib/progress";
import { ProgressionChart } from "../../components/ProgressionChart";

export const dynamic = "force-dynamic";

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const name = decodeURIComponent(id);
  const data = await exerciseProgression(name);
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>{name}</h1>
      <ProgressionChart data={data as any} />
    </main>
  );
}

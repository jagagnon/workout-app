import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { logWorkout } from "../../../lib/log-workout";
import { exerciseProgression, muscleUpLadder, prBoard } from "../../../lib/progress";

const entrySchema = z.object({
  exercise: z.string(),
  metric: z.number(),
  metric_type: z.enum(["reps", "seconds", "meters"]).optional(),
  load_type: z.enum(["added", "assisted", "external", "bodyweight"]),
  load_value: z.number().nullable().optional(),
  load_unit: z.string().optional(),
  per_side: z.boolean().optional(),
  notes: z.string().optional(),
});

const handler = createMcpHandler((server) => {
  server.tool(
    "log_workout",
    "Log a training session's best-set-per-exercise actuals.",
    {
      date: z.string().optional(),
      region: z.enum(["U", "L"]).optional(),
      type: z.enum(["Strength", "Hypertrophy", "Volume"]).optional(),
      entries: z.array(entrySchema),
    },
    async (args) => {
      const res = await logWorkout(args);
      const lines = res.results.map((r) =>
        r.written
          ? `• ${r.display}${r.is_pr ? "  ⬆ PR" : ""}`
          : `⚠ '${r.input.exercise}' unmatched — candidates: ${(r.candidates ?? []).join(", ")}`,
      );
      return { content: [{ type: "text", text: `Logged ${res.date}\n${lines.join("\n")}` }] };
    },
  );

  server.tool(
    "get_progress",
    "Get progression for one exercise, or the muscle-up ladder.",
    { exercise: z.string().optional(), ladder: z.boolean().optional() },
    async ({ exercise, ladder }) => {
      const data = ladder ? await muscleUpLadder() : await exerciseProgression(exercise ?? "");
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },
  );

  server.tool("get_prs", "Get the PR board.", {}, async () => {
    return { content: [{ type: "text", text: JSON.stringify(await prBoard()) }] };
  });
});

export { handler as GET, handler as POST };

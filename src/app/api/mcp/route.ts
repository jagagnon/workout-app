import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { logWorkout } from "../../../lib/log-workout";
import { exerciseProgression, muscleUpLadder, prBoard, recentActuals } from "../../../lib/progress";
import { logPlan, recentPlans } from "../../../lib/plans";

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

const mcpHandler = createMcpHandler(
  (server) => {
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

    server.tool(
      "log_plan",
      "Save the prescribed plan for a session (the programmed exercise blocks) so future generations can rotate variety and read stimulus history. body = the verbatim W/A1/…/F block.",
      {
        date: z.string().optional(),
        region: z.enum(["U", "L"]),
        stimulus: z.enum(["Strength", "Hypertrophy", "Volume"]).optional(),
        body: z.string(),
      },
      async (args) => {
        const row = await logPlan(args);
        return {
          content: [{
            type: "text",
            text: `Plan saved ${row.date} ${row.region}${row.stimulus ? " · " + row.stimulus : ""}`,
          }],
        };
      },
    );

    server.tool(
      "get_recent_plans",
      "Get the last N prescribed plans for a region (U or L), newest first, regardless of stimulus — for stimulus rotation, variety checks, and MU-progression.",
      { region: z.enum(["U", "L"]), limit: z.number().optional() },
      async ({ region, limit }) => {
        const rows = await recentPlans(region, limit ?? 4);
        return { content: [{ type: "text", text: JSON.stringify(rows) }] };
      },
    );

    server.tool(
      "get_recent_sessions",
      "Get the last N actual sessions for a region (U or L), newest first — per-exercise results plus rpe, feel, and mu_note. Use to autoregulate: compare what was done vs prescribed, and read recent feel/MU notes.",
      { region: z.enum(["U", "L"]), limit: z.number().optional() },
      async ({ region, limit }) => {
        const rows = await recentActuals(region, limit ?? 4);
        return { content: [{ type: "text", text: JSON.stringify(rows) }] };
      },
    );
  },
  {},
  { streamableHttpEndpoint: "/api/mcp" },
);

async function authed(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const secret = process.env.MCP_SECRET;
  if (!secret || url.searchParams.get("key") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }
  return mcpHandler(req);
}

export { authed as GET, authed as POST };

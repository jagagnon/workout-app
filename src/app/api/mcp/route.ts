import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { logWorkout } from "../../../lib/log-workout";
import { addExercise } from "../../../lib/add-exercise";
import { deleteExercise } from "../../../lib/delete-exercise";
import { deleteEntry } from "../../../lib/delete-entry";
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
        rpe: z.number().optional(),
        feel: z.string().optional(),
        mu_note: z.string().optional(),
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
      "add_exercise",
      "Create a new canonical exercise. Only call this after the user confirms the exercise is genuinely new — not a typo or variant of one that already exists. Returns a collision error if the name (or an alias) already exists, and a warning if it merely resembles an existing exercise.",
      {
        canonical_name: z.string(),
        aliases: z.array(z.string()).optional(),
        primary_metric: z.enum(["reps", "seconds", "meters"]).optional(),
        default_load_type: z.enum(["added", "assisted", "external", "bodyweight"]).optional(),
        family: z.string().optional().describe(
          "Movement-variant group for the PR board (e.g. 'Row', 'Push-up', 'Pull-up', 'Dip') — only set if this is a variation of an existing tracked movement pattern, so it visually clusters with the others.",
        ),
      },
      async (args) => {
        const res = await addExercise(args);
        const text = res.created
          ? `✓ Created '${res.canonical_name}'${res.warning ? `  (note: similar to '${res.warning}')` : ""}`
          : `⚠ Not created — '${res.collision}' already exists. Use that, or re-send log_workout with the corrected name.`;
        return { content: [{ type: "text", text }] };
      },
    );

    server.tool(
      "delete_exercise",
      "Permanently delete a canonical exercise and all its logged entries — e.g. to remove a duplicate created by a mis-matched log (two names for the same movement). Matches by exact canonical name or alias only, never fuzzy. This is destructive and cannot be undone; confirm with the user before calling, especially if entries_removed would be > 0.",
      { canonical_name: z.string() },
      async ({ canonical_name }) => {
        const res = await deleteExercise(canonical_name);
        const text = res.deleted
          ? `✓ Deleted '${res.canonical_name}' and ${res.entries_removed} logged ${res.entries_removed === 1 ? "entry" : "entries"}.`
          : `⚠ No exercise found matching '${canonical_name}'.`;
        return { content: [{ type: "text", text }] };
      },
    );

    server.tool(
      "delete_entry",
      "Delete a single logged entry — one exercise's result within one session — without touching the canonical exercise or its other history. Use this instead of delete_exercise to undo a single mis-matched log (e.g. a session got logged under the wrong exercise) while keeping the rest of that exercise's history intact. Matches by exact canonical name or alias only, never fuzzy. Destructive and cannot be undone; confirm with the user before calling.",
      { date: z.string(), exercise: z.string(), region: z.enum(["U", "L"]).optional() },
      async ({ date, exercise, region }) => {
        const res = await deleteEntry(date, exercise, region);
        const text = res.deleted
          ? `✓ Deleted ${res.canonical_name} (${res.metric_value}) logged on ${date}.`
          : `⚠ ${res.error}`;
        return { content: [{ type: "text", text }] };
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

    server.tool(
      "get_prs",
      "Get the PR board (key calisthenics only). Pass all:true to include every tracked lift — needed to autoregulate lower-body days, which aren't on the visual board.",
      { all: z.boolean().optional() },
      async ({ all }) => {
        return { content: [{ type: "text", text: JSON.stringify(await prBoard(all ?? false)) }] };
      },
    );

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

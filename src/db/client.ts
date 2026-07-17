import postgres, { type Sql } from "postgres";

// Built lazily so importing this module never requires a DATABASE_URL. Vercel's
// build imports every route to collect page data; on Preview/Development deploys
// (where DATABASE_URL isn't set) an eager client threw at import and failed the
// whole build. postgres() opens no socket until the first query, so deferring
// construction costs nothing and the missing-URL error now surfaces at request
// time — where it's actionable — instead of at build time.
let client: Sql | undefined;

function getClient(): Sql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = postgres(url, { ssl: "require" });
  }
  return client;
}

export const sql = new Proxy(function () {} as unknown as Sql, {
  // sql`...` — the tagged-template call
  apply: (_t, _this, args: [TemplateStringsArray, ...unknown[]]) =>
    (getClient() as unknown as (...a: unknown[]) => unknown)(...args),
  // sql.end(), sql.begin(), etc. Skip `then` so the proxy is never mistaken for a
  // thenable and awaited into construction before a URL exists.
  get: (_t, prop) => {
    if (prop === "then") return undefined;
    const value = (getClient() as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

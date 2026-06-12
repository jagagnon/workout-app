export function checkBearer(req: Request): boolean {
  const token = process.env.API_BEARER_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${token}`;
}

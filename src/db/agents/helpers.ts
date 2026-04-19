import { getDb } from "../connection";

export function agentNameExistsInDb(name: string): boolean {
  return (
    getDb()
      .query("SELECT 1 FROM agents WHERE name = ? LIMIT 1")
      .get(name.trim()) != null
  );
}

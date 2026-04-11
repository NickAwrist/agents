export type PersonalizationFields = {
  name?: string;
  location?: string;
  preferredFormats?: string;
};

/** Returns a block to insert between agent system prompt and model warnings, or null if nothing to add. */
export function formatPersonalizationBlock(fields: PersonalizationFields): string | null {
  const name = fields.name?.trim();
  const location = fields.location?.trim();
  const preferredFormats = fields.preferredFormats?.trim();
  const lines: string[] = [];
  if (name) lines.push(`User name: ${name}`);
  if (location) lines.push(`Location: ${location}`);
  if (preferredFormats) lines.push(`Preferred response format: ${preferredFormats}`);
  if (lines.length === 0) return null;
  return ["--- User personalization ---", ...lines].join("\n");
}

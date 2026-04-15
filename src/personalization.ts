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

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  lines.push(`Current date and time: ${dateStr}, ${timeStr}`);

  return ["--- User personalization ---", ...lines].join("\n");
}

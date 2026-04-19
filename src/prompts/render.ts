/**
 * Pure, browser-safe system-prompt renderer. Stored agent templates may
 * contain `{{PERSONALIZATION}}`, `{{SESSION_DIRECTORY}}`, `{{OS}}` tokens;
 * missing values cause the token (and its surrounding blank line) to be
 * removed from the output.
 */

export type PersonalizationFields = {
  name?: string;
  location?: string;
  preferredFormats?: string;
  /** Optional override; defaults to `new Date()` at render time. */
  now?: Date;
};

export type PromptContext = {
  personalization?: PersonalizationFields;
  sessionDirectory?: string;
  os?: string;
};

/**
 * Invariant suffix appended to every agent's final system prompt. These
 * directives must always be present regardless of the user-authored template.
 * Lives in the browser-safe renderer module so the UI can append it locally
 * when showing the debug prompt (same string the server appends server-side).
 */
export const CORE_DIRECTIVES = [
  "<tool_format>",
  "When calling tools, output strictly valid JSON arguments. Do not use custom delimiters or markup.",
  "For multi-line string arguments (file contents, code), escape newlines as \\n or use an array of strings via the `lines` property when available.",
  "</tool_format>",
  "",
  "<agency>",
  "You are an action-oriented agent. When you decide on a next step, immediately execute it with a tool call.",
  "Never end your turn with only a plan or commentary — always follow through with the corresponding tool call unless the task is fully complete.",
  "</agency>",
].join("\n");

export const PROMPT_PLACEHOLDERS = {
  PERSONALIZATION: "{{PERSONALIZATION}}",
  SESSION_DIRECTORY: "{{SESSION_DIRECTORY}}",
  OS: "{{OS}}",
} as const;

export type PromptPlaceholderKey = keyof typeof PROMPT_PLACEHOLDERS;

export const PROMPT_PLACEHOLDER_LIST: Array<{
  key: PromptPlaceholderKey;
  token: string;
  description: string;
}> = [
  {
    key: "PERSONALIZATION",
    token: PROMPT_PLACEHOLDERS.PERSONALIZATION,
    description:
      "User name, location, preferred response format, and current date/time.",
  },
  {
    key: "SESSION_DIRECTORY",
    token: PROMPT_PLACEHOLDERS.SESSION_DIRECTORY,
    description: "Absolute working directory for this chat session.",
  },
  {
    key: "OS",
    token: PROMPT_PLACEHOLDERS.OS,
    description: "Operating system of the machine running the chat client.",
  },
];

function formatPersonalizationBlock(fields: PersonalizationFields): string {
  const name = fields.name?.trim();
  const location = fields.location?.trim();
  const preferredFormats = fields.preferredFormats?.trim();
  const lines: string[] = [];
  if (name) lines.push(`User name: ${name}`);
  if (location) lines.push(`Location: ${location}`);
  if (preferredFormats)
    lines.push(`Preferred response format: ${preferredFormats}`);

  const now = fields.now ?? new Date();
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

function formatSessionDirectoryBlock(absResolvedPath: string): string {
  return `--- Session context ---\nSession directory: ${absResolvedPath}`;
}

function formatOsBlock(os: string): string {
  return `OS: ${os}`;
}

function resolveValue(key: PromptPlaceholderKey, ctx: PromptContext): string {
  switch (key) {
    case "PERSONALIZATION": {
      const p = ctx.personalization;
      if (!p) return "";
      return formatPersonalizationBlock(p);
    }
    case "SESSION_DIRECTORY": {
      const dir = ctx.sessionDirectory?.trim();
      return dir ? formatSessionDirectoryBlock(dir) : "";
    }
    case "OS": {
      const os = ctx.os?.trim();
      return os ? formatOsBlock(os) : "";
    }
  }
}

/**
 * Replace each `{{TOKEN}}` with its rendered block, or with an empty string
 * when the value is absent. Consecutive blank lines produced by removed
 * tokens are collapsed to a single blank line, and leading/trailing
 * whitespace is trimmed.
 */
export function renderSystemPrompt(
  template: string,
  ctx: PromptContext,
): string {
  let out = template;
  for (const { key, token } of PROMPT_PLACEHOLDER_LIST) {
    if (!out.includes(token)) continue;
    const value = resolveValue(key, ctx);
    out = out.split(token).join(value);
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

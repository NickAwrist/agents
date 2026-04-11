/**
 * Copies text to the system clipboard. Uses the Clipboard API when allowed,
 * otherwise falls back to execCommand (works on plain HTTP / LAN IPs where
 * navigator.clipboard is unavailable or rejects).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* try fallback */
    }
  }
  return fallbackCopyText(text);
}

function fallbackCopyText(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    // Intentional legacy path for non-secure origins
    const execCommand = (document as unknown as { execCommand: (commandId: string) => boolean }).execCommand;
    ok = execCommand.call(document, "copy");
  } finally {
    document.body.removeChild(ta);
  }
  return ok;
}

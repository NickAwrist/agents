type UADataLowEntropy = { platform?: string };

/**
 * Best-effort client OS label. Uses the modern User-Agent Client Hints
 * API when available and falls back to a compact regex over `userAgent`.
 */
export function detectClientOs(): string {
  if (typeof navigator === "undefined") return "";

  const nav = navigator as Navigator & { userAgentData?: UADataLowEntropy };
  const uad = nav.userAgentData?.platform?.trim();
  if (uad) return uad;

  const ua = navigator.userAgent ?? "";
  if (/Windows NT 10/.test(ua)) return "Windows 10/11";
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) {
    const m = ua.match(/Mac OS X ([0-9_.]+)/);
    return m ? `macOS ${m[1]!.replace(/_/g, ".")}` : "macOS";
  }
  if (/Android/.test(ua)) return "Android";
  if (/(iPhone|iPad|iPod)/.test(ua)) return "iOS";
  if (/Linux/.test(ua)) return "Linux";
  return ua;
}

let cached: string | null = null;
export function getClientOs(): string {
  if (cached != null) return cached;
  cached = detectClientOs();
  return cached;
}

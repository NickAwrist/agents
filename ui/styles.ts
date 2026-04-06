export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const eyebrowText = "text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground";

export const primaryButton =
  "inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-[0.8125rem] font-semibold text-accent-foreground transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45";

export const secondaryButton =
  "inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-transparent px-3 py-2 text-[0.8125rem] text-foreground transition-colors duration-150 hover:border-border hover:bg-muted";

export const secondaryButtonSmall =
  "inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-transparent px-2 py-[5px] text-[0.75rem] text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-muted";

export const iconButton =
  "inline-flex size-9 items-center justify-center rounded-lg border border-border-subtle bg-transparent text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-muted hover:text-foreground";

export const modalShell =
  "fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[8px] sm:p-[10px]";

export const modalSurface =
  "grid max-h-[calc(100vh-32px)] grid-rows-[auto_minmax(0,1fr)] rounded-xl border border-border-subtle bg-surface";

export const modalHeader =
  "flex items-center justify-between gap-3 border-b border-border-subtle px-[18px] py-[14px] sm:px-3.5 sm:py-3.5";

export const modalCloseButton =
  "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground";

export const debugBlock =
  "rounded-lg border border-border-subtle bg-background px-[14px] py-3 text-[0.8125rem] leading-[1.6] text-foreground";

import { cx } from "../styles";
import ReactMarkdown from "react-markdown";

export function MarkdownMessage({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cx(
        "min-w-0 break-words text-[0.9375rem] leading-[1.65] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-accent [&_a:hover]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-[3px] [&_blockquote]:border-border [&_blockquote]:pl-[0.9em] [&_blockquote]:text-muted-foreground [&_code]:rounded-[4px] [&_code]:border [&_code]:border-border-subtle [&_code]:bg-muted [&_code]:px-[0.35em] [&_code]:py-[0.12em] [&_code]:text-[0.85em] [&_h1]:my-[0.75em] [&_h1]:mb-[0.4em] [&_h1]:text-[1.125rem] [&_h1]:font-semibold [&_h1]:leading-[1.3] [&_h1]:tracking-[-0.02em] [&_h2]:my-[0.75em] [&_h2]:mb-[0.4em] [&_h2]:text-[1.05rem] [&_h2]:font-semibold [&_h2]:leading-[1.3] [&_h2]:tracking-[-0.02em] [&_h3]:my-[0.75em] [&_h3]:mb-[0.4em] [&_h3]:text-[1rem] [&_h3]:font-semibold [&_h3]:leading-[1.3] [&_h3]:tracking-[-0.02em] [&_hr]:my-[0.85em] [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-border-subtle [&_li]:my-[0.2em] [&_ol]:my-2 [&_ol]:pl-[1.35em] [&_p]:my-2 [&_pre]:my-[0.65em] [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border-subtle [&_pre]:bg-background [&_pre]:px-3 [&_pre]:py-2.5 [&_pre]:text-[0.8125rem] [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit [&_table]:my-[0.65em] [&_table]:border-collapse [&_table]:text-[0.875rem] [&_td]:border [&_td]:border-border-subtle [&_td]:px-[10px] [&_td]:py-[6px] [&_th]:border [&_th]:border-border-subtle [&_th]:bg-muted [&_th]:px-[10px] [&_th]:py-[6px] [&_th]:text-left [&_th]:font-semibold [&_ul]:my-2 [&_ul]:pl-[1.35em]",
        className,
      )}
    >
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

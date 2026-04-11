import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown, { MarkdownHooks, type Components, type ExtraProps } from "react-markdown";
import rehypePrettyCode from "rehype-pretty-code";
import remarkGfm from "remark-gfm";
import { copyTextToClipboard } from "../lib/copyTextToClipboard";
import { cx } from "../styles";

const prettyCodeOptions = {
  theme: "github-dark-dimmed",
  keepBackground: false,
  grid: false,
  bypassInlineCode: true,
} as const;

const rehypePrettyCodePlugins = [[rehypePrettyCode, prettyCodeOptions]] as const;
const remarkPlugins = [remarkGfm] as const;

/** GFM tables need newline-separated rows; streamed/model text often uses a single line. */
function normalizeFlattenedPipeTables(markdown: string): string {
  if (markdown.includes("\n")) return markdown;
  const pipeRuns = markdown.match(/\|\s+\|/g);
  if (!pipeRuns || pipeRuns.length < 2) return markdown;
  return markdown.replace(/\|\s+\|/g, "|\n|");
}

const codeCopyBtn =
  "absolute right-2 top-2 z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-[opacity,transform,color,background-color] duration-200 ease-out opacity-0 group-hover/codeblock:opacity-100 hover:bg-muted hover:text-foreground active:scale-[0.96] focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring";

function MarkdownPre({ children, ...rest }: React.ComponentPropsWithoutRef<"pre"> & ExtraProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const copyBlock = async () => {
    const root = preRef.current;
    if (!root) return;
    const codeEl = root.querySelector("code");
    const text = codeEl?.innerText ?? root.innerText ?? "";
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="group/codeblock relative">
      <button
        type="button"
        onClick={() => void copyBlock()}
        className={codeCopyBtn}
        title={copied ? "Copied" : "Copy"}
        aria-label={copied ? "Copied" : "Copy code"}
      >
        {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={2} />}
      </button>
      <pre ref={preRef} {...rest} className={rest.className}>
        {children}
      </pre>
    </div>
  );
}

const markdownComponents: Components = {
  pre: MarkdownPre,
};

const markdownProseClass =
  "min-w-0 break-words text-[0.9375rem] leading-[1.65] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-accent [&_a:hover]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-[3px] [&_blockquote]:border-border [&_blockquote]:pl-[0.9em] [&_blockquote]:text-muted-foreground [&_code]:rounded-[4px] [&_code]:border [&_code]:border-border-subtle [&_code]:bg-muted [&_code]:px-[0.35em] [&_code]:py-[0.12em] [&_code]:text-[0.85em] [&_h1]:my-[0.75em] [&_h1]:mb-[0.4em] [&_h1]:text-[1.125rem] [&_h1]:font-semibold [&_h1]:leading-[1.3] [&_h1]:tracking-[-0.02em] [&_h2]:my-[0.75em] [&_h2]:mb-[0.4em] [&_h2]:text-[1.05rem] [&_h2]:font-semibold [&_h2]:leading-[1.3] [&_h2]:tracking-[-0.02em] [&_h3]:my-[0.75em] [&_h3]:mb-[0.4em] [&_h3]:text-[1rem] [&_h3]:font-semibold [&_h3]:leading-[1.3] [&_h3]:tracking-[-0.02em] [&_hr]:my-[0.85em] [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-border-subtle [&_li]:my-[0.2em] [&_ol]:my-2 [&_ol]:pl-[1.35em] [&_p]:my-2 [&_pre]:my-[0.65em] [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border-subtle [&_pre]:bg-background [&_pre]:px-3 [&_pre]:py-2.5 [&_pre]:text-[0.8125rem] [&_pre_code]:rounded-none [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[0.8125rem] [&_table]:my-[0.65em] [&_table]:border-collapse [&_table]:text-[0.875rem] [&_td]:border [&_td]:border-border-subtle [&_td]:px-[10px] [&_td]:py-[6px] [&_th]:border [&_th]:border-border-subtle [&_th]:bg-muted [&_th]:px-[10px] [&_th]:py-[6px] [&_th]:text-left [&_th]:font-semibold [&_ul]:my-2 [&_ul]:pl-[1.35em]";

export function MarkdownMessage({ children, className }: { children: string; className?: string }) {
  const source = normalizeFlattenedPipeTables(children);
  return (
    <div className={cx(markdownProseClass, className)}>
      <MarkdownHooks
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePrettyCodePlugins}
        components={markdownComponents}
        fallback={
          <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
            {source}
          </ReactMarkdown>
        }
      >
        {source}
      </MarkdownHooks>
    </div>
  );
}

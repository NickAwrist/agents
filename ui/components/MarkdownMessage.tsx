import { useRef, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
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

const COMFYUI_VIEW_PREFIX = "/api/comfyui/view/";

function isComfyUIImage(src: string | undefined): boolean {
  return typeof src === "string" && src.startsWith(COMFYUI_VIEW_PREFIX);
}

function ComfyUIImageCard({ src, alt }: { src: string; alt?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string>("");

  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    console.error("ComfyUI image failed to load:", src, e);
    setErrored(true);
    setErrorDetails(`URL: ${src}`);
  };

  return (
    <div className="my-3 inline-block max-w-full">
      <div className="overflow-hidden rounded-lg border border-border-subtle bg-background shadow-sm">
        {errored ? (
          <div className="flex h-48 w-80 flex-col items-center justify-center p-4 text-center text-[0.8125rem] text-muted-foreground">
            <div className="mb-2">Failed to load image</div>
            <div className="break-all text-[0.7rem] opacity-70">{errorDetails}</div>
          </div>
        ) : (
          <a href={src} target="_blank" rel="noopener noreferrer" className="group/imgcard block">
            <div className="relative">
              {!loaded && (
                <div className="flex h-48 w-80 items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-subtle border-t-foreground" />
                </div>
              )}
              <img
                src={src}
                alt={alt || "Generated image"}
                onLoad={() => setLoaded(true)}
                onError={handleError}
                className={cx(
                  "max-h-[512px] max-w-full rounded-t-lg object-contain",
                  loaded ? "block" : "hidden",
                )}
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-t-lg bg-black/0 opacity-0 transition-all group-hover/imgcard:bg-black/30 group-hover/imgcard:opacity-100">
                <ExternalLink size={24} className="text-white drop-shadow-md" />
              </div>
            </div>
          </a>
        )}
      </div>
    </div>
  );
}

function MarkdownImg({ src, alt, ...rest }: React.ComponentPropsWithoutRef<"img"> & ExtraProps) {
  if (isComfyUIImage(src)) {
    return <ComfyUIImageCard src={src!} alt={alt} />;
  }
  return <img src={src} alt={alt} {...rest} />;
}

/**
 * Detect ComfyUI image URLs in various formats the LLM might produce and
 * convert them into clean markdown image syntax.
 *
 * Handles:
 *  - JSON wrapper:  { "image_url": "/api/comfyui/view/..." }
 *  - Quoted URL:    "/api/comfyui/view/..."
 *  - Bare URL:      /api/comfyui/view/...
 *  - Already valid: ![alt](/api/comfyui/view/...) — left untouched
 */
function convertComfyUIUrls(markdown: string): string {
  // 1. Replace full JSON object wrappers like { "image_url": "..." }
  let result = markdown.replace(
    /\{\s*"[^"]*"\s*:\s*"(\/api\/comfyui\/view\/[^"]+)"\s*\}/g,
    (_match, url) => `![Generated Image](${url})`,
  );

  // 2. Replace quoted URLs not already inside markdown image syntax
  result = result.replace(
    /(?<!\]\()"(\/api\/comfyui\/view\/[^"]+)"/g,
    (_match, url) => `![Generated Image](${url})`,
  );

  // 3. Replace remaining bare URLs (exclude quotes, parens, brackets, whitespace)
  result = result.replace(
    /(?<!\]\()(?<!\()(\/api\/comfyui\/view\/[^\s"')>\]]+)/g,
    (match) => {
      if (result.includes(`](${match})`)) return match;
      return `![Generated Image](${match})`;
    },
  );

  return result;
}

const markdownComponents: Components = {
  pre: MarkdownPre,
  img: MarkdownImg,
};

const markdownProseClass =
  "min-w-0 break-words text-[0.9375rem] leading-[1.65] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-accent [&_a:hover]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-[3px] [&_blockquote]:border-border [&_blockquote]:pl-[0.9em] [&_blockquote]:text-muted-foreground [&_code]:rounded-[4px] [&_code]:border [&_code]:border-border-subtle [&_code]:bg-muted [&_code]:px-[0.35em] [&_code]:py-[0.12em] [&_code]:text-[0.85em] [&_h1]:my-[0.75em] [&_h1]:mb-[0.4em] [&_h1]:text-[1.125rem] [&_h1]:font-semibold [&_h1]:leading-[1.3] [&_h1]:tracking-[-0.02em] [&_h2]:my-[0.75em] [&_h2]:mb-[0.4em] [&_h2]:text-[1.05rem] [&_h2]:font-semibold [&_h2]:leading-[1.3] [&_h2]:tracking-[-0.02em] [&_h3]:my-[0.75em] [&_h3]:mb-[0.4em] [&_h3]:text-[1rem] [&_h3]:font-semibold [&_h3]:leading-[1.3] [&_h3]:tracking-[-0.02em] [&_hr]:my-[0.85em] [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-border-subtle [&_li]:my-[0.2em] [&_ol]:my-2 [&_ol]:pl-[1.35em] [&_p]:my-2 [&_pre]:my-[0.65em] [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border-subtle [&_pre]:bg-background [&_pre]:px-3 [&_pre]:py-2.5 [&_pre]:text-[0.8125rem] [&_pre_code]:rounded-none [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[0.8125rem] [&_table]:my-[0.65em] [&_table]:border-collapse [&_table]:text-[0.875rem] [&_td]:border [&_td]:border-border-subtle [&_td]:px-[10px] [&_td]:py-[6px] [&_th]:border [&_th]:border-border-subtle [&_th]:bg-muted [&_th]:px-[10px] [&_th]:py-[6px] [&_th]:text-left [&_th]:font-semibold [&_ul]:my-2 [&_ul]:pl-[1.35em]";

export function MarkdownMessage({ children, className }: { children: string; className?: string }) {
  const source = convertComfyUIUrls(normalizeFlattenedPipeTables(children));
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

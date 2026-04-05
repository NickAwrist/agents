import ReactMarkdown from "react-markdown";

export function MarkdownMessage({ children, className }: { children: string; className?: string }) {
  return (
    <div className={["message-markdown", className].filter(Boolean).join(" ")}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

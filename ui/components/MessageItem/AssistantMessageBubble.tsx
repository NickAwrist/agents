import { Check, Copy, Download, Waypoints } from "lucide-react";
import type { CSSProperties } from "react";
import type { Message } from "../../types";
import { extractComfyUIImageUrls, MarkdownMessage } from "../MarkdownMessage";
import { traceStepsForDisplay } from "../ExecutionTrace";
import { cx } from "../../styles";
import { msgIconBtn, msgIconSize, msgIconStroke } from "./messageItemStyles";

type Props = {
  message: Message;
  enterStyle: CSSProperties | undefined;
  copied: boolean;
  copyContent: () => void;
  onViewSteps?: () => void;
};

export function AssistantMessageBubble({ message, enterStyle, copied, copyContent, onViewSteps }: Props) {
  const comfyImageUrls = extractComfyUIImageUrls(message.content);

  return (
    <div className="group/msg ui-animate-slide-up flex w-full min-w-0 flex-col" style={enterStyle}>
      <div className="flex w-full justify-start pt-4 max-[640px]:pt-3.5" aria-hidden>
        <div className="h-px w-9 max-[640px]:w-8 shrink-0 rounded-full bg-border-subtle/70" />
      </div>
      <div className="max-w-[min(100%,42rem)] min-w-0 pt-2">
        <MarkdownMessage className="text-foreground">{message.content}</MarkdownMessage>

        <div
          className={cx(
            "mt-2 flex flex-wrap items-center gap-1",
            "opacity-0 transition-opacity duration-300 ease-out",
            "group-hover/msg:opacity-100 focus-within:opacity-100",
          )}
        >
          <button
            type="button"
            onClick={() => void copyContent()}
            className={msgIconBtn}
            title={copied ? "Copied" : "Copy"}
            aria-label={copied ? "Copied" : "Copy message"}
          >
            {copied ? (
              <Check size={msgIconSize} strokeWidth={msgIconStroke} />
            ) : (
              <Copy size={msgIconSize} strokeWidth={msgIconStroke} />
            )}
          </button>
          {comfyImageUrls.map((href, i) => (
            <a
              key={`${href}-${i}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={msgIconBtn}
              title="Open image"
              aria-label={
                comfyImageUrls.length > 1 ? `Open generated image ${i + 1} in new tab` : "Open generated image in new tab"
              }
            >
              <Download size={msgIconSize} strokeWidth={msgIconStroke} />
            </a>
          ))}
          {message.steps && traceStepsForDisplay(message.steps).length > 0 && onViewSteps && (
            <button
              type="button"
              onClick={onViewSteps}
              className={msgIconBtn}
              title="View trace"
              aria-label="View trace"
            >
              <Waypoints size={msgIconSize} strokeWidth={msgIconStroke} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

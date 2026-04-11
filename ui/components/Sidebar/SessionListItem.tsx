import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { RefObject } from "react";
import type { SessionSummary } from "../../types";
import { cx } from "../../styles";

type Props = {
  session: SessionSummary;
  active: boolean;
  collapsed: boolean;
  menuOpenId: string | null;
  setMenuOpenId: (id: string | null) => void;
  menuWrapRef: RefObject<HTMLDivElement | null>;
  onSelectSession: (id: string) => void;
  onRenameSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
};

export function SessionListItem({
  session,
  active,
  collapsed,
  menuOpenId,
  setMenuOpenId,
  menuWrapRef,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
}: Props) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onSelectSession(session.id)}
        className={cx(
          "relative flex w-full justify-center rounded-md px-2 py-2 text-left transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.98]",
          active &&
            "before:pointer-events-none before:absolute before:left-1 before:top-1/2 before:h-5 before:w-px before:-translate-y-1/2 before:rounded-full before:bg-foreground/45 before:content-['']",
        )}
        title={session.preview || "Chat"}
      >
        <div className="min-w-0">
          <div
            className={cx(
              "size-1.5 rounded-full bg-muted-foreground/55 transition-[background-color,opacity] duration-150",
              active && "bg-foreground/50",
            )}
          />
        </div>
      </button>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_32px] items-stretch border-b border-border-subtle last:border-b-0">
      <button
        type="button"
        onClick={() => {
          setMenuOpenId(null);
          onSelectSession(session.id);
        }}
        className={cx(
          "relative block w-full rounded-none rounded-l-md border-l-2 border-transparent bg-transparent px-2 py-2.5 pr-1 text-left transition-[color,background-color,border-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.995]",
          active && "border-l-foreground/35 bg-muted/20 hover:bg-muted/35",
        )}
      >
        <div className="min-w-0">
          <div className="overflow-hidden text-[0.8125rem] leading-[1.4] text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
            {session.preview || "New chat"}
          </div>
          <div className="mt-1 text-[0.6875rem] text-muted-foreground">
            {new Date(session.updatedAt).toLocaleString()}
          </div>
        </div>
      </button>
      <div
        className="relative flex items-start justify-center pr-0.5 pt-2"
        ref={menuOpenId === session.id ? menuWrapRef : undefined}
      >
        <button
          type="button"
          className={cx(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-transparent text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-[0.94] active:bg-muted/70",
            menuOpenId === session.id && "bg-muted text-foreground",
          )}
          aria-expanded={menuOpenId === session.id}
          aria-haspopup="menu"
          aria-label="Chat options"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpenId(menuOpenId === session.id ? null : session.id);
          }}
        >
          <MoreVertical size={16} />
        </button>
        {menuOpenId === session.id && (
          <div
            className="ui-animate-slide-up absolute right-0 top-full z-50 mt-1 min-w-[140px] origin-top-right rounded-lg border border-border-subtle bg-surface p-1 shadow-[0_10px_28px_rgba(0,0,0,0.4)]"
            role="menu"
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.8125rem] text-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.99] active:bg-muted/80"
              role="menuitem"
              onClick={() => {
                setMenuOpenId(null);
                onRenameSession(session.id);
              }}
            >
              <Pencil size={14} />
              Rename
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.8125rem] text-red-400 transition-[color,background-color,transform] duration-150 ease-out hover:bg-red-400/10 hover:text-red-300 active:scale-[0.99] active:bg-red-400/15"
              role="menuitem"
              onClick={() => {
                setMenuOpenId(null);
                onDeleteSession(session.id);
              }}
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

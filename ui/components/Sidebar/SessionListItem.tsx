import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useLayoutEffect, useState, type RefObject } from "react";
import type { SessionSummary } from "../../types";
import { cx } from "../../styles";

const MENU_VIEW_MARGIN = 8;
const MENU_GAP = 4;

function SessionOptionsMenuPortal({
  menuWrapRef,
  menuPortalRef,
  onRename,
  onDelete,
}: {
  menuWrapRef: RefObject<HTMLDivElement | null>;
  menuPortalRef: RefObject<HTMLDivElement | null>;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; flipped: boolean } | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const wrap = menuWrapRef.current;
      const panel = menuPortalRef.current;
      if (!wrap) return;
      const wrapRect = wrap.getBoundingClientRect();
      const panelHeight = panel?.offsetHeight ?? 88;
      const panelWidth = panel?.offsetWidth ?? 140;
      const spaceBelow = window.innerHeight - wrapRect.bottom - MENU_VIEW_MARGIN;
      const spaceAbove = wrapRect.top - MENU_VIEW_MARGIN;
      const flipped =
        spaceBelow < panelHeight &&
        (spaceAbove >= panelHeight || spaceAbove > spaceBelow);
      let top = flipped
        ? wrapRect.top - panelHeight - MENU_GAP
        : wrapRect.bottom + MENU_GAP;
      const maxTop = window.innerHeight - panelHeight - MENU_VIEW_MARGIN;
      const minTop = MENU_VIEW_MARGIN;
      top = Math.min(maxTop, Math.max(minTop, top));
      const left = Math.min(
        Math.max(MENU_VIEW_MARGIN, wrapRect.right - panelWidth),
        window.innerWidth - panelWidth - MENU_VIEW_MARGIN,
      );
      setPos({ top, left, flipped });
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [menuWrapRef, menuPortalRef]);

  return createPortal(
    <div
      ref={menuPortalRef}
      className={cx(
        "ui-animate-slide-up fixed z-[200] min-w-[140px] rounded-lg border border-border-subtle bg-surface p-1 shadow-[0_10px_28px_rgba(0,0,0,0.4)]",
        pos?.flipped ? "origin-bottom-right" : "origin-top-right",
      )}
      style={
        pos
          ? { top: pos.top, left: pos.left }
          : { visibility: "hidden", top: 0, left: 0 }
      }
      role="menu"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.8125rem] text-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.99] active:bg-muted/80"
        role="menuitem"
        onClick={onRename}
      >
        <Pencil size={14} />
        Rename
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.8125rem] text-red-400 transition-[color,background-color,transform] duration-150 ease-out hover:bg-red-400/10 hover:text-red-300 active:scale-[0.99] active:bg-red-400/15"
        role="menuitem"
        onClick={onDelete}
      >
        <Trash2 size={14} />
        Delete
      </button>
    </div>,
    document.body,
  );
}

type Props = {
  session: SessionSummary;
  active: boolean;
  collapsed: boolean;
  menuOpenId: string | null;
  setMenuOpenId: (id: string | null) => void;
  menuWrapRef: RefObject<HTMLDivElement | null>;
  menuPortalRef: RefObject<HTMLDivElement | null>;
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
  menuPortalRef,
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
          <SessionOptionsMenuPortal
            menuWrapRef={menuWrapRef}
            menuPortalRef={menuPortalRef}
            onRename={() => {
              setMenuOpenId(null);
              onRenameSession(session.id);
            }}
            onDelete={() => {
              setMenuOpenId(null);
              onDeleteSession(session.id);
            }}
          />
        )}
      </div>
    </div>
  );
}

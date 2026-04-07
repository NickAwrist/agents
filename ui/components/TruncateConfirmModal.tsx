import { useId } from "react";
import { X } from "lucide-react";
import { cx, eyebrowText, modalCloseButton, modalHeader, modalShell, primaryButton, secondaryButton } from "../styles";

export function TruncateConfirmModal({
  title,
  description,
  confirmLabel = "Continue",
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const titleId = useId();

  return (
    <div className={modalShell} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose}>
      <div className="max-h-none w-full max-w-[400px]" onClick={(e) => e.stopPropagation()}>
        <div className="ui-animate-modal-panel grid rounded-xl border border-border-subtle bg-surface">
          <div className={modalHeader}>
            <div>
              <div className={eyebrowText}>Warning</div>
              <h2 id={titleId} className="mt-1 text-[1.0625rem] font-semibold tracking-[-0.02em]">
                {title}
              </h2>
            </div>
            <button type="button" onClick={onClose} className={modalCloseButton} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="px-[18px] py-4 sm:px-3.5">
            <p className="m-0 text-[0.875rem] leading-[1.6] text-muted-foreground">{description}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={onClose} className={secondaryButton}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void Promise.resolve(onConfirm())}
                className={cx(primaryButton, "!bg-[#991b1b] hover:!bg-[#b91c1c] !text-white")}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

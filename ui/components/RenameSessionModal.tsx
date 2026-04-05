import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export function RenameSessionModal({
  initialTitle,
  onSave,
  onClose,
}: {
  initialTitle: string;
  onSave: (title: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initialTitle);
  }, [initialTitle]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="modal-shell modal-shell--open" role="dialog" aria-modal="true" aria-labelledby="rename-session-title" onClick={onClose}>
      <div className="modal-panel modal-panel--rename" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel__surface rename-modal__surface">
          <div className="modal-panel__header">
            <div>
              <div className="modal-panel__eyebrow">Chat</div>
              <h2 id="rename-session-title">Rename</h2>
            </div>
            <button type="button" onClick={onClose} className="modal-close-button" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <form
            className="rename-modal__body"
            onSubmit={(e) => {
              e.preventDefault();
              onSave(value.trim());
            }}
          >
            <label className="rename-modal__label" htmlFor="rename-session-input">
              Display name
            </label>
            <input
              id="rename-session-input"
              ref={inputRef}
              className="rename-modal__input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Uses last user message if empty"
              autoComplete="off"
            />
            <p className="rename-modal__hint">Leave empty to show the latest user message as the title.</p>
            <div className="rename-modal__actions">
              <button type="button" className="secondary-button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary-button">
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

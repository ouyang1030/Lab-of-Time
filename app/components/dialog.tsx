"use client";
import { createContext, useContext, useEffect, useRef } from "react";
import { X } from "lucide-react";
export const FeedbackContext = createContext("");
export default function Dialog({
  title,
  children,
  onClose,
  wide = false,
  head,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  /** Replaces the plain title heading; `title` still names the dialog. */
  head?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const error = useContext(FeedbackContext);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="dialog-content">
        <div className="dialog-head">
          {head ?? <h2>{title}</h2>}
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {children}
      </div>
    </dialog>
  );
}

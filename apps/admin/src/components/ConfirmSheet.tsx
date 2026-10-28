import { Button } from "@web/components/Button";
import { Sheet } from "@web/components/Sheet";
import { useId, useState, type ReactNode } from "react";
import { t } from "../i18n/ar";

type Props = {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: (note: string | undefined) => void;
  onClose: () => void;
  /** Extra fields above the note, e.g. a member picker. */
  children?: ReactNode;
  disabled?: boolean;
};

/** Confirms an admin action. The optional note goes to the audit log (spec 4.5). */
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
  children,
  disabled,
}: Props) {
  const noteId = useId();
  const [note, setNote] = useState("");
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="mb-3">{body}</p>
      {children}
      <label htmlFor={noteId} className="mt-2 block text-sm">
        {t.ops.noteLabel}
      </label>
      <textarea
        id={noteId}
        value={note}
        maxLength={500}
        rows={2}
        onChange={(e) => setNote(e.target.value)}
        className="mt-1 w-full rounded-ui border-2 border-line bg-white p-2"
      />
      <div className="mt-3 flex flex-col gap-2">
        <Button
          disabled={disabled}
          onClick={() => onConfirm(note.trim() ? note.trim() : undefined)}
        >
          {confirmLabel}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t.ops.cancel}
        </Button>
      </div>
    </Sheet>
  );
}

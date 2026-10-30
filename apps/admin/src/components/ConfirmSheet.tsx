import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90svh] overflow-y-auto"
        // Only its buttons and Escape close it, so a stray tap can't lose a note.
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {children}
        <div className="grid gap-1.5">
          <Label htmlFor={noteId} className="text-[13px]">
            {t.ops.noteLabel}
          </Label>
          <Textarea
            id={noteId}
            value={note}
            maxLength={500}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.ops.cancel}
          </Button>
          <Button
            disabled={disabled}
            onClick={() => onConfirm(note.trim() ? note.trim() : undefined)}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

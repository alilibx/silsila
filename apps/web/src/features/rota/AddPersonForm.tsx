import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { t } from "../../i18n/ar";
import { getSessionToken } from "../../lib/session";
import { thrownMessage } from "./errors";

const addErrors: Record<string, string> = t.rota.addErrors;
const fieldClass =
  "mt-1.5 min-h-14 w-full rounded-ui border-2 border-line bg-white px-4 text-ink";

/**
 * A name and a number, added as a participant. With `juz` the person takes that juz' of the next
 * khatma; without it, the first one nobody reads.
 */
export function AddPersonForm({
  inviteCode,
  juz,
  variant = "ghost",
  onAdded,
}: {
  inviteCode: string;
  juz?: number;
  variant?: "ghost" | "primary";
  /** Called after the person is added, once the fields are empty. */
  onAdded?: () => void;
}) {
  const addParticipant = useMutation(api.rota.addParticipant);
  const ids = useId();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const addingRef = useRef(false);

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (addingRef.current) return;
    addingRef.current = true;
    setAdding(true);
    setError(null);
    try {
      const result = await addParticipant({
        sessionToken: getSessionToken() ?? undefined,
        inviteCode,
        name: name.trim(),
        phone: phone.trim(),
        ...(juz === undefined ? {} : { juz }),
      });
      if ("error" in result) {
        setError(addErrors[result.error] ?? t.errors.generic);
      } else {
        setName("");
        setPhone("");
        nameField.current?.focus();
        onAdded?.();
      }
    } catch (caught) {
      setError(thrownMessage(caught));
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  }

  return (
    <form onSubmit={(event) => void onAdd(event)} noValidate>
      <label htmlFor={`${ids}-name`} className="block font-medium">
        {t.rota.personName}
      </label>
      <input
        ref={nameField}
        id={`${ids}-name`}
        type="text"
        maxLength={60}
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={fieldClass}
      />
      <label htmlFor={`${ids}-phone`} className="mt-4 block font-medium">
        {t.rota.personPhone}
      </label>
      <input
        id={`${ids}-phone`}
        type="text"
        inputMode="tel"
        autoComplete="off"
        dir="ltr"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        aria-describedby={`${ids}-hint`}
        className={`${fieldClass} text-right`}
      />
      <p id={`${ids}-hint`} className="mt-1 text-base text-ink-soft">
        {t.rota.phoneHint}
      </p>
      {error && (
        <p role="alert" className="mt-3 font-medium text-[#8A2B1E]">
          {error}
        </p>
      )}
      <div className="mt-4">
        <Button type="submit" variant={variant} disabled={adding}>
          {adding ? t.rota.adding : t.rota.add}
        </Button>
      </div>
    </form>
  );
}

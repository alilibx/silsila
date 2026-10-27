import { api } from "@convex/_generated/api";
import { normalizeDigits, toArabicDigits } from "@convex/lib/digits";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, buttonClass } from "../../components/Button";
import { Sheet } from "../../components/Sheet";
import { t } from "../../i18n/ar";
import { formatDate } from "../../lib/format";
import { useSessionToken } from "../../lib/session";
import { useVerification } from "./useVerification";

type Props = {
  title: string;
  onVerified: () => void;
  onClose: () => void;
};

const PIN_LENGTH = 6;
const heading = "text-xl font-semibold";
const hint = "mt-1.5 leading-relaxed text-ink-soft";
const errorText = "mt-2 font-medium text-[#8A2B1E]";

export function VerifySheet({ title, onVerified, onClose }: Props) {
  const v = useVerification();

  // Fire once, when the flow reaches its end; the page decides what comes next.
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;
  useEffect(() => {
    if (v.step === "done") onVerifiedRef.current();
  }, [v.step]);

  // Leaving at confirm or pin drops the attempt, so the next person on a shared phone
  // cannot continue it. Leaving while waiting keeps it: the user may be in WhatsApp.
  const close = () => {
    if (v.step === "confirm" || v.step === "pin") v.discard();
    onClose();
  };

  return (
    <Sheet title={title} onClose={close}>
      {v.step === "name" && <NameStep v={v} />}
      {v.step === "waiting" && <WaitingStep v={v} />}
      {v.step === "confirm" && <ConfirmStep v={v} />}
      {v.step === "pin" && <PinStep v={v} />}
      {v.step === "devices" && <DevicesStep v={v} />}
      {v.step === "error" && <ErrorStep v={v} />}
    </Sheet>
  );
}

type StepProps = { v: ReturnType<typeof useVerification> };

function NameStep({ v }: StepProps) {
  const [name, setName] = useState("");
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void v.start(name);
  };
  return (
    <form onSubmit={onSubmit} noValidate>
      <p className={hint}>{t.verify.intro}</p>
      <label htmlFor="verify-name" className="mt-3.5 block font-medium">
        {t.verify.nameLabel}
      </label>
      <input
        id="verify-name"
        type="text"
        autoComplete="name"
        maxLength={40}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t.verify.namePlaceholder}
        aria-invalid={v.error !== null}
        aria-describedby={v.error ? "verify-name-error" : undefined}
        className="mt-1.5 min-h-14 w-full rounded-ui border-2 border-line bg-white px-4 text-ink"
      />
      {v.error && (
        <p id="verify-name-error" role="alert" className={errorText}>
          {v.error}
        </p>
      )}
      <div className="mt-5 grid gap-3">
        <Button variant="whatsapp" type="submit" disabled={v.busy}>
          {v.busy ? t.verify.starting : t.verify.start}
        </Button>
      </div>
      <p className="mt-3.5 rounded-xl bg-paper-2 p-3 text-base leading-relaxed">
        {t.verify.startHint}
      </p>
    </form>
  );
}

function WaitingStep({ v }: StepProps) {
  return (
    <div>
      <div className="py-2.5 text-center">
        <div
          role="status"
          aria-label={t.verify.waitingTitle}
          className="mx-auto mt-1.5 mb-4 size-14 rounded-full border-[5px] border-paper-2 border-t-wa motion-safe:animate-spin"
        />
        <h3 className={heading}>{t.verify.waitingTitle}</h3>
        <p className={hint}>{t.verify.waitingHint}</p>
      </div>
      {v.waUrl && (
        <div className="mt-5 grid gap-3">
          <a
            href={v.waUrl}
            target="_blank"
            rel="noopener"
            className={buttonClass("whatsapp", "no-underline")}
          >
            {v.opened ? t.verify.reopenWhatsApp : t.verify.openWhatsApp}
          </a>
        </div>
      )}
    </div>
  );
}

function ConfirmStep({ v }: StepProps) {
  return (
    <div>
      <div className="text-center">
        <div
          aria-hidden="true"
          className="mx-auto mt-2 flex size-14 items-center justify-center rounded-full bg-green text-3xl text-white"
        >
          ✓
        </div>
        <h3 className={`${heading} mt-3`}>
          {t.verify.confirmTitle(v.displayName)}
        </h3>
        {v.maskedPhone && (
          <p className={hint}>
            {t.verify.yourNumber}{" "}
            <span dir="ltr" className="font-bold text-ink">
              {v.maskedPhone}
            </span>
          </p>
        )}
      </div>
      {v.error && (
        <p role="alert" className={errorText}>
          {v.error}
        </p>
      )}
      <div className="mt-5 grid gap-3">
        <Button disabled={v.busy} onClick={() => void v.confirm()}>
          {t.verify.yes}
        </Button>
        <Button
          variant="ghost"
          disabled={v.busy}
          onClick={() => void v.notMe()}
        >
          {t.verify.notMe}
        </Button>
      </div>
    </div>
  );
}

/** One real input, drawn as six boxes: paste, autofill and the keyboard all behave like a normal field. */
function PinStep({ v }: StepProps) {
  const [pin, setPin] = useState("");
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function submit(value: string) {
    await v.submitPin(value);
    // A wrong PIN leaves the step as it was; start over in the same field.
    setPin("");
    input.current?.focus();
  }

  const onChange = (raw: string) => {
    const digits = normalizeDigits(raw)
      .replace(/\D/gu, "")
      .slice(0, PIN_LENGTH);
    setPin(digits);
    if (digits.length === PIN_LENGTH && !v.busy) void submit(digits);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (pin.length === PIN_LENGTH && !v.busy) void submit(pin);
      }}
    >
      <h3 className={heading}>{t.verify.pinTitle}</h3>
      <p className={hint}>
        {t.verify.pinHint}
        {v.maskedPhone && (
          <>
            {" "}
            <span dir="ltr" className="font-bold text-ink">
              {v.maskedPhone}
            </span>
          </>
        )}
      </p>
      <label htmlFor="verify-pin" className="mt-4 block font-medium">
        {t.verify.pinLabel}
      </label>
      <div dir="ltr" className="relative mt-1.5 flex justify-center gap-2">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`flex h-16 w-12 items-center justify-center rounded-ui border-2 bg-white text-3xl font-bold ${
              focused && i === Math.min(pin.length, PIN_LENGTH - 1)
                ? "border-green"
                : "border-line"
            }`}
          >
            {pin[i] ? toArabicDigits(pin[i]) : ""}
          </span>
        ))}
        <input
          id="verify-pin"
          ref={input}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={pin}
          disabled={v.busy}
          aria-invalid={v.error !== null}
          aria-describedby={v.error ? "verify-pin-error" : undefined}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="absolute inset-0 size-full cursor-text opacity-0"
        />
      </div>
      {v.error && (
        <p id="verify-pin-error" role="alert" className={errorText}>
          {v.error}
        </p>
      )}
      <div className="mt-5 grid gap-3">
        <Button type="submit" disabled={v.busy || pin.length !== PIN_LENGTH}>
          {t.verify.pinSubmit}
        </Button>
      </div>
    </form>
  );
}

function DevicesStep({ v }: StepProps) {
  const sessionToken = useSessionToken();
  const sessions = useQuery(
    api.sessions.list,
    sessionToken ? { sessionToken } : "skip",
  );
  const others = sessions?.filter((s) => !s.isCurrent);
  return (
    <div>
      <h3 className={heading}>{t.verify.devicesTitle}</h3>
      <p className={hint}>{t.verify.devicesHint}</p>
      {others === undefined ? (
        <p role="status" className="mt-3 text-ink-soft">
          {t.common.loading}
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {others.map((s) => (
            <li
              key={s.sessionId}
              className="rounded-ui border border-line bg-paper-2 px-4 py-2.5"
            >
              <span className="block font-medium">{s.deviceLabel}</span>
              <span className="block text-base text-ink-soft">
                {t.verify.lastUsed(formatDate(s.lastUsedAt))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {v.error && (
        <p role="alert" className={errorText}>
          {v.error}
        </p>
      )}
      <div className="mt-5 grid gap-3">
        <Button disabled={v.busy} onClick={() => void v.signOutOthers()}>
          {t.verify.signOutOthers}
        </Button>
        <Button
          variant="ghost"
          disabled={v.busy}
          onClick={v.continueFromDevices}
        >
          {t.verify.keep}
        </Button>
      </div>
    </div>
  );
}

function ErrorStep({ v }: StepProps) {
  return (
    <div>
      <p role="alert" className="mt-2 text-lg leading-relaxed">
        {v.error}
      </p>
      {v.canRetry && (
        <div className="mt-5 grid gap-3">
          <Button onClick={v.reset}>{t.verify.retry}</Button>
        </div>
      )}
    </div>
  );
}

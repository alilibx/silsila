import { Textarea } from "@/components/ui/textarea";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { AdminSheet } from "../components/AdminSheet";
import { formatDate } from "@web/lib/format";
import { useMutation, useQuery } from "convex/react";
import { useId, useState } from "react";
import { Link, useParams } from "react-router";
import { t } from "../i18n/ar";
import { useAdminToken } from "../lib/adminSession";

const CONTEXT_FIELDS = [
  "path",
  "appVersion",
  "userAgent",
  "screen",
  "timeZone",
] as const;

function errorText(code: string): string {
  const known: Record<string, string> = t.help.errors;
  return known[code] ?? t.help.errors.generic;
}

/** One help conversation, with what an admin needs to fix the problem (spec 5). */
export function HelpRequestPage() {
  const adminToken = useAdminToken() ?? "";
  const requestId = useParams().requestId as Id<"helpRequests">;
  const request = useQuery(api.adminHelp.get, { adminToken, requestId });
  const reply = useMutation(api.adminHelp.reply);
  const close = useMutation(api.adminHelp.close);
  const reopen = useMutation(api.adminHelp.reopen);
  const replyId = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [bigShot, setBigShot] = useState<string | null>(null);

  if (request === undefined) return null;
  if (request === null) return <p>{t.help.errors.not_found}</p>;

  async function run(call: () => Promise<{ ok: true } | { error: string }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await call();
      if ("error" in res) {
        setError(errorText(res.error));
        return false;
      }
      return true;
    } catch {
      setError(errorText("generic"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Link to="/help" className="text-primary underline underline-offset-4">
        {t.help.back}
      </Link>
      <ol className="flex flex-col gap-2">
        {request.messages.map((m) => (
          <li
            key={m._id}
            className={`rounded-lg px-4 py-3 ${m.from === "team" ? "bg-saffron-soft text-saffron-ink" : "border bg-card"}`}
          >
            <p className="text-xs text-muted-foreground">
              {m.from === "team"
                ? t.help.team
                : (request.person?.displayName ?? t.help.visitor)}{" "}
              · {formatDate(m.createdAt)}
            </p>
            {m.text && <p className="mt-1 whitespace-pre-wrap">{m.text}</p>}
            {m.screenshotUrl && (
              <button
                type="button"
                aria-label={t.help.openScreenshot}
                onClick={() => setBigShot(m.screenshotUrl)}
                className="mt-2 block h-40 w-28 overflow-hidden rounded-lg border "
              >
                <img
                  src={m.screenshotUrl}
                  alt={t.help.screenshot}
                  className="h-full w-full object-cover"
                />
              </button>
            )}
            {m.voiceUrl && (
              <audio controls src={m.voiceUrl} className="mt-2 w-full" />
            )}
            {m.hadAttachment && !m.screenshotUrl && !m.voiceUrl && (
              <p className="mt-1 text-sm text-muted-foreground">
                {t.help.deleted}
              </p>
            )}
          </li>
        ))}
      </ol>

      <section className="rounded-lg border bg-card px-4 py-3 text-sm">
        <h2 className="mb-2 font-semibold">{t.help.context.title}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">{t.help.person}</dt>
          <dd>
            {request.person ? (
              <>
                <Link
                  to={`/people/${request.person.personId}`}
                  className="text-primary underline"
                >
                  {request.person.displayName}
                </Link>{" "}
                <span dir="ltr">{request.person.phone}</span>
              </>
            ) : (
              t.help.visitor
            )}
          </dd>
          <dt className="text-muted-foreground">{t.help.khatma}</dt>
          <dd>
            {request.khatma ? (
              <Link
                to={`/khatmas/${request.khatma.khatmaId}`}
                className="text-primary underline"
              >
                {request.khatma.name ?? request.khatma.inviteCode}
              </Link>
            ) : (
              t.help.noKhatma
            )}
          </dd>
          {CONTEXT_FIELDS.map((field) => (
            <div key={field} className="contents">
              <dt className="text-muted-foreground">{t.help.context[field]}</dt>
              <dd dir="ltr" className="break-all text-start">
                {request.context[field]}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => reply({ adminToken, requestId, text })).then((ok) => {
            if (ok) setText("");
          });
        }}
      >
        <label htmlFor={replyId} className="font-medium">
          {t.help.reply}
        </label>
        <Textarea
          id={replyId}
          value={text}
          maxLength={1000}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          className="rounded-lg border bg-card p-3"
        />
        {error !== null && (
          <p role="alert" className="text-saffron-ink">
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="sm:self-start"
          disabled={busy || text.trim() === ""}
        >
          {t.help.send}
        </Button>
      </form>

      {request.status === "closed" ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void run(() => reopen({ adminToken, requestId }))}
        >
          {t.help.reopen}
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          {t.help.close}
        </Button>
      )}

      {confirming && (
        <AdminSheet
          title={t.help.confirmCloseTitle}
          onClose={() => setConfirming(false)}
        >
          <p className="mb-4">{t.help.confirmCloseBody}</p>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => {
                setConfirming(false);
                void run(() => close({ adminToken, requestId }));
              }}
            >
              {t.help.confirmClose}
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              {t.help.cancel}
            </Button>
          </div>
        </AdminSheet>
      )}

      {bigShot && (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink/90 p-4">
          <button
            type="button"
            onClick={() => setBigShot(null)}
            className="self-end text-white underline"
          >
            {t.help.closeScreenshot}
          </button>
          <img
            src={bigShot}
            alt={t.help.screenshot}
            className="m-auto max-h-full max-w-full"
          />
        </div>
      )}
    </div>
  );
}

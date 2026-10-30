import { PageHeader } from "../components/PageHeader";
import { Input } from "@/components/ui/input";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { AdminSheet } from "../components/AdminSheet";
import { useMutation, useQuery } from "convex/react";
import { useId, useState } from "react";
import { t } from "../i18n/ar";
import { useAdminToken } from "../lib/adminSession";

function errorText(code: string): string {
  const known: Record<string, string> = t.admins.errors;
  return known[code] ?? t.admins.errors.generic;
}

/** The admin allowlist (spec 4.3): add by phone, remove with a confirmation. */
export function AdminsPage() {
  const adminToken = useAdminToken() ?? "";
  const admins = useQuery(api.admins.list, { adminToken });
  const add = useMutation(api.admins.add);
  const remove = useMutation(api.admins.remove);
  const phoneId = useId();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Id<"admins"> | null>(null);

  async function run(call: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await call();
      if (res !== null && typeof res === "object" && "error" in res) {
        setError(errorText(String(res.error)));
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

  if (admins === undefined) return null;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t.admins.title} />
      {error !== null && (
        <p
          role="alert"
          className="rounded-lg bg-saffron-soft p-3 text-saffron-ink"
        >
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {admins.map((admin) => (
          <li
            key={admin.adminId}
            className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
          >
            <span dir="ltr">{admin.phone}</span>
            {admin.isMe ? (
              <span className="text-sm text-primary">{t.admins.you}</span>
            ) : (
              <button
                type="button"
                className="text-sm font-medium text-saffron-ink underline underline-offset-4"
                onClick={() => setRemoving(admin.adminId)}
              >
                {t.admins.remove}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex max-w-md flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => add({ adminToken, phone })).then((ok) => {
            if (ok) setPhone("");
          });
        }}
      >
        <label htmlFor={phoneId}>{t.admins.phoneLabel}</label>
        <Input
          id={phoneId}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          dir="ltr"
          className="rounded-lg border bg-card p-3"
        />
        <Button
          type="submit"
          className="sm:self-start"
          disabled={busy || phone.trim() === ""}
        >
          {t.admins.add}
        </Button>
      </form>
      {removing !== null && (
        <AdminSheet
          title={t.admins.confirmTitle}
          onClose={() => setRemoving(null)}
        >
          <p className="mb-4">{t.admins.confirmBody}</p>
          <div className="flex flex-col gap-2">
            <Button
              disabled={busy}
              onClick={() => {
                const adminId = removing;
                setRemoving(null);
                void run(() => remove({ adminToken, adminId }));
              }}
            >
              {t.admins.confirmRemove}
            </Button>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              {t.admins.cancel}
            </Button>
          </div>
        </AdminSheet>
      )}
    </div>
  );
}

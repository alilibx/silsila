import { PageHeader } from "../components/PageHeader";
import { Input } from "@/components/ui/input";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useConvex } from "convex/react";
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ConfirmSheet } from "../components/ConfirmSheet";
import { t } from "../i18n/ar";
import { useAdminToken } from "../lib/adminSession";
import { opsError, withNote } from "../lib/opsError";

type KhatmaHit = {
  khatmaId: Id<"khatmas">;
  name: string | null;
  inviteCode: string;
  members: number;
};

/** Find a khatma by code or name, or a person by phone (spec 8). */
export function SearchPage() {
  const adminToken = useAdminToken() ?? "";
  const convex = useConvex();
  const navigate = useNavigate();
  const khatmaId = useId();
  const phoneId = useId();
  const [khatmaQuery, setKhatmaQuery] = useState("");
  const [phone, setPhone] = useState("");
  const [hits, setHits] = useState<KhatmaHit[] | null>(null);
  const [phoneResult, setPhoneResult] = useState<
    null | { kind: "none"; blocked: boolean } | { kind: "invalid" }
  >(null);
  const [blocking, setBlocking] = useState<"block" | "unblock" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function findKhatmas() {
    setHits(
      await convex.query(api.adminLookup.findKhatmas, {
        adminToken,
        query: khatmaQuery,
      }),
    );
  }

  async function findPerson() {
    setMessage(null);
    const res = await convex.query(api.adminLookup.findPerson, {
      adminToken,
      phone,
    });
    if ("error" in res) setPhoneResult({ kind: "invalid" });
    else if (res.personId) navigate(`/people/${res.personId}`);
    else setPhoneResult({ kind: "none", blocked: res.blocked });
  }

  async function setBlocked(kind: "block" | "unblock", note?: string) {
    setBlocking(null);
    const ref =
      kind === "block" ? api.adminOps.blockPhone : api.adminOps.unblockPhone;
    const res = await convex.mutation(
      ref,
      withNote({ adminToken, phone }, note),
    );
    if ("error" in res) setMessage(opsError(res.error));
    else {
      setMessage(t.ops.done);
      setPhoneResult({ kind: "none", blocked: kind === "block" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.lookup.title} />

      <form
        className="flex max-w-md flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void findKhatmas();
        }}
      >
        <label htmlFor={khatmaId}>{t.lookup.khatmaLabel}</label>
        <Input
          id={khatmaId}
          value={khatmaQuery}
          onChange={(e) => setKhatmaQuery(e.target.value)}
        />
        <Button
          type="submit"
          className="sm:self-start"
          disabled={khatmaQuery.trim().length < 2}
        >
          {t.lookup.find}
        </Button>
        {hits !== null && hits.length === 0 && (
          <p className="text-muted-foreground">{t.lookup.noResults}</p>
        )}
        {hits !== null && hits.length > 0 && (
          <ul className="flex flex-col gap-2">
            {hits.map((k) => (
              <li key={k.khatmaId}>
                <Link
                  to={`/khatmas/${k.khatmaId}`}
                  className="block rounded-lg border bg-card px-4 py-3"
                >
                  <span className="font-medium">
                    {k.name ?? t.lookup.unnamed}
                  </span>{" "}
                  <span className="text-sm text-muted-foreground">
                    {t.lookup.members(k.members)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </form>

      <form
        className="flex max-w-md flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void findPerson();
        }}
      >
        <label htmlFor={phoneId}>{t.lookup.personLabel}</label>
        <Input
          id={phoneId}
          value={phone}
          inputMode="tel"
          dir="ltr"
          onChange={(e) => setPhone(e.target.value)}
        />
        <Button
          type="submit"
          className="sm:self-start"
          disabled={phone.trim() === ""}
        >
          {t.lookup.find}
        </Button>
        {phoneResult?.kind === "invalid" && (
          <p className="text-saffron-ink">{t.lookup.invalidPhone}</p>
        )}
        {phoneResult?.kind === "none" && (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground">
              {t.lookup.noAccount} {phoneResult.blocked && t.lookup.blocked}
            </p>
            <Button
              variant="outline"
              onClick={() =>
                setBlocking(phoneResult.blocked ? "unblock" : "block")
              }
            >
              {phoneResult.blocked ? t.ops.unblock : t.ops.block}
            </Button>
          </div>
        )}
        {message && <p role="status">{message}</p>}
      </form>

      {blocking && (
        <ConfirmSheet
          title={blocking === "block" ? t.ops.block : t.ops.unblock}
          body={blocking === "block" ? t.ops.blockBody : t.ops.unblockBody}
          confirmLabel={blocking === "block" ? t.ops.block : t.ops.unblock}
          onConfirm={(note) => void setBlocked(blocking, note)}
          onClose={() => setBlocking(null)}
        />
      )}
    </div>
  );
}

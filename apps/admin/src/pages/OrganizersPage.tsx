import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button, buttonClass } from "@web/components/Button";
import {
  useConvex,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { useId, useState } from "react";
import { Link } from "react-router";
import { ConfirmSheet } from "../components/ConfirmSheet";
import { RotaSwitch } from "../components/RotaSwitch";
import { t } from "../i18n/ar";
import { useAdminToken } from "../lib/adminSession";
import { opsError, withNote } from "../lib/opsError";

const PAGE = 50;

type Khatma = {
  khatmaId: Id<"khatmas">;
  name: string | null;
  memberCount: number;
};

/** Someone's row: who they are, the switch, and the khatmas they organize if known. */
function PersonRow({
  personId,
  displayName,
  phone,
  rotaAllowed,
  khatmas,
  onToggle,
}: {
  personId: Id<"people">;
  displayName: string;
  phone: string;
  rotaAllowed: boolean;
  khatmas?: Khatma[];
  onToggle: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-ui border-2 border-line bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/people/${personId}`}
            className="block font-medium text-green underline"
          >
            {displayName}
          </Link>
          <span dir="ltr" className="block text-start text-sm text-ink-soft">
            {phone}
          </span>
        </div>
        <RotaSwitch
          checked={rotaAllowed}
          label={`${t.ops.rotaAllowed}: ${displayName}`}
          onToggle={onToggle}
        />
      </div>
      {khatmas && (
        <ul className="flex flex-col gap-1 text-sm">
          {khatmas.map((k) => (
            <li key={k.khatmaId} className="flex justify-between gap-2">
              <Link
                to={`/khatmas/${k.khatmaId}`}
                className="text-green underline"
              >
                {k.name ?? t.lookup.unnamed}
              </Link>
              <span className="text-ink-soft">
                {t.lookup.members(k.memberCount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** A person found by phone, with the switch as it stands now. */
function FoundRow({
  adminToken,
  personId,
  onToggle,
}: {
  adminToken: string;
  personId: Id<"people">;
  onToggle: (name: string, allowed: boolean) => void;
}) {
  const person = useQuery(api.adminLookup.person, { adminToken, personId });
  if (!person) return null;
  return (
    <PersonRow
      personId={personId}
      displayName={person.displayName}
      phone={person.phone}
      rotaAllowed={person.rotaAllowed}
      onToggle={() => onToggle(person.displayName, person.rotaAllowed)}
    />
  );
}

/**
 * The people who organize khatmas, newest first, and the switch that lets each
 * create rotating khatmas (spec 10.2). Search finds anyone else by phone.
 */
export function OrganizersPage() {
  const adminToken = useAdminToken() ?? "";
  const convex = useConvex();
  const setRotaAllowed = useMutation(api.adminOps.setRotaAllowed);
  const phoneId = useId();
  const { results, status, loadMore } = usePaginatedQuery(
    api.adminLookup.organizers,
    { adminToken },
    { initialNumItems: PAGE },
  );
  const [phone, setPhone] = useState("");
  const [found, setFound] = useState<
    | null
    | { kind: "person"; personId: Id<"people"> }
    | { kind: "none" | "invalid" }
  >(null);
  const [asking, setAsking] = useState<null | {
    personId: Id<"people">;
    name: string;
    turnOn: boolean;
  }>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function find() {
    setMessage(null);
    const res = await convex.query(api.adminLookup.findPerson, {
      adminToken,
      phone,
    });
    if ("error" in res) setFound({ kind: "invalid" });
    else if (res.personId) setFound({ kind: "person", personId: res.personId });
    else setFound({ kind: "none" });
  }

  async function confirm(note: string | undefined) {
    if (!asking) return;
    const { personId, turnOn } = asking;
    setAsking(null);
    try {
      const res = await setRotaAllowed(
        withNote({ adminToken, personId, allowed: turnOn }, note),
      );
      setMessage("error" in res ? opsError(res.error) : t.ops.done);
    } catch {
      setMessage(opsError("generic"));
    }
  }

  const ask = (personId: Id<"people">, name: string, allowed: boolean) =>
    setAsking({ personId, name, turnOn: !allowed });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl text-green-deep">
        {t.organizers.title}
      </h1>
      <Link to="/rota/new" className={buttonClass("ghost", "no-underline")}>
        {t.organizers.createFor}
      </Link>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void find();
        }}
      >
        <label htmlFor={phoneId}>{t.organizers.searchLabel}</label>
        <input
          id={phoneId}
          value={phone}
          inputMode="tel"
          dir="ltr"
          onChange={(e) => setPhone(e.target.value)}
          className="rounded-ui border-2 border-line bg-white p-3"
        />
        <Button type="submit" disabled={phone.trim() === ""}>
          {t.lookup.find}
        </Button>
        {found?.kind === "invalid" && (
          <p className="text-saffron-ink">{t.lookup.invalidPhone}</p>
        )}
        {found?.kind === "none" && (
          <p className="text-ink-soft">{t.lookup.noAccount}</p>
        )}
      </form>
      {found?.kind === "person" && (
        <ul>
          <FoundRow
            adminToken={adminToken}
            personId={found.personId}
            onToggle={(name, allowed) => ask(found.personId, name, allowed)}
          />
        </ul>
      )}

      {message && <p role="status">{message}</p>}

      {status !== "LoadingFirstPage" && results.length === 0 && (
        <p className="text-ink-soft">{t.organizers.empty}</p>
      )}
      <ul className="flex flex-col gap-2">
        {results.map((o, i) => (
          <PersonRow
            key={`${o.personId}-${i}`}
            personId={o.personId}
            displayName={o.displayName}
            phone={o.phoneMasked}
            rotaAllowed={o.rotaAllowed}
            khatmas={o.khatmas}
            onToggle={() => ask(o.personId, o.displayName, o.rotaAllowed)}
          />
        ))}
      </ul>
      {status === "CanLoadMore" && (
        <button
          type="button"
          className="font-medium text-green underline underline-offset-4"
          onClick={() => loadMore(PAGE)}
        >
          {t.organizers.more}
        </button>
      )}

      {asking && (
        <ConfirmSheet
          title={asking.turnOn ? t.ops.rotaAllowOn : t.ops.rotaAllowOff}
          body={asking.turnOn ? t.ops.rotaAllowOnBody : t.ops.rotaAllowOffBody}
          confirmLabel={asking.turnOn ? t.ops.rotaAllowOn : t.ops.rotaAllowOff}
          onConfirm={(note) => void confirm(note)}
          onClose={() => setAsking(null)}
        >
          <p className="mb-2 font-semibold">{asking.name}</p>
        </ConfirmSheet>
      )}
    </div>
  );
}

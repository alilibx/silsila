import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { t } from "../i18n/ar";
import { SwitchLine } from "./SwitchLine";
import {
  adminPushSupport,
  currentAdminEndpoint,
  disableAdminPush,
  enableAdminPush,
} from "../lib/adminPush";
import { useAdminToken } from "../lib/adminSession";

/** Push on the admin's phone, and which kinds they get (spec 7). */
export function AdminPushCard() {
  const adminToken = useAdminToken() ?? "";
  const support = adminPushSupport();
  const [endpoint, setEndpoint] = useState<string | null | undefined>(
    undefined,
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"denied" | "failed" | null>(null);
  const mine = useQuery(
    api.adminPush.mine,
    endpoint === undefined
      ? "skip"
      : { adminToken, ...(endpoint ? { endpoint } : {}) },
  );
  const setNotify = useMutation(api.adminPush.setNotify);

  useEffect(() => {
    void currentAdminEndpoint().then(setEndpoint);
  }, []);

  if (support !== "ready") {
    return (
      <section className="rounded-lg border bg-card px-4 py-3">
        <h2 className="font-semibold">{t.adminPush.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {support === "ios_install"
            ? t.adminPush.iosInstall
            : t.adminPush.unsupported}
        </p>
      </section>
    );
  }
  if (mine === undefined) return null;

  return (
    <section className="rounded-lg border bg-card px-4 py-3">
      <h2 className="font-semibold">{t.adminPush.title}</h2>
      {mine.thisDevice ? (
        <>
          {(
            [
              ["help", t.adminPush.help, mine.notifyHelp],
              ["summary", t.adminPush.summary, mine.notifySummary],
              ["milestones", t.adminPush.milestones, mine.notifyMilestones],
            ] as const
          ).map(([kind, label, on]) => (
            <SwitchLine
              key={kind}
              label={label}
              on={on}
              disabled={busy}
              onChange={(next) =>
                void setNotify({ adminToken, kind, on: next })
              }
            />
          ))}
          <button
            type="button"
            disabled={busy}
            className="mt-3 text-sm text-muted-foreground underline underline-offset-4"
            onClick={async () => {
              setBusy(true);
              await disableAdminPush(adminToken);
              setEndpoint(await currentAdminEndpoint());
              setBusy(false);
            }}
          >
            {t.adminPush.off}
          </button>
        </>
      ) : (
        <Button
          className="mt-3"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setProblem(null);
            const res = await enableAdminPush(adminToken);
            if (res !== "on") setProblem(res);
            setEndpoint(await currentAdminEndpoint());
            setBusy(false);
          }}
        >
          {t.adminPush.on}
        </Button>
      )}
      {problem !== null && (
        <p role="alert" className="mt-2 text-sm text-saffron-ink">
          {t.adminPush[problem]}
        </p>
      )}
    </section>
  );
}

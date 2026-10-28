import { api } from "@convex/_generated/api";
import { Button } from "@web/components/Button";
import { SwitchRow } from "@web/components/SwitchRow";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { t } from "../i18n/ar";
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
  const setNotifyHelp = useMutation(api.adminPush.setNotifyHelp);

  useEffect(() => {
    void currentAdminEndpoint().then(setEndpoint);
  }, []);

  if (support !== "ready") {
    return (
      <section className="rounded-ui border-2 border-line bg-card px-4 py-3">
        <h2 className="font-semibold">{t.adminPush.title}</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {support === "ios_install"
            ? t.adminPush.iosInstall
            : t.adminPush.unsupported}
        </p>
      </section>
    );
  }
  if (mine === undefined) return null;

  return (
    <section className="rounded-ui border-2 border-line bg-card px-4 py-3">
      <h2 className="font-semibold">{t.adminPush.title}</h2>
      {mine.thisDevice ? (
        <>
          <SwitchRow
            label={t.adminPush.help}
            on={mine.notifyHelp}
            disabled={busy}
            onChange={(on) => void setNotifyHelp({ adminToken, on })}
          />
          <button
            type="button"
            disabled={busy}
            className="mt-3 text-sm text-ink-soft underline underline-offset-4"
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

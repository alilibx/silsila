import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { t } from "../i18n/ar";
import { clearAdminToken } from "../lib/adminSession";

/** The link in the admin sign-in alert: ends every session of that admin. */
export function AlertSignOutPage() {
  const [params] = useSearchParams();
  const alertToken = params.get("t");
  const signOut = useMutation(api.adminAuth.signOutByAlertToken);
  const [result, setResult] = useState<"working" | "done" | "invalid">(
    alertToken ? "working" : "invalid",
  );
  // StrictMode runs effects twice in dev; the link is single-use, so call once.
  const called = useRef(false);

  useEffect(() => {
    if (!alertToken || called.current) return;
    called.current = true;
    signOut({ alertToken })
      .then((res) => {
        clearAdminToken();
        setResult(res.ok ? "done" : "invalid");
      })
      .catch(() => setResult("invalid"));
  }, [alertToken, signOut]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="text-center text-lg">{t.signOut[result]}</p>
    </main>
  );
}

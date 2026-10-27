import { t } from "../i18n/ar";

export function SignOutPage() {
  return (
    <main className="mx-auto max-w-xl p-5">
      <h1 className="font-display text-3xl text-green-deep">
        {t.pages.signOut}
      </h1>
    </main>
  );
}

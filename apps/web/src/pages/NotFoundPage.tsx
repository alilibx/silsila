import { t } from "../i18n/ar";

export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-xl p-5">
      <h1 className="font-display text-3xl text-green-deep">
        {t.pages.notFound}
      </h1>
    </main>
  );
}

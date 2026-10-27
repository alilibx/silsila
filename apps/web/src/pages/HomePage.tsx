import { t } from "../i18n/ar";

export function HomePage() {
  return (
    <main className="mx-auto max-w-xl p-5">
      <h1 className="font-display text-3xl text-green-deep">{t.pages.home}</h1>
    </main>
  );
}

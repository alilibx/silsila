import { Link } from "react-router";
import { t } from "../i18n/ar";

/** Dead invite links and unknown URLs get the same friendly page. */
export function NotFoundPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-5 pt-16 text-center">
      <h1 className="font-display text-3xl leading-snug text-green-deep">
        {t.notFound.dead}
      </h1>
      <Link
        to="/"
        className="flex min-h-14 w-full items-center justify-center rounded-ui border-2 border-line px-5 py-3 font-medium text-green"
      >
        {t.common.home}
      </Link>
    </main>
  );
}

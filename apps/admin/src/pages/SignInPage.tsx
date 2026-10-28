import { t } from "../i18n/ar";

export function SignInPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <h1 className="text-center text-2xl font-semibold">{t.signIn.title}</h1>
    </main>
  );
}

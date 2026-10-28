import posthog from "posthog-js";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../i18n/ar";
import { posthogLog } from "../lib/posthogLogs";
import { Button } from "./Button";

type Props = { children: ReactNode };
type State = { failed: boolean };

/**
 * Last line of defence: a render error (for example a Convex query failing because the backend
 * is mid-deploy) shows kind copy and a reload button instead of a blank page. It sits outside the
 * router, so it uses a plain link home.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const exception =
      error instanceof Error ? error : new Error("Unknown React render error");
    posthog.captureException(exception, { component_stack: info.componentStack });
    posthogLog.error("react render failed", { error_type: exception.name });
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-5 p-5 pt-16 text-center">
        <h1 className="font-display text-3xl leading-snug text-green-deep">
          {t.errorBoundary.title}
        </h1>
        <p className="text-lg leading-relaxed">{t.errorBoundary.body}</p>
        <Button onClick={() => window.location.reload()}>
          {t.errorBoundary.reload}
        </Button>
        <a
          href="/"
          className="inline-flex min-h-14 items-center justify-center font-medium text-green underline underline-offset-4"
        >
          {t.common.home}
        </a>
      </main>
    );
  }
}

import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../i18n/ar";
import { Button } from "./Button";
import { reportRenderError } from "./ErrorBoundary";

/** How long each automatic try waits; after the last one, a button takes over. */
export const RETRY_DELAYS_MS = [1_000, 3_000, 8_000] as const;

/** A page that stayed up this long starts its tries over at the shortest delay. */
const SETTLED_MS = 30_000;

type Props = {
  /** The page's address: a new one mounts the new page at once and starts the tries over. */
  resetKey: string;
  /** Show nothing while retrying (for a bar), instead of the inline message. */
  quiet?: boolean;
  children: ReactNode;
};
type State = { failed: boolean; tries: number };

/**
 * Catches a failed render inside the layout, most often a Convex query that errored (a timeout
 * on a slow or busy backend), so the rest of the screen stays. Convex only re-runs a failed query
 * once nothing uses it any more. While this shows its message the children are unmounted, so
 * mounting them again after a wait starts their queries fresh. After the automatic tries a
 * button retries; the app-wide ErrorBoundary stays the last line of defence.
 */
export class RetryBoundary extends Component<Props, State> {
  state: State = { failed: false, tries: 0 };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private mountedAt = Date.now();

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const settled = Date.now() - this.mountedAt >= SETTLED_MS;
    const tries = settled ? 0 : this.state.tries;
    // Once per incident: the automatic tries that follow are the same failure.
    if (tries === 0) reportRenderError(error, info);
    if (tries !== this.state.tries) this.setState({ tries });
    this.schedule(tries);
  }

  componentDidUpdate(previous: Props): void {
    if (previous.resetKey === this.props.resetKey) return;
    clearTimeout(this.timer);
    if (this.state.failed) this.remount(0);
    else if (this.state.tries > 0) this.setState({ tries: 0 });
  }

  componentWillUnmount(): void {
    clearTimeout(this.timer);
  }

  private schedule(tries: number): void {
    clearTimeout(this.timer);
    const delay = RETRY_DELAYS_MS[tries];
    if (delay === undefined) return;
    this.timer = setTimeout(() => this.remount(tries + 1), delay);
  }

  private remount(tries: number): void {
    this.mountedAt = Date.now();
    this.setState({ failed: false, tries });
  }

  /** The children are already unmounted, so a tap can mount them again at once. */
  private readonly tryAgain = (): void => {
    this.remount(0);
  };

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.quiet) return null;
    const retrying = this.state.tries < RETRY_DELAYS_MS.length;
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-5 p-5 pt-16 text-center">
        <h1 className="font-display text-3xl leading-snug text-green-deep">
          {t.retry.title}
        </h1>
        <p role="status" className="text-lg leading-relaxed">
          {retrying ? t.retry.retrying : t.retry.failed}
        </p>
        {!retrying && (
          <>
            <Button onClick={this.tryAgain}>{t.retry.tryAgain}</Button>
            {/* A full load: clears whatever state a lasting failure is stuck on. */}
            <a
              href="/"
              className="inline-flex min-h-14 items-center justify-center font-medium text-green underline underline-offset-4"
            >
              {t.common.home}
            </a>
          </>
        )}
      </main>
    );
  }
}

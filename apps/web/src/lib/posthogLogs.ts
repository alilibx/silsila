import posthog from "posthog-js";

type LogAttributes = Record<string, string | number | boolean>;

let logsEnabled = false;

/**
 * Initializes the browser SDK's native OTLP log transport. Console capture deliberately remains
 * disabled, so only records emitted through the helpers below leave this app.
 */
export function initializePostHogLogging(): void {
  const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
  if (!token) {
    if (import.meta.env.DEV) {
      console.error(
        new Error(
          "VITE_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_PROJECT_TOKEN is configured",
        ),
      );
    }
    return;
  }

  const host = import.meta.env.VITE_POSTHOG_HOST;
  posthog.init(token, {
    ...(host ? { api_host: host } : {}),
    logs: {
      serviceName: "wirdak-web",
      environment: import.meta.env.MODE,
    },
  });
  logsEnabled = true;

  posthog.logger.info("web application started", { runtime: "browser" });
}

/** The only logger whose records this integration exports to PostHog Logs. */
export const posthogLog = {
  info(message: string, attributes: LogAttributes): void {
    if (logsEnabled) posthog.logger.info(message, attributes);
  },
  error(message: string, attributes: LogAttributes): void {
    if (logsEnabled) posthog.logger.error(message, attributes);
  },
};

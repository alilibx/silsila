import posthog from "posthog-js";

/** The sheet shown once after a first juz': browser push, the iPhone install steps, or WhatsApp. */
export type NotificationPrompt = "push" | "install" | "whatsapp";

/** What the person chose there. "dismissed" is the sheet's own close (×, backdrop, Escape). */
export type NotificationChoice =
  "enable" | "added" | "whatsapp" | "not_now" | "dismissed";

/** `result` is the browser's answer to the push permission request, or "error" when it threw. */
export function trackPromptChoice(
  prompt: NotificationPrompt,
  choice: NotificationChoice,
  result?: string,
): void {
  posthog.capture("notification_prompt_choice", {
    prompt,
    choice,
    ...(result === undefined ? {} : { result }),
  });
}

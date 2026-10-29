import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { buttonClass } from "../../components/Button";
import { t } from "../../i18n/ar";
import { waLink, waShareLink } from "../../lib/whatsapp";
import { getSessionToken } from "../../lib/session";

/** What the People screens know of someone's WhatsApp: the fields `api.rota.people` adds. */
export type JoinState = {
  phone: string;
  joined: boolean;
  stopped: boolean;
  silenced: boolean;
};

const chip =
  "inline-flex items-center rounded-full px-3 py-0.5 text-base font-semibold";

/**
 * Opens the join link's share in WhatsApp to pick the group, or, with `phone`, a chat with that
 * one person. Nothing to show until the khatma has a join link.
 */
export function ShareJoinLink({
  title,
  joinLink,
  variant = "whatsapp",
}: {
  title: string;
  joinLink: string | null;
  variant?: "whatsapp" | "ghost";
}) {
  if (joinLink === null) return null;
  return (
    <a
      href={waShareLink(t.rota.shareMessage(title, joinLink))}
      target="_blank"
      rel="noopener"
      className={buttonClass(variant, "no-underline")}
    >
      {t.rota.shareJoin}
    </a>
  );
}

/**
 * Where someone stands with WhatsApp: joined (green), stopped it, or had it stopped for silence
 * (neutral), or not joined yet, which links to sending them the join message again.
 */
export function JoinChip({
  person,
  isMe,
  title,
  joinLink,
}: {
  person: JoinState;
  isMe: boolean;
  title: string;
  joinLink: string | null;
}) {
  if (person.stopped) {
    return (
      <span className={`${chip} min-h-9 bg-paper-2 text-ink-soft`}>
        {t.rota.stoppedMessages}
      </span>
    );
  }
  if (person.silenced) {
    return (
      <span className={`${chip} min-h-9 bg-paper-2 text-ink-soft`}>
        {t.rota.silencedMessages}
      </span>
    );
  }
  if (person.joined) {
    return (
      <span className={`${chip} min-h-9 bg-green/15 text-green-deep`}>
        {t.rota.joined}
      </span>
    );
  }
  const waiting = `${chip} bg-saffron-soft text-saffron-ink`;
  if (joinLink === null) {
    return (
      <span className={`${waiting} min-h-9`}>{t.rota.notJoinedShort}</span>
    );
  }
  // The organizer joins by sending the message themselves; anyone else gets the link in a chat.
  const href = isMe
    ? joinLink
    : waLink(
        person.phone.replace(/\D/g, ""),
        t.rota.shareMessage(title, joinLink),
      );
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={`${waiting} min-h-14 no-underline`}
    >
      {isMe ? t.rota.notJoinedMe : t.rota.notJoined}
    </a>
  );
}

/**
 * A khatma made before join links has no code yet, and a query can't draw one: ask for it once,
 * and the screen's own query brings the link. A refusal (an archived khatma) leaves it as it is.
 */
export function useEnsureJoinLink(
  inviteCode: string,
  /** Undefined while the People query loads. */
  joinLink: string | null | undefined,
) {
  const ensure = useMutation(api.rota.ensureJoinLink);
  const asked = useRef(false);
  useEffect(() => {
    if (joinLink !== null || asked.current) return;
    asked.current = true;
    ensure({ sessionToken: getSessionToken() ?? undefined, inviteCode }).catch(
      () => {},
    );
  }, [ensure, inviteCode, joinLink]);
}

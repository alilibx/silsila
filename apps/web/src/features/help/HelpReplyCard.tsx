import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { buttonClass } from "../../components/Button";
import { t } from "../../i18n/ar";
import { useSessionToken } from "../../lib/session";
import { useHelpUi } from "./helpUi";
import { useReporterToken } from "./reporterToken";

const PREVIEW = 140;

/** On the home page: a team reply nobody has read yet (spec 3.4). */
export function HelpReplyCard() {
  const sessionToken = useSessionToken();
  const reporterToken = useReporterToken() ?? undefined;
  const mine = useQuery(api.help.mine, { sessionToken, reporterToken });
  const { openSheet } = useHelpUi();
  const unread = mine?.find((r) => r.unread);
  if (!unread) return null;
  const reply = [...unread.messages].reverse().find((m) => m.from === "team");
  return (
    <section className="mb-4 rounded-ui border border-line bg-saffron-soft p-4 text-saffron-ink">
      <h2 className="font-semibold">{t.help.replyCardTitle}</h2>
      {reply?.text && (
        <p className="mt-1 line-clamp-3 leading-relaxed">
          {reply.text.slice(0, PREVIEW)}
        </p>
      )}
      <button
        type="button"
        className={buttonClass("ghost", "mt-3 min-h-11 border-saffron-ink/30")}
        onClick={() => openSheet({ requestId: unread._id })}
      >
        {t.help.openReply}
      </button>
    </section>
  );
}

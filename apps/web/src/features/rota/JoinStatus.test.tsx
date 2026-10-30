import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { t } from "../../i18n/ar";
import { JoinChip } from "./JoinStatus";

const base = { joined: false, stopped: false, silenced: false };
const link = "https://wa.me/971500000000?text=JOIN";

function chip(person: Parameters<typeof JoinChip>[0]["person"], isMe = false) {
  render(
    <JoinChip
      person={person}
      isMe={isMe}
      title="ختمة العائلة"
      daysKind="daily"
      joinLink={link}
    />,
  );
}

describe("JoinChip", () => {
  it("a person with a number who has not joined can be sent the message again", () => {
    chip({ ...base, phone: "+971501234567" });
    expect(
      screen.getByRole("link", { name: t.rota.notJoined }),
    ).toHaveAttribute("href", expect.stringContaining("971501234567"));
  });

  it("a person whose number is hidden shows no link, only that they have not joined", () => {
    chip({ ...base, phone: null });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(t.rota.notJoinedShort)).toBeInTheDocument();
  });

  it("the organizer's own chip still links, number or not", () => {
    chip({ ...base, phone: null }, true);
    expect(
      screen.getByRole("link", { name: t.rota.notJoinedMe }),
    ).toHaveAttribute("href", link);
  });
});

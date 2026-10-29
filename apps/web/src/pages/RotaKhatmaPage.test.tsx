import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { RotaKhatmaPage } from "./RotaKhatmaPage";

type Person = { id: string; name: string; isMe: boolean; juz: number[] };

const m = vi.hoisted(() => ({
  today: undefined as unknown,
  settings: undefined as unknown,
  people: undefined as unknown,
  mine: [] as unknown,
  me: null as unknown,
  fns: {
    reassign: vi.fn(),
    markDone: vi.fn(),
    markNotDone: vi.fn(),
    addParticipant: vi.fn(),
    giveJuz: vi.fn(),
    moveJuz: vi.fn(),
    removeParticipant: vi.fn(),
  },
}));

vi.mock("../lib/session", () => ({
  useSessionToken: () => "tok",
  getSessionToken: () => "tok",
  clearSessionToken: () => {},
}));
vi.mock("../features/verify/VerifySheet", () => ({
  VerifySheet: (props: { title: string; intent?: unknown }) => (
    <div role="dialog" aria-label={props.title}>
      {JSON.stringify(props.intent)}
    </div>
  ),
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: never, args: unknown) => {
      const name = getFunctionName(ref);
      if (args === "skip") return undefined;
      if (name === "rota:today") return m.today;
      if (name === "rota:settings") return m.settings;
      if (name === "rota:people") return m.people;
      if (name === "khatmas:mine") return m.mine;
      if (name === "sessions:me") return m.me;
      throw new Error(`unexpected query ${name}`);
    },
    useMutation: (ref: never) =>
      m.fns[getFunctionName(ref).split(":")[1] as keyof typeof m.fns],
  };
});

const settings = {
  name: "ختمة العائلة",
  days: { kind: "daily" },
  firstDate: "2026-10-30",
  firstDatePassed: true,
  endDate: null,
  timeZone: "UTC",
  messages: {
    dayAt: 480,
    reminder: { at: 960, on: true },
    unread: { at: 1140, on: true },
    summary: { at: 1260, on: false },
  },
  pausedAt: null,
  pauseDates: [],
  upcoming: [],
  quiet: { startHour: 22, endHour: 7 },
};

const people = [
  { id: "p1", name: "علي", isMe: true },
  { id: "p2", name: "مريم", isMe: false },
  { id: "p3", name: "سارة", isMe: false },
];

/** Khatma 12 on Tuesday 10 November: 27 done, juz' 8 unread (Sara's), 9 given to Maryam, 10 unread. */
function todayView(overrides: Record<string, unknown> = {}) {
  return {
    day: {
      number: 12,
      cycle: 1,
      date: "2026-11-10",
      doneCount: 27,
      completedAt: null,
    },
    next: { number: 13, date: "2026-11-11" },
    paused: false,
    archived: false,
    tiles: Array.from({ length: 30 }, (_, i) => {
      const juz = i + 1;
      const state =
        juz === 8 || juz === 10 ? "unread" : juz === 9 ? "reassigned" : "done";
      return {
        readId: `r${juz}`,
        juz,
        state,
        holderName: juz === 8 ? "سارة" : juz === 9 ? "خالد" : "مريم",
        readerName: juz === 9 ? "مريم" : "مريم",
        readerId: juz === 9 ? "p2" : juz === 8 ? "p3" : "p2",
      };
    }),
    participants: people.map((p) => ({ ...p, doneToday: p.id !== "p3" })),
    ...overrides,
  };
}

function peopleView(
  holders: Person[],
  target = { number: 13, date: "2026-11-11", isFirst: false },
) {
  const byJuz = new Map<number, Person>();
  for (const p of holders) for (const juz of p.juz) byJuz.set(juz, p);
  return {
    target,
    rows: Array.from({ length: 30 }, (_, i) => {
      const p = byJuz.get(i + 1);
      return {
        juz: i + 1,
        participant: p
          ? { id: p.id, name: p.name, isMe: p.isMe, slots: p.juz.length }
          : null,
      };
    }),
    participants: holders,
    freeJuz: Array.from({ length: 30 }, (_, i) => i + 1).filter(
      (j) => !byJuz.has(j),
    ),
    maxSlots: 3,
  };
}

const roster: Person[] = [
  { id: "p1", name: "علي", isMe: true, juz: [1] },
  { id: "p2", name: "مريم", isMe: false, juz: [2, 3] },
  { id: "p3", name: "سارة", isMe: false, juz: [4] },
];

function renderAt(url = "/j/CODE") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/j/:inviteCode" element={<Page />} />
      </Routes>
    </MemoryRouter>,
  );
}
function Page() {
  return <RotaKhatmaPage inviteCode="CODE" name="ختمة العائلة" />;
}

const grid = () => screen.getByRole("region", { name: t.rota.gridLabel });
const args = { sessionToken: "tok", inviteCode: "CODE" };

beforeEach(() => {
  // Tuesday 10 November, noon in UTC, the khatma's time zone.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
  for (const fn of Object.values(m.fns)) {
    fn.mockReset().mockResolvedValue({ ok: true });
  }
  m.today = todayView();
  m.settings = settings;
  m.people = peopleView(roster);
  m.mine = [];
  m.me = { displayName: "علي" };
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Today", () => {
  it("shows the day, the count and when the next one comes", () => {
    renderAt();
    expect(
      screen.getByRole("heading", { name: "ختمة العائلة" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("الختمة ١٢ · الثلاثاء ١٠ نوفمبر"),
    ).toBeInTheDocument();
    expect(screen.getByText("٢٧ / ٣٠")).toBeInTheDocument();
    expect(
      screen.getByText("التالي: الختمة ١٣ · غداً ٨:٠٠ ص"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/الدورة/)).toBeNull();
  });

  it("names a later date instead of «غداً» and the cycle after the first", () => {
    m.today = todayView({
      day: {
        number: 42,
        cycle: 2,
        date: "2026-11-10",
        doneCount: 27,
        completedAt: null,
      },
      next: { number: 43, date: "2026-11-17" },
    });
    renderAt();
    expect(screen.getByText("الدورة ٢")).toBeInTheDocument();
    expect(
      screen.getByText("التالي: الختمة ٤٣ · الثلاثاء ١٧ نوفمبر ٨:٠٠ ص"),
    ).toBeInTheDocument();
  });

  it("draws the 30 ajza' with their states", () => {
    renderAt();
    const tiles = within(grid()).getAllByRole("button");
    expect(tiles).toHaveLength(30);
    const named = (word: string) =>
      tiles.filter((tile) => tile.getAttribute("aria-label")?.endsWith(word));
    expect(named(t.rota.legendDone)).toHaveLength(27);
    expect(named(t.rota.legendUnread)).toHaveLength(2);
    expect(named(t.rota.legendReassigned)).toHaveLength(1);
    expect(tiles[7]).toHaveAccessibleName("الجزء ٨، لم يُقرأ");
  });

  it("says when the day is complete", () => {
    m.today = todayView({
      day: {
        number: 12,
        cycle: 1,
        date: "2026-11-10",
        doneCount: 30,
        completedAt: 1,
      },
    });
    renderAt();
    expect(screen.getByRole("status")).toHaveTextContent("اكتملت الختمة ١٢");
  });

  it("shows a banner while paused", () => {
    m.today = todayView({ paused: true, next: { number: 13, date: null } });
    renderAt();
    expect(screen.getByText(t.rota.pausedBanner)).toBeInTheDocument();
    expect(screen.queryByText(/التالي/)).toBeNull();
  });

  it("with no open day, says when the khatma starts and draws no grid", () => {
    m.today = todayView({
      day: null,
      tiles: [],
      next: { number: 1, date: "2026-10-30" },
    });
    renderAt();
    expect(
      screen.getByText("تبدأ الختمة ١ يوم الجمعة ٣٠ أكتوبر الساعة ٨:٠٠ ص"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: t.rota.gridLabel })).toBeNull();
  });

  it("an unread juz' shows who holds it, with the three actions", async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(
      within(grid()).getByRole("button", { name: "الجزء ٨، لم يُقرأ" }),
    );
    const sheet = screen.getByRole("dialog", { name: "الجزء ٨ لم يُقرأ بعد" });
    expect(within(sheet).getByText("صاحبه اليوم: سارة")).toBeInTheDocument();
    for (const action of [t.rota.assign, t.rota.readMyself, t.rota.markDone]) {
      expect(
        within(sheet).getByRole("button", { name: action }),
      ).toBeInTheDocument();
    }
  });

  it("a reassigned juz' also says who reads it now", async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(
      within(grid()).getByRole("button", { name: "الجزء ٩، أُسند" }),
    );
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("صاحبه اليوم: خالد")).toBeInTheDocument();
    expect(within(sheet).getByText("يقرؤه الآن: مريم")).toBeInTheDocument();
  });

  it("reassigns to the chosen participant, marking who finished today", async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(
      within(grid()).getByRole("button", { name: "الجزء ٨، لم يُقرأ" }),
    );
    await user.click(screen.getByRole("button", { name: t.rota.assign }));
    const sheet = screen.getByRole("dialog", {
      name: "من يقرأ الجزء ٨ اليوم؟",
    });
    expect(
      within(sheet).getByRole("button", { name: /مريم/ }),
    ).toHaveTextContent(t.rota.finishedToday);
    expect(
      within(sheet).getByRole("button", { name: /سارة/ }),
    ).not.toHaveTextContent(t.rota.finishedToday);
    await user.click(within(sheet).getByRole("button", { name: /مريم/ }));
    expect(m.fns.reassign).toHaveBeenCalledWith({
      ...args,
      readId: "r8",
      participantId: "p2",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("«سأقرؤه أنا» gives it to the organizer", async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(
      within(grid()).getByRole("button", { name: "الجزء ٨، لم يُقرأ" }),
    );
    await user.click(screen.getByRole("button", { name: t.rota.readMyself }));
    expect(m.fns.reassign).toHaveBeenCalledWith({
      ...args,
      readId: "r8",
      participantId: "p1",
    });
  });

  it("«سجّله تامّاً» marks it done", async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(
      within(grid()).getByRole("button", { name: "الجزء ٨، لم يُقرأ" }),
    );
    await user.click(screen.getByRole("button", { name: t.rota.markDone }));
    expect(m.fns.markDone).toHaveBeenCalledWith({ ...args, readId: "r8" });
  });

  it("a done juz' can be taken back", async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(
      within(grid()).getByRole("button", { name: "الجزء ١، تمّ" }),
    );
    const sheet = screen.getByRole("dialog", { name: "الجزء ١ تمّت قراءته" });
    expect(within(sheet).getByText("قرأه: مريم")).toBeInTheDocument();
    await user.click(
      within(sheet).getByRole("button", { name: t.rota.undoDone }),
    );
    expect(m.fns.markNotDone).toHaveBeenCalledWith({ ...args, readId: "r1" });
  });

  it.each([
    [{ error: "closed" }, t.rota.todayErrors.closed],
    [{ error: "done" }, t.rota.todayErrors.done],
  ])(
    "keeps the sheet and says why a change was refused (%j)",
    async (result, message) => {
      m.fns.reassign.mockResolvedValue(result);
      const user = userEvent.setup();
      renderAt();
      await user.click(
        within(grid()).getByRole("button", { name: "الجزء ٨، لم يُقرأ" }),
      );
      await user.click(screen.getByRole("button", { name: t.rota.readMyself }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message ?? "");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    },
  );

  it("maps a thrown error code, and a failed call is a network error", async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(
      within(grid()).getByRole("button", { name: "الجزء ٨، لم يُقرأ" }),
    );
    m.fns.markDone.mockRejectedValue(new ConvexError({ code: "forbidden" }));
    await user.click(screen.getByRole("button", { name: t.rota.markDone }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      t.rota.errors.forbidden ?? "",
    );
    m.fns.markDone.mockRejectedValue(new Error("offline"));
    await user.click(screen.getByRole("button", { name: t.rota.markDone }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      t.errors.network,
    );
  });

  it("leaves the grid alone once the khatma is archived", () => {
    m.today = todayView({ archived: true });
    renderAt();
    for (const tile of within(grid()).getAllByRole("button")) {
      expect(tile).toBeDisabled();
    }
  });
});

describe("page", () => {
  it("shows only the short WhatsApp page to anyone but the organizer, titled with the khatma's name", () => {
    m.today = null;
    renderAt();
    expect(
      screen.getByRole("heading", { name: "ختمة العائلة" }),
    ).toBeInTheDocument();
    expect(screen.getByText(t.rota.whatsappOnly)).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    // Signed in, so there is nothing to sign in to.
    expect(
      screen.queryByRole("button", { name: t.rota.imOrganizer }),
    ).toBeNull();
  });

  it("offers a signed-out visitor the sign-in sheet, to come back here as the organizer", async () => {
    m.today = null;
    m.me = null;
    const user = userEvent.setup();
    renderAt();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: t.rota.imOrganizer }));
    expect(
      screen.getByRole("dialog", { name: t.signIn.title }),
    ).toHaveTextContent('{"kind":"signin"}');
  });

  it("waits for the answer", () => {
    m.today = undefined;
    renderAt();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
  });

  it("has the two tabs, the settings link and no switch button with one khatma", () => {
    renderAt();
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["اليوم", "المشاركون"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("link", { name: t.khatmaSettings.link }),
    ).toHaveAttribute("href", "/j/CODE/settings");
    expect(
      screen.queryByRole("button", { name: t.nav.switchKhatma }),
    ).toBeNull();
  });

  it("offers to switch khatmas when there are two", () => {
    const card = {
      name: "أ",
      createdAt: 0,
      kind: "pool",
      done: 3,
      holding: null,
      hasNote: false,
      schedule: "daily",
    };
    m.mine = [
      { ...card, inviteCode: "CODE", kind: "rota" },
      { ...card, inviteCode: "OTHER" },
    ];
    renderAt();
    expect(
      screen.getByRole("button", { name: t.nav.switchKhatma }),
    ).toBeInTheDocument();
  });

  it("opens the People tab from the URL and switches with the tabs", async () => {
    const user = userEvent.setup();
    renderAt("/j/CODE?tab=people");
    expect(screen.getByRole("tab", { name: "المشاركون" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("list")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "اليوم" }));
    expect(screen.getByText("٢٧ / ٣٠")).toBeInTheDocument();
  });
});

describe("People", () => {
  const rows = () => within(screen.getByRole("list")).getAllByRole("listitem");

  it("shows the next khatma's banner and 30 rows, the open ones inviting an add", () => {
    renderAt("/j/CODE?tab=people");
    expect(
      screen.getByText(
        /الختمة ١٣ يوم الأربعاء ١١ نوفمبر. هذا جزء كل مشارك فيها/,
      ),
    ).toBeInTheDocument();
    expect(rows()).toHaveLength(30);
    expect(rows()[0]).toHaveTextContent("أنا");
    expect(rows()[1]).toHaveTextContent("مريم");
    expect(rows()[2]).toHaveTextContent("مريم");
    expect(rows()[2]).toHaveTextContent(t.rota.secondJuz);
    expect(rows()[1]).not.toHaveTextContent(t.rota.secondJuz);
    expect(rows()[6]).toHaveTextContent("+ أضف قارئاً للجزء ٧");
  });

  it("before the start, says whose juz' khatma 1 holds", () => {
    m.people = peopleView(roster, {
      number: 1,
      date: "2026-10-30",
      isFirst: true,
    });
    renderAt("/j/CODE?tab=people");
    expect(
      screen.getByText("جزء كل مشارك في الختمة ١، يوم الجمعة ٣٠ أكتوبر"),
    ).toBeInTheDocument();
  });

  it("an empty row opens the add sheet and sends the name, the number and that juz'", async () => {
    m.fns.addParticipant.mockResolvedValue({
      ok: true,
      participantId: "p9",
      juz: 7,
    });
    const user = userEvent.setup();
    renderAt("/j/CODE?tab=people");
    await user.click(rows()[6]?.querySelector("button") as HTMLElement);
    const sheet = screen.getByRole("dialog", { name: "قارئ الجزء ٧" });
    expect(
      within(sheet).getByText(
        "يقرأ الجزء ٧ في الختمة ١٣، ثم ٨ في الختمة ١٤، وهكذا.",
      ),
    ).toBeInTheDocument();
    await user.type(within(sheet).getByLabelText(t.rota.personName), "خالد");
    await user.type(
      within(sheet).getByLabelText(t.rota.personPhone),
      "+971500000007",
    );
    await user.click(within(sheet).getByRole("button", { name: t.rota.add }));
    expect(m.fns.addParticipant).toHaveBeenCalledWith({
      ...args,
      name: "خالد",
      phone: "+971500000007",
      juz: 7,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("wraps the walk after juz' 30 and khatma 30", async () => {
    m.people = peopleView(roster, {
      number: 30,
      date: "2026-11-11",
      isFirst: false,
    });
    const user = userEvent.setup();
    renderAt("/j/CODE?tab=people");
    await user.click(rows()[29]?.querySelector("button") as HTMLElement);
    expect(
      screen.getByText("يقرأ الجزء ٣٠ في الختمة ٣٠، ثم ١ في الختمة ١، وهكذا."),
    ).toBeInTheDocument();
  });

  it("keeps the add sheet open and says why when the number is refused", async () => {
    m.fns.addParticipant.mockResolvedValue({ error: "bad_phone" });
    const user = userEvent.setup();
    renderAt("/j/CODE?tab=people");
    await user.click(rows()[6]?.querySelector("button") as HTMLElement);
    await user.type(screen.getByLabelText(t.rota.personName), "خالد");
    await user.type(screen.getByLabelText(t.rota.personPhone), "1");
    await user.click(screen.getByRole("button", { name: t.rota.add }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      t.rota.addErrors.bad_phone ?? "",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("a filled row moves its person to a free juz'", async () => {
    const user = userEvent.setup();
    renderAt("/j/CODE?tab=people");
    await user.click(rows()[3]?.querySelector("button") as HTMLElement);
    const sheet = screen.getByRole("dialog", { name: "سارة" });
    // The first free juz' is preselected.
    expect(within(sheet).getByLabelText(t.rota.moveLabel)).toHaveValue("5");
    await user.selectOptions(
      within(sheet).getByLabelText(t.rota.moveLabel),
      "12",
    );
    await user.click(within(sheet).getByRole("button", { name: t.rota.move }));
    expect(m.fns.moveJuz).toHaveBeenCalledWith({
      ...args,
      participantId: "p3",
      fromJuz: 4,
      toJuz: 12,
    });
  });

  it("says who a person swaps with when the juz' is held", async () => {
    const user = userEvent.setup();
    renderAt("/j/CODE?tab=people");
    await user.click(rows()[3]?.querySelector("button") as HTMLElement);
    const sheet = screen.getByRole("dialog");
    await user.selectOptions(
      within(sheet).getByLabelText(t.rota.moveLabel),
      "1",
    );
    expect(within(sheet).getByText(t.rota.swapsWithMe)).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: t.rota.move }));
    expect(m.fns.moveJuz).toHaveBeenCalledWith(
      expect.objectContaining({ fromJuz: 4, toJuz: 1 }),
    );
  });

  it("names the person a juz' swaps with when it is not the organizer", async () => {
    const user = userEvent.setup();
    renderAt("/j/CODE?tab=people");
    await user.click(rows()[3]?.querySelector("button") as HTMLElement);
    await user.selectOptions(screen.getByLabelText(t.rota.moveLabel), "2");
    expect(
      within(screen.getByRole("dialog")).getByText("سيتبادل مع مريم", {
        selector: "p",
      }),
    ).toBeInTheDocument();
  });

  it("gives the person the next free juz' as a second one", async () => {
    const user = userEvent.setup();
    renderAt("/j/CODE?tab=people");
    await user.click(rows()[3]?.querySelector("button") as HTMLElement);
    await user.click(
      screen.getByRole("button", { name: new RegExp(t.rota.giveMore) }),
    );
    expect(m.fns.giveJuz).toHaveBeenCalledWith({
      ...args,
      participantId: "p3",
      juz: 5,
    });
  });

  it("offers no second juz' to someone who reads the most already", async () => {
    m.people = peopleView([
      { id: "p1", name: "علي", isMe: true, juz: [1, 2, 3] },
    ]);
    const user = userEvent.setup();
    renderAt("/j/CODE?tab=people");
    await user.click(rows()[0]?.querySelector("button") as HTMLElement);
    expect(
      screen.queryByRole("button", { name: new RegExp(t.rota.giveMore) }),
    ).toBeNull();
  });

  it("removes someone only after asking", async () => {
    const user = userEvent.setup();
    renderAt("/j/CODE?tab=people");
    await user.click(rows()[3]?.querySelector("button") as HTMLElement);
    await user.click(screen.getByRole("button", { name: t.rota.remove }));
    expect(m.fns.removeParticipant).not.toHaveBeenCalled();
    const sheet = screen.getByRole("dialog", { name: "أزل سارة من الختمة؟" });
    await user.click(
      within(sheet).getByRole("button", { name: t.rota.removeConfirm }),
    );
    expect(m.fns.removeParticipant).toHaveBeenCalledWith({
      ...args,
      participantId: "p3",
    });
  });

  it("backing out of the removal removes nobody", async () => {
    const user = userEvent.setup();
    renderAt("/j/CODE?tab=people");
    await user.click(rows()[3]?.querySelector("button") as HTMLElement);
    await user.click(screen.getByRole("button", { name: t.rota.remove }));
    await user.click(screen.getByRole("button", { name: t.rota.cancel }));
    expect(m.fns.removeParticipant).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "سارة" })).toBeInTheDocument();
  });

  it("the organizer's own row cannot be removed", async () => {
    const user = userEvent.setup();
    renderAt("/j/CODE?tab=people");
    await user.click(rows()[0]?.querySelector("button") as HTMLElement);
    expect(screen.getByRole("dialog", { name: t.rota.me })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.rota.remove })).toBeNull();
  });

  it("shows a refused move without closing", async () => {
    m.fns.moveJuz.mockResolvedValue({ error: "not_found" });
    const user = userEvent.setup();
    renderAt("/j/CODE?tab=people");
    await user.click(rows()[3]?.querySelector("button") as HTMLElement);
    await user.click(screen.getByRole("button", { name: t.rota.move }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      t.rota.peopleErrors.not_found ?? "",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

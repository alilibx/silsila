import { SETTING_SPECS } from "@convex/lib/settingSpecs";
import { SETTING_DEFAULTS, type SettingKey } from "@convex/lib/settings";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { SettingsPage } from "./SettingsPage";

const rows = (Object.keys(SETTING_DEFAULTS) as SettingKey[]).map((key) => ({
  key,
  value: key === "maxMembers" ? 40 : SETTING_DEFAULTS[key],
  defaultValue: SETTING_DEFAULTS[key],
  isDefault: key !== "maxMembers",
  spec: SETTING_SPECS[key],
}));

vi.mock("convex/react", () => ({
  useQuery: () => rows,
  useMutation: () => vi.fn(),
}));
vi.mock("../lib/adminSession", () => ({ useAdminToken: () => "tok" }));

function Url() {
  return <output data-testid="url">{useLocation().search}</output>;
}

function renderAt(search = "") {
  render(
    <MemoryRouter initialEntries={[`/settings${search}`]}>
      <SettingsPage />
      <Url />
    </MemoryRouter>,
  );
}

const panel = () => screen.getByRole("tabpanel");
const label = (key: SettingKey) => t.settings.labels[key];

describe("SettingsPage", () => {
  it("shows one group at a time, starting with the switches", () => {
    renderAt();
    expect(
      screen.getByRole("tab", { name: /المفاتيح/, selected: true }),
    ).toBeInTheDocument();
    expect(
      within(panel()).getByText(label("maintenanceMode")),
    ).toBeInTheDocument();
    expect(
      within(panel()).queryByText(label("maxMembers")),
    ).not.toBeInTheDocument();
  });

  it("switches group from the tabs and keeps it in the URL", async () => {
    renderAt();
    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(t.settings.groups.limits) }),
    );
    expect(screen.getByTestId("url")).toHaveTextContent("group=limits");
    expect(within(panel()).getByText(label("maxMembers"))).toBeInTheDocument();
    expect(
      within(panel()).getByText(t.settings.sections.signInAbuse),
    ).toBeInTheDocument();
  });

  it("lists only changed settings on the changed tab", () => {
    renderAt("?group=changed");
    expect(within(panel()).getByText(label("maxMembers"))).toBeInTheDocument();
    expect(
      within(panel()).queryByText(label("maintenanceMode")),
    ).not.toBeInTheDocument();
  });

  it("searches every group by name and description", async () => {
    renderAt();
    await userEvent.type(
      screen.getByRole("searchbox", { name: t.settings.searchLabel }),
      "واتساب",
    );
    expect(
      within(panel()).getByText(label("verificationTtlMs")),
    ).toBeInTheDocument();
    expect(
      within(panel()).getByText(label("verifyPerPhonePerHour")),
    ).toBeInTheDocument();
    expect(
      within(panel()).queryByText(label("maintenanceMode")),
    ).not.toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    renderAt();
    await userEvent.type(
      screen.getByRole("searchbox", { name: t.settings.searchLabel }),
      "zzzz",
    );
    expect(screen.getByText(t.settings.noResults)).toBeInTheDocument();
  });
});

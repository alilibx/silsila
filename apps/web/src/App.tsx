import { Route, Routes } from "react-router";
import { HandoffGate } from "./features/handoff/HandoffGate";
import { useHandoffManifest } from "./features/handoff/useHandoffManifest";
import { HelpButton } from "./features/help/HelpButton";
import { HelpProvider } from "./features/help/helpUi";
import { useClaimVisitorHelp } from "./features/help/useClaimVisitorHelp";
import { useHelpDeepLink } from "./features/help/useHelpDeepLink";
import { StatusBanners } from "./features/status/StatusBanners";
import { useTouch } from "./lib/useTouch";
import { CreatePage } from "./pages/CreatePage";
import { HomePage } from "./pages/HomePage";
import { KhatmaPage } from "./pages/KhatmaPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OrganizerPage } from "./pages/OrganizerPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignOutPage } from "./pages/SignOutPage";

/** Opens a help conversation from a reply push (`/?help=<id>`). Needs the provider. */
function HelpDeepLink() {
  useHelpDeepLink();
  return null;
}

export function App() {
  useTouch();
  useHandoffManifest();
  useClaimVisitorHelp();
  return (
    <HandoffGate>
      <HelpProvider>
        <StatusBanners />
        <HelpButton />
        <HelpDeepLink />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/new" element={<CreatePage />} />
          <Route path="/j/:inviteCode" element={<KhatmaPage />} />
          <Route path="/j/:inviteCode/settings" element={<OrganizerPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/signout" element={<SignOutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </HelpProvider>
    </HandoffGate>
  );
}

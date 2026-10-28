import { Route, Routes } from "react-router";
import { HandoffGate } from "./features/handoff/HandoffGate";
import { useHandoffManifest } from "./features/handoff/useHandoffManifest";
import { StatusBanners } from "./features/status/StatusBanners";
import { useTouch } from "./lib/useTouch";
import { CreatePage } from "./pages/CreatePage";
import { HomePage } from "./pages/HomePage";
import { KhatmaPage } from "./pages/KhatmaPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OrganizerPage } from "./pages/OrganizerPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignOutPage } from "./pages/SignOutPage";

export function App() {
  useTouch();
  useHandoffManifest();
  return (
    <HandoffGate>
      <StatusBanners />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/new" element={<CreatePage />} />
        <Route path="/j/:inviteCode" element={<KhatmaPage />} />
        <Route path="/j/:inviteCode/settings" element={<OrganizerPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/signout" element={<SignOutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HandoffGate>
  );
}

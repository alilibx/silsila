import { Route, Routes } from "react-router";
import { HandoffGate } from "./features/handoff/HandoffGate";
import { useTouch } from "./lib/useTouch";
import { CreatePage } from "./pages/CreatePage";
import { HomePage } from "./pages/HomePage";
import { KhatmaPage } from "./pages/KhatmaPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignOutPage } from "./pages/SignOutPage";

export function App() {
  useTouch();
  return (
    <HandoffGate>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/new" element={<CreatePage />} />
        <Route path="/j/:inviteCode" element={<KhatmaPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/signout" element={<SignOutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HandoffGate>
  );
}

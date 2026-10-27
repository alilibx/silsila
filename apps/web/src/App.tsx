import { Route, Routes } from "react-router";
import { CreatePage } from "./pages/CreatePage";
import { HomePage } from "./pages/HomePage";
import { KhatmaPage } from "./pages/KhatmaPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SignOutPage } from "./pages/SignOutPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/new" element={<CreatePage />} />
      <Route path="/j/:inviteCode" element={<KhatmaPage />} />
      <Route path="/signout" element={<SignOutPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

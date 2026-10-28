import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { useAdminToken } from "./lib/adminSession";
import { SignInPage } from "./pages/SignInPage";

export function App() {
  const adminToken = useAdminToken();
  const me = useQuery(api.adminAuth.me, {
    adminToken: adminToken ?? undefined,
  });

  if (me === undefined) return null;
  if (me === null) return <SignInPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={null} />
        <Route path="/settings" element={null} />
        <Route path="/audit" element={null} />
        <Route path="/admins" element={null} />
        <Route path="*" element={null} />
      </Route>
    </Routes>
  );
}

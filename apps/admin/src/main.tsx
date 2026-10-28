import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ErrorBoundary } from "@web/components/ErrorBoundary";
import { App } from "./App";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  // Developer-facing setup error, deliberately plain (not part of the Arabic UI).
  root.render(
    <pre style={{ padding: 24, whiteSpace: "pre-wrap", direction: "ltr" }}>
      Missing VITE_CONVEX_URL. Set it in apps/admin/.env.local and restart the
      dev server.
    </pre>,
  );
} else {
  const convex = new ConvexReactClient(convexUrl);
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <ConvexProvider client={convex}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ConvexProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

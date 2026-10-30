import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetDeleting } from "../features/khatma/deleting";

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  // The delete state is module-wide; a case must not leave a khatma "being deleted".
  resetDeleting();
});

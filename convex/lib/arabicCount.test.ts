import { expect, test } from "vitest";
import { counted } from "./arabicCount";

const DAYS = { few: "أيام", many: "يوماً", other: "يوم" };

test("a counted noun agrees with its number", () => {
  expect(counted(4, DAYS)).toBe("٤ أيام");
  expect(counted(10, DAYS)).toBe("١٠ أيام");
  expect(counted(11, DAYS)).toBe("١١ يوماً");
  expect(counted(99, DAYS)).toBe("٩٩ يوماً");
  expect(counted(100, DAYS)).toBe("١٠٠ يوم");
  expect(counted(103, DAYS)).toBe("١٠٣ أيام");
  expect(counted(150, DAYS)).toBe("١٥٠ يوماً");
  expect(counted(0, DAYS)).toBe("٠ يوم");
  expect(counted(1, DAYS)).toBe("١ يوم");
  expect(counted(2, DAYS)).toBe("٢ يوم");
});

test("a decimal takes the singular, with the digits it's given", () => {
  expect(counted(29.4, DAYS, "٢٩٫٤")).toBe("٢٩٫٤ يوم");
});

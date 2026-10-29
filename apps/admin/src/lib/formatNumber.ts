const COUNT = new Intl.NumberFormat("ar", { numberingSystem: "arab" });
const DECIMAL = new Intl.NumberFormat("ar", {
  numberingSystem: "arab",
  maximumFractionDigits: 1,
});

/** A count in Arabic digits, grouped: "١٬٠٣٨". */
export function formatCount(n: number): string {
  return COUNT.format(n);
}

/** A number with at most one decimal: "١٩٠٫٥". */
export function formatDecimal(n: number): string {
  return DECIMAL.format(n);
}

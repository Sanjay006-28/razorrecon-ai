/**
 * Centralized constants for exception categories, labels, colors, and severity levels.
 * Ensures consistent badge and chart styling across Dashboard, Exceptions, and Reports.
 */

export const ALL_EXCEPTION_TYPES = [
  "ALL",
  "UNMATCHED_NO_SETTLEMENT",
  "UNMATCHED_NO_BANK_CREDIT",
  "DUPLICATE_BANK_CREDIT",
  "AMOUNT_MISMATCH",
  "DUPLICATE",
  "DELAYED_SETTLEMENT",
] as const;

export const EXC_LABELS: Record<string, string> = {
  ALL:                      "All Types",
  UNMATCHED_NO_SETTLEMENT:  "No Settlement",
  UNMATCHED_NO_BANK_CREDIT: "No Bank Credit",
  DUPLICATE_BANK_CREDIT:    "Duplicate Bank Credit",
  AMOUNT_MISMATCH:          "Amount Mismatch",
  DUPLICATE:                "Duplicate Payment",
  DELAYED_SETTLEMENT:       "Delayed Settlement",
};

export const EXC_SHORT_LABELS: Record<string, string> = {
  ALL:                      "All",
  UNMATCHED_NO_SETTLEMENT:  "No Settlement",
  UNMATCHED_NO_BANK_CREDIT: "No Bank Credit",
  DUPLICATE_BANK_CREDIT:    "Dup Bank Credit",
  AMOUNT_MISMATCH:          "Amt Mismatch",
  DUPLICATE:                "Duplicate",
  DELAYED_SETTLEMENT:       "Delayed",
};

/**
 * Canonical Hex Colors used in Charts (Recharts, SVGs)
 */
export const EXC_HEX_COLORS: Record<string, string> = {
  UNMATCHED_NO_SETTLEMENT:  "#EF4444", // Red-500
  UNMATCHED_NO_BANK_CREDIT: "#F97316", // Orange-500
  DUPLICATE_BANK_CREDIT:    "#F43F5E", // Rose-500
  AMOUNT_MISMATCH:          "#EAB308", // Yellow-500
  DUPLICATE:                "#A855F7", // Purple-500
  DELAYED_SETTLEMENT:       "#3B82F6", // Blue-500
};

/**
 * Canonical Tailwind Badge Classes for Exception Types
 */
export const EXC_BADGE_CLASSES: Record<string, string> = {
  UNMATCHED_NO_SETTLEMENT:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800/40",
  UNMATCHED_NO_BANK_CREDIT: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800/40",
  DUPLICATE_BANK_CREDIT:    "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800/40",
  AMOUNT_MISMATCH:          "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/40",
  DUPLICATE:                "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800/40",
  DELAYED_SETTLEMENT:       "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800/40",
};

/**
 * Severity ranking and visual badge classes
 */
export const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

export const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  high:     "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
  medium:   "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
  low:      "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
  info:     "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600",
};

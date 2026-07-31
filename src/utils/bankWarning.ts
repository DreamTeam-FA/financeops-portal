/**
 * Bank Balance Warning Helper
 * $500 below = "Critically Low" color red
 * $1000 below = "Low" color yellow/amber
 */

export interface BankWarning {
  label: "Critically Low" | "Low";
  badgeClass: string;
  bgClass: string;
  textClass: string;
  borderColor: string;
}

export function getBankBalanceWarning(balance: number): BankWarning | null {
  if (balance < 500) {
    return {
      label: "Critically Low",
      badgeClass: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
      bgClass: "bg-red-500",
      textClass: "text-red-600 dark:text-red-400",
      borderColor: "border-red-500/40"
    };
  }
  if (balance < 1000) {
    return {
      label: "Low",
      badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
      bgClass: "bg-amber-500",
      textClass: "text-amber-700 dark:text-amber-400",
      borderColor: "border-amber-500/40"
    };
  }
  return null;
}

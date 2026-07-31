/**
 * User Greeting Name Mapper and Viewer Local Time Utility
 */

export function getUserGreetingName(userEmail?: string, googleDisplayName?: string): string {
  const email = (userEmail || "").toLowerCase().trim();

  if (email === "accounting@marktimm.com") return "Norlan";
  if (email === "finances@marktimm.com") return "Micah";
  if (email === "monica@marktimm.com") return "Monica";
  if (email === "izabela@marktimm.com" || email === "izabela@elevateonecommerce.com") return "Iza";
  if (email === "mt@marktimm.com") return "Mark";

  if (googleDisplayName) {
    const firstName = googleDisplayName.trim().split(" ")[0];
    if (firstName) return firstName;
  }

  if (email && email.includes("@")) {
    const raw = email.split("@")[0];
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  return "User";
}

export function getViewerFormattedTime(date: Date = new Date()): string {
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });

  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let tzPart = "";
  try {
    tzPart = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value || tzName;
  } catch (e) {
    tzPart = tzName;
  }

  return `${dateStr} • ${timeStr} (${tzPart})`;
}

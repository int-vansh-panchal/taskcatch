/**
 * Indian Context Date & Time Resolver
 * Resolves relative date/time expressions commonly used in Hindi, Gujarati, Hinglish and English:
 * - "aaj shaam" -> today at 18:00
 * - "kal", "kal subah", "kal shaam", "kal dopahar" -> tomorrow
 * - "parso" / "parson" / "પરમ દિવસે" -> 2 days ahead
 * - "agle somvar", "agle hafte", "next monday", etc.
 */

export interface DateResolutionOptions {
  baseDate: Date; // Session recording timestamp
  timezone?: string; // Default 'Asia/Calcutta'
}

const HINDI_WEEKDAYS: Record<string, number> = {
  somvar: 1,
  somwar: 1,
  mangalvar: 2,
  mangalwar: 2,
  budhvar: 3,
  budhwar: 3,
  guruvar: 4,
  guruwar: 4,
  veervar: 4,
  veerwar: 4,
  shukravar: 5,
  shukrawar: 5,
  shanivar: 6,
  shaniwar: 6,
  ravivar: 0,
  raviwar: 0,
  itvar: 0,
  itwar: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 0,
  som: 1,
  mangal: 2,
  budh: 3,
  guru: 4,
  shukra: 5,
  shani: 6,
  ravi: 0,
};

export function resolveIndianRelativeDate(
  expression: string | null | undefined,
  options: DateResolutionOptions
): string | null {
  if (!expression || !expression.trim()) {
    return null;
  }

  const raw = expression.trim().toLowerCase();
  const base = new Date(options.baseDate);
  const target = new Date(base);

  // Default hour/minute presets (in 24-hr local time)
  let targetHour = 18; // Default to end-of-workday 18:00 (6 PM)
  let targetMinute = 0;

  if (raw.includes("subah") || raw.includes("morning") || raw.includes("સવારે")) {
    targetHour = 10; // 10:00 AM
  } else if (raw.includes("dopahar") || raw.includes("afternoon") || raw.includes("બપોરે")) {
    targetHour = 14; // 2:00 PM
  } else if (raw.includes("shaam") || raw.includes("evening") || raw.includes("સાંજે")) {
    targetHour = 18; // 6:00 PM
  } else if (raw.includes("raat") || raw.includes("night") || raw.includes("રાત્રે")) {
    targetHour = 21; // 9:00 PM
  }

  // Check specific time format like "5 pm", "10 am", "5:30 pm"
  const timeMatch = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const isPm = timeMatch[3].toLowerCase() === "pm";
    if (isPm && h < 12) h += 12;
    if (!isPm && h === 12) h = 0;
    targetHour = h;
    targetMinute = m;
  }

  // 1. "aaj" / "today"
  if (raw.includes("aaj") || raw.includes("today") || raw.includes("આજે")) {
    target.setHours(targetHour, targetMinute, 0, 0);
    return target.toISOString();
  }

  // 2. "parso" / "parson" / "day after tomorrow" / "પરમ દિવસે"
  if (
    raw.includes("parso") ||
    raw.includes("parson") ||
    raw.includes("day after tomorrow") ||
    raw.includes("પરમ દિવસે")
  ) {
    target.setDate(target.getDate() + 2);
    target.setHours(targetHour, targetMinute, 0, 0);
    return target.toISOString();
  }

  // 3. "kal" / "tomorrow" / "આવતીકાલે"
  if (raw.includes("kal") || raw.includes("tomorrow") || raw.includes("આવતીકાલે")) {
    target.setDate(target.getDate() + 1);
    target.setHours(targetHour, targetMinute, 0, 0);
    return target.toISOString();
  }

  // 4. "agle hafte" / "next week"
  if (raw.includes("agle hafte") || raw.includes("next week") || raw.includes("આવતા અઠવાડિયે")) {
    target.setDate(target.getDate() + 7);
    target.setHours(targetHour, targetMinute, 0, 0);
    return target.toISOString();
  }

  // 5. Weekday matches: "agle somvar", "next monday", "aavta somvare"
  for (const [dayName, dayIndex] of Object.entries(HINDI_WEEKDAYS)) {
    if (raw.includes(dayName)) {
      const currentDay = base.getDay();
      let diff = dayIndex - currentDay;
      if (diff <= 0 || raw.includes("agle") || raw.includes("next") || raw.includes("આવતા")) {
        diff += 7;
      }
      target.setDate(target.getDate() + diff);
      target.setHours(targetHour, targetMinute, 0, 0);
      return target.toISOString();
    }
  }

  // 6. If it's already an ISO string or standard parseable date
  const parsed = new Date(expression);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return null;
}

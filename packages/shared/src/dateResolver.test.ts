import { describe, it, expect } from "vitest";
import { resolveIndianRelativeDate } from "./dateResolver.js";

describe("resolveIndianRelativeDate", () => {
  // Base date: Wednesday, Oct 15, 2026, 12:00:00 PM
  const baseDate = new Date("2026-10-15T12:00:00.000Z");

  it("resolves 'kal shaam' to tomorrow evening at 18:00 local", () => {
    const result = resolveIndianRelativeDate("kal shaam tak report bhejna", { baseDate });
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getDate()).toBe(baseDate.getDate() + 1);
    expect(date.getHours()).toBe(18);
  });

  it("resolves 'parso subah' to day-after-tomorrow at 10:00", () => {
    const result = resolveIndianRelativeDate("parso subah meeting hai", { baseDate });
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getDate()).toBe(baseDate.getDate() + 2);
    expect(date.getHours()).toBe(10);
  });

  it("resolves 'aaj shaam 5 pm' to today at 17:00", () => {
    const result = resolveIndianRelativeDate("aaj shaam 5 pm tak", { baseDate });
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getDate()).toBe(baseDate.getDate());
    expect(date.getHours()).toBe(17);
  });

  it("resolves 'agle somvar' (next Monday) properly", () => {
    // Oct 15, 2026 is Thursday (getDay() === 4).
    // Next Monday should be Oct 19, 2026.
    const result = resolveIndianRelativeDate("agle somvar demo dena hai", { baseDate });
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getDay()).toBe(1); // Monday
    expect(date.getDate()).toBe(19);
  });

  it("resolves Gujarati 'આવતીકાલે બપોરે' (tomorrow afternoon)", () => {
    const result = resolveIndianRelativeDate("આવતીકાલે બપોરે રિવ્યુ કરીશું", { baseDate });
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getDate()).toBe(baseDate.getDate() + 1);
    expect(date.getHours()).toBe(14);
  });

  it("resolves Gujarati 'કાલે સાંજે' (tomorrow evening)", () => {
    const result = resolveIndianRelativeDate("કાલે સાંજે ક્લાયન્ટ કોલ છે", { baseDate });
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getDate()).toBe(baseDate.getDate() + 1);
    expect(date.getHours()).toBe(18);
  });

  it("resolves Gujarati script weekday 'આવતા શુક્રવારે' (next Friday)", () => {
    // Base Oct 15, 2026 is Thursday (4). Next Friday is Oct 23, 2026 (or next day Oct 16 with 'aavta' adding 7 -> Oct 23).
    const result = resolveIndianRelativeDate("આવતા શુક્રવારે કામ પૂરું કરવું", { baseDate });
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getDay()).toBe(5); // Friday
  });

  it("returns null for non-relative or empty text", () => {
    expect(resolveIndianRelativeDate(null, { baseDate })).toBeNull();
    expect(resolveIndianRelativeDate("", { baseDate })).toBeNull();
    expect(resolveIndianRelativeDate("no date mentioned here", { baseDate })).toBeNull();
  });
});

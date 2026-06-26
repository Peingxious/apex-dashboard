// Shared date preset utilities used by both the library toolbar
// filter popup and the library configuration modal. Keeping them
// in one place guarantees the two surfaces stay in sync.

export type DatePresetRange = { start: string; end: string };

export type DatePreset = {
  key: string;
  labelKey: string;
  range: (today: Date) => DatePresetRange;
};

/** Format a Date as local-time YYYY-MM-DD (no UTC drift). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** ISO week — Monday is the first day. Matches Obsidian's own
 *  weekly-note convention. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const dow = x.getDay() === 0 ? 7 : x.getDay();
  return addDays(x, -(dow - 1));
}

export function endOfWeek(d: Date): Date {
  return addDays(startOfWeek(d), 6);
}

export function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export function endOfMonth(d: Date): Date {
  const x = startOfMonth(d);
  x.setMonth(x.getMonth() + 1);
  return addDays(x, -1);
}

/** The 8 one-tap windows exposed in the UI. The labelKey maps to
 *  a t() string so both locales can stay in sync. */
export const DATE_PRESETS: DatePreset[] = [
  {
    key: "today",
    labelKey: "library.presetToday",
    range: (today) => ({ start: toISODate(today), end: toISODate(today) }),
  },
  {
    key: "yesterday",
    labelKey: "library.presetYesterday",
    range: (today) => {
      const y = addDays(today, -1);
      return { start: toISODate(y), end: toISODate(y) };
    },
  },
  {
    key: "thisWeek",
    labelKey: "library.presetThisWeek",
    range: (today) => ({
      start: toISODate(startOfWeek(today)),
      end: toISODate(endOfWeek(today)),
    }),
  },
  {
    key: "lastWeek",
    labelKey: "library.presetLastWeek",
    range: (today) => {
      const last = addDays(today, -7);
      return {
        start: toISODate(startOfWeek(last)),
        end: toISODate(endOfWeek(last)),
      };
    },
  },
  {
    key: "thisMonth",
    labelKey: "library.presetThisMonth",
    range: (today) => ({
      start: toISODate(startOfMonth(today)),
      end: toISODate(endOfMonth(today)),
    }),
  },
  {
    key: "lastMonth",
    labelKey: "library.presetLastMonth",
    range: (today) => {
      const last = addDays(startOfMonth(today), -1);
      return {
        start: toISODate(startOfMonth(last)),
        end: toISODate(endOfMonth(last)),
      };
    },
  },
  {
    key: "last7",
    labelKey: "library.presetLast7",
    range: (today) => {
      const from = addDays(today, -6);
      return { start: toISODate(from), end: toISODate(today) };
    },
  },
  {
    key: "last30",
    labelKey: "library.presetLast30",
    range: (today) => {
      const from = addDays(today, -29);
      return { start: toISODate(from), end: toISODate(today) };
    },
  },
];

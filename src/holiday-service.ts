export type HolidayInfo = {
    name: string;
    date: string;
};

export async function fetchHolidayData(): Promise<HolidayInfo[]> {
    // Stub: fetch holiday data
    return [];
}

export function getHolidayForDate(date: string): HolidayInfo | null {
    // Stub: get holiday for date
    return null;
}

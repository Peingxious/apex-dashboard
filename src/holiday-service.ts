export type HolidayInfo = {
	name: string;
	date: string;
	holiday?: boolean;
	type?: number;
};

export async function fetchHolidayData(_year: number): Promise<Record<string, HolidayInfo>> {
	return {};
}

export function getHolidayForDate(date: string, holidayData: Record<string, HolidayInfo>): HolidayInfo | null {
	return holidayData[date] ?? null;
}

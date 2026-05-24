import { requestUrl } from 'obsidian';
import type { WeatherConfig, WeatherData } from './types';
import { getLanguage } from './i18n';

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
	data: WeatherData;
	fetchedAt: number;
}

const weatherCache = new Map<string, CacheEntry>();

export interface GeocodeResult {
	name: string;
	latitude: number;
	longitude: number;
	country: string;
	admin1?: string;
}

export function clearWeatherCache(): void {
	weatherCache.clear();
}

export function getCachedWeather(config: WeatherConfig): WeatherData | null {
	const key = cacheKey(config);
	const entry = weatherCache.get(key);
	if (!entry) return null;
	if (Date.now() - entry.fetchedAt > CACHE_TTL) {
		weatherCache.delete(key);
		return null;
	}
	return entry.data;
}

export async function fetchWeather(config: WeatherConfig): Promise<WeatherData> {
	const cached = getCachedWeather(config);
	if (cached) return cached;

	const lang = getLanguage();
	const url = `https://api.open-meteo.com/v1/forecast?latitude=${config.latitude}&longitude=${config.longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,apparent_temperature&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5`;

	const resp = await requestUrl({ url });
	const json = resp.json;

	const current = json.current;
	const daily = json.daily;

	if (!current || !daily) {
		throw new Error('Invalid weather API response');
	}

	const data: WeatherData = {
		temperature: typeof current.temperature_2m === 'number' ? current.temperature_2m : 0,
		weatherCode: typeof current.weather_code === 'number' ? current.weather_code : 0,
		windSpeed: typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : 0,
		humidity: typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : 0,
		feelsLike: typeof current.apparent_temperature === 'number' ? current.apparent_temperature : 0,
		dailyMax: Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max.slice(0, 5) : [],
		dailyMin: Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min.slice(0, 5) : [],
		dailyCodes: Array.isArray(daily.weather_code) ? daily.weather_code.slice(0, 5) : [],
		dailyDates: Array.isArray(daily.time) ? daily.time.slice(0, 5) : [],
		fetchedAt: Date.now(),
	};

	weatherCache.set(cacheKey(config), { data, fetchedAt: Date.now() });
	return data;
}

export async function geocodeCity(query: string): Promise<GeocodeResult[]> {
	if (!query.trim()) return [];

	const lang = getLanguage();
	const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=${lang === 'zh' ? 'zh' : 'en'}`;

	try {
		const resp = await requestUrl({ url });
		const json = resp.json;
		if (!json.results) return [];

		return json.results.map((r: Record<string, unknown>) => ({
			name: r.name as string,
			latitude: r.latitude as number,
			longitude: r.longitude as number,
			country: r.country as string,
			admin1: r.admin1 as string | undefined,
		}));
	} catch {
		return [];
	}
}

function cacheKey(config: WeatherConfig): string {
	return `${config.latitude.toFixed(4)},${config.longitude.toFixed(4)}`;
}

const WEATHER_EMOJI: Record<number, string> = {
	0: '☀️',   // Clear sky
	1: '🌤',   // Mainly clear
	2: '⛅',         // Partly cloudy
	3: '☁️',   // Overcast
	45: '🌫',  // Fog
	48: '🌫',  // Depositing rime fog
	51: '💧',  // Light drizzle
	53: '💧',  // Moderate drizzle
	55: '💧',  // Dense drizzle
	56: '💧',  // Light freezing drizzle
	57: '💧',  // Dense freezing drizzle
	61: '🌧',  // Slight rain
	63: '🌧',  // Moderate rain
	65: '🌧',  // Heavy rain
	66: '🌨',  // Light freezing rain
	67: '🌨',  // Heavy freezing rain
	71: '🌨',  // Slight snow
	73: '❄️',  // Moderate snow
	75: '❄️',  // Heavy snow
	77: '❄️',  // Snow grains
	80: '🌧',  // Slight rain showers
	81: '🌧',  // Moderate rain showers
	82: '🌧',  // Violent rain showers
	85: '❄️',  // Slight snow showers
	86: '❄️',  // Heavy snow showers
	95: '⛈️',  // Thunderstorm
	96: '⛈️',  // Thunderstorm with slight hail
	99: '⛈️',  // Thunderstorm with heavy hail
};

export function getWeatherEmoji(code: number): string {
	return WEATHER_EMOJI[code] ?? '☁️';
}

const WEATHER_DESC_EN: Record<number, string> = {
	0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
	45: 'Fog', 48: 'Rime fog',
	51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
	56: 'Freezing drizzle', 57: 'Freezing drizzle',
	61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
	66: 'Freezing rain', 67: 'Freezing rain',
	71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
	80: 'Showers', 81: 'Showers', 82: 'Heavy showers',
	85: 'Snow showers', 86: 'Heavy snow showers',
	95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
};

const WEATHER_DESC_ZH: Record<number, string> = {
	0: '晴', 1: '大部晴朗', 2: '多云', 3: '阴',
	45: '雾', 48: '雾凇',
	51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨',
	56: '冻毛毛雨', 57: '冻毛毛雨',
	61: '小雨', 63: '中雨', 65: '大雨',
	66: '冻雨', 67: '冻雨',
	71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
	80: '阵雨', 81: '阵雨', 82: '大阵雨',
	85: '阵雪', 86: '大阵雪',
	95: '雷暴', 96: '雷暴', 99: '雷暴',
};

export function getWeatherDescription(code: number): string {
	const lang = getLanguage();
	const desc = lang === 'zh'
		? WEATHER_DESC_ZH[code]
		: WEATHER_DESC_EN[code];
	return desc ?? 'Unknown';
}

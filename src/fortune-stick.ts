export type FortuneCategory = 'love' | 'career' | 'wealth' | 'health' | 'study';

export type FortuneLevel = 'great' | 'good' | 'neutral' | 'bad';

export type FortuneCategoryOption = {
	key: FortuneCategory;
	label: string;
	emoji: string;
};

export type FortuneStick = {
	category: FortuneCategory;
	level: FortuneLevel;
	title: string;
	verse: string;
	interpretation: string;
};

export const FORTUNE_CATEGORIES: FortuneCategoryOption[] = [
	{ key: 'love', label: '感情', emoji: '💘' },
	{ key: 'career', label: '事业', emoji: '🚀' },
	{ key: 'wealth', label: '财运', emoji: '💰' },
	{ key: 'health', label: '健康', emoji: '🌿' },
	{ key: 'study', label: '学业', emoji: '📚' },
];

type FortuneStickPoolItem = Omit<FortuneStick, 'category'>;

const POOLS: Record<FortuneCategory, FortuneStickPoolItem[]> = {
	love: [
		{ level: 'good', title: '小吉', verse: '心有灵犀一点通。', interpretation: '适合表达心意，但别急着要答案。' },
		{ level: 'neutral', title: '平', verse: '风来不定，云自有归。', interpretation: '保持沟通，先把误会说清。' },
		{ level: 'great', title: '大吉', verse: '相逢恰好，花开正盛。', interpretation: '把握机会，主动一点更顺。' },
	],
	career: [
		{ level: 'good', title: '上吉', verse: '稳中求进，水到渠成。', interpretation: '先做对的事，再把事做大。' },
		{ level: 'neutral', title: '平', verse: '千里之行，始于足下。', interpretation: '别怕慢，拆解目标，一步步推进。' },
		{ level: 'bad', title: '下签', verse: '急则乱，缓则明。', interpretation: '先停一停，避免硬刚；把风险点写下来再决策。' },
	],
	wealth: [
		{ level: 'good', title: '小吉', verse: '细水长流，积少成多。', interpretation: '适合做预算与长期计划，少做冲动消费。' },
		{ level: 'neutral', title: '平', verse: '守成胜于冒进。', interpretation: '先保现金流，谨慎尝试新投入。' },
		{ level: 'great', title: '大吉', verse: '时来运转，财星高照。', interpretation: '适合谈合作或争取加薪，但要准备好证据与方案。' },
	],
	health: [
		{ level: 'good', title: '吉', verse: '早睡早起，百病不侵。', interpretation: '规律作息会立刻见效；今天先从早睡开始。' },
		{ level: 'neutral', title: '平', verse: '劳逸结合，方得长久。', interpretation: '别逞强，留出休息时间。' },
		{ level: 'bad', title: '凶', verse: '身体在提醒你停下来。', interpretation: '减少熬夜与高强度，必要时及时就医咨询。' },
	],
	study: [
		{ level: 'great', title: '大吉', verse: '书山有路勤为径。', interpretation: '适合冲刺：把任务拆成小块，连续完成3个小目标。' },
		{ level: 'good', title: '吉', verse: '温故而知新。', interpretation: '先复盘再刷题，效果更好。' },
		{ level: 'neutral', title: '平', verse: '心静则明。', interpretation: '先减少干扰：关掉通知，专注25分钟。' },
	],
};

function pickOne<T>(arr: T[]): T {
	const idx = Math.floor(Math.random() * arr.length);
	return arr[Math.max(0, Math.min(idx, arr.length - 1))]!;
}

export function drawFortuneStick(category: FortuneCategory): FortuneStick {
	const pool = POOLS[category] ?? POOLS.study;
	const picked = pickOne(pool);
	return { category, ...picked };
}

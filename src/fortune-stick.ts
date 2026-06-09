export type FortuneCategory = string;

export type FortuneStick = {
    category: FortuneCategory;
    text: string;
};

export const FORTUNE_CATEGORIES: FortuneCategory[] = [];

export function drawFortuneStick(): FortuneStick {
    // Stub: draw fortune stick
    return { category: "", text: "" };
}

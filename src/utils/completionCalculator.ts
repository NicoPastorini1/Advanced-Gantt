import { BarDatum } from "../visual";

const completionCache = new Map<string, number>();
const COMPLETION_CACHE_MAX = 500;

export function getCompletionByGroup(rowKey: string, allBars: BarDatum[]): number {
    const cacheKey = rowKey;
    
    if (completionCache.has(cacheKey)) {
        return completionCache.get(cacheKey)!;
    }

    const groupId = rowKey.replace(/^G:/, "");

    const children = allBars.filter(b => {
        if (b.isGroup) return false;
        const parts = b.rowKey.split("|");
        return parts.length === 2 && parts[1] === groupId;
    });

    const completions = children
        .map(c => Number(c.completion))
        .filter(c => !isNaN(c));

    let result = 0;
    if (completions.length) {
        const avg = completions.reduce((a, b) => a + b, 0) / completions.length;
        result = Math.max(0, Math.min(1, avg > 1 ? avg / 100 : avg));
    }

    if (completionCache.size >= COMPLETION_CACHE_MAX) {
        completionCache.clear();
    }
    completionCache.set(cacheKey, result);

    return result;
}

export function clearCompletionCache(): void {
    completionCache.clear();
}
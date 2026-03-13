import * as d3 from "d3";
import { BarDatum } from "../visual";

const pathCache = new Map<string, string>();
const PATH_CACHE_MAX = 1000;

function getCacheKey(
    start: Date,
    end: Date,
    rowKey: string,
    taskHeight: number,
    barHeight: number,
    xDomain: string,
    yDomain: string
): string {
    return `${start.getTime()}-${end.getTime()}-${rowKey}-${taskHeight}-${barHeight}-${xDomain}-${yDomain}`;
}

export function getGroupBarPath(
    scaleX: d3.ScaleTime<number, number>,
    scaleY: d3.ScaleBand<string>,
    d: BarDatum,
    taskHeight: number,
    barHeight: number
): string {
    const xDomain = `${scaleX.domain()[0].getTime()}-${scaleX.domain()[1].getTime()}`;
    const yDomain = scaleY.domain().join(',');
    const cacheKey = getCacheKey(d.start, d.end, d.rowKey, taskHeight, barHeight, xDomain, yDomain);

    if (pathCache.has(cacheKey)) {
        return pathCache.get(cacheKey)!;
    }

    const x1 = scaleX(d.start);
    const x2 = scaleX(d.end);
    const width = x2 - x1;

    const yTop = scaleY(d.rowKey)! + (taskHeight - barHeight) / 2;
    const topHeight = barHeight * 0.5;
    const tipHeight = barHeight * 0.6;
    const tipInset = Math.min(width * 0.15, 35);

    const path = `
    M${x1},${yTop}
    H${x2}
    L${x2},${yTop + topHeight + tipHeight}
    L${x2 - tipInset},${yTop + topHeight}
    H${x1 + tipInset}
    L${x1},${yTop + topHeight + tipHeight}
    Z
  `.trim();

    if (pathCache.size >= PATH_CACHE_MAX) {
        pathCache.clear();
    }
    pathCache.set(cacheKey, path);

    return path;
}

export function clearPathCache(): void {
    pathCache.clear();
}
import powerbi from "powerbi-visuals-api";
import { dataViewObjects } from "powerbi-visuals-utils-dataviewutils";
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataViewObjectPropertyIdentifier = powerbi.DataViewObjectPropertyIdentifier;
import Fill = powerbi.Fill;
import FormattingId = powerbi.visuals.FormattingId;
import { LegendDataPoint, GanttDataPoint } from "../types";

export function buildColorMaps(
  ganttdataPoints: GanttDataPoint[],
  legendDataPoints: LegendDataPoint[]
): { parentColorMap: Map<string, string>; legendColorMap: Map<string, string> } {
  const parentColorMap = new Map<string, string>();
  const legendColorMap = new Map<string, string>();

  for (const dp of ganttdataPoints) {
    if (dp.parent) {
      parentColorMap.set(dp.parent, dp.color);
    }
  }

  for (const dp of legendDataPoints) {
    if (dp.legend) {
      legendColorMap.set(dp.legend, dp.color);
    }
  }

  return { parentColorMap, legendColorMap };
}

export function getBarColor(
  rowKey: string,
  legendValue: string | undefined,
  legendColorMap: Map<string, string>,
  parentColorMap: Map<string, string>
): string {
  if (legendValue && legendColorMap.size > 0) {
    const legendColor = legendColorMap.get(String(legendValue));
    if (legendColor) {
      return legendColor;
    }
  }

  if (rowKey.startsWith("G:")) {
    const parentKey = rowKey.slice(2);
    return parentColorMap.get(parentKey) ?? "#72c0ffff";
  }

  const parentKey = rowKey.includes("|") ? rowKey.split("|")[1] : undefined;
  return parentKey ? (parentColorMap.get(parentKey) ?? "#72c0ffff") : "#72c0ffff";
}

export interface ColorManagerResult {
  dataPoints: LegendDataPoint[];
  colorMapToPersist: Record<string, string> | null;
}

export function createLegendDataPoints(
  options: VisualUpdateOptions,
  host: IVisualHost,
  existingColorStore: Map<string, string>
): ColorManagerResult {
  const dataPoints: LegendDataPoint[] = [];
  const dv = options.dataViews?.[0];
  const categorical = dv?.categorical;

  if (!categorical?.categories) {
    return { dataPoints: [], colorMapToPersist: null };
  }

  const legendCategory = categorical.categories.find(c => c.source.roles?.legend);
  if (!legendCategory) {
    return { dataPoints: [], colorMapToPersist: null };
  }

  const colorPalette = host.colorPalette;

  const colorMapString = dv?.metadata?.objects?.["legendColorState"]?.["colorMap"] as string;
  if (colorMapString) {
    try {
      const colorMap = JSON.parse(colorMapString);
      Object.keys(colorMap).forEach(legendValue => {
        const color = colorMap[legendValue];
        if (color && typeof color === 'string') {
          existingColorStore.set(legendValue, color);
        }
      });
    } catch (e) {
    }
  }

  const prop: DataViewObjectPropertyIdentifier = {
    objectName: "legendColorSelector",
    propertyName: "fill"
  };

  const colorChangesByValue = new Map<string, string>();
  const indexByValue = new Map<string, number>();

  legendCategory.values.forEach((v, i) => {
    const key = String(v);
    if (!indexByValue.has(key)) {
      indexByValue.set(key, i);
    }

    const obj = legendCategory.objects?.[i];
    if (obj) {
      const fill = dataViewObjects.getValue<Fill>(obj, prop);
      if (fill?.solid?.color) {
        const currentStored = existingColorStore.get(key);
        if (currentStored !== fill.solid.color) {
          existingColorStore.set(key, fill.solid.color);
          colorChangesByValue.set(key, fill.solid.color);
        }
      }
    }
  });

  if (colorChangesByValue.size > 0) {
    const colorMapObject: Record<string, string> = {};
    existingColorStore.forEach((color, legendValue) => {
      colorMapObject[legendValue] = color;
    });

    host.persistProperties({
      merge: [{
        objectName: "legendColorState",
        selector: null,
        properties: {
          colorMap: JSON.stringify(colorMapObject)
        }
      }]
    });
  }

  const uniqueValues = new Set<string>();
  const indexByLegend = new Map<string, number>();

  legendCategory.values.forEach((v, i) => {
    const key = String(v);
    uniqueValues.add(key);

    if (!indexByLegend.has(key)) {
      indexByLegend.set(key, i);
    }
  });

  const needsPersist = new Set<string>();

  uniqueValues.forEach((value) => {
    const baseIndex = indexByLegend.get(value)!;

    const selectionId = host.createSelectionIdBuilder()
      .withCategory(legendCategory, baseIndex)
      .createSelectionId();

    let color: string;

    const objIndex = indexByLegend.get(value)!;
    const obj = legendCategory.objects?.[objIndex];
    const conditionalColor = obj ? dataViewObjects.getValue<Fill>(obj, prop)?.solid?.color : undefined;

    if (conditionalColor) {
      color = conditionalColor;
      existingColorStore.set(value, color);
    } else if (existingColorStore.has(value)) {
      color = existingColorStore.get(value)!;
    } else {
      color = colorPalette.getColor(value).value;
      existingColorStore.set(value, color);
      needsPersist.add(value);
    }

    dataPoints.push({
      legend: value,
      color,
      selectionId,
      index: baseIndex,
      formattingId: {} as FormattingId
    });
  });

  if (needsPersist.size > 0) {
    const colorMapObject: Record<string, string> = {};
    existingColorStore.forEach((c, k) => {
      colorMapObject[k] = c;
    });

    host.persistProperties({
      merge: [{
        objectName: "legendColorState",
        selector: null,
        properties: {
          colorMap: JSON.stringify(colorMapObject)
        }
      }]
    });
  }

  return { dataPoints, colorMapToPersist: null };
}

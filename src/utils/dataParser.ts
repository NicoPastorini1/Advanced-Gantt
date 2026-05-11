import * as d3 from "d3";
import powerbi from "powerbi-visuals-api";
import { dataViewObjects } from "powerbi-visuals-utils-dataviewutils";
import ISelectionId = powerbi.visuals.ISelectionId;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import DataViewObjectPropertyIdentifier = powerbi.DataViewObjectPropertyIdentifier;
import Fill = powerbi.Fill;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;
import { GanttDataPoint, ParseDataResult, Task } from "../types";

export function createSelectorDataPoints(
  options: VisualUpdateOptions,
  host: IVisualHost
): GanttDataPoint[] {
  const dataPoints: GanttDataPoint[] = [];
  const dataViews = options.dataViews;

  if (!dataViews || !dataViews[0] || !dataViews[0].categorical ||
    !dataViews[0].categorical.categories || !dataViews[0].categorical.categories[1]?.values ||
    !dataViews[0].categorical.values) {
    return dataPoints;
  }

  const categorical = dataViews[0].categorical;
  const parent = categorical.categories[1];
  const colorPalette: ISandboxExtendedColorPalette = host.colorPalette;

  const parentIndexMap = new Map<string, number>();
  parent.values.forEach((value, index) => {
    const key = `${value}`;
    if (!parentIndexMap.has(key)) {
      parentIndexMap.set(key, index);
    }
  });
  parentIndexMap.forEach((index, value) => {
    const selectionId: ISelectionId = host.createSelectionIdBuilder()
      .withCategory(parent, index)
      .createSelectionId();

    const prop: DataViewObjectPropertyIdentifier = {
      objectName: "colorSelector",
      propertyName: "fill"
    };

    const obj = parent.objects?.[index];
    const colorFromObj = obj ? dataViewObjects.getValue<Fill>(obj, prop)?.solid?.color : undefined;
    const color = colorFromObj ?? colorPalette.getColor(`${parent.values[index]}`).value;

    dataPoints.push({
      task: "",
      parent: value,
      startDate: null,
      endDate: null,
      color,
      selectionId,
      index
    });
  });
  return dataPoints;
}

export function parseData(dv: DataView): ParseDataResult {
  const defaultResult: ParseDataResult = {
    tasks: [],
    secondaryStartName: "Secondary Start Date",
    secondaryEndName: "Secondary End Date",
    startName: "Start Date",
    endName: "End Date",
    parentName: "Parent",
    extraColNames: [],
    taskColCount: 0,
    taskColNames: []
  };

  if (!dv.categorical?.categories?.length) return defaultResult;
  const cat = dv.categorical;

  const sVal = cat.values.find(v => v.source.roles?.startDate);
  const eVal = cat.values.find(v => v.source.roles?.endDate);
  const durVal = cat.values.find(v => v.source.roles?.duration);
  const compVal = cat.values.find(v => v.source.roles?.completion);
  const secStartVal = cat.values.find(v => v.source.roles?.secondaryStart);
  const secEndVal = cat.values.find(v => v.source.roles?.secondaryEnd);
  const legendCol = cat.categories.find(c => c.source.roles?.legend);
  const labelVal = cat.values.find(v => v.source.roles?.label);

  const secondaryStartName = secStartVal?.source.displayName ?? "Secondary Start Date";
  const secondaryEndName = secEndVal?.source.displayName ?? "Secondary End Date";
  const startName = sVal?.source.displayName ?? "Start Date";
  const endName = eVal?.source.displayName ?? "End Date";

  const parentCol = cat.categories.find(c => c.source.roles?.parent);
  const parentName = parentCol?.source.displayName ?? "Parent";

  const colVals = cat.values.filter(v => v.source.roles?.columns);
  const colCatVals: { name: string; values: any[] }[] = [];
  cat.categories.forEach(c => {
    if (c.source.roles?.columns) {
      colCatVals.push({ name: c.source.displayName, values: c.values });
    }
  });

  const extraColNames = [
    ...colVals.map(c => c.source.displayName),
    ...colCatVals.map(c => c.name)
  ];

  const taskCols: { name: string; values: any[] }[] = [];
  const parentCols: { values: any[] }[] = [];

  let predCol: any[] | undefined;

  cat.categories.forEach(c => {
    const r = c.source.roles;
    if (r?.task) taskCols.push({ name: c.source.displayName, values: c.values });
    if (r?.parent) parentCols.push({ values: c.values });
    if (r?.predecessor) predCol = c.values;
  });

  const taskColCount = taskCols.length;
  const taskColNames = taskCols.map(c => c.name);

  const out: Task[] = [];
  const rowCount = sVal?.values?.length ?? 0;

  for (let i = 0; i < rowCount; i++) {
    const taskFields = taskCols.map(c => String(c.values[i] ?? ""));
    const parentTxt = parentCols.map(c => String(c.values[i] ?? "")).join(" | ") || "Parent";

    const rawStart = sVal?.values?.[i];
    const rawEnd = eVal?.values?.[i];

    const start = rawStart ? new Date(rawStart as string) : null;
    const end = rawEnd ? new Date(rawEnd as string) : null;

    const isStartValid = start instanceof Date && !isNaN(start.getTime());
    const isEndValid = end instanceof Date && !isNaN(end.getTime());

    const duration = durVal ? Number(durVal.values?.[i]) : undefined;
    const fieldsWithDuration = durVal ? [...taskFields, duration?.toString() ?? ""] : taskFields;

    let predecessor: string | undefined;
    if (predCol) {
      const rawPred = String(predCol[i] ?? "").trim();
      if (rawPred !== "") predecessor = rawPred;
    }

    const secStart =
      typeof secStartVal?.values?.[i] === "string" || typeof secStartVal?.values?.[i] === "number"
        ? new Date(secStartVal.values[i] as string | number)
        : undefined;

    const secEnd =
      typeof secEndVal?.values?.[i] === "string" || typeof secEndVal?.values?.[i] === "number"
        ? new Date(secEndVal.values[i] as string | number)
        : undefined;

    const extraCols = [
      ...colVals.map(c => String(c.values[i] ?? "")),
      ...colCatVals.map(c => String(c.values[i] ?? ""))
    ];
    const paddedExtraCols =
      extraCols.length === extraColNames.length
        ? extraCols
        : Array(extraColNames.length).fill("");

    const legendText = legendCol ? String(legendCol.values[i] ?? "") : undefined;

    const timelineDateVal = cat.values.find(v => v.source.roles?.timelineDate);
    const rawTimelineDate = timelineDateVal?.values?.[i];
    const timelineDate = rawTimelineDate
      ? new Date(rawTimelineDate as string | number)
      : undefined;

    const task: Task = {
      id: taskFields.join(" | "),
      parent: parentTxt,
      start: isStartValid ? start! : null,
      end: isEndValid ? end! : null,
      fields: fieldsWithDuration,
      completion: compVal ? Number(compVal.values?.[i]) : undefined,
      secondaryStart: secStart,
      secondaryEnd: secEnd,
      predecessor,
      index: i,
      extraCols: paddedExtraCols,
      legend: legendText,
      timelineDate: timelineDate && !isNaN(timelineDate.getTime()) ? timelineDate : undefined,
      labelValue: labelVal ? String(labelVal.values[i] ?? "") : undefined
    };

    out.push(task);
  }

  return {
    tasks: out,
    secondaryStartName,
    secondaryEndName,
    startName,
    endName,
    parentName,
    extraColNames,
    taskColCount,
    taskColNames
  };
}

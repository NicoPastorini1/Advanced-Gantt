"use strict";

import "./../style/visual.less";
import * as d3 from "d3";
import powerbi from "powerbi-visuals-api";
import { renderDurationLabels } from "./utils/renderLabels";
import { renderFormatButtons } from "./components/formatButtons";
import { renderParentToggleButtons } from "./components/parentButtons";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel/lib/FormattingSettingsService";
import { VisualFormattingSettingsModel } from "./settings";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { createTooltipServiceWrapper, ITooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";
import { dataViewObjects } from "powerbi-visuals-utils-dataviewutils";
import { legend } from "powerbi-visuals-utils-chartutils";
import { renderXAxisBottom } from "./components/xAxis/renderXAxisBottom";
import { renderXAxisTop } from "./components/xAxis/renderXAxisTop";
import { renderLanding } from "./components/renderLanding";
import { getGroupBarPath } from "./utils/barPaths";
import { getCompletionByGroup } from "./utils/completionCalculator";
import IVisual = powerbi.extensibility.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import DataViewObjectPropertyIdentifier = powerbi.DataViewObjectPropertyIdentifier;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import Fill = powerbi.Fill;
import FormattingId = powerbi.visuals.FormattingId;

interface Task {
  id: string;
  parent: string;
  start: Date | null;
  end: Date | null;
  fields: string[];
  completion?: number;
  secondaryStart?: Date;
  secondaryEnd?: Date;
  predecessor?: string;
  index: number;
  extraCols?: string[];
  legend?: string;
}

interface VisualRow {
  id: string;
  isGroup: boolean;
  task?: Task;
  rowKey: string;
  labelY: string;
  duration?: number;
  extraCols?: string[];
}

export interface BarDatum {
  id: string;
  start: Date;
  end: Date;
  rowKey: string;
  isGroup: boolean;
  index: number;
  completion?: number;
  secondaryStart?: Date;
  secondaryEnd?: Date;
  selectionId: ISelectionId;
  legend?: string;
  gradientId?: string;
}

export interface GanttDataPoint {
  task: string;
  parent: string;
  startDate: Date;
  endDate: Date;
  color: string;
  selectionId: ISelectionId;
  index: number;
  completion?: number;
  secondaryStart?: Date;
  secondaryEnd?: Date;
}

interface LegendDataPoint {
  legend: string;
  color: string;
  selectionId: ISelectionId;
  index: number;
  formattingId: FormattingId;
}

function createSelectorDataPoints(options: VisualUpdateOptions, host: IVisualHost): GanttDataPoint[] {
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

    const color = getColumnColorByIndex(parent, index, colorPalette, "colorSelector");

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

function getColumnColorByIndex(
  category: DataViewCategoryColumn,
  index: number,
  colorPalette: ISandboxExtendedColorPalette,
  objectName: string = "colorSelector"
): string {
  if (colorPalette.isHighContrast) {
    return colorPalette.background.value;
  }

  const defaultColor: Fill = {
    solid: {
      color: colorPalette.getColor(`${category.values[index]}`).value,
    }
  };

  const prop: DataViewObjectPropertyIdentifier = {
    objectName: objectName,
    propertyName: "fill"
  };

  let colorFromObjects: Fill;
  if (category.objects?.[index]) {
    colorFromObjects = dataViewObjects.getValue(category?.objects[index], prop);
  }

  return colorFromObjects?.solid.color ?? defaultColor.solid.color;
}

type FormatType = 'Hora' | 'Día' | 'Mes' | 'Año' | 'Todo';

export class Visual implements IVisual {
  private container: HTMLElement;
  private yAxisDiv: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private yAxisSVG: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private ganttDiv: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private ganttSVG: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private axisTopContentG: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private axisBottomContentG: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private leftBtns: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private rightBtns: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private leftG: d3.Selection<SVGGElement, unknown, null, undefined>;
  private ganttG: d3.Selection<SVGGElement, unknown, null, undefined>;
  private linesG: d3.Selection<SVGGElement, unknown, null, undefined>;
  private landingG: d3.Selection<SVGGElement, unknown, null, undefined>;
  private xAxisFixedG: d3.Selection<SVGGElement, unknown, null, undefined>;
  private xAxisFixedDiv: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private xAxisFixedSVG: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private expanded = new Map<string, boolean>();
  private cacheTasks: Task[] = [];
  private groupRange = new Map<string, {
    start: Date;
    end: Date;
    secondaryStart?: Date;
    secondaryEnd?: Date;
  }>();
  private selectedFormat: FormatType = "Año";
  private lastOptions: VisualUpdateOptions;
  private taskColCount = 0;
  private taskColNames: string[] = [];
  private fmtService = new FormattingSettingsService();
  private fmtSettings = new VisualFormattingSettingsModel();
  private tooltipServiceWrapper: ITooltipServiceWrapper;
  private allExpanded = true;
  private host: IVisualHost;
  private ganttdataPoints: GanttDataPoint[]
  private legendDataPoints: LegendDataPoint[] = []
  private legend: any;
  private currentZoomTransform?: d3.ZoomTransform;
  private y: d3.ScaleBand<string>;
  private marginLeft: number = 0;
  private width: number = 0;
  private innerW: number = 0;
  private xOriginal: d3.ScaleTime<number, number>;
  private barH: number = 40;
  private zoomBehavior!: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private baseDomain?: [Date, Date];
  private extraColNames: string[] = [];
  private secondaryStartName: string = "Inicio R";
  private secondaryEndName: string = "Fin R";
  private selectionManager: ISelectionManager;
  private selectionIdMap: Map<string, ISelectionId>;
  private selectedIds: ISelectionId[] = [];
  private startName: string = "Start Date";
  private endName: string = "End Date";
  private parentName: string = "Parent";
  private legendColorStore = new Map<string, string>();

  private computeInnerW(format: FormatType, start: Date, end: Date, width: number, margin: { left: number; right: number; }): number {
    const diffInDays = d3.timeDay.count(start, end);
    switch (format) {
      case "Hora": {
        const numHours = d3.timeHour.count(start, end);
        return Math.max(numHours * 38, 3000);
      }
      case "Día": {
        const numDays = diffInDays;
        return Math.max(numDays * 15, 3000);
      }
      case "Mes": {
        const numMonths = d3.timeMonth.count(start, end);
        return Math.max(numMonths * 90, 3000);
      }
      case "Año": {
        const numYears = d3.timeYear.count(start, end);
        return Math.max(numYears * 15, 3000);
      }
      case "Todo":
        return Math.max(diffInDays * 38, width - margin.left - margin.right);
      default:
        return width - margin.left - margin.right;
    }
  }

  private getBarColor(rowKey: string, legendValue?: string): string {
    if (rowKey.startsWith("G:")) {
      const parentKey = rowKey.slice(2);
      const dpParent = this.ganttdataPoints.find(p => p.parent === parentKey);
      return dpParent?.color ?? "#72c0ffff";
    }

    if (legendValue && this.legendDataPoints.length > 0) {
      const legendDP = this.legendDataPoints.find(dp => dp.legend === String(legendValue));
      if (legendDP?.color) {
        return legendDP.color;
      }
    }

    const parentKey = rowKey.includes("|") ? rowKey.split("|")[1] : undefined;
    const dpParent = parentKey
      ? this.ganttdataPoints.find(p => p.parent === parentKey)
      : undefined;

    return dpParent?.color ?? "#72c0ffff";
  }

  private createLegendDataPoints(
    options: VisualUpdateOptions
  ): LegendDataPoint[] {

    const dataPoints: LegendDataPoint[] = [];
    const dv = options.dataViews?.[0];
    const categorical = dv?.categorical;

    if (!categorical?.categories) {
      return dataPoints;
    }

    const legendCategory = categorical.categories.find(c => c.source.roles?.legend);
    if (!legendCategory) {
      return dataPoints;
    }

    const colorPalette = this.host.colorPalette;

    // 🔹 PASO 1: Cargar colores guardados desde un JSON string
    const colorMapString = dv?.metadata?.objects?.["legendColorState"]?.["colorMap"] as string;
    if (colorMapString) {
      try {
        const colorMap = JSON.parse(colorMapString);
        Object.keys(colorMap).forEach(legendValue => {
          const color = colorMap[legendValue];
          if (color && typeof color === 'string') {
            this.legendColorStore.set(legendValue, color);
          }
        });
      } catch (e) {
      }
    }

    const prop: DataViewObjectPropertyIdentifier = {
      objectName: "legendColorSelector",
      propertyName: "fill"
    };

    // 🔹 PASO 2: Procesar valores actuales y detectar cambios
    const colorChangesByValue = new Map<string, string>();

    legendCategory.values.forEach((v, i) => {
      const key = String(v);

      const obj = legendCategory.objects?.[i];

      if (obj) {
        const fill = dataViewObjects.getValue<Fill>(obj, prop);
        if (fill?.solid?.color) {
          const currentStored = this.legendColorStore.get(key);

          if (currentStored !== fill.solid.color) {
            this.legendColorStore.set(key, fill.solid.color);
            colorChangesByValue.set(key, fill.solid.color);
          }
        }
      }
    });

    // 🔹 PASO 3: Si hay cambios, persistir TODO el estado como JSON
    if (colorChangesByValue.size > 0) {
      const updates: any[] = [];

      // Construir el mapa completo de colores
      const colorMapObject: any = {};
      this.legendColorStore.forEach((color, legendValue) => {
        colorMapObject[legendValue] = color;
      });

      // Actualizar los selectores individuales solo para los valores cambiados
      colorChangesByValue.forEach((newColor, legendValue) => {
        legendCategory.values.forEach((v, i) => {
          if (String(v) === legendValue) {
            const selector = this.host.createSelectionIdBuilder()
              .withCategory(legendCategory, i)
              .createSelectionId()
              .getSelector();

            updates.push({
              objectName: "legendColorSelector",
              selector,
              properties: {
                fill: { solid: { color: newColor } }
              }
            });
          }
        });
      });

      // 🔹 Guardar estado global como JSON string
      updates.push({
        objectName: "legendColorState",
        selector: null,
        properties: {
          colorMap: JSON.stringify(colorMapObject)
        }
      });
      this.host.persistProperties({ merge: updates });
    }

    // 🔹 PASO 4: Crear data points con colores del store
    const uniqueValues = new Set<string>();
    const indexByLegend = new Map<string, number>();

    legendCategory.values.forEach((v, i) => {
      const key = String(v);
      uniqueValues.add(key);

      if (!indexByLegend.has(key)) {
        indexByLegend.set(key, i);
      }
    });

    uniqueValues.forEach((value) => {
      const baseIndex = indexByLegend.get(value)!;

      const selectionId = this.host.createSelectionIdBuilder()
        .withCategory(legendCategory, baseIndex)
        .createSelectionId();

      let color: string;

      // Primero intentar obtener del store (que ya tiene los guardados)
      if (this.legendColorStore.has(value)) {
        color = this.legendColorStore.get(value)!;
      } else {
        // Si no existe, generar uno nuevo
        color = colorPalette.getColor(value).value;
        this.legendColorStore.set(value, color);

        // 🔹 Guardar inmediatamente el nuevo color
        const updatedColorMap: any = {};
        this.legendColorStore.forEach((c, k) => {
          updatedColorMap[k] = c;
        });

        this.host.persistProperties({
          merge: [{
            objectName: "legendColorState",
            selector: null,
            properties: {
              colorMap: JSON.stringify(updatedColorMap)
            }
          }]
        });
      }

      dataPoints.push({
        legend: value,
        color,
        selectionId,
        index: baseIndex,
        formattingId: {} as FormattingId
      });
    });

    return dataPoints;
  }

  constructor(opts: VisualConstructorOptions) {
    this.container = opts.element as HTMLElement;
    this.host = opts.host

    this.tooltipServiceWrapper = createTooltipServiceWrapper(
      opts.host.tooltipService,
      opts.element
    );

    this.selectionManager = this.host.createSelectionManager();
    this.selectionIdMap = new Map();

    const headerWrapper = d3.select(this.container)
      .append("div")
      .attr("class", "header-wrapper")
      .style("display", "flex")
      .style("flex-direction", "column");

    const legendWrapper = headerWrapper
      .append("div")
      .attr("class", "legend-wrapper");

    this.legend = legend.createLegend(
      legendWrapper.node() as HTMLElement,
      false,
      null
    );

    const topBtnsWrapper = headerWrapper
      .append("div")
      .attr("class", "top-btns-wrapper")
      .style("display", "flex")
      .style("justify-content", "space-between")
      .style("gap", "8px")
      .style("align-items", "center");

    topBtnsWrapper.style("margin-top", "11px");

    this.leftBtns = topBtnsWrapper.append("div").attr("class", "parent-btn-container");
    this.rightBtns = topBtnsWrapper.append("div").attr("class", "format-btn-container");

    const onChangeHandler = (expand: boolean) => {
      this.allExpanded = expand;
      for (const key of this.expanded.keys()) {
        this.expanded.set(key, expand);
      }
      renderParentToggleButtons({
        container: this.leftBtns.node() as HTMLElement,
        allExpanded: this.allExpanded,
        onChange: onChangeHandler
      });
      this.update(this.lastOptions, true);
    };

    renderParentToggleButtons({
      container: this.leftBtns.node() as HTMLElement,
      allExpanded: this.allExpanded,
      onChange: onChangeHandler
    });

    renderFormatButtons({
      container: this.rightBtns.node() as HTMLElement,
      onFormatChange: (fmt: string) => {
        const [newMin, newMax] = this.getDateRangeFromFormat(fmt as FormatType);
        this.zoomToRange(newMin, newMax);

        if (this.currentZoomTransform) {
          const newX = this.currentZoomTransform.rescaleX(this.xOriginal);
          this.selectedFormat = fmt as FormatType;
          this.redrawZoomedElements(newX, this.y, this.barH);
          this.updateFormatButtonsUI(this.selectedFormat);
          this.host.persistProperties({
            merge: [{
              objectName: "formatState",
              selector: null,
              properties: { selectedFormat: this.selectedFormat }
            }]
          });
        }
      }
    });


    const layoutDiv = d3.select(this.container)
      .append("div")
      .attr("class", "layout-wrapper")
      .style("display", "flex")
      .style("height", "100%")
      .style("width", "100%");

    this.yAxisDiv = layoutDiv.append("div")
      .attr("class", "y-axis-fixed")
      .style("flex", "none")
      .style("z-index", "2")
      .style("overflow", "hidden")
      .style("background", "#fff");

    this.yAxisSVG = this.yAxisDiv.append("svg");

    this.ganttDiv = layoutDiv.append("div")
      .attr("class", "scroll-wrapper")
      .style("flex", "1 1 0")
      .style("overflow-x", "auto")
      .style("overflow-y", "auto")
      .style("width", "100%")
      .style("height", "100%")
      .style("position", "relative");

    this.ganttSVG = this.ganttDiv.append("svg")
      .attr("height", "100%")
      .style("display", "block");

    this.xAxisFixedDiv = d3.select(this.container)
      .append("div")
      .attr("class", "x-axis-fixed")
      .style("position", "absolute")
      .style("top", () => {
        const header = this.container.querySelector(".header-wrapper") as HTMLElement;
        return `${header?.offsetHeight ?? 60}px`;
      })
      .style("left", "0px")
      .style("right", "0px")
      .style("height", "60px")
      .style("overflow", "hidden")
      .style("z-index", "0")
      .style("background", "#fff")
      .style("display", "none");


    this.xAxisFixedSVG = this.xAxisFixedDiv.append("svg")
      .style("width", "100%")
      .style("height", "60px");

    this.xAxisFixedG = this.xAxisFixedSVG.append("g");

    this.ganttDiv.node()!.addEventListener("scroll", () => {
      const node = this.ganttDiv.node()!;
      const left = node.scrollLeft;
      const top = node.scrollTop;

      requestAnimationFrame(() => {
        this.xAxisFixedG.attr("transform", `translate(${-left},0)`);
        this.leftG.select<SVGGElement>(".y-content")
          .attr("transform", `translate(0, ${60 - top})`);
      });
    }, { passive: true });

    this.leftG = this.yAxisSVG.append("g");
    this.ganttG = this.ganttSVG.append("g");
    this.linesG = this.ganttG.append("g").attr("class", "y-grid");
    this.landingG = this.ganttSVG.append("g")
      .attr("class", "landing")
      .style("pointer-events", "none");

    d3.select(this.container).on("click", () => {
      this.selectionManager.clear().then(() => {
        this.selectedIds = [];
        const bars = this.ganttG.selectAll<SVGElement, BarDatum>(".bar, .completion-bar");
        bars.attr("opacity", 1);
      });
    });
  }

  public update(opts: VisualUpdateOptions, preserveView = false): void {

    const objects = opts.dataViews?.[0]?.metadata?.objects;
    const persistedFmt = objects?.["formatState"]?.["selectedFormat"] as FormatType | undefined;

    this.selectedFormat = persistedFmt ?? this.selectedFormat;
    this.updateFormatButtonsUI(this.selectedFormat);


    const isDataUpdate = (opts.type & powerbi.VisualUpdateType.Data) !== 0;
    if (isDataUpdate) {
      preserveView = true;

      if (this.currentZoomTransform) {
        const oldDomain = this.xOriginal?.domain();
        const dataDomain: [Date, Date] = this.baseDomain!;

        if (oldDomain && dataDomain[0] && dataDomain[1]) {
          const oldSpan = oldDomain[1].getTime() - oldDomain[0].getTime();
          const newSpan = dataDomain[1].getTime() - dataDomain[0].getTime();

          if (oldSpan > 0 && newSpan > 0) {
            const t = this.currentZoomTransform;
            const testX = t.rescaleX(this.xOriginal);
            const [testMin, testMax] = testX.domain();

            if (testMax < this.baseDomain![0] || testMin > this.baseDomain![1]) {
              this.currentZoomTransform = null;
              if (this.ganttSVG && this.zoomBehavior) {
                this.ganttSVG.call(this.zoomBehavior.transform, d3.zoomIdentity);
              }
            } else {
              const overlap = Math.min(testMax.getTime(), dataDomain[1].getTime()) -
                Math.max(testMin.getTime(), dataDomain[0].getTime());
              const visibleSpan = testMax.getTime() - testMin.getTime();

              if (visibleSpan <= 0 || overlap / visibleSpan < 0.2) {
                this.currentZoomTransform = null;
                if (this.ganttSVG && this.zoomBehavior) {
                  this.ganttSVG.call(this.zoomBehavior.transform, d3.zoomIdentity);
                }
              } else {
                this.currentZoomTransform = t;
              }
            }
          } else {
            this.currentZoomTransform = null;
            if (this.ganttSVG && this.zoomBehavior) {
              this.ganttSVG.call(this.zoomBehavior.transform, d3.zoomIdentity);
            }
          }
        }
      }

    }

    let savedScrollTop: number | undefined;
    let savedScrollLeft: number | undefined;
    let savedZoom: d3.ZoomTransform | undefined;

    if (preserveView) {
      savedScrollTop = this.ganttDiv?.node()?.scrollTop ?? 0;
      savedScrollLeft = this.ganttDiv?.node()?.scrollLeft ?? 0;
      if (this.ganttSVG) {
        savedZoom = d3.zoomTransform(this.ganttSVG.node() as any);
      }
    }

    this.host.eventService?.renderingStarted?.(opts.viewport);


    const dv: DataView | undefined = opts.dataViews?.[0];
    this.fmtSettings = this.fmtService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dv);


    this.ganttdataPoints = createSelectorDataPoints(opts, this.host)
    this.legendDataPoints = this.createLegendDataPoints(opts);


    this.fmtSettings.populateColorSelector(this.ganttdataPoints);
    if (this.legendDataPoints.length > 0) {
      this.fmtSettings.populateLegendDataPointSlices(this.legendDataPoints);
    }

    const { width, height } = opts.viewport;
    this.lastOptions = opts;

    if (this.legendDataPoints.length > 0) {
      const legendData = {
        dataPoints: this.legendDataPoints.map(dp => ({
          label: dp.legend,
          color: dp.color,
          icon: 1,
          identity: dp.selectionId,
          selected: false
        })),
        fontSize: 10,
        labelColor: "#000000"
      };

      this.legend.drawLegend(legendData, { width, height });
    } else {
      this.legend.reset();
    }

    d3.select(this.container)
      .select(".legend")
      .style("display", "block")
      .style("white-space", "normal");


    const hasData = dv?.categorical?.categories?.some(c => c.source.roles?.task) &&
      dv?.categorical?.values?.some(v => v.source.roles?.startDate) &&
      dv?.categorical?.values?.some(v => v.source.roles?.endDate);

    this.leftBtns.style("display", hasData ? "block" : "none");
    this.rightBtns.style("display", hasData ? "block" : "none");
    const pad = 10;

    const tasks = this.parseData(dv);
    if (tasks.length) this.cacheTasks = tasks;

    const hasD = this.cacheTasks.some(t => t.fields.length > this.taskColCount);
    const extraColCount = this.cacheTasks[0]?.extraCols?.length ?? 0;

    const colWidths: number[] = [];
    colWidths.push(this.fmtSettings.taskCard.taskWidth.value);
    colWidths.push(this.fmtSettings.taskCard.startWidth.value);
    colWidths.push(this.fmtSettings.taskCard.endWidth.value);

    for (let i = 0; i < extraColCount; i++) {
      colWidths.push(150);
    }

    if (this.fmtSettings.taskCard.showSecondaryColumns.value) {
      colWidths.push(this.fmtSettings.taskCard.startWidth.value);
      colWidths.push(this.fmtSettings.taskCard.endWidth.value);
    }

    if (hasD) {
      colWidths.push(100);
    }

    this.width = opts.viewport.width;
    this.marginLeft = pad + colWidths.reduce((acc, w) => acc + w, 0);

    const margin = {
      top: 60,
      right: 20,
      bottom: 60,
      left: this.marginLeft
    };

    this.yAxisSVG.selectAll("*").remove();
    this.ganttSVG.selectAll("*").remove();
    this.xAxisFixedG.selectAll("*").remove();

    if (!hasData) {
      this.landingG = this.ganttSVG.append("g")
        .attr("class", "landing")
        .style("pointer-events", "none");
      this.ganttSVG
        .attr("width", width)
        .attr("height", height);
      this.yAxisSVG.attr("display", "none")
        .attr("width", margin.left)
        .attr("height", height);
      this.xAxisFixedDiv.style("display", "none");
      this.xAxisFixedSVG.style("display", "none");
      this.xAxisFixedG.style("display", "none");
      this.renderLanding(width, height);
      return;
    }
    this.xAxisFixedDiv.style("display", null);
    this.xAxisFixedSVG.style("display", null);
    this.xAxisFixedG.style("display", null);
    this.yAxisSVG.attr("display", null);
    this.landingG.attr("display", "none");

    const expCache = new Map(this.expanded);
    const { visibleRows, expanded } = this.buildRows(this.cacheTasks, expCache);
    this.expanded = expanded;

    const rowH = this.fmtSettings.taskCard.taskHeight.value;
    const innerH = rowH * visibleRows.length;


    this.innerW = this.computeInnerW(
      this.selectedFormat,
      d3.min(this.cacheTasks, d => d.start)!,
      d3.max(this.cacheTasks, d => d.end)!,
      width,
      margin
    );
    let x: d3.ScaleTime<number, number>;

    if (!this.baseDomain) {
      const minDate = d3.min(this.cacheTasks, d => d.start)!;
      const maxDate = d3.max(this.cacheTasks, d => d.end)!;
      const buffer = 365;

      this.baseDomain = [
        d3.timeDay.offset(minDate, -buffer),
        d3.timeDay.offset(maxDate, buffer)
      ];
    }

    if (!this.xOriginal) {
      this.xOriginal = d3.scaleTime()
        .domain(this.baseDomain)
        .range([0, this.innerW]);
    } else {
      this.xOriginal.range([0, this.innerW]);
    }

    x = this.currentZoomTransform
      ? this.currentZoomTransform.rescaleX(this.xOriginal)
      : this.xOriginal.copy();

    this.y = d3.scaleBand()
      .domain(visibleRows.map(r => r.rowKey))
      .range([0, innerH])
      .paddingInner(0)
      .paddingOuter(0);



    this.yAxisSVG
      .attr("width", margin.left)
      .attr("height", innerH + margin.top + margin.bottom);
    this.ganttSVG
      .attr("width", this.innerW + margin.right)
      .attr("height", innerH + margin.top + margin.bottom);

    this.xAxisFixedSVG
      .attr("width", this.innerW + margin.right)
      .attr("height", 60);

    const colX = (i: number) => pad + colWidths.slice(0, i).reduce((acc, w) => acc + w, 0);
    const headFmt = this.fmtSettings.headerCard;
    const taskFmt = this.fmtSettings.taskCard;
    const parFmt = this.fmtSettings.parentCard;

    this.leftG = this.yAxisSVG.append("g").attr("class", "left-g");
    const yAxisContentG = this.leftG.append("g")
      .attr("class", "y-content")
      .attr("transform", `translate(0, ${margin.top})`);
    const gridYPos = visibleRows.map(r => this.y(r.rowKey)!);

    this.xOriginal.domain(this.baseDomain!);

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let scrollTopStart = 0;

    this.zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 100])
      .translateExtent([[-1e9, -1e9], [1e9, 1e9]])
      .filter((event) => {
        return !event.ctrlKey || event.type === "wheel" || event.type === "mousedown";
      })
      .on("zoom", (event) => {
        const t = event.transform;
        const newX = t.rescaleX(this.xOriginal);

        this.currentZoomTransform = t;

        this.redrawZoomedElements(newX, this.y, this.barH);

        const newFormat = this.updateSelectedFormatFromZoom(t, width);
        if (newFormat !== this.selectedFormat) {
          this.selectedFormat = newFormat;
          this.updateFormatButtonsUI(this.selectedFormat);
        }

        renderXAxisTop({
          xScale: newX,
          svg: this.axisTopContentG,
          height: 30,
          width,
          selectedFormat: this.selectedFormat,
          translateX: margin.left,
          fmtSettings: this.fmtSettings
        });

        renderXAxisBottom({
          xScale: newX,
          svg: this.axisBottomContentG,
          height: 30,
          width,
          selectedFormat: this.selectedFormat,
          translateX: margin.left,
          fmtSettings: this.fmtSettings
        });
      });


    this.ganttSVG
      .call(this.zoomBehavior)
      .on("mousedown.zoom", null)
      .on("dblclick.zoom", null)
      .on("touchstart.zoom", null);

    this.ganttSVG
  .on("dblclick", () => {
    // Obtener el rango real de fechas de todas las tareas
    const validTasks = this.cacheTasks.filter(t => t.start && t.end);
    
    if (validTasks.length === 0) return;

    const minDate = d3.min(validTasks, t => t.start)!;
    const maxDate = d3.max(validTasks, t => t.end)!;
    
    // Calcular duración promedio para elegir formato óptimo
    const taskDurations = validTasks.map(t => d3.timeDay.count(t.start!, t.end!));
    const avgDuration = d3.mean(taskDurations) ?? 30;

    let optimalFormat: FormatType;

    if (avgDuration <= 2) {
      optimalFormat = "Día";
    } else if (avgDuration <= 15) {
      optimalFormat = "Día";
    } else if (avgDuration <= 90) {
      optimalFormat = "Mes";
    } else {
      optimalFormat = "Mes";
    }

    // Usar el rango real (min-max) de las tareas
    const startDate = minDate;
    const endDate = maxDate;

    const visibleW = this.width - this.marginLeft;
    const rangeWidth = this.xOriginal(endDate) - this.xOriginal(startDate);
    const scale = visibleW / rangeWidth;
    const firstBarX = this.xOriginal(startDate);
    const translateX = -firstBarX * scale + 20;

    const targetTransform = d3.zoomIdentity
      .translate(translateX, 0)
      .scale(scale);

    this.ganttSVG.transition()
      .duration(500)
      .call(this.zoomBehavior.transform, targetTransform);

    this.selectedFormat = optimalFormat;
    this.updateFormatButtonsUI(this.selectedFormat);

    this.ganttSVG.transition()
      .delay(550)
      .on("end", () => {
        if (this.currentZoomTransform) {
          const newX = this.currentZoomTransform.rescaleX(this.xOriginal);
          this.redrawZoomedElements(newX, this.y, this.barH);
        }
      });
  });


    let rafPending = false;
    this.ganttDiv
      .on("mousedown", (event: MouseEvent) => {
        isDragging = true;
        startX = event.clientX;
        startY = event.clientY;
        scrollTopStart = this.ganttDiv.node()!.scrollTop;
        this.ganttDiv.style("cursor", "grabbing");
        event.preventDefault();
      })
      .on("mouseup mouseleave", () => {
        isDragging = false;
        this.ganttDiv.style("cursor", "default");
      })
      .on("mousemove", (event: MouseEvent) => {
        if (!isDragging || rafPending) return;
        rafPending = true;

        requestAnimationFrame(() => {
          const dx = event.clientX - startX;
          const dy = event.clientY - startY;

          const t = d3.zoomTransform(this.ganttSVG.node()!);
          this.ganttSVG.call(this.zoomBehavior.translateBy, dx / t.k, 0);
          this.ganttDiv.node()!.scrollTop -= dy;

          startX = event.clientX;
          startY = event.clientY;
          rafPending = false;
        });
      });

    this.ganttSVG.on("wheel", (event: WheelEvent) => {
      event.preventDefault();
    });

    
      const header = yAxisContentG.append("g")
        .attr("class", "y-grid")
        .selectAll("line")
        .data(gridYPos)
        .join("line")
        .attr("x1", 0)
        .attr("x2", margin.left)
        .attr("y1", d => d)
        .attr("y2", d => d)
        .attr("stroke", this.fmtSettings.axisYCard.lineColor.value.value)
        .attr("stroke-width", 1);
if (headFmt.show.value) {
      const head = this.leftG.append("g")
        .attr("class", "header")
        .attr("transform", `translate(0, ${margin.top})`);

      head.append("rect")
        .attr("x", 0)
        .attr("y", -90)
        .attr("width", margin.left)
        .attr("height", 90)
        .attr("zindex", 999)
        .attr("fill", this.fmtSettings.headerCard.backgroundColor.value.value);

      head.append("line")
        .attr("x1", 0)
        .attr("x2", margin.left)
        .attr("y1", 0)
        .attr("y2", 0)
        .attr("stroke", this.fmtSettings.axisYCard.lineColor.value.value)
        .attr("stroke-width", this.fmtSettings.axisYCard.widthLine.value);

      this.taskColNames.forEach((n, i) => {
        head.append("text").text(n)
          .attr("x", colX(i) + colWidths[i] / 2)
          .attr("y", -10)
          .attr("zindex", 999)
          .attr("fill", headFmt.fontColor.value.value)
          .attr("font-size", headFmt.fontSize.value)
          .attr("font-family", headFmt.fontFamily.value)
          .attr("text-anchor", "middle");
      });

      head.append("text").text(this.startName)
        .attr("x", colX(this.taskColCount) + colWidths[this.taskColCount] / 2)
        .attr("y", -10)
        .attr("zindex", 999)
        .attr("fill", headFmt.fontColor.value.value)
        .attr("font-size", headFmt.fontSize.value)
        .attr("font-family", headFmt.fontFamily.value)
        .attr("text-anchor", "middle");

      head.append("text").text(this.endName)
        .attr("x", colX(this.taskColCount + 1) + colWidths[this.taskColCount + 1] / 2)
        .attr("y", -10)
        .attr("zindex", 999)
        .attr("fill", headFmt.fontColor.value.value)
        .attr("font-size", headFmt.fontSize.value)
        .attr("font-family", headFmt.fontFamily.value)
        .attr("text-anchor", "middle");

      if (extraColCount > 0) {
        const baseIndex = this.taskColCount + 2 + (this.fmtSettings.taskCard.showSecondaryColumns.value ? 2 : 0);

        for (let i = 0; i < extraColCount; i++) {
          const colName = this.extraColNames?.[i] ?? `Col ${i + 1}`;
          const colIndex = baseIndex + i;
          head.append("text").text(colName)
            .attr("x", colX(colIndex) + colWidths[colIndex] / 2)
            .attr("y", -10)
            .attr("zindex", 999)
            .attr("fill", headFmt.fontColor.value.value)
            .attr("font-size", headFmt.fontSize.value)
            .attr("font-family", headFmt.fontFamily.value)
            .attr("text-anchor", "middle");
        }
      }

      if (this.fmtSettings.taskCard.showSecondaryColumns.value) {
        head.append("text").text(this.secondaryStartName)
          .attr("x", colX(this.taskColCount + 2) + colWidths[this.taskColCount + 2] / 2)
          .attr("y", -10)
          .attr("zindex", 999)
          .attr("fill", headFmt.fontColor.value.value)
          .attr("font-size", headFmt.fontSize.value)
          .attr("font-family", headFmt.fontFamily.value)
          .attr("text-anchor", "middle");

        head.append("text").text(this.secondaryEndName)
          .attr("x", colX(this.taskColCount + 3) + colWidths[this.taskColCount + 3] / 2)
          .attr("y", -10)
          .attr("zindex", 999)
          .attr("fill", headFmt.fontColor.value.value)
          .attr("font-size", headFmt.fontSize.value)
          .attr("font-family", headFmt.fontFamily.value)
          .attr("text-anchor", "middle");
      }

      if (hasD) {
        const durIndex = this.taskColCount + (this.fmtSettings.taskCard.showSecondaryColumns.value ? 4 : 2);
        head.append("text").text("Duración")
          .attr("x", colX(durIndex) + colWidths[durIndex] / 2)
          .attr("y", -10)
          .attr("zindex", 999)
          .attr("fill", headFmt.fontColor.value.value)
          .attr("font-size", headFmt.fontSize.value)
          .attr("font-family", headFmt.fontFamily.value)
          .attr("text-anchor", "middle");
      }
    }

    const dateFmt = d3.timeFormat("%d/%m/%Y %H:%M");
    const self = this;

    const yScale = this.y

    const yAxis = yAxisContentG.selectAll(".row")
      .data(visibleRows)
      .enter().append("g")
      .attr("class", "row")
      .each(function (row) {
        const top = yScale(row.rowKey);
        if (top === undefined) return;
        const g = d3.select(this);
        if (row.isGroup) {
          g.append("rect")
            .attr("x", 0)
            .attr("y", top)
            .attr("width", margin.left)
            .attr("height", yScale.bandwidth())
            .attr("fill", parFmt.backgroundColor.value.value);

          const exp = self.expanded.get(row.id) ?? true;

          let key: string | undefined;
          if (row.rowKey?.startsWith("G:")) key = row.rowKey.slice(2);
          else if (row.rowKey?.includes("|")) key = row.rowKey.split("|")[1];

          const dp = self.ganttdataPoints.find(p => p.parent === key);
          const triColor = dp?.color ?? parFmt.fontColor.value.value;

          const label = g.append("text")
            .attr("x", 5)
            .attr("y", top + yScale.bandwidth() / 2 + 4)
            .attr("font-weight", "bold")
            .attr("cursor", "pointer")
            .attr("font-family", parFmt.fontFamily.value)
            .attr("font-size", parFmt.fontSize.value)
            .attr("data-rowKey", row.rowKey)
            .on("click", () => {
              self.expanded.set(row.id, !exp);
              const expandedValues = Array.from(self.expanded.values());
              self.allExpanded = expandedValues.every(Boolean);
              self.update(self.lastOptions);
            });

          label.text(null);

          label.append("tspan")
            .attr("fill", triColor)
            .text(exp ? "▼" : "▶")
            .attr("dy", "3px")
            .attr("data-rowKey", row.rowKey);

          label.append("tspan")
            .text(" " + row.labelY);

          const r = self.groupRange.get(row.id);
          if (r) {
            g.append("text").text(dateFmt(r.start))
              .attr("x", colX(self.taskColCount))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              .attr("font-weight", "bold")
              .attr("fill", parFmt.fontColor.value.value)
              .attr("font-size", parFmt.fontSize.value)
              .attr("data-rowKey", row.rowKey)
              .attr("font-family", parFmt.fontFamily.value);

            g.append("text").text(dateFmt(r.end))
              .attr("x", colX(self.taskColCount + 1))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              .attr("font-weight", "bold")
              .attr("fill", parFmt.fontColor.value.value)
              .attr("data-rowKey", row.rowKey)
              .attr("font-size", parFmt.fontSize.value)
              .attr("font-family", parFmt.fontFamily.value);

            if (self.fmtSettings.taskCard.showSecondaryColumns.value) {
              if (r.secondaryStart) {
                g.append("text").text(dateFmt(r.secondaryStart))
                  .attr("x", colX(self.taskColCount + 2))
                  .attr("y", top + yScale.bandwidth() / 2 + 4)
                  .attr("font-weight", "bold")
                  .attr("fill", parFmt.fontColor.value.value)
                  .attr("data-rowKey", row.rowKey)
                  .attr("font-size", parFmt.fontSize.value)
                  .attr("font-family", parFmt.fontFamily.value);
              }
              if (r.secondaryEnd) {
                g.append("text").text(dateFmt(r.secondaryEnd))
                  .attr("x", colX(self.taskColCount + 3))
                  .attr("y", top + yScale.bandwidth() / 2 + 4)
                  .attr("font-weight", "bold")
                  .attr("fill", parFmt.fontColor.value.value)
                  .attr("data-rowKey", row.rowKey)
                  .attr("font-size", parFmt.fontSize.value)
                  .attr("font-family", parFmt.fontFamily.value);
              }
            }
          }

          if (row.duration !== undefined && hasD) {
            g.append("text").text(String(row.duration))
              .attr("x", colX(self.taskColCount + (self.fmtSettings.taskCard.showSecondaryColumns.value ? 4 : 2)))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              .attr("font-weight", "bold")
              .attr("fill", parFmt.fontColor.value.value)
              .attr("data-rowKey", row.rowKey)
              .attr("font-size", parFmt.fontSize.value)
              .attr("font-family", parFmt.fontFamily.value);
          }

          if (self.extraColNames.length > 0) {
            self.extraColNames.forEach((colName, i) => {
              const children = self.cacheTasks.filter(t => t.parent === row.id);
              const vals = children.map(t => t.extraCols?.[i]).filter(v => v !== undefined && v !== "");

              let aggVal = "";
              if (vals.length) {
                const nums = vals.map(Number).filter(n => !isNaN(n));
                if (nums.length === vals.length) {
                  aggVal = d3.mean(nums)!.toFixed(1);
                } else {
                  const firstVal = vals[0] as string;
                  const d = new Date(firstVal);
                  if (!isNaN(d.getTime())) {
                    aggVal = d3.timeFormat("%d/%m/%Y %H:%M")(d);
                  } else {
                    aggVal = [...new Set(vals)].join(", ");
                  }
                }
              }

              const baseIndex = self.taskColCount + 2 + (self.fmtSettings.taskCard.showSecondaryColumns.value ? 2 : 0);
              const colIndex = baseIndex + i;

              g.append("text")
                .text(aggVal)
                .attr("x", colX(colIndex))
                .attr("y", top + yScale.bandwidth() / 2 + 4)
                .attr("font-weight", "bold")
                .attr("fill", parFmt.fontColor.value.value)
                .attr("font-size", parFmt.fontSize.value)
                .attr("data-rowKey", row.rowKey)
                .attr("font-family", parFmt.fontFamily.value);
            });
          }

        }

        else if (row.task) {
          const hasDuration = row.task.fields.length > self.taskColCount;
          const durationIndex = hasDuration ? row.task.fields.length - 1 : -1;
          const showSecondaryColumns = self.fmtSettings.taskCard.showSecondaryColumns.value;

          const dateFmt = d3.timeFormat("%d/%m/%Y %H:%M");

          row.task.fields.forEach((val, i) => {
            if (hasDuration && i === durationIndex) return;

            const maxWidth = colWidths[i] - 8;
            const tmp = g.append("text")
              .attr("x", colX(i))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              .attr("font-size", taskFmt.fontSize.value)
              .attr("fill", taskFmt.fontColor.value.value)
              .attr("font-family", taskFmt.fontFamily.value)
              .attr("data-rowKey", row.rowKey)
              .text(val);

            let textNode = tmp.node() as SVGTextElement;
            if (textNode.getComputedTextLength() > maxWidth) {
              let str = val;
              while (str.length && textNode.getComputedTextLength() > maxWidth) {
                str = str.slice(0, -1);
                tmp.text(str + "…");
                textNode = tmp.node() as SVGTextElement;
              }
            }
            tmp.append("title").text(val);
          });

          // === Inicio P ===
          g.append("text")
            .text(row.task.start && !isNaN(row.task.start.getTime()) ? dateFmt(row.task.start) : " ")
            .attr("x", colX(self.taskColCount))
            .attr("y", top + yScale.bandwidth() / 2 + 4)
            .attr("font-size", taskFmt.fontSize.value)
            .attr("fill", taskFmt.fontColor.value.value)
            .attr("data-rowKey", row.rowKey)
            .attr("font-family", taskFmt.fontFamily.value);

          // === Fin P ===
          g.append("text")
            .text(row.task.end && !isNaN(row.task.end.getTime()) ? dateFmt(row.task.end) : " ")
            .attr("x", colX(self.taskColCount + 1))
            .attr("y", top + yScale.bandwidth() / 2 + 4)
            .attr("font-size", taskFmt.fontSize.value)
            .attr("fill", taskFmt.fontColor.value.value)
            .attr("data-rowKey", row.rowKey)
            .attr("font-family", taskFmt.fontFamily.value);

          // === Secondary ===
          if (showSecondaryColumns) {
            g.append("text")
              .text(row.task.secondaryStart && !isNaN(row.task.secondaryStart.getTime()) ? dateFmt(row.task.secondaryStart) : " ")
              .attr("x", colX(self.taskColCount + 2))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              .attr("font-size", taskFmt.fontSize.value)
              .attr("data-rowKey", row.rowKey)
              .attr("fill", taskFmt.fontColor.value.value)
              .attr("font-family", taskFmt.fontFamily.value);

            g.append("text")
              .text(row.task.secondaryEnd && !isNaN(row.task.secondaryEnd.getTime()) ? dateFmt(row.task.secondaryEnd) : " ")
              .attr("x", colX(self.taskColCount + 3))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              .attr("font-size", taskFmt.fontSize.value)
              .attr("data-rowKey", row.rowKey)
              .attr("fill", taskFmt.fontColor.value.value)
              .attr("font-family", taskFmt.fontFamily.value);
          }

          // === ExtraCols justo acá (se pintan en el mismo flujo) ===
          if (row.task.extraCols && self.extraColNames.length) {
            row.task.extraCols.forEach((val, i) => {
              const baseIndex = self.taskColCount + 2 + (showSecondaryColumns ? 2 : 0);
              const colIndex = baseIndex + i;

              let displayVal = val || "";

              if (displayVal !== "") {
                if (!isNaN(Number(displayVal))) {
                  const num = Number(displayVal);
                  displayVal = `${num.toFixed(1)} h`;
                } else {
                  const d = new Date(displayVal);
                  if (!isNaN(d.getTime())) {
                    displayVal = d3.timeFormat("%d/%m/%Y %H:%M")(d);
                  }
                }
              }

              const tmp = g.append("text")
                .attr("x", colX(colIndex))
                .attr("y", top + yScale.bandwidth() / 2 + 4)
                .attr("font-size", taskFmt.fontSize.value)
                .attr("fill", taskFmt.fontColor.value.value)
                .attr("font-family", taskFmt.fontFamily.value)
                .attr("data-rowKey", row.rowKey)
                .text(displayVal);

              tmp.append("title").text(displayVal);
            });
          }

          if (hasDuration) {
            const durationVal = row.task.fields[durationIndex];
            g.append("text").text(durationVal)
              .attr("x", colX(self.taskColCount + 2))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              .attr("font-size", taskFmt.fontSize.value)
              .attr("fill", taskFmt.fontColor.value.value)
              .attr("font-family", taskFmt.fontFamily.value);
          }
        }



      });

    if (this.fmtSettings.axisYCard.showLine.value) {
      this.leftG.selectAll(".row")
        .data(visibleRows)
        .enter().append("g")
        .attr("class", "row")
        .each(function (row) {
        });

      yAxisContentG.append("line")
        .attr("x1", margin.left - 1)
        .attr("x2", margin.left - 1)
        .attr("y1", 0)
        .attr("y2", innerH)
        .attr("stroke", this.fmtSettings.axisYCard.lineColor.value.value)
        .attr("stroke-width", this.fmtSettings.axisYCard.widthLine.value)
      yAxisContentG.selectAll(".y-tick")
        .data(visibleRows)
        .enter()
        .append("line")
        .attr("class", "y-tick")
        .attr("x1", margin.left - 7)
        .attr("x2", margin.left - 1)
        .attr("y1", (d) => yScale(d.rowKey)! + yScale.bandwidth() / 2)
        .attr("y2", (d) => yScale(d.rowKey)! + yScale.bandwidth() / 2)
        .attr("stroke", "#bbbbbb")
        .attr("stroke-width", 2);
    }

    this.ganttG = this.ganttSVG.append("g").attr("transform", `translate(0, ${margin.top})`);

    const barCfg = this.fmtSettings.barCard;
    this.barH = Math.min((this.fmtSettings.barCard.barGroup.slices.find(s => s.name === "barHeight") as formattingSettings.NumUpDown)?.value ?? 30, rowH);
    const yOff = (taskFmt.taskHeight.value - this.barH) / 2;

    const categorical = opts.dataViews[0].categorical;
    const taskCategory = categorical.categories[0];

    const taskBars: BarDatum[] = [];
    visibleRows
      .filter(r => !r.isGroup && r.task)
      .forEach(r => {
        const task = r.task!;
        const entries = (task as any).legendEntries || [task];

        entries.forEach((entry: Task) => {
          if (entry.start && entry.end) {
            taskBars.push({
              id: `${entry.id}_${entry.legend || 'default'}`,
              start: entry.start,
              end: entry.end,
              rowKey: r.rowKey,
              isGroup: false,
              index: entry.index,
              completion: entry.completion,
              secondaryStart: entry.secondaryStart ? new Date(entry.secondaryStart) : undefined,
              secondaryEnd: entry.secondaryEnd ? new Date(entry.secondaryEnd) : undefined,
              selectionId: this.host.createSelectionIdBuilder()
                .withCategory(taskCategory, entry.index)
                .createSelectionId() as ISelectionId,
              legend: entry.legend
            });
          }
        });
      });

    const parentCategory = categorical.categories[1];

    const groupBars: BarDatum[] = visibleRows
      .filter(r => r.isGroup)
      .map(r => {
        const range = this.groupRange.get(r.id)!;
        const parentIndex = parentCategory.values.findIndex(v => `${v}` === r.id);

        const groupSelectionId = this.host.createSelectionIdBuilder()
          .withCategory(parentCategory, parentIndex)
          .createSelectionId();

        return {
          id: r.id,
          start: range.start,
          end: range.end,
          rowKey: r.rowKey,
          isGroup: true,
          index: parentIndex,
          completion: getCompletionByGroup(
            r.rowKey,
            this.cacheTasks.map((t, j) => ({
              id: t.id,
              start: t.start,
              end: t.end,
              rowKey: `T:${t.id}|${t.parent}`,
              isGroup: false,
              index: j,
              completion: t.completion,
              selectionId: this.host.createSelectionIdBuilder()
                .withCategory(taskCategory, j)
                .createSelectionId() as ISelectionId
            }))
          ),
          secondaryStart: range.secondaryStart ? new Date(range.secondaryStart) : undefined,
          secondaryEnd: range.secondaryEnd ? new Date(range.secondaryEnd) : undefined,
          selectionId: groupSelectionId
        };
      });


    const allBars = [...taskBars, ...groupBars].map((bar, i) => ({
      ...bar,
      gradientId: `bar-gradient-${i}`
    }));

    const defs = this.ganttSVG.append("defs");

    allBars.forEach(d => {
      if (!(d.start instanceof Date) || !(d.end instanceof Date)) return;

      let key: string | undefined;
      if (d.rowKey?.startsWith("G:")) {
        key = d.rowKey.slice(2);
      } else if (d.rowKey?.includes("|")) {
        key = d.rowKey.split("|")[1];
      }

      const baseColorStr = this.getBarColor(d.rowKey, d.legend);
      const colorBase = d3.color(baseColorStr)!;
      const colorClaro = d3.interpolateRgb(colorBase, d3.color("#ffffff"))(0.5);

      const gradient = defs.append("linearGradient")
        .attr("id", d.gradientId)
        .attr("x1", "0%")
        .attr("x2", "100%")
        .attr("y1", "0%")
        .attr("y2", "0%");

      const raw = Number(d.completion);
      const safeCompletion = isNaN(raw) ? 0 : (raw > 1 ? raw / 100 : raw);
      const completion = Math.max(0, Math.min(1, safeCompletion));

      gradient.append("stop")
        .attr("offset", `${completion * 100}%`)
        .attr("stop-color", baseColorStr);

      gradient.append("stop")
        .attr("offset", `${completion * 100}%`)
        .attr("stop-color", colorClaro);
    });

    const dependencies: { from: string; to: string }[] = [];

    visibleRows.forEach(row => {
      const pred = row.task?.predecessor;
      if (pred) {
        const fromTask = visibleRows.find(r => r.labelY === pred);

        if (
          fromTask?.task?.start instanceof Date &&
          !isNaN(fromTask.task.start.getTime()) &&
          fromTask?.task?.end instanceof Date &&
          !isNaN(fromTask.task.end.getTime()) &&
          row.task?.start instanceof Date &&
          !isNaN(row.task.start.getTime())
        ) {
          dependencies.push({ from: fromTask.id, to: row.id });
        } else {
        }
      }
    });

    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 10)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#666");


    if (allBars.length) {
      const bars = this.ganttG.selectAll<SVGRectElement, BarDatum>(".bar, .bar-secondary")
        .data(allBars, d => d.id)
        .join(
          enter => enter.append(d =>
            document.createElementNS("http://www.w3.org/2000/svg", d.isGroup ? "path" : "rect")
          ).attr("class", "bar"),
          update => update,
          exit => exit.remove()
        );

      // === HIJOS (tareas) ===
      bars.filter(d =>
        !d.isGroup &&
        d.start instanceof Date && !isNaN(d.start.getTime()) &&
        d.end instanceof Date && !isNaN(d.end.getTime())
      )
        .attr("x", d => x(d.start))
        .attr("y", d => yScale(d.rowKey)! + yOff)
        .attr("width", d => x(d.end) - x(d.start))
        .attr("height", this.barH)
        .attr("fill", d => this.getBarColor(d.rowKey, d.legend))
        .attr("rx", (barCfg.barGroup.slices.find(s => s.name === "cornerRadius") as formattingSettings.Slider).value)
        .attr("ry", (barCfg.barGroup.slices.find(s => s.name === "cornerRadius") as formattingSettings.Slider).value)
        .attr("stroke", d => this.getBarColor(d.rowKey, d.legend))
        .attr("stroke-width", (barCfg.barGroup.slices.find(s => s.name === "strokeWidth") as formattingSettings.Slider).value)
        .attr("tabindex", 0)
        .on("keydown", (event, d: BarDatum) => {
          if (event.key === "Enter" || event.key === " ") {
            this.selectionManager.select(d.selectionId, true).then((ids: ISelectionId[]) => {
              this.selectedIds = ids;
              this.update(this.lastOptions);
            });
            event.preventDefault();
          }
        })
        .on("mouseover", (event, d: BarDatum) => {
          const strokeColor = d3.select(event.currentTarget).attr("stroke");
          d3.selectAll(`text[data-rowKey="${d.rowKey}"]`).attr("fill", strokeColor);
          d3.selectAll(`.duration-label[data-rowKey="${d.rowKey}"]`).attr("fill", strokeColor);
        })
        .on("mouseout", (event, d: BarDatum) => {
          d3.selectAll(`text[data-rowKey="${d.rowKey}"]`).attr("fill", taskFmt.fontColor.value.value);
          d3.selectAll(`.duration-label[data-rowKey="${d.rowKey}"]`).attr("fill", this.fmtSettings.barCard.labelGroup.fontColor.value.value);
        })
        .on("click", (event, d: BarDatum) => {
          event.stopPropagation();
          this.selectionManager.select(d.selectionId, event.ctrlKey || event.metaKey).then((ids: ISelectionId[]) => {
            this.selectedIds = ids;

            const bars = this.ganttG.selectAll<SVGElement, BarDatum>(".bar, .completion-bar");
            bars.attr("opacity", bar =>
              ids.some(sel => sel.getKey() === bar.selectionId.getKey()) ? 1 : 0.3
            );
          });
        })
        .on("contextmenu", (event, d: BarDatum) => {
          this.selectionManager.showContextMenu(d.selectionId, {
            x: event.clientX,
            y: event.clientY
          });
          event.preventDefault();
        });

      // === PADRES (grupos) ===
      bars.filter(d => d.isGroup)
        .attr("d", d => getGroupBarPath(x, yScale, d, taskFmt.taskHeight.value, this.barH))
        .attr("fill", d => `url(#${d.gradientId})`)
        .attr("stroke", d => {
          const key = d.rowKey.split("|")[0].replace(/^[A-Z]:/, "");
          const dp = this.ganttdataPoints.find(p => p.parent === key);
          return dp?.color ?? "#72c0ffff";
        })
        .attr("stroke-width", 1)
        .style("pointer-events", "all")

        .attr("tabindex", 0)
        .on("keydown", (event, d: BarDatum) => {
          if (event.key === "Enter" || event.key === " ") {
            this.selectionManager.select(d.selectionId, event.ctrlKey || event.metaKey).then((ids: ISelectionId[]) => {
              this.selectedIds = ids;
              this.update(this.lastOptions);
            });
            event.preventDefault();
          }
        })
        .on("click", (event, d: BarDatum) => {
          event.stopPropagation();
          this.selectionManager.select(d.selectionId, true).then((ids: ISelectionId[]) => {
            this.selectedIds = ids;

            const bars = this.ganttG.selectAll<SVGElement, BarDatum>(".bar, .completion-bar");
            bars.attr("opacity", bar =>
              ids.some(sel => sel.getKey() === bar.selectionId.getKey()) ? 1 : 0.3
            );
          });
        })
        .on("contextmenu", (event, d: BarDatum) => {
          this.selectionManager.showContextMenu(d.selectionId, {
            x: event.clientX,
            y: event.clientY
          });
          event.preventDefault();
        })
        .on("mouseover", (event, d: BarDatum) => {
          const strokeColor = d3.select(event.currentTarget).attr("stroke");
          d3.selectAll(`text[data-rowKey="${d.rowKey}"]`).attr("fill", strokeColor);
        })
        .on("mouseout", (event, d: BarDatum) => {
          d3.selectAll(`text[data-rowKey="${d.rowKey}"]`).attr("fill", parFmt.fontColor.value.value);
        });

      const highlightColumn = dv.categorical.values.find(val => val.highlights);

      if (highlightColumn && highlightColumn.highlights) {
        const highlights = highlightColumn.highlights;
        bars.attr("opacity", d =>
          highlights[d.index] != null ? 1 : 0.3
        );
      } else if (this.selectedIds.length > 0) {
        bars.attr("opacity", d =>
          this.selectedIds.some(sel => sel.getKey() === d.selectionId.getKey()) ? 1 : 0.3
        );
      } else {
        bars.attr("opacity", 1);
      }

      // === COMPLETION BARS ===
      this.ganttG.selectAll<SVGRectElement, BarDatum>(".completion-bar")
        .data(allBars.filter(d =>
          !d.isGroup &&
          d.start instanceof Date &&
          !isNaN(d.start.getTime()) &&
          d.end instanceof Date &&
          !isNaN(d.end.getTime())
        ), d => d.id)
        .join("rect")
        .raise()
        .attr("zindex", 312)
        .attr("class", "completion-bar")
        .attr("x", d => x(d.start))
        .attr("y", d => yScale(d.rowKey)! + yOff)
        .attr("height", this.barH)
        .attr("width", d => {
          if (!(d.start instanceof Date) || isNaN(d.start.getTime())) return 0;
          if (!(d.end instanceof Date) || isNaN(d.end.getTime())) return 0;
          const xStart = x(d.start);
          const xEnd = x(d.end);
          if (!isFinite(xStart) || !isFinite(xEnd)) return 0;
          const baseWidth = Math.max(0, xEnd - xStart);
          const c = Number(d.completion);
          if (isNaN(c) || c <= 0) return 0;
          if (c >= 100) return baseWidth;
          return baseWidth * (c > 1 ? c / 100 : c);
        })
        .attr("fill", d => this.getBarColor(d.rowKey, d.legend))
        .attr("rx", (barCfg.barGroup.slices.find(s => s.name === "cornerRadius") as formattingSettings.Slider).value)
        .attr("ry", (barCfg.barGroup.slices.find(s => s.name === "cornerRadius") as formattingSettings.Slider).value);

      // === BARRAS SECUNDARIAS ===
      this.ganttG
        .selectAll(".bar-secondary")
        .data(allBars.filter(d =>
          d.secondaryStart instanceof Date &&
          !isNaN(d.secondaryStart.getTime()) &&
          d.secondaryEnd instanceof Date &&
          !isNaN(d.secondaryEnd.getTime())
        ))
        .join("rect")
        .attr("class", "bar-secondary")
        .attr("x", d => x(d.secondaryStart!))
        .attr("y", d => yScale(d.rowKey)! + yOff + this.barH / 2 - (d.isGroup ? 4 : 3))
        .attr("width", d => {
          const xStart = x(d.secondaryStart!);
          const xEnd = x(d.secondaryEnd!);
          const w = Math.max(0, xEnd - xStart);
          return w;
        })
        .attr("height", d => d.isGroup ? 5 : 6)
        .attr("fill", d => d.isGroup ? "#d35400" : "#e67e22")
        .attr("rx", 2)
        .on("mouseover", (event, d: BarDatum) => {
          const key = d.rowKey.startsWith("G:") ? d.rowKey.slice(2) : d.rowKey;
        });


      // === LÍNEA Y TEXTO DE HOY ===
      const today = new Date();
      this.ganttG
        .selectAll(".today-line")
        .data([today])
        .join("line")
        .attr("class", "today-line")
        .attr("x1", d => x(d))
        .attr("x2", d => x(d))
        .attr("y1", 0)
        .attr("y2", innerH)
        .attr("stroke", this.fmtSettings.timeMarkerCard.todayGroup.fontColor.value.value)
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "4,2");

      this.ganttG
        .selectAll(".today-label")
        .data([today])
        .join("text")
        .attr("class", "today-label")
        .text("Hoy")
        .attr("x", d => x(d) + 5)
        .attr("y", 10)
        .attr("font-size", 15)
        .attr("fill", this.fmtSettings.timeMarkerCard.todayGroup.fontColor.value.value)
        .attr("writing-mode", "vertical-rl")
        .attr("text-anchor", "start");

      // === COMPLETION LABELS ===
      this.ganttG.selectAll<SVGTextElement, BarDatum>(".completion-label")
        .data(allBars.filter(d =>
          !d.isGroup &&
          d.start instanceof Date &&
          !isNaN(d.start.getTime()) &&
          d.end instanceof Date &&
          !isNaN(d.end.getTime()) &&
          d.completion !== undefined &&
          d.completion > 0
        ), d => d.id)
        .join("text")
        .attr("class", "completion-label")
        .text(d => {
          const c = Number(d.completion);
          const pct = c > 1 ? c : c * 100;
          return `${Math.round(pct)}%`;
        })
        .attr("x", d => {
          const c = Number(d.completion);
          if (isNaN(c) || c <= 0) return -9999;
          const start = x(d.start);
          const end = x(d.end);
          const width = end - start;
          const pct = c > 1 ? c / 100 : c;
          return start + width * pct - 6;
        })
        .attr("y", d => yScale(d.rowKey)! + yOff + this.barH / 2 + 4)
        .attr("fill", this.fmtSettings.completionCard.fontColor.value.value)
        .attr("font-size", this.fmtSettings.completionCard.fontSize.value)
        .attr("font-family", this.fmtSettings.completionCard.fontFamily.value)
        .attr("text-anchor", "start")
        .attr("dominant-baseline", "middle");

      // === BARRA DE GRUPO ===
      bars.filter(d =>
        d.isGroup &&
        d.start instanceof Date &&
        !isNaN(d.start.getTime()) &&
        d.end instanceof Date &&
        !isNaN(d.end.getTime())
      )
        .attr("d", d => getGroupBarPath(x, yScale, d, taskFmt.taskHeight.value, this.barH))
        .attr("fill", d => `url(#${d.gradientId})`)
        .attr("stroke", d => {
          const key = d.rowKey.split("|")[0].replace(/^[A-Z]:/, "");
          const dp = this.ganttdataPoints.find(p => p.parent === key);
          return dp?.color ?? "#72c0ffff";
        })
        .attr("stroke-width", 1);

      // === LABELS DE DURACIÓN ===
      if (this.fmtSettings.labelCard.show.value) {
        renderDurationLabels({
          svg: this.ganttG,
          bars: allBars,
          x,
          y: this.y,
          yOffset: yOff,
          barHeight: this.barH,
          fontFamily: this.fmtSettings.barCard.labelGroup.fontFamily.value,
          fontSize: this.fmtSettings.barCard.labelGroup.fontSize.value,
          fontColor: this.fmtSettings.barCard.labelGroup.fontColor.value.value,
          bold: this.fmtSettings.barCard.labelGroup.bold.value,
          italic: this.fmtSettings.barCard.labelGroup.italic.value,
          underline: this.fmtSettings.barCard.labelGroup.underline.value
        });
      }

      // === TOOLTIP ===
      const tooltipTargets = this.ganttG.selectAll<SVGElement, BarDatum>(
        ".bar, .bar-secondary, .bar-group"
      );

      this.tooltipServiceWrapper.addTooltip<BarDatum>(
        tooltipTargets,
        (d: BarDatum) => {
          const tooltipItems: { displayName: string; value: string }[] = [];

          if (d.isGroup) {
            const range = this.groupRange.get(d.id);

            tooltipItems.push(
              { displayName: this.parentName, value: d.id },
              { displayName: this.startName, value: range?.start ? d3.timeFormat("%d/%m/%Y %H:%M")(range.start) : "" },
              { displayName: this.endName, value: range?.end ? d3.timeFormat("%d/%m/%Y %H:%M")(range.end) : "" }
            );

            if (this.fmtSettings.taskCard.showSecondaryColumns.value) {
              tooltipItems.push(
                { displayName: this.secondaryStartName, value: range?.secondaryStart ? d3.timeFormat("%d/%m/%Y %H:%M")(range.secondaryStart) : "" },
                { displayName: this.secondaryEndName, value: range?.secondaryEnd ? d3.timeFormat("%d/%m/%Y %H:%M")(range.secondaryEnd) : "" }
              );
            }
          } else {
            const [taskRaw, parentRaw] = (d.rowKey || "").split("|", 2);
            const taskName = (taskRaw || "").replace(/^T:/, "");
            const parentName = (parentRaw || "").replace(/^G:/, "");

            tooltipItems.push(
              { displayName: this.parentName, value: parentName },
              { displayName: "Task", value: taskName },
              { displayName: this.startName, value: d.start ? d3.timeFormat("%d/%m/%Y %H:%M")(d.start) : "" },
              { displayName: this.endName, value: d.end ? d3.timeFormat("%d/%m/%Y %H:%M")(d.end) : "" }
            );

            if (this.fmtSettings.taskCard.showSecondaryColumns.value) {
              tooltipItems.push(
                { displayName: this.secondaryStartName, value: d.secondaryStart ? d3.timeFormat("%d/%m/%Y %H:%M")(d.secondaryStart) : "" },
                { displayName: this.secondaryEndName, value: d.secondaryEnd ? d3.timeFormat("%d/%m/%Y %H:%M")(d.secondaryEnd) : "" }
              );
            }
          }

          return tooltipItems;
        },
        (d: BarDatum) => d.selectionId
      );

    }

    const depLines: {
      fromRow: VisualRow;
      toRow: VisualRow;
    }[] = [];

    dependencies.forEach(dep => {
      const fromRow = visibleRows.find(r => r.id === dep.from);
      const toRow = visibleRows.find(r => r.id === dep.to);

      if (fromRow?.task?.end && toRow?.task?.start) {
        depLines.push({ fromRow, toRow });
      } else {
      }
    });

    this.ganttG.selectAll(".dependency-line")
      .data(depLines)
      .join("path")
      .attr("class", "dependency-line")
      .attr("d", d => {
        const x1 = x(d.fromRow.task.end);
        const y1 = this.y(d.fromRow.rowKey)! + this.y.bandwidth() / 2;
        const x2 = x(d.toRow.task.start);
        const y2 = this.y(d.toRow.rowKey)! + this.y.bandwidth() / 2;

        const midX = (x1 + x2) / 2;
        return `M${x1},${y1} 
              L${midX},${y1} 
              L${midX},${y2} 
              L${x2},${y2}`;
      })
      .attr("fill", "none")
      .attr("stroke", "#afafafff")
      .attr("stroke-width", 2)
      .attr("marker-end", "url(#arrowhead)")
      .lower();

    this.axisTopContentG = this.xAxisFixedG
      .append("g")
      .attr("class", "axis-top-content")
      .attr("transform", `translate(0, 0)`);

    renderXAxisTop({
      xScale: x,
      svg: this.axisTopContentG,
      height: 30,
      width: width,
      selectedFormat: this.selectedFormat,
      translateX: margin.left,
      fmtSettings: this.fmtSettings
    });

    this.axisBottomContentG = this.xAxisFixedG
      .append("g")
      .attr("class", "axis-bottom-content")
      .attr("transform", `translate(0, 0)`);

    renderXAxisBottom({
      xScale: x,
      svg: this.axisBottomContentG,
      height: 30,
      width: width,
      selectedFormat: this.selectedFormat,
      translateX: margin.left,
      fmtSettings: this.fmtSettings
    });

    if (preserveView) {
      if (savedScrollTop !== undefined) {
        this.ganttDiv.node()!.scrollTop = savedScrollTop;
        this.ganttDiv.node()!.scrollLeft = savedScrollLeft ?? 0;
        this.leftG.select<SVGGElement>(".y-content")
          .attr("transform", `translate(0, ${60 - savedScrollTop})`);
      }
      if (savedZoom) {
        this.ganttSVG.call(this.zoomBehavior.transform, savedZoom);
      }
    }

    this.host.eventService?.renderingFinished?.(opts.viewport);
  }

  private renderLanding(width: number, height: number) {
    renderLanding({
      svg: this.landingG,
      width,
      height
    });
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return this.fmtService.buildFormattingModel(this.fmtSettings);
  }

  private parseData(dv: DataView): Task[] {
    if (!dv.categorical?.categories?.length) return [];
    const cat = dv.categorical;

    const sVal = cat.values.find(v => v.source.roles?.startDate);
    const eVal = cat.values.find(v => v.source.roles?.endDate);
    const durVal = cat.values.find(v => v.source.roles?.duration);
    const compVal = cat.values.find(v => v.source.roles?.completion);
    const secStartVal = cat.values.find(v => v.source.roles?.secondaryStart);
    const secEndVal = cat.values.find(v => v.source.roles?.secondaryEnd);
    const legendCol = cat.categories.find(c => c.source.roles?.legend);

    this.secondaryStartName = secStartVal?.source.displayName ?? "Secondary Start Date";
    this.secondaryEndName = secEndVal?.source.displayName ?? "Secondary End Date";
    this.startName = sVal?.source.displayName ?? "Start Date";
    this.endName = eVal?.source.displayName ?? "End Date";

    const parentCol = cat.categories.find(c => c.source.roles?.parent);
    this.parentName = parentCol?.source.displayName ?? "Parent";

    // === Columns: medidas y categorías ===
    const colVals = cat.values.filter(v => v.source.roles?.columns);
    const colCatVals: { name: string; values: any[] }[] = [];
    cat.categories.forEach(c => {
      if (c.source.roles?.columns) {
        colCatVals.push({ name: c.source.displayName, values: c.values });
      }
    });

    this.extraColNames = [
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

    this.taskColCount = taskCols.length;
    this.taskColNames = taskCols.map(c => c.name);

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
        extraCols.length === this.extraColNames.length
          ? extraCols
          : Array(this.extraColNames.length).fill("");

      const legendText = legendCol ? String(legendCol.values[i] ?? "") : undefined;

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
        legend: legendText
      };

      out.push(task);
    }

    return out;
  }

  private buildRows(tasks: Task[], cache: Map<string, boolean>) {
    const rows: VisualRow[] = [];
    this.groupRange.clear();
    const uniqueParentsInTasks = new Set(tasks.map(t => t.parent));

    const tasksByIdParent = new Map<string, Task[]>();
    tasks.forEach(t => {
      const key = `${t.id}|${t.parent}`;
      if (!tasksByIdParent.has(key)) {
        tasksByIdParent.set(key, []);
      }
      tasksByIdParent.get(key)!.push(t);
    });

    const uniqueTasks: Task[] = [];
    tasksByIdParent.forEach((entries, key) => {
      const firstEntry = entries[0];
      uniqueTasks.push({
        ...firstEntry,
        legendEntries: entries
      } as any);
    });

    const grouped = d3.group(uniqueTasks, t => t.parent);
    for (const [parent, list] of grouped.entries()) {
      const allEntries: Task[] = [];
      list.forEach(t => {
        const entries = (t as any).legendEntries || [t];
        allEntries.push(...entries);
      });

      this.groupRange.set(parent!, {
        start: d3.min(allEntries, d => d.start)!,
        end: d3.max(allEntries, d => d.end)!,
        secondaryStart: d3.min(allEntries, d => d.secondaryStart),
        secondaryEnd: d3.max(allEntries, d => d.secondaryEnd)
      });
      const groupDuration = list.reduce((sum, t) => {
        const dur = Number(t.fields[t.fields.length - 1]);
        return sum + (isNaN(dur) ? 0 : dur);
      }, 0);

      rows.push({
        id: parent!,
        isGroup: true,
        rowKey: `G:${parent}`,
        labelY: parent!,
        duration: groupDuration
      });

      const exp = cache.get(parent!) ?? true;
      if (exp) {
        list.forEach(t => {
          rows.push({
            id: t.id,
            isGroup: false,
            task: t,
            rowKey: `T:${t.id}|${parent}`,
            labelY: t.id
          });
        });
      }
      cache.set(parent!, exp);
    }
    return { visibleRows: rows, expanded: cache };
  }

  private redrawZoomedElements(
    newX: d3.ScaleTime<number, number>,
    y: d3.ScaleBand<string>,
    barH: number
  ) {
    const days = d3.timeDays(newX.domain()[0], newX.domain()[1]);

    if (this.selectedFormat === "Día" && this.fmtSettings.weekendCard.show.value) {
      this.ganttG.selectAll<SVGLineElement, Date>("line.day")
        .data(days, d => d.getTime().toString())
        .join(
          enter => enter.append("line")
            .attr("class", "day")
            .attr("y1", 0)
            .attr("y2", this.y[0])
            .attr("stroke", "#e0e0e0")
            .attr("stroke-width", 1)
            .attr("zindex", "-100")
            .attr("x1", d => newX(d))
            .attr("x2", d => newX(d)),
          update => update
            .attr("x1", d => newX(d))
            .attr("x2", d => newX(d)),
          exit => exit.remove()
        );
      this.ganttG.selectAll<SVGLineElement, Date>("rect.weekend")
        .data(days.filter(d => d.getDay() === 6))
        .enter()
        .append("rect")
        .attr("x", d => newX(d))
        .attr("y", -10)
        .attr("width", d => newX(d3.timeDay.offset(d, 2)) - newX(d))
        .attr("height", this.y.range()[1])
        .attr("fill", this.fmtSettings.weekendCard.markerColor.value.value)
        .attr("class", "weekend");

      this.ganttG.selectAll("line.day").lower();
      this.ganttG.selectAll("rect.weekend").lower();
    } else {
      this.ganttG.selectAll("line.day").remove()
      this.ganttG.selectAll("rect.weekend").remove();
    }

    if (this.selectedFormat === "Mes") {
      const months = d3.timeMonths(newX.domain()[0], newX.domain()[1]);
      this.ganttG.selectAll<SVGLineElement, Date>("line.month")
        .data(months)
        .enter()
        .append("line")
        .attr("x1", d => newX(d))
        .attr("x2", d => newX(d))
        .attr("y1", -10)
        .attr("y2", this.y.range()[1])
        .attr("stroke", this.fmtSettings.weekendCard.markerColor.value.value)
        .attr("stroke-width", 1)
        .attr("class", "month");

      this.ganttG.selectAll("line.month").lower();
    } else { this.ganttG.selectAll("line.month").remove() }

    this.ganttG.selectAll<SVGRectElement, BarDatum>(".bar")
      .filter(d => d.start instanceof Date && d.end instanceof Date)
      .attr("x", d => {
        if (!(d.start instanceof Date) || isNaN(d.start.getTime())) return -9999;
        return newX(d.start);
      })
      .attr("width", d => {
        if (!(d.start instanceof Date) || isNaN(d.start.getTime())) return 0;
        if (!(d.end instanceof Date) || isNaN(d.end.getTime())) return 0;
        return Math.max(0, newX(d.end) - newX(d.start));
      });

    this.ganttG.selectAll<SVGRectElement, BarDatum>(".completion-bar")
      .attr("x", d => newX(d.start))
      .attr("width", d => {
        const start = newX(d.start);
        const end = newX(d.end);
        const baseWidth = Math.max(0, end - start);
        const c = Number(d.completion);
        if (isNaN(c) || c <= 0) return 0;
        return baseWidth * (c > 1 ? c / 100 : c);
      });
    if (this.fmtSettings.labelCard.show.value) {
      this.ganttG.selectAll<SVGTextElement, BarDatum>(".duration-label")
        .attr("x", d => {
          const end = d.end instanceof Date ? d.end : null;
          const secEnd = d.secondaryEnd instanceof Date ? d.secondaryEnd : null;

          const baseDate = (end && secEnd && secEnd > end) ? secEnd : end;

          return baseDate ? newX(baseDate) + 4 : -9999;
        });
    }

    this.ganttG.selectAll<SVGTextElement, BarDatum>(".completion-label")
      .attr("x", d => {
        const c = Number(d.completion);
        if (isNaN(c) || c <= 0) return -9999;
        const start = newX(d.start);
        const end = newX(d.end);
        const width = end - start;
        const pct = c > 1 ? c / 100 : c;
        return start + width * pct - 6;
      });
    this.ganttG.selectAll<SVGPathElement, BarDatum>(".bar")
      .filter(d =>
        d.isGroup &&
        d.start instanceof Date &&
        !isNaN(d.start.getTime()) &&
        d.end instanceof Date &&
        !isNaN(d.end.getTime())
      )
      .attr("d", d =>
        getGroupBarPath(
          newX,
          y,
          d,
          this.fmtSettings.taskCard.taskHeight.value,
          barH
        )
      );
    this.axisTopContentG?.selectAll<SVGTextElement, Date>("text")
      .attr("x", (d, i, nodes) => {
        const nextTick = i + 1 < nodes.length ? d3.select(nodes[i + 1]).datum() as Date : null;
        const nextX = nextTick ? newX(nextTick) : newX.range()[1];
        return (newX(d) + nextX) / 2;
      });

    this.axisTopContentG?.selectAll<SVGLineElement, Date>("line")
      .attr("x1", d => newX(d))
      .attr("x2", d => newX(d));

    if (this.axisBottomContentG?.select("rect.x-label-bg").size()) {
      this.axisBottomContentG.selectAll<SVGRectElement, Date>("rect.x-label-bg")
        .attr("x", d => {
          const xVal = newX(d);
          return isFinite(xVal) ? xVal : -9999;
        })
        .attr("width", (d, i, nodes) => {
          const nextTick = i + 1 < nodes.length ? d3.select(nodes[i + 1]).datum() as Date : null;
          const start = newX(d);
          const end = nextTick ? newX(nextTick) : newX.range()[1];

          if (!isFinite(start) || !isFinite(end)) return 0;
          const width = end - start;
          return width > 0 ? width : 0;
        });
    }

    this.axisBottomContentG?.selectAll<SVGLineElement, Date>("line.x-tick")
      .attr("x1", d => newX(d))
      .attr("x2", d => newX(d));

    this.axisBottomContentG?.selectAll<SVGTextElement, Date>("text.x-label")
      .attr("x", (d, i, nodes) => {
        const nextTick = i + 1 < nodes.length ? d3.select(nodes[i + 1]).datum() as Date : null;
        const nextX = nextTick ? newX(nextTick) : newX.range()[1];
        return (newX(d) + nextX) / 2;
      });

    this.axisBottomContentG?.selectAll<SVGLineElement, unknown>("line.x-domain")
      .attr("x1", newX.range()[0])
      .attr("x2", newX.range()[1]);

    this.ganttG.selectAll<SVGRectElement, Date>("rect.weekend")
      .attr("x", d => newX(d))
      .attr("width", d => newX(d3.timeDay.offset(d, 2)) - newX(d));

    this.ganttG.selectAll<SVGLineElement, Date>("line.month")
      .attr("x1", d => newX(d))
      .attr("x2", d => newX(d));

    // Redibujar dependencias al zoom
    this.ganttG.selectAll<SVGPathElement, any>(".dependency-line")
      .attr("d", d => {
        const x1 = newX(d.fromRow.task.end);
        const y1 = y(d.fromRow.rowKey)! + y.bandwidth() / 2;
        const x2 = newX(d.toRow.task.start);
        const y2 = y(d.toRow.rowKey)! + y.bandwidth() / 2;

        const midX = (x1 + x2) / 2;

        return `M${x1},${y1} 
              L${midX},${y1} 
              L${midX},${y2} 
              L${x2},${y2}`;
      });

    this.ganttG
      .selectAll<SVGRectElement, BarDatum>(".bar-secondary")
      .filter(d => d.secondaryStart instanceof Date && d.secondaryEnd instanceof Date)
      .attr("x", d => newX(d.secondaryStart!))
      .attr("width", d => {
        const x1 = newX(d.secondaryStart!);
        const x2 = newX(d.secondaryEnd!);
        return Math.max(0, x2 - x1);
      });

    const today = new Date();
    this.ganttG
      .selectAll<SVGLineElement, Date>(".today-line")
      .attr("x1", d => newX(d))
      .attr("x2", d => newX(d));

    this.ganttG
      .selectAll<SVGTextElement, Date>(".today-label")
      .attr("x", d => newX(d) + 10);

  }

  private updateSelectedFormatFromZoom(t: d3.ZoomTransform, width: number): FormatType {
    const [start, end] = this.xOriginal.domain();
    const baseDays = (end.getTime() - start.getTime()) / (1000 * 3600 * 24);
    const visibleDays = baseDays / t.k;
    const pxPerDay = width / visibleDays;
    if (pxPerDay > 125) return "Hora";
    if (pxPerDay > 17) return "Día";
    if (pxPerDay > 2) return "Mes";
    return "Año";
  }

  private getDateRangeFromFormat(fmt: FormatType): [Date, Date] {
    const [minDate, maxDate] = this.xOriginal.domain();
    switch (fmt) {
      case "Hora":
        return [minDate, d3.timeDay.offset(minDate, 1)];
      case "Día":
        return [minDate, d3.timeMonth.offset(minDate, 1)];
      case "Mes":
        return [minDate, d3.timeYear.offset(minDate, 1)];
      case "Año":
      default:
        return [minDate, maxDate];
    }
  }

  private zoomToRange(start: Date, end: Date) {
    const visibleW = this.width - this.marginLeft;
    const rangeWidth = this.xOriginal(end) - this.xOriginal(start);
    const scale = visibleW / rangeWidth;

    let barStart: number;

    if (this.currentZoomTransform) {
      const oldX = this.currentZoomTransform.rescaleX(this.xOriginal);
      const [oldMin] = oldX.domain();
      const visibleTask = this.cacheTasks
        .filter(t => t.start && t.end)
        .sort((a, b) => +a.start! - +b.start!)
        .find(t => t.start! >= oldMin);

      if (visibleTask) {
        barStart = this.xOriginal(visibleTask.start!);
      } else {
        barStart = this.xOriginal(oldMin);
      }
    } else {
      const firstTask = this.cacheTasks.find(t => t.start && t.end);
      if (!firstTask) return;
      barStart = this.xOriginal(firstTask.start!);
    }

    const translateX = (this.marginLeft - this.marginLeft) - barStart * scale + 10;

    const t = d3.zoomIdentity
      .translate(translateX, 0)
      .scale(scale);

    this.ganttSVG.call(this.zoomBehavior.transform, t);
  }

  private updateFormatButtonsUI(fmt: FormatType) {
    const buttons = this.rightBtns.selectAll("button");
    buttons.classed("active", d => d === fmt);
  }
}
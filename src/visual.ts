"use strict";

import "./../style/visual.less";
import * as d3 from "d3";
import powerbi from "powerbi-visuals-api";
import { renderDurationLabels, updateLabelPositions } from "./utils/renderLabels";
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
import { getGroupBarPath, clearPathCache } from "./utils/barPaths";
import { renderEndMarkerShape } from "./utils/endMarkerShapes";
import { getCompletionByGroup, clearCompletionCache } from "./utils/completionCalculator";
import { createSelectorDataPoints, parseData } from "./utils/dataParser";
import { buildRows } from "./utils/rowBuilder";
import { buildColorMaps, getBarColor, createLegendDataPoints } from "./utils/colorManager";
import { Task, VisualRow, GanttDataPoint, LegendDataPoint, GroupRange, ParseDataResult } from "./types";
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

export interface BarDatum {
  id: string;
  taskName?: string;
  start: Date;
  end: Date;
  rowKey: string;
  isGroup: boolean;
  isTask?: boolean;
  isSummary?: boolean;
  index: number;
  completion?: number;
  secondaryStart?: Date;
  secondaryEnd?: Date;
  selectionId: ISelectionId;
  legend?: string;
  gradientId?: string;
  resolvedColor?: string;
  labelText?: string;
  labelValue?: string;
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
  private allExpanded = false;
  private host: IVisualHost;
  private ganttdataPoints: GanttDataPoint[]
  private legendDataPoints: LegendDataPoint[] = []
  private legend: any;
  private currentZoomTransform?: d3.ZoomTransform;
  private y: d3.ScaleBand<string>;
  private marginLeft: number = 0;
  private marginTop: number = 60;
  private width: number = 0;
  private innerW: number = 0;
  private currentWidth: number = 0;
  private xOriginal: d3.ScaleTime<number, number>;
  private barH: number = 40;
  private zoomBehavior!: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private baseDomain?: [Date, Date];
  private extraColNames: string[] = [];
  private secondaryStartName: string = "Inicio R";
  private secondaryEndName: string = "Fin R";
  private selectionManager: ISelectionManager;
  private selectedIds: ISelectionId[] = [];
  private startName: string = "Start Date";
  private endName: string = "End Date";
  private parentName: string = "Parent";
  private cachedAllBars: any[] = [];
  private legendColorStore = new Map<string, string>();
  private dateFormatter = d3.timeFormat("%d/%m/%Y %H:%M");
  private computedColWidths: number[] | null = null;
  private secondaryBarOffsets = new Map<string, number>();
  private parentColorStore = new Map<string, string>();
  private parentColorMap = new Map<string, string>();
  private legendColorMap = new Map<string, string>();
  private selectedIdSet = new Set<string>();
  private isHighContrast = false;
  private allowInteractions = false;
  private resizeObserver: ResizeObserver | null = null;
  private pendingResize = false;
  private cachedInnerWidth = 0;
  private cachedInnerHeight = 0;

  private updateBarOpacities() {
    const hasSelection = this.selectedIds.length > 0;
    if (hasSelection) {
      this.selectedIdSet = new Set(this.selectedIds.map(sel => sel.getKey()));
    }

    const setOpacity = (selection: d3.Selection<any, BarDatum, any, any>) => {
      if (!hasSelection) {
        selection.attr("opacity", 1);
        return;
      }
      selection.attr("opacity", d => this.selectedIdSet.has(d.selectionId.getKey()) ? 1 : 0.3);
    };

    setOpacity(this.ganttG.selectAll<SVGElement, BarDatum>(".bar"));
    setOpacity(this.ganttG.selectAll<SVGElement, BarDatum>(".completion-bar"));
    setOpacity(this.ganttG.selectAll<SVGElement, BarDatum>(".bar-secondary"));
    setOpacity(this.ganttG.selectAll<SVGLineElement, BarDatum>(".bar-secondary-end-marker"));
    setOpacity(this.ganttG.selectAll<SVGElement, BarDatum>(".duration-label"));
    setOpacity(this.ganttG.selectAll<SVGElement, BarDatum>(".completion-label"));
  }

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

  private createLegendDataPoints(
    options: VisualUpdateOptions
  ): LegendDataPoint[] {
    const result = createLegendDataPoints(options, this.host, this.legendColorStore);
    return result.dataPoints;
  }

  constructor(opts: VisualConstructorOptions) {
    this.container = opts.element as HTMLElement;
    this.host = opts.host
    this.allowInteractions = (opts.host as any).hostCapabilities?.allowInteractions ?? false;

    this.tooltipServiceWrapper = createTooltipServiceWrapper(
      opts.host.tooltipService,
      opts.element
    );

    this.selectionManager = this.host.createSelectionManager();

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
      true,
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
        // CAMBIAR EL FORMATO Y EL ZOOM (comportamiento original)
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

    this.zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 200])
      .translateExtent([[-1e9, -1e9], [1e9, 1e9]])
      .filter((event) => {
        return !event.ctrlKey || event.type === "wheel" || event.type === "mousedown";
      })
      .on("zoom", (event) => {
        const t = event.transform;
        const newX = t.rescaleX(this.xOriginal);

        this.currentZoomTransform = t;

        const newFormat = this.updateSelectedFormatFromZoom(t, this.currentWidth);
        if (newFormat !== this.selectedFormat) {
          this.selectedFormat = newFormat;
          this.updateFormatButtonsUI(this.selectedFormat);
        }

        this.redrawZoomedElements(newX, this.y, this.barH);

        renderXAxisTop({
          xScale: newX,
          svg: this.axisTopContentG,
          height: 30,
          width: this.currentWidth,
          selectedFormat: this.selectedFormat,
          translateX: this.marginLeft,
          scrollLeft: this.ganttDiv.node()?.scrollLeft ?? 0,
          fmtSettings: this.fmtSettings
        });

        renderXAxisBottom({
          xScale: newX,
          svg: this.axisBottomContentG,
          height: 30,
          width: this.currentWidth,
          selectedFormat: this.selectedFormat,
          translateX: this.marginLeft,
          fmtSettings: this.fmtSettings
        });
      });

    this.ganttSVG
      .call(this.zoomBehavior)
      .on("mousedown.zoom", null)
      .on("dblclick.zoom", null)
      .on("touchstart.zoom", null);

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
        
        // Re-render top axis with scrollLeft to adjust label positions
        if (this.axisTopContentG && this.currentZoomTransform) {
          const newX = this.currentZoomTransform.rescaleX(this.xOriginal);
          renderXAxisTop({
            xScale: newX,
            svg: this.axisTopContentG,
            height: 30,
            width: this.currentWidth,
            selectedFormat: this.selectedFormat,
            translateX: this.marginLeft,
            scrollLeft: left,
            fmtSettings: this.fmtSettings
          });
        }
      });
    }, { passive: true });

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width !== this.cachedInnerWidth || height !== this.cachedInnerHeight) {
          this.cachedInnerWidth = width;
          this.cachedInnerHeight = height;
          if (!this.pendingResize) {
            this.pendingResize = true;
            requestAnimationFrame(() => {
              this.pendingResize = false;
              if (this.lastOptions) {
                this.lastOptions = {
                  ...this.lastOptions,
                  viewport: { width, height }
                };
this.update(this.lastOptions);
              }
            });
          }
        }
      }
    });
    this.resizeObserver.observe(this.container);

    this.leftG = this.yAxisSVG.append("g");
    this.ganttG = this.ganttSVG.append("g");
    this.landingG = this.ganttSVG.append("g")
      .attr("class", "landing")
      .style("pointer-events", "none");

    d3.select(this.container).on("click", () => {
      this.selectionManager.clear().then(() => {
        this.selectedIds = [];
        this.updateBarOpacities();
      });
    });
  }

  public update(opts: VisualUpdateOptions, preserveView = false): void {
    this.isHighContrast = this.host.colorPalette.isHighContrast ?? false;

    const objects = opts.dataViews?.[0]?.metadata?.objects;
    const persistedFmt = objects?.["formatState"]?.["selectedFormat"] as FormatType | undefined;

    this.selectedFormat = persistedFmt ?? this.selectedFormat;
    this.updateFormatButtonsUI(this.selectedFormat);


    const isDataUpdate = (opts.type & powerbi.VisualUpdateType.Data) !== 0;
    const isResizeOnly = opts.type === powerbi.VisualUpdateType.Resize;
    const isViewportChange = opts.type === powerbi.VisualUpdateType.ViewMode;

    if (this.ganttG && !isDataUpdate && !isResizeOnly && !isViewportChange) {
      return;
    }
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
    const colorMaps = buildColorMaps(this.ganttdataPoints, this.legendDataPoints);
    this.parentColorMap = colorMaps.parentColorMap;
    this.legendColorMap = colorMaps.legendColorMap;

    this.fmtSettings.populateColorSelector(this.ganttdataPoints);
    if (this.legendDataPoints.length > 0) {
      this.fmtSettings.populateLegendDataPointSlices(this.legendDataPoints);
    }

    const { width, height } = opts.viewport;
    this.lastOptions = opts;

    if (this.legendDataPoints.length > 0 && this.fmtSettings.legend.show.value) {
      const legendData = {
        dataPoints: this.legendDataPoints.map(dp => ({
          label: dp.legend,
          color: dp.color,
          icon: this.fmtSettings.legend.fontSize.value,
          identity: dp.selectionId,
          selected: false
        })),
        fontSize: this.fmtSettings.legend.fontSize.value,
        labelColor: this.fmtSettings.legend.fontColor.value.value,
      };

      this.legend.drawLegend(legendData, { width, height });
    } else {
      this.legend.reset();
    }

    d3.select(this.container)
      .select(".legend")
      .style("display", this.fmtSettings.legend.show.value ? "block" : "none")
      .style("white-space", "normal");


    const hasData = dv?.categorical?.categories?.some(c => c.source.roles?.task) &&
      dv?.categorical?.values?.some(v => v.source.roles?.startDate) &&
      dv?.categorical?.values?.some(v => v.source.roles?.endDate);

    this.leftBtns.style("display", hasData ? "block" : "none");
    this.rightBtns.style("display", hasData ? "block" : "none");
    const pad = 10;

    clearPathCache();
    clearCompletionCache();

    const tasks = this.parseData(dv);
    if (tasks.length) this.cacheTasks = tasks;

    const hasD = this.cacheTasks.some(t => t.fields.length > this.taskColCount);
    const extraColCount = this.cacheTasks[0]?.extraCols?.length ?? 0;

    if (!this.computedColWidths || this.computedColWidths.length !== (this.taskColCount + 2 + extraColCount + (this.fmtSettings.taskCard.showSecondaryColumns.value ? 2 : 0) + (hasD ? 1 : 0))) {
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

      this.computedColWidths = colWidths;
    }

    const colWidths = this.computedColWidths;

    this.width = opts.viewport.width;
    this.currentWidth = this.width;
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

    if (this.ganttG) {
      this.ganttG.selectAll("line.day").remove();
      this.ganttG.selectAll("rect.weekend").remove();
      this.ganttG.selectAll("line.month").remove();
    }

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
    const showSubChildren = this.fmtSettings.taskCard.showSubChildren.value;
    const { visibleRows, expanded } = this.buildRows(this.cacheTasks, expCache, showSubChildren);
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
    this.currentWidth = width;
    this.marginLeft = margin.left;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let scrollTopStart = 0;

    this.ganttSVG
      .on("dblclick", () => {
        const validTasks = this.cacheTasks.filter(t => t.start && t.end);

        if (validTasks.length === 0) return;

        const minDate = d3.min(validTasks, t => t.start)!;
        const maxDate = d3.max(validTasks, t => t.end)!;
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
          const showSubChildren = self.fmtSettings.taskCard.showSubChildren.value;
          const bgColor = (row.isTask && !row.isLegendGroup && !showSubChildren) ? "#ffffff" : parFmt.backgroundColor.value.value;
          
          g.append("rect")
            .attr("x", 0)
            .attr("y", top)
            .attr("width", margin.left)
            .attr("height", yScale.bandwidth())
            .attr("fill", bgColor);

          const exp = self.expanded.get(row.id) ?? true;
          const canExpand = (row.isTask && !row.isLegendGroup && showSubChildren) || row.rowKey?.startsWith("P:");
          
          let indentX = 5;
          if (row.isTask) indentX = 20;
          if (row.isLegendGroup) indentX = 40;

          let parentKey: string | undefined;
          if (row.rowKey?.startsWith("P:")) {
            parentKey = row.rowKey.slice(2);
          } else if (row.rowKey?.startsWith("T:")) {
            const parts = row.rowKey.split("|");
            parentKey = parts.length > 1 ? parts[1] : parts[0];
          } else if (row.rowKey?.startsWith("L:")) {
            const parts = row.rowKey.replace("L:", "").split("|");
            parentKey = parts.length > 2 ? parts[2] : (parts.length > 1 ? parts[1] : parts[0]);
          } else if (row.rowKey?.startsWith("G:")) {
            parentKey = row.rowKey.slice(2);
          } else if (row.rowKey?.includes("|")) {
            const parts = row.rowKey.split("|");
            parentKey = parts.length > 1 ? parts[1] : parts[0];
          }

          const triColor = parentKey ? self.parentColorMap.get(parentKey) ?? parFmt.fontColor.value.value : parFmt.fontColor.value.value;

          const label = g.append("text")
            .attr("x", indentX)
            .attr("y", top + yScale.bandwidth() / 2 + 4)
            .attr("font-weight", canExpand && row.rowKey?.startsWith("P:") ? "bold" : "normal")
            .attr("cursor", canExpand ? "pointer" : "default")
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

          if (canExpand) {
            label.append("tspan")
              .attr("fill", triColor)
              .text(exp ? "▼" : "▶")
              .attr("dy", "3px")
              .attr("data-rowKey", row.rowKey);
          }

          label.append("tspan")
            .text(" " + row.labelY);

          const r = self.groupRange.get(row.id);
          if (r) {
            g.append("text").text(self.dateFormatter(r.start))
              .attr("x", colX(self.taskColCount))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              
              .attr("fill", parFmt.fontColor.value.value)
              .attr("font-size", parFmt.fontSize.value)
              .attr("data-rowKey", row.rowKey)
              .attr("font-family", parFmt.fontFamily.value);

            g.append("text").text(self.dateFormatter(r.end))
              .attr("x", colX(self.taskColCount + 1))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              
              .attr("fill", parFmt.fontColor.value.value)
              .attr("data-rowKey", row.rowKey)
              .attr("font-size", parFmt.fontSize.value)
              .attr("font-family", parFmt.fontFamily.value);

            if (self.fmtSettings.taskCard.showSecondaryColumns.value) {
              if (r.secondaryStart) {
                g.append("text").text(self.dateFormatter(r.secondaryStart))
                  .attr("x", colX(self.taskColCount + 2))
                  .attr("y", top + yScale.bandwidth() / 2 + 4)
                  
                  .attr("fill", parFmt.fontColor.value.value)
                  .attr("data-rowKey", row.rowKey)
                  .attr("font-size", parFmt.fontSize.value)
                  .attr("font-family", parFmt.fontFamily.value);
              }
              if (r.secondaryEnd) {
                g.append("text").text(self.dateFormatter(r.secondaryEnd))
                  .attr("x", colX(self.taskColCount + 3))
                  .attr("y", top + yScale.bandwidth() / 2 + 4)
                  
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
                    aggVal = self.dateFormatter(d);
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

          if (row.isLegendGroup) {
            const legendVal = row.task.legend || "Default";
            const maxWidth = colWidths[0] - 8;
            const tmp = g.append("text")
              .attr("x", colX(0))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              .attr("font-size", taskFmt.fontSize.value)
              .attr("fill", taskFmt.fontColor.value.value)
              .attr("font-family", taskFmt.fontFamily.value)
              .attr("font-weight", "normal")
              .attr("font-weight", "normal")
              .attr("data-rowKey", row.rowKey)
              .text(legendVal);

            let textNode = tmp.node() as SVGTextElement;
            if (textNode.getComputedTextLength() > maxWidth) {
              let str = legendVal;
              while (str.length && textNode.getComputedTextLength() > maxWidth) {
                str = str.slice(0, -1);
                tmp.text(str + "…");
                textNode = tmp.node() as SVGTextElement;
              }
            }
            tmp.append("title").text(legendVal);
          } else {
            row.task.fields.forEach((val, i) => {
              if (hasDuration && i === durationIndex) return;

              const maxWidth = colWidths[i] - 8;
              const tmp = g.append("text")
                .attr("x", colX(i))
                .attr("y", top + yScale.bandwidth() / 2 + 4)
                .attr("font-size", taskFmt.fontSize.value)
                .attr("fill", taskFmt.fontColor.value.value)
                .attr("font-family", taskFmt.fontFamily.value)
              .attr("font-weight", "normal")
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
          }

          // === Inicio P ===
          g.append("text")
            .text(row.task.start && !isNaN(row.task.start.getTime()) ? self.dateFormatter(row.task.start) : " ")
            .attr("x", colX(self.taskColCount))
            .attr("y", top + yScale.bandwidth() / 2 + 4)
            .attr("font-size", taskFmt.fontSize.value)
            .attr("fill", taskFmt.fontColor.value.value)
            .attr("data-rowKey", row.rowKey)
            .attr("font-family", taskFmt.fontFamily.value)
              .attr("font-weight", "normal");

          // === Fin P ===
          g.append("text")
            .text(row.task.end && !isNaN(row.task.end.getTime()) ? self.dateFormatter(row.task.end) : " ")
            .attr("x", colX(self.taskColCount + 1))
            .attr("y", top + yScale.bandwidth() / 2 + 4)
            .attr("font-size", taskFmt.fontSize.value)
            .attr("fill", taskFmt.fontColor.value.value)
            .attr("data-rowKey", row.rowKey)
            .attr("font-family", taskFmt.fontFamily.value)
              .attr("font-weight", "normal");

          // === Secondary ===
          if (showSecondaryColumns) {
            g.append("text")
              .text(row.task.secondaryStart && !isNaN(row.task.secondaryStart.getTime()) ? self.dateFormatter(row.task.secondaryStart) : " ")
              .attr("x", colX(self.taskColCount + 2))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              .attr("font-size", taskFmt.fontSize.value)
              .attr("data-rowKey", row.rowKey)
              .attr("fill", taskFmt.fontColor.value.value)
              .attr("font-family", taskFmt.fontFamily.value)
              .attr("font-weight", "normal");

            g.append("text")
              .text(row.task.secondaryEnd && !isNaN(row.task.secondaryEnd.getTime()) ? self.dateFormatter(row.task.secondaryEnd) : " ")
              .attr("x", colX(self.taskColCount + 3))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              .attr("font-size", taskFmt.fontSize.value)
              .attr("data-rowKey", row.rowKey)
              .attr("fill", taskFmt.fontColor.value.value)
              .attr("font-family", taskFmt.fontFamily.value)
              .attr("font-weight", "normal");
          }

          // === ExtraCols ===
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
                    displayVal = self.dateFormatter(d);
                  }
                }
              }

              const tmp = g.append("text")
                .attr("x", colX(colIndex))
                .attr("y", top + yScale.bandwidth() / 2 + 4)
                .attr("font-size", taskFmt.fontSize.value)
                .attr("fill", taskFmt.fontColor.value.value)
                .attr("font-family", taskFmt.fontFamily.value)
              .attr("font-weight", "normal")
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
              .attr("font-family", taskFmt.fontFamily.value)
              .attr("font-weight", "normal")
              ;
          }
        }
      });

    if (this.fmtSettings.axisYCard.showLine.value) {

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

    const labelValuesFromView = categorical.values.find(v => v.source.roles?.label)?.values ?? [];

    const taskBars: BarDatum[] = [];
    visibleRows
      .filter(r => r.isTask && r.task)
      .forEach(r => {
        const task = r.task!;
        
        if (r.isLegendGroup) {
          if (task.start && task.end) {
            const legendCat = categorical.categories.find(c => c.source.roles?.legend);
            const prop: DataViewObjectPropertyIdentifier = { objectName: "legendColorSelector", propertyName: "fill" };
            const obj = legendCat?.objects?.[task.index];
            const fxColor = obj ? dataViewObjects.getValue<Fill>(obj, prop)?.solid?.color : undefined;

            taskBars.push({
              id: `${task.id}_${task.legend || 'default'}_${r.rowKey}`,
              taskName: task.id,
              labelValue: String(labelValuesFromView[task.index] ?? ""),
              start: task.start,
              end: task.end,
              rowKey: r.rowKey,
              isGroup: false,
              isTask: true,
              index: task.index,
              completion: task.completion,
              secondaryStart: task.secondaryStart ? new Date(task.secondaryStart) : undefined,
              secondaryEnd: task.secondaryEnd ? new Date(task.secondaryEnd) : undefined,
              selectionId: this.host.createSelectionIdBuilder()
                .withCategory(taskCategory, task.index)
                .createSelectionId() as ISelectionId,
              legend: task.legend,
              resolvedColor: fxColor
            });
          }
        } else {
          const legendCat = categorical.categories.find(c => c.source.roles?.legend);
          const prop: DataViewObjectPropertyIdentifier = { objectName: "legendColorSelector", propertyName: "fill" };
          
          const childTasks = this.cacheTasks.filter(t => 
            t.id === task.id && t.parent === task.parent
          );
          
          childTasks.forEach((childTask, childIdx) => {
            if (childTask.start && childTask.end) {
              const obj = legendCat?.objects?.[childTask.index];
              const fxColor = obj ? dataViewObjects.getValue<Fill>(obj, prop)?.solid?.color : undefined;

              taskBars.push({
                id: `child_${task.id}_${childIdx}_${r.rowKey}`,
                taskName: childTask.id,
                labelValue: childTask.labelValue,
                start: childTask.start,
                end: childTask.end,
                rowKey: r.rowKey,
                isGroup: false,
                isTask: true,
                index: childTask.index,
                completion: childTask.completion,
                secondaryStart: childTask.secondaryStart ? new Date(childTask.secondaryStart) : undefined,
                secondaryEnd: childTask.secondaryEnd ? new Date(childTask.secondaryEnd) : undefined,
                selectionId: this.host.createSelectionIdBuilder()
                  .withCategory(taskCategory, childTask.index)
                  .createSelectionId() as ISelectionId,
                legend: childTask.legend,
                resolvedColor: fxColor
              });
            }
          });
        }
      });

    const parentCategory = categorical.categories[1];
    const legendCategory = categorical.categories.find(c => c.source.roles?.legend);

    const groupBars: BarDatum[] = visibleRows
      .filter(r => r.isGroup && r.rowKey?.startsWith("P:"))
      .map(r => {
        const range = this.groupRange.get(r.id)!;
        const parentIndex = parentCategory.values.findIndex(v => `${v}` === r.id);

        const groupSelectionId = this.host.createSelectionIdBuilder()
          .withCategory(parentCategory, parentIndex)
          .createSelectionId();

        return {
          id: r.id,
          taskName: r.id,
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

    function extractLabelValue(raw: any): string | undefined {
      if (raw == null) return undefined;
      if (typeof raw === "string") return raw.trim() !== "" ? raw : undefined;
      if (typeof raw === "number") return String(raw);
      if (typeof raw === "boolean") return String(raw);
      if (typeof raw === "object") {
        if (raw.text != null && raw.text !== "") return String(raw.text);
        if (raw.value != null) {
          if (typeof raw.value === "string") return raw.value.trim() !== "" ? raw.value : undefined;
          if (typeof raw.value === "number") return String(raw.value);
          if (typeof raw.value === "object") return extractLabelValue(raw.value);
        }
        return undefined;
      }
      return undefined;
    }

    const allBars = this.cachedAllBars = [...taskBars, ...groupBars].map((bar, i) => {
      let customLabel: string | undefined;
      if (!bar.isGroup && taskCategory?.objects?.[bar.index]) {
        const obj = taskCategory.objects[bar.index];
        const raw: any = obj?.labelCard?.labelContent;
        const val = extractLabelValue(raw);
        if (val !== undefined && val.trim() !== "") {
          customLabel = val;
        }
      }
      const labelText = customLabel ?? (bar.labelValue || undefined);
      return {
        ...bar,
        gradientId: `bar-gradient-${i}`,
        labelText,
        taskName: bar.taskName || bar.id
      };
    });

    const defs = this.ganttSVG.append("defs");

    allBars.forEach(d => {
      if (!(d.start instanceof Date) || !(d.end instanceof Date)) return;

      let key: string | undefined;
      if (d.rowKey?.startsWith("G:") || d.rowKey?.startsWith("P:")) {
        key = d.rowKey.slice(2);
      } else if (d.rowKey?.includes("|")) {
        key = d.rowKey.split("|")[1];
      }

      const baseColorStr = (d as BarDatum).resolvedColor ?? getBarColor(d.rowKey, d.legend, this.legendColorMap, this.parentColorMap);
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
      const bars = this.ganttG.selectAll<SVGElement, BarDatum>(".bar, .bar-secondary")
        .data(allBars, d => d.id)
        .join(
          enter => enter.append(d => {
            if (d.isGroup && d.rowKey?.startsWith("P:")) {
              return document.createElementNS("http://www.w3.org/2000/svg", "path");
            }
            return document.createElementNS("http://www.w3.org/2000/svg", "rect");
          }).attr("class", "bar"),
          update => update,
          exit => exit.remove()
        );

      // === BARRAS DE TAREAS (Task/Diseno y Legend) ===
      bars.filter(d =>
        d.isTask &&
        d.start instanceof Date && !isNaN(d.start.getTime()) &&
        d.end instanceof Date && !isNaN(d.end.getTime())
      )
        .attr("x", d => x(d.start))
        .attr("y", d => yScale(d.rowKey)! + yOff)
        .attr("width", d => x(d.end) - x(d.start))
        .attr("height", this.barH)
        .attr("fill", d => `url(#${d.gradientId})`)
        .attr("rx", (barCfg.barGroup.slices.find(s => s.name === "cornerRadius") as formattingSettings.Slider).value)
        .attr("ry", (barCfg.barGroup.slices.find(s => s.name === "cornerRadius") as formattingSettings.Slider).value)
        .attr("stroke", d => d.resolvedColor ?? getBarColor(d.rowKey, d.legend, this.legendColorMap, this.parentColorMap))
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
          requestAnimationFrame(() => {
            d3.selectAll(`text[data-rowKey="${d.rowKey}"]`).attr("fill", strokeColor);
            d3.selectAll(`.duration-label[data-rowKey="${d.rowKey}"]`).attr("fill", strokeColor);
          });
        })
        .on("mouseout", (event, d: BarDatum) => {
          requestAnimationFrame(() => {
            d3.selectAll(`text[data-rowKey="${d.rowKey}"]`).attr("fill", taskFmt.fontColor.value.value);
            d3.selectAll(`.duration-label[data-rowKey="${d.rowKey}"]`).attr("fill", this.fmtSettings.barCard.labelGroup.fontColor.value.value);
          });
        })
        .on("click", (event, d: BarDatum) => {
          if (!this.allowInteractions) return;
          event.stopPropagation();
          this.selectionManager.select(d.selectionId, event.ctrlKey || event.metaKey).then((ids: ISelectionId[]) => {
            this.selectedIds = ids;
            this.updateBarOpacities();
          });
        })
        .on("contextmenu", (event, d: BarDatum) => {
          if (!this.allowInteractions) return;
          this.selectionManager.showContextMenu(d.selectionId, {
            x: event.clientX,
            y: event.clientY
          });
          event.preventDefault();
        });

      // === PADRES (corchete) ===
      bars.filter(d => d.isGroup && d.rowKey?.startsWith("P:"))
        .attr("d", d => getGroupBarPath(x, yScale, d, taskFmt.taskHeight.value, this.barH))
        .attr("fill", d => `url(#${d.gradientId})`)
        .attr("stroke", d => {
          const key = d.rowKey.split("|")[0].replace(/^[A-Z]:/, "");
          return this.parentColorMap.get(key) ?? "#72c0ffff";
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
          if (!this.allowInteractions) return;
          event.stopPropagation();
          this.selectionManager.select(d.selectionId, event.ctrlKey || event.metaKey).then((ids: ISelectionId[]) => {
            this.selectedIds = ids;
            this.updateBarOpacities();
          });
        })
        .on("contextmenu", (event, d: BarDatum) => {
          if (!this.allowInteractions) return;
          this.selectionManager.showContextMenu(d.selectionId, {
            x: event.clientX,
            y: event.clientY
          });
          event.preventDefault();
        })
        .on("mouseover", (event, d: BarDatum) => {
          const strokeColor = d3.select(event.currentTarget).attr("stroke");
          requestAnimationFrame(() => {
            d3.selectAll(`text[data-rowKey="${d.rowKey}"]`).attr("fill", strokeColor);
          });
        })
        .on("mouseout", (event, d: BarDatum) => {
          requestAnimationFrame(() => {
            d3.selectAll(`text[data-rowKey="${d.rowKey}"]`).attr("fill", parFmt.fontColor.value.value);
          });
        });

      const highlightColumn = dv.categorical.values.find(val => val.highlights);

      if (highlightColumn && highlightColumn.highlights) {
        const highlights = highlightColumn.highlights;
        bars.attr("opacity", d =>
          highlights[d.index] != null ? 1 : 0.3
        );
      } else {
        this.updateBarOpacities();
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
        .attr("fill", d => d.resolvedColor ?? getBarColor(d.rowKey, d.legend, this.legendColorMap, this.parentColorMap))
        .attr("rx", (barCfg.barGroup.slices.find(s => s.name === "cornerRadius") as formattingSettings.Slider).value)
        .attr("ry", (barCfg.barGroup.slices.find(s => s.name === "cornerRadius") as formattingSettings.Slider).value);

      // === BARRAS SECUNDARIAS ===
      this.ganttG
        .selectAll(".bar-secondary")
        .data(
          allBars.filter(d =>
            d.secondaryStart instanceof Date &&
            !isNaN(d.secondaryStart.getTime()) &&
            d.secondaryEnd instanceof Date &&
            !isNaN(d.secondaryEnd.getTime())
          )
        )
        .join("line")
        .attr("class", "bar-secondary")
        .attr("x1", d => x(d.secondaryStart!))
        .attr("x2", d => x(d.secondaryEnd!))
        .attr("y1", d => {
        if (!this.secondaryBarOffsets.has(d.id)) {
          const secH = this.fmtSettings.secondaryBarCard.barHeight.value;
          const margin = secH;
          const arr = new Uint32Array(1);
          window.crypto.getRandomValues(arr);
          const rand = arr[0] / (0xFFFFFFFF + 1);
          this.secondaryBarOffsets.set(d.id, margin + rand * (this.barH - secH - margin));
        }
        return yScale(d.rowKey)! + yOff + this.secondaryBarOffsets.get(d.id)!;
      })
      .attr("y2", d => yScale(d.rowKey)! + yOff + this.secondaryBarOffsets.get(d.id)!)
        .attr("stroke", d => {
  if (d.isGroup) {
    return getBarColor(d.rowKey, d.legend, this.legendColorMap, this.parentColorMap);
  }

  let strokeColor = this.fmtSettings.secondaryBarCard.strokeColor.value.value;

  if (legendCategory && d.legend) {
    const legendIndex = legendCategory.values.findIndex((v, i) => String(v) === d.legend && i === d.index);
    const obj = legendIndex >= 0 ? legendCategory.objects?.[legendIndex] : null;
    if (obj) {
      const prop: DataViewObjectPropertyIdentifier = {
        objectName: "secondaryBarCard",
        propertyName: "strokeColor"
      };
      const fill = dataViewObjects.getValue<Fill>(obj, prop);
      if (fill?.solid?.color) {
        strokeColor = fill.solid.color;
      }
    }
  }

  return strokeColor;
})
        .attr("stroke-width", this.fmtSettings.secondaryBarCard.barHeight.value)
        .attr("stroke-dasharray", () => {
          const style = this.fmtSettings.secondaryBarCard.lineStyle.value.value;
          if (style === "dash") return "5,5";
          if (style === "dot") return "2,2";
          return "none";
        })
        .style("pointer-events", "all")

      // Líneas verticales al final
      const endMarkers = this.ganttG
        .selectAll<SVGGElement, BarDatum>(".bar-secondary-end-marker")
        .data(allBars.filter(d =>
          d.secondaryStart instanceof Date &&
          !isNaN(d.secondaryStart.getTime()) &&
          d.secondaryEnd instanceof Date &&
          !isNaN(d.secondaryEnd.getTime())
        ), d => d.id)
        .join("g")
        .attr("class", "bar-secondary-end-marker")
        .attr("opacity", this.fmtSettings.secondaryBarCard.opacity.value);

      endMarkers.each(function (d) {
        d3.select(this).selectAll("*").remove();

        const markerX = x(d.secondaryEnd!);
        const markerY = yScale(d.rowKey)! + yOff + self.barH * 0.5;

        let strokeColor = self.fmtSettings.secondaryBarCard.strokeColor.value.value;
        if (d.isGroup) {
          strokeColor = getBarColor(d.rowKey, d.legend, self.legendColorMap, self.parentColorMap);
        }
        let fillColor = strokeColor;
        let shapeValue = self.fmtSettings.secondaryBarCard.endMarkerShape.value;
        let shapeSize = self.fmtSettings.secondaryBarCard.endMarkerSize.value;

        if (legendCategory && d.legend) {
          const legendIndex = legendCategory.values.findIndex((v, i) => String(v) === d.legend && i === d.index);
          const obj = legendIndex >= 0 ? legendCategory.objects?.[legendIndex] : null;
          if (obj) {
            const prop: DataViewObjectPropertyIdentifier = {
              objectName: "secondaryBarCard",
              propertyName: "strokeColor"
            };
            const fill = dataViewObjects.getValue<Fill>(obj, prop);
            if (fill?.solid?.color) {
              strokeColor = fill.solid.color;
              fillColor = fill.solid.color;
            }
          }
        }

        const taskCategory = self.lastOptions.dataViews[0].categorical.categories[0];
        const obj = taskCategory.objects?.[d.index];

        if (obj) {
          const prop: DataViewObjectPropertyIdentifier = {
            objectName: "secondaryBarCard",
            propertyName: "endMarkerShape"
          };
          const customShape = dataViewObjects.getValue<number>(obj, prop);
          if (customShape !== undefined) {
            shapeValue = customShape;
          }
        }

        renderEndMarkerShape(
          d3.select(this),
          shapeValue,
          markerX,
          markerY,
          shapeSize,
          strokeColor,
          strokeColor,
          self.fmtSettings.secondaryBarCard.strokeWidth.value
        );
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

        // === TIMELINE MARKERS ===
      if (this.fmtSettings.timelineCard.show.value) {
        const tlFmt = this.fmtSettings.timelineCard;

        const timelineRows = visibleRows.filter(r =>
          !r.isGroup &&
          r.task?.timelineDate instanceof Date &&
          !isNaN(r.task.timelineDate.getTime())
        );

        const byParent = d3.group(timelineRows, r => r.task!.parent);

        byParent.forEach((rows) => {
          const sorted = rows.slice().sort((a, b) =>
            visibleRows.indexOf(a) - visibleRows.indexOf(b)
          );

          const s = tlFmt.tickSize.value;
          if (tlFmt.showLine.value && sorted.length > 1) {
            for (let idx = 0; idx < sorted.length - 1; idx++) {
              const rA = sorted[idx];
              const rB = sorted[idx + 1];
              this.ganttG.append("line")
                .attr("class", "timeline-connector")
                .attr("x1", x(rA.task!.timelineDate!))
                .attr("y1", yScale(rA.rowKey)! + yOff - s)
                .attr("x2", x(rB.task!.timelineDate!))
                .attr("y2", yScale(rB.rowKey)! + yOff - s)
                .attr("stroke", tlFmt.lineColor.value.value)
                .attr("stroke-width", tlFmt.lineWidth.value)
                .style("pointer-events", "none");
            }
          }

          sorted.forEach(row => {
            const s = tlFmt.tickSize.value;
            this.ganttG.append("rect")
              .attr("class", "timeline-tick")
              .attr("x", x(row.task!.timelineDate!) - s)
              .attr("y", yScale(row.rowKey)! + yOff - s * 2)
              .attr("width", s * 2)
              .attr("height", s * 2)
              .attr("fill", tlFmt.tickColor.value.value)
              .attr("stroke", tlFmt.tickColor.value.value)
              .style("pointer-events", "none");
          });
        });
      }

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
          return this.parentColorMap.get(key) ?? "#72c0ffff";
        })
        .attr("stroke-width", 1);

      // === LABELS DE DURACIÓN ===
      const shouldShowLabels = this.shouldShowDurationLabels(x);
      if (this.fmtSettings.labelCard.show.value && shouldShowLabels) {
        renderDurationLabels({
          svg: this.ganttG,
          bars: allBars,
          x,
          y: this.y,
          yOffset: yOff,
          barHeight: this.barH,
          formatString: this.fmtSettings.labelCard.labelContent.value,
          labelPosition: this.fmtSettings.labelCard.labelPosition.value.value as "end" | "center" | "start",
          fontFamily: this.fmtSettings.labelCard.fontFamily.value,
          fontSize: this.fmtSettings.labelCard.fontSize.value,
          fontColor: this.fmtSettings.labelCard.fontColor.value.value,
          bold: this.fmtSettings.labelCard.bold.value,
          italic: this.fmtSettings.labelCard.italic.value,
          underline: this.fmtSettings.labelCard.underline.value
        });
      } else {
        this.ganttG.selectAll(".duration-label-group").remove();
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
              { displayName: this.startName, value: range?.start ? self.dateFormatter(range.start) : "" },
              { displayName: this.endName, value: range?.end ? self.dateFormatter(range.end) : "" }
            );

            if (this.fmtSettings.taskCard.showSecondaryColumns.value) {
              tooltipItems.push(
                { displayName: this.secondaryStartName, value: range?.secondaryStart ? self.dateFormatter(range.secondaryStart) : "" },
                { displayName: this.secondaryEndName, value: range?.secondaryEnd ? self.dateFormatter(range.secondaryEnd) : "" }
              );
            }
          } else {
            const [taskRaw, parentRaw] = (d.rowKey || "").split("|", 2);
            const taskName = (taskRaw || "").replace(/^T:/, "");
            const parentName = (parentRaw || "").replace(/^G:/, "");

            tooltipItems.push(
              { displayName: this.parentName, value: parentName },
              { displayName: "Task", value: taskName },
              { displayName: this.startName, value: d.start ? self.dateFormatter(d.start) : "" },
              { displayName: this.endName, value: d.end ? self.dateFormatter(d.end) : "" }
            );

            if (this.fmtSettings.taskCard.showSecondaryColumns.value) {
              tooltipItems.push(
                { displayName: this.secondaryStartName, value: d.secondaryStart ? self.dateFormatter(d.secondaryStart) : "" },
                { displayName: this.secondaryEndName, value: d.secondaryEnd ? self.dateFormatter(d.secondaryEnd) : "" }
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
      scrollLeft: 0,
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

    if (this.currentZoomTransform) {
      const actualFormat = this.updateSelectedFormatFromZoom(this.currentZoomTransform, width);
      if (actualFormat !== this.selectedFormat) {
        this.selectedFormat = actualFormat;
        this.updateFormatButtonsUI(this.selectedFormat);
        this.host.persistProperties({
          merge: [{
            objectName: "formatState",
            selector: null,
            properties: { selectedFormat: this.selectedFormat }
          }]
        });
      }

      const newX = this.currentZoomTransform.rescaleX(this.xOriginal);

      renderXAxisTop({
        xScale: newX,
        svg: this.axisTopContentG,
        height: 30,
        width: width,
        selectedFormat: this.selectedFormat,
        translateX: margin.left,
        scrollLeft: 0,
        fmtSettings: this.fmtSettings
      });

      renderXAxisBottom({
        xScale: newX,
        svg: this.axisBottomContentG,
        height: 30,
        width: width,
        selectedFormat: this.selectedFormat,
        translateX: margin.left,
        fmtSettings: this.fmtSettings
      });
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
    const result: ParseDataResult = parseData(dv);
    this.secondaryStartName = result.secondaryStartName;
    this.secondaryEndName = result.secondaryEndName;
    this.startName = result.startName;
    this.endName = result.endName;
    this.parentName = result.parentName;
    this.extraColNames = result.extraColNames;
    this.taskColCount = result.taskColCount;
    this.taskColNames = result.taskColNames;
    return result.tasks;
  }

  private buildRows(tasks: Task[], cache: Map<string, boolean>, showSubChildren = true) {
    const result = buildRows(tasks, cache, showSubChildren);
    this.groupRange = result.groupRange;
    return { visibleRows: result.visibleRows, expanded: result.expanded };
  }

  private redrawZoomedElements(
    newX: d3.ScaleTime<number, number>,
    y: d3.ScaleBand<string>,
    barH: number
  ) {
    const days = d3.timeDays(newX.domain()[0], newX.domain()[1]);

    this.ganttG.selectAll("line.day").remove();
    this.ganttG.selectAll("rect.weekend").remove();
    this.ganttG.selectAll("line.month").remove();

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
      const hasLabels = this.ganttG.selectAll(".duration-label-group").size() > 0;
      if (this.shouldShowDurationLabels(newX)) {
        if (hasLabels) {
          updateLabelPositions(
            this.ganttG,
            newX,
            this.fmtSettings.labelCard.labelPosition.value.value as "end" | "center" | "start"
          );
        } else {
          const yOffLocal = (this.fmtSettings.taskCard.taskHeight.value - this.barH) / 2;
          renderDurationLabels({
            svg: this.ganttG,
            bars: this.cachedAllBars,
            x: newX,
            y: y,
            yOffset: yOffLocal,
            barHeight: this.barH,
            formatString: this.fmtSettings.labelCard.labelContent.value,
            labelPosition: this.fmtSettings.labelCard.labelPosition.value.value as "end" | "center" | "start",
            fontFamily: this.fmtSettings.barCard.labelGroup.fontFamily.value,
            fontSize: this.fmtSettings.barCard.labelGroup.fontSize.value,
            fontColor: this.fmtSettings.barCard.labelGroup.fontColor.value.value,
            bold: this.fmtSettings.barCard.labelGroup.bold.value,
            italic: this.fmtSettings.barCard.labelGroup.italic.value,
            underline: this.fmtSettings.barCard.labelGroup.underline.value
          });
        }
      } else if (hasLabels) {
        this.ganttG.selectAll(".duration-label-group").remove();
      }
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

    const self = this;
    this.ganttG.selectAll<SVGGElement, BarDatum>(".bar-secondary-end-marker")
      .each(function (d) {
        d3.select(this).selectAll("*").remove();
        const markerX = newX(d.secondaryEnd!);
        const yOff = (self.fmtSettings.taskCard.taskHeight.value - self.barH) / 2;
        const markerY = self.y(d.rowKey)! + yOff + (self.secondaryBarOffsets.get(d.id) ?? self.barH * 0.5);

        const baseColor = getBarColor(d.rowKey, d.legend, self.legendColorMap, self.parentColorMap);
        const color = d3.color(baseColor);

        const categorical = self.lastOptions.dataViews[0].categorical;
        const legendCategory = categorical.categories.find(c => c.source.roles?.legend);

        let strokeColor = self.fmtSettings.secondaryBarCard.strokeColor.value.value;
        if (d.isGroup) {
          strokeColor = baseColor;
        }
        else if (legendCategory && d.legend) {
          const legendIndex = legendCategory.values.findIndex((v, i) => String(v) === d.legend && i === d.index);
          const obj = legendIndex >= 0 ? legendCategory.objects?.[legendIndex] : null;
          if (obj) {
            const prop: DataViewObjectPropertyIdentifier = {
              objectName: "secondaryBarCard",
              propertyName: "strokeColor"
            };
            const fill = dataViewObjects.getValue<Fill>(obj, prop);
            if (fill?.solid?.color) {
              strokeColor = fill.solid.color;
            }
          }
        }

        d3.select(this).selectAll("*").remove();

        let shapeValue = self.fmtSettings.secondaryBarCard.endMarkerShape.value;
        let shapeSize = self.fmtSettings.secondaryBarCard.endMarkerSize.value

        const taskCategory = self.lastOptions.dataViews[0].categorical.categories[0];
        const obj = taskCategory.objects?.[d.index];

        if (obj) {
          const prop: DataViewObjectPropertyIdentifier = {
            objectName: "secondaryBarCard",
            propertyName: "endMarkerShape"
          };
          const customShape = dataViewObjects.getValue<number>(obj, prop);
          if (customShape !== undefined) {
            shapeValue = customShape;
          }
        }

        renderEndMarkerShape(
          d3.select(this),
          shapeValue,
          markerX,
          markerY,
          shapeSize,
          strokeColor,
          strokeColor,
          self.fmtSettings.secondaryBarCard.strokeWidth.value
        );
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
      .selectAll<SVGLineElement, BarDatum>(".bar-secondary")
      .filter(d => d.secondaryStart instanceof Date && d.secondaryEnd instanceof Date)
      .attr("x1", d => newX(d.secondaryStart!))
      .attr("x2", d => newX(d.secondaryEnd!))
      .attr("stroke", d => {
        if (d.isGroup) {
          return getBarColor(d.rowKey, d.legend, this.legendColorMap, this.parentColorMap);
        }

        const categorical = this.lastOptions.dataViews[0].categorical;
        const legendCategory = categorical.categories.find(c => c.source.roles?.legend);
        let strokeColor = this.fmtSettings.secondaryBarCard.strokeColor.value.value;

        if (legendCategory && d.legend) {
          const legendIndex = legendCategory.values.findIndex((v, i) => String(v) === d.legend && i === d.index);
          const obj = legendIndex >= 0 ? legendCategory.objects?.[legendIndex] : null;
          if (obj) {
            const prop: DataViewObjectPropertyIdentifier = {
              objectName: "secondaryBarCard",
              propertyName: "strokeColor"
            };
            const fill = dataViewObjects.getValue<Fill>(obj, prop);
            if (fill?.solid?.color) {
              strokeColor = fill.solid.color;
            }
          }
        }

        return strokeColor;
      })
      .attr("stroke-dasharray", () => {
        const style = this.fmtSettings.secondaryBarCard.lineStyle.value.value;
        if (style === "dash") return "5,5";
        if (style === "dot") return "2,2";
        return "none";
      })
      .attr("stroke-width", this.fmtSettings.secondaryBarCard.barHeight.value)

    const today = new Date();
    this.ganttG
      .selectAll<SVGLineElement, Date>(".today-line")
      .attr("x1", d => newX(d))
      .attr("x2", d => newX(d));

    this.ganttG
      .selectAll<SVGTextElement, Date>(".today-label")
      .attr("x", d => newX(d) + 10);

      this.ganttG.selectAll(".timeline-connector").remove();
    this.ganttG.selectAll(".timeline-tick").remove();

    if (this.fmtSettings.timelineCard.show.value) {
      const tlFmt = this.fmtSettings.timelineCard;
      const visibleKeys = this.y.domain();
      const yOffLocal = (this.fmtSettings.taskCard.taskHeight.value - this.barH) / 2;

      const timelineRows = this.cacheTasks
        .filter(t =>
          t.timelineDate instanceof Date &&
          !isNaN(t.timelineDate.getTime()) &&
          visibleKeys.includes(`T:${t.id}|${t.parent}`)
        )
        .map(t => ({
          rowKey: `T:${t.id}|${t.parent}`,
          parent: t.parent,
          timelineDate: t.timelineDate!
        }));

      const byParent = d3.group(timelineRows, r => r.parent);

      byParent.forEach((rows) => {
        const sorted = rows.slice().sort((a, b) =>
          visibleKeys.indexOf(a.rowKey) - visibleKeys.indexOf(b.rowKey)
        );

        const s = tlFmt.tickSize.value;
        if (tlFmt.showLine.value && sorted.length > 1) {
          for (let idx = 0; idx < sorted.length - 1; idx++) {
            const rA = sorted[idx];
            const rB = sorted[idx + 1];
            this.ganttG.append("line")
              .attr("class", "timeline-connector")
              .attr("x1", newX(rA.timelineDate))
              .attr("y1", y(rA.rowKey)! + yOffLocal - s)
              .attr("x2", newX(rB.timelineDate))
              .attr("y2", y(rB.rowKey)! + yOffLocal - s)
              .attr("stroke", tlFmt.lineColor.value.value)
              .attr("stroke-width", tlFmt.lineWidth.value)
              .style("pointer-events", "none");
          }
        }

        sorted.forEach(row => {
          const s = tlFmt.tickSize.value;
          this.ganttG.append("rect")
            .attr("class", "timeline-tick")
            .attr("x", newX(row.timelineDate) - s)
            .attr("y", y(row.rowKey)! + yOffLocal - s * 2)
            .attr("width", s * 2)
            .attr("height", s * 2)
            .attr("fill", tlFmt.tickColor.value.value)
            .attr("stroke", tlFmt.tickColor.value.value)
            .style("pointer-events", "none");
        });
      });
    }

  }

  private updateSelectedFormatFromZoom(t: d3.ZoomTransform, width: number): FormatType {
    const [start, end] = this.xOriginal.domain();
    const baseDays = (end.getTime() - start.getTime()) / (1000 * 3600 * 24);
    const visibleDays = baseDays / t.k;
    const pxPerDay = width / visibleDays;
    const pxPerHour = pxPerDay / 24;
    
    // Alinear con los umbrales de renderXAxisBottom.ts
    if (pxPerHour > 60) return "Hora";   // 10 min
    if (pxPerHour > 30) return "Hora";   // 30 min
    if (pxPerHour > 15) return "Hora";   // 1 hora
    if (pxPerHour > 8) return "Hora";     // 2 horas
    if (pxPerHour > 4) return "Hora";     // 6 horas
    if (pxPerHour > 2) return "Hora";     // 12 horas
    if (pxPerDay > 17) return "Día";
    if (pxPerDay > 2) return "Mes";
    return "Año";
  }

  private getDateRangeFromFormat(fmt: FormatType): [Date, Date] {
    const valid = this.cacheTasks.filter(t => t.start && t.end);
    const dataMin = valid.length ? d3.min(valid, t => t.start)! : this.xOriginal.domain()[0];
    const dataMax = valid.length ? d3.max(valid, t => t.end)! : this.xOriginal.domain()[1];
    switch (fmt) {
      case "Hora":
        return [dataMin, d3.timeDay.offset(dataMin, 1)];
      case "Día":
        return [dataMin, d3.timeMonth.offset(dataMin, 1)];
      case "Mes":
        return [dataMin, d3.timeYear.offset(dataMin, 1)];
      case "Año":
      default:
        return [dataMin, dataMax];
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
  private shouldShowDurationLabels(x: d3.ScaleTime<number, number>): boolean {
    if (this.selectedFormat !== "Hora") return false;
    const [d0, d1] = x.domain();
    const visibleHours = (d1.getTime() - d0.getTime()) / 3600000;
    if (visibleHours <= 0) return false;
    const rangeWidth = x.range()[1] - x.range()[0];
    const pxPerHour = rangeWidth / visibleHours;
    return pxPerHour > 8;
  }

  private updateFormatButtonsUI(fmt: FormatType) {
    const buttons = this.rightBtns.selectAll("button");
    buttons.classed("active", d => d === fmt);
  }
}
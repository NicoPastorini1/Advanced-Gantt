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
import ypfBg from "../assets/ypf_background.svg";
import { dataViewObjects } from "powerbi-visuals-utils-dataviewutils";
import { renderXAxisBottom } from "./components/xAxis/renderXAxisBottom";
import { renderXAxisTop } from "./components/xAxis/renderXAxisTop";
// powerbi.visuals
import IVisual = powerbi.extensibility.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import ISelectionID = powerbi.visuals.ISelectionId
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import DataViewObjectPropertyIdentifier = powerbi.DataViewObjectPropertyIdentifier;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import Fill = powerbi.Fill;
import FormattingId = powerbi.visuals.FormattingId;

// Interfaces
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
}

interface VisualRow {
  id: string;
  isGroup: boolean;
  task?: Task;
  rowKey: string;
  labelY: string;
  duration?: number;
}

interface References {
  cardUid?: string;
  groupUid?: string;
  fill?: FormattingId;
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
  selectionId: ISelectionID;  // 👈 agregar esta línea
}

const enum GanttObjectNames {
  ColorSelector = "colorSelector"
}


export interface GanttDataPoint {
  task: string;
  parent: string;
  startDate: Date;
  endDate: Date;
  color: string;
  selectionId: ISelectionID;
  index: number;
  completion?: number;
  secondaryStart?: Date;
  secondaryEnd?: Date;
}

// Funciones
function createSelectorDataPoints(options: VisualUpdateOptions, host: IVisualHost): GanttDataPoint[] {
  const dataPoints: GanttDataPoint[] = [];
  const dataViews = options.dataViews;

  if (!dataViews
    || !dataViews[0]
    || !dataViews[0].categorical
    || !dataViews[0].categorical.categories
    || !dataViews[0].categorical.categories[1]?.values
    || !dataViews[0].categorical.values
  ) {
    return dataPoints;
  }

  const categorical = dataViews[0].categorical;
  const parent = categorical.categories[1];

  const colorPalette: ISandboxExtendedColorPalette = host.colorPalette;

  // 🔁 Agrupamos por parent único
  const uniqueParents = [...new Set(parent.values.map(v => `${v}`))];

  uniqueParents.forEach((value, i) => {
    const index = parent.values.findIndex(v => `${v}` === value);
    const selectionId: ISelectionID = host.createSelectionIdBuilder()
      .withCategory(parent, index)
      .createSelectionId();

    const color = getColumnColorByIndex(parent, index, colorPalette);

    dataPoints.push({
      task: "",
      parent: value,
      startDate: new Date(),
      endDate: new Date(),
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
    objectName: "colorSelector",
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
  private currentZoomTransform?: d3.ZoomTransform;
  private y: d3.ScaleBand<string>;
  private marginLeft: number = 0;
  private width: number = 0;
  private innerW: number = 0;
  private xOriginal: d3.ScaleTime<number, number>;
  private barH: number = 40;
  private zoomBehavior!: d3.ZoomBehavior<SVGSVGElement, unknown>;





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

  private getGroupBarPath(
    scaleX: d3.ScaleTime<number, number>,
    scaleY: d3.ScaleBand<string>,
    d: BarDatum,
    taskHeight: number,
    barHeight: number
  ): string {
    const x1 = scaleX(d.start);
    const x2 = scaleX(d.end);
    const width = x2 - x1;

    const yTop = scaleY(d.rowKey)! + (taskHeight - barHeight) / 2;
    const topHeight = barHeight * 0.5; // Ancho de la barra de arriba
    const tipHeight = barHeight * 0.6; // Alto de la barra
    const tipInset = Math.min(width * 0.15, 35);

    return `
    M${x1},${yTop}
    H${x2}
    L${x2},${yTop + topHeight + tipHeight}
    L${x2 - tipInset},${yTop + topHeight}
    H${x1 + tipInset}
    L${x1},${yTop + topHeight + tipHeight}
    Z
  `;
  }

  private getCompletionByGroup(rowKey: string, allBars: BarDatum[]): number {
    const groupId = rowKey.replace(/^G:/, "");

    const children = allBars.filter(b => {
      if (b.isGroup) return false;
      const parts = b.rowKey.split("|");
      return parts.length === 2 && parts[1] === groupId;
    });

    const completions = children
      .map(c => Number(c.completion))
      .filter(c => !isNaN(c));

    if (!completions.length) {
      return 0;
    }

    const avg = completions.reduce((a, b) => a + b, 0) / completions.length;
    const boundedAvg = Math.max(0, Math.min(1, avg > 1 ? avg / 100 : avg));
    return boundedAvg;
  }

  constructor(opts: VisualConstructorOptions) {
    this.container = opts.element as HTMLElement;
    this.host = opts.host

    this.tooltipServiceWrapper = createTooltipServiceWrapper(
      opts.host.tooltipService,
      opts.element
    );

    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    const topBtnsWrapper = d3.select(this.container)
      .append("div")
      .attr("class", "top-btns-wrapper")
      .style("display", "flex")
      .style("justify-content", "space-between")
      .style("gap", "8px")
      .style("align-items", "center");

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
      this.update(this.lastOptions, true); // preserva scroll y zoom
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

        // 2. aplicar el rango al zoom → esto mueve la cámara
        this.zoomToRange(newMin, newMax);

        // ⚠️ importante: acá NO tocamos this.selectedFormat
        // lo decide updateSelectedFormatFromZoom()
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
      .style("top", "60px")
      .style("left", `0px`)
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

    this.ganttDiv.on("scroll", () => {
      const scrollNode = this.ganttDiv.node()!;
      const scrollLeft = scrollNode.scrollLeft;
      const scrollTop = scrollNode.scrollTop;
      this.xAxisFixedG.attr("transform", `translate(${-scrollLeft},0)`);
      this.leftG.select<SVGGElement>(".y-content")
        .attr("transform", `translate(0, ${60 - scrollTop})`);
      event.preventDefault(); // previene el scroll nativo

    });

    this.leftG = this.yAxisSVG.append("g");
    this.ganttG = this.ganttSVG.append("g");
    this.linesG = this.ganttG.append("g").attr("class", "y-grid");
    this.landingG = this.ganttSVG.append("g")
      .attr("class", "landing")
      .style("pointer-events", "none");
  }

  public update(opts: VisualUpdateOptions, preserveView = false): void {
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

    this.fmtSettings = this.fmtService.populateFormattingSettingsModel(VisualFormattingSettingsModel, opts.dataViews?.[0]);
    this.ganttdataPoints = createSelectorDataPoints(opts, this.host)
    this.fmtSettings.populateColorSelector(this.ganttdataPoints);
    const { width, height } = opts.viewport;
    this.lastOptions = opts;

    const dv: DataView | undefined = opts.dataViews?.[0];
    const hasData = Boolean(dv?.categorical?.categories?.length) &&
      (dv?.categorical?.values?.length ?? 0) >= 2;

    this.leftBtns.style("display", hasData ? "block" : "none");
    this.rightBtns.style("display", hasData ? "block" : "none");
    const pad = 10;

    const hasD = this.cacheTasks.some(t => t.fields.length > this.taskColCount);
    const totalCols = 2 + this.taskColCount + (hasD ? 1 : 0);

    const colWidths: number[] = [];

    colWidths.push(this.fmtSettings.taskCard.taskWidth.value); // Tarea
    colWidths.push(this.fmtSettings.taskCard.startWidth.value); // Inicio

    for (let i = 0; i < this.taskColCount - 2; i++) {
      colWidths.push(180); // podés personalizar más si querés
    }

    colWidths.push(this.fmtSettings.taskCard.endWidth.value); // Fin

    if (hasD) {
      colWidths.push(100); // Duración
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

    const tasks = this.parseData(dv);
    if (tasks.length) this.cacheTasks = tasks;
    const { visibleRows, expanded } = this.buildRows(this.cacheTasks, expCache);
    this.expanded = expanded;

    const rowH = this.fmtSettings.taskCard.taskHeight.value;
    const innerH = rowH * visibleRows.length;

    let xStart = d3.min(this.cacheTasks, d => d.start)!;
    let xEnd = d3.max(this.cacheTasks, d => d.end)!;
    if (xStart >= xEnd) xEnd = new Date(xStart.getTime() + 3_600_000);

    // 1) Calcular ancho lógico ANTES de crear las escalas
    this.innerW = this.computeInnerW(this.selectedFormat, xStart, xEnd, width, margin);

    // 2) Crear escalas usando el range correcto
    let x: d3.ScaleTime<number, number>;

    if (this.currentZoomTransform) {
      this.xOriginal = d3.scaleTime()
        .domain([xStart, xEnd])
        .range([0, this.innerW]);
      x = this.currentZoomTransform.rescaleX(this.xOriginal);
    } else {
      this.xOriginal = d3.scaleTime()
        .domain([xStart, xEnd])
        .range([0, this.innerW]);
      x = this.xOriginal.copy();
    }


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

    // 1) Extender dominio base para evitar pared invisible en zoom
    const [origMin, origMax] = this.xOriginal.domain();
    const bufferDias = 365; // margen: 1 año extra a cada lado
    const minDateExt = d3.timeDay.offset(origMin, -bufferDias);
    const maxDateExt = d3.timeDay.offset(origMax, bufferDias);
    this.xOriginal.domain([minDateExt, maxDateExt]);

    // 2) Variables para drag vertical/horizontal
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let scrollTopStart = 0;

    this.zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 100])
      .translateExtent([[-1e9, -1e9], [1e9, 1e9]]) // pan libre
      .filter((event) => {
        // permitir rueda para zoom y arrastre para pan
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
        const [minDate, maxDate] = this.xOriginal.domain();

        // al hacer doble clic, centramos todo el rango en la vista
        this.zoomToRange(minDate, maxDate);
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

    if (headFmt.show.value) {
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

      this.taskColNames.forEach((n, i) =>
        head.append("text").text(n)
          .attr("x", colX(i))
          .attr("y", -10)
          .attr("zindex", 999)
          .attr("fill", headFmt.fontColor.value.value)
          .attr("font-size", headFmt.fontSize.value)
          .attr("font-family", headFmt.fontFamily.value)
      );
      head.append("text").text("Inicio P")
        .attr("x", colX(this.taskColCount))
        .attr("y", -10)
        .attr("zindex", 999)
        .attr("fill", headFmt.fontColor.value.value)
        .attr("font-size", headFmt.fontSize.value)
        .attr("font-family", headFmt.fontFamily.value);
      head.append("text").text("Fin P")
        .attr("x", colX(this.taskColCount + 1))
        .attr("y", -10)
        .attr("zindex", 999)
        .attr("fill", headFmt.fontColor.value.value)
        .attr("font-size", headFmt.fontSize.value)
        .attr("font-family", headFmt.fontFamily.value);
      if (hasD) {
        head.append("text").text("Duración")
          .attr("x", colX(this.taskColCount + 2))
          .attr("y", -10)
          .attr("zindex", 999)
          .attr("fill", headFmt.fontColor.value.value)
          .attr("font-size", headFmt.fontSize.value)
          .attr("font-family", headFmt.fontFamily.value);
      }
    }
    const dateFmt = d3.timeFormat("%d/%m/%Y %H:%M:%S");
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
          else if (row.rowKey?.includes("|")) key = row.rowKey.split("|")[1]; // por si acaso

          const dp = self.ganttdataPoints.find(p => p.parent === key);
          const triColor = dp?.color ?? parFmt.fontColor.value.value;

          const label = g.append("text")
            .attr("x", 5)
            .attr("y", top + yScale.bandwidth() / 2 + 4)
            .attr("font-weight", "bold")
            .attr("cursor", "pointer")
            .attr("font-family", parFmt.fontFamily.value)
            .attr("font-size", parFmt.fontSize.value)
            .attr("data-rowKey", row.rowKey)   // 👈 agregar esto
            .on("click", () => {
              self.expanded.set(row.id, !exp);
              const expandedValues = Array.from(self.expanded.values());
              self.allExpanded = expandedValues.every(Boolean);
              self.update(self.lastOptions);
            });

          label.text(null);
          label.append("tspan").attr("fill", triColor).text(exp ? "▼" : "▶");
          label.append("tspan").attr("fill", parFmt.fontColor.value.value).text(" " + row.labelY);

          // --- Resto igual ---
          const r = self.groupRange.get(row.id);
          if (r) {
            g.append("text").text(dateFmt(r.start))
              .attr("x", colX(self.taskColCount))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              .attr("font-weight", "bold")
              .attr("fill", parFmt.fontColor.value.value)
              .attr("font-size", parFmt.fontSize.value)
              .attr("font-family", parFmt.fontFamily.value);

            g.append("text").text(dateFmt(r.end))
              .attr("x", colX(self.taskColCount + 1))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              .attr("font-weight", "bold")
              .attr("fill", parFmt.fontColor.value.value)
              .attr("font-size", parFmt.fontSize.value)
              .attr("font-family", parFmt.fontFamily.value);
          }

          if (row.duration !== undefined && hasD) {
            g.append("text").text(String(row.duration))
              .attr("x", colX(self.taskColCount + 2))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              .attr("font-weight", "bold")
              .attr("fill", parFmt.fontColor.value.value)
              .attr("font-size", parFmt.fontSize.value)
              .attr("font-family", parFmt.fontFamily.value);
          }
        } else if (row.task) {
          const hasDuration = row.task.fields.length > self.taskColCount;
          const durationIndex = hasDuration ? row.task.fields.length - 1 : -1;

          const dateFmt = d3.timeFormat("%d/%m/%Y %H:%M");

          row.task.fields.forEach((val, i) => {
            if (hasDuration && i === durationIndex) return;
            g.append("text").text(val)
              .attr("x", colX(i))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              .attr("font-size", taskFmt.fontSize.value)
              .attr("fill", taskFmt.fontColor.value.value)
              .attr("font-family", taskFmt.fontFamily.value)
              .attr("data-rowKey", row.rowKey);   // 👈 identificador para hover
          });

          g.append("text")
            .text(row.task.start && !isNaN(row.task.start.getTime())
              ? dateFmt(row.task.start)
              : " ")
            .attr("x", colX(self.taskColCount))
            .attr("y", top + yScale.bandwidth() / 2 + 4)
            .attr("font-size", taskFmt.fontSize.value)
            .attr("fill", taskFmt.fontColor.value.value)
            .attr("font-family", taskFmt.fontFamily.value)
            .attr("data-rowKey", row.rowKey);     // 👈 también acá

          g.append("text")
            .text(row.task.end && !isNaN(row.task.end.getTime())
              ? dateFmt(row.task.end)
              : " ")
            .attr("x", colX(self.taskColCount + 1))
            .attr("y", top + yScale.bandwidth() / 2 + 4)
            .attr("font-size", taskFmt.fontSize.value)
            .attr("fill", taskFmt.fontColor.value.value)
            .attr("font-family", taskFmt.fontFamily.value)
            .attr("data-rowKey", row.rowKey);     // 👈 también acá

          if (hasDuration) {
            const durationVal = row.task.fields[durationIndex];
            g.append("text").text(durationVal)
              .attr("x", colX(self.taskColCount + 2))
              .attr("y", top + yScale.bandwidth() / 2 + 4)
              .attr("font-size", taskFmt.fontSize.value)
              .attr("fill", taskFmt.fontColor.value.value)
              .attr("font-family", taskFmt.fontFamily.value)
              .attr("data-rowKey", row.rowKey);   // 👈 también acá
          }

        }

      });
    if (this.fmtSettings.axisYCard.showLine.value) {
      this.leftG.selectAll(".row")
        .data(visibleRows)
        .enter().append("g")
        .attr("class", "row")
        .each(function (row) {
          // ...
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
    const taskCategory = categorical.categories[0]; // 👈 una sola columna

    const taskBars: BarDatum[] = visibleRows
      .filter(r => !r.isGroup && r.task)
      .map(r => ({
        id: r.task!.id,
        start: r.task!.start,
        end: r.task!.end,
        rowKey: r.rowKey,
        isGroup: false,
        index: r.task!.index,
        completion: r.task!.completion,
        secondaryStart: r.task!.secondaryStart ? new Date(r.task!.secondaryStart) : undefined,
        secondaryEnd: r.task!.secondaryEnd ? new Date(r.task!.secondaryEnd) : undefined,
        selectionId: this.host.createSelectionIdBuilder()
          .withCategory(taskCategory, r.task!.index)
          .createSelectionId() as ISelectionID
      }));

    const parentCategory = categorical.categories[1];

    const groupBars: BarDatum[] = visibleRows
      .filter(r => r.isGroup)
      .map((r, i) => {
        const range = this.groupRange.get(r.id)!;
        return {
          id: r.id,
          start: range.start,
          end: range.end,
          rowKey: r.rowKey,
          isGroup: true,
          index: i,
          completion: this.getCompletionByGroup(
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
                .createSelectionId() as ISelectionID
            }))
          ),
          secondaryStart: range.secondaryStart ? new Date(range.secondaryStart) : undefined,
          secondaryEnd: range.secondaryEnd ? new Date(range.secondaryEnd) : undefined,
          selectionId: this.host.createSelectionIdBuilder()
            .withCategory(parentCategory, i)
            .createSelectionId() as ISelectionID
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
        key = d.rowKey.slice(2); // quita "G:"
      } else if (d.rowKey?.includes("|")) {
        key = d.rowKey.split("|")[1];
      }

      const dp = this.ganttdataPoints.find(p => p.parent === key);

      const baseColorStr = dp?.color ?? "#72c0ffff";
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
        .attr("fill", d => {
          const dp = this.ganttdataPoints.find(p => p.parent === d.rowKey.split("|")[1]);
          return dp?.color ?? "#000";
        })
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
        .attr("fill", d => {
          const key = d.rowKey.split("|")[1];
          const dp = this.ganttdataPoints.find(p => p.parent === key);
          const baseColor = d3.color(dp?.color ?? "#72c0ffff");
          return baseColor ? d3.interpolateRgb(baseColor, d3.color("#ffffff"))(0.50) : "#cccccc";
        })
        .attr("rx", (barCfg.barGroup.slices.find(s => s.name === "cornerRadius") as formattingSettings.Slider).value)
        .attr("ry", (barCfg.barGroup.slices.find(s => s.name === "cornerRadius") as formattingSettings.Slider).value)
        .attr("stroke", d => {
          const key = d.rowKey.split("|")[1];
          const dp = this.ganttdataPoints.find(p => p.parent === key);
          return dp?.color ?? "#72c0ffff";
        })
        .attr("stroke-width", (barCfg.barGroup.slices.find(s => s.name === "strokeWidth") as formattingSettings.Slider).value)
        .on("mouseover", (event, d: BarDatum) => {
          const strokeColor = d3.select(event.currentTarget).attr("stroke");
          d3.selectAll(`text[data-rowKey="${d.rowKey}"]`).attr("fill", strokeColor);
        })
        .on("mouseout", (event, d: BarDatum) => {
          d3.selectAll(`text[data-rowKey="${d.rowKey}"]`).attr("fill", taskFmt.fontColor.value.value);
        });

      // === PADRES (grupos) ===
      // === PADRES (grupos) ===
      bars.filter(d =>
        d.isGroup &&
        d.start instanceof Date && !isNaN(d.start.getTime()) &&
        d.end instanceof Date && !isNaN(d.end.getTime())
      )
        .attr("d", d => this.getGroupBarPath(x, yScale, d, taskFmt.taskHeight.value, this.barH))
        .attr("fill", d => `url(#${d.gradientId})`)
        .attr("stroke", d => {
          const key = d.rowKey.split("|")[0].replace(/^[A-Z]:/, "");
          const dp = this.ganttdataPoints.find(p => p.parent === key);
          return dp?.color ?? "#72c0ffff";
        })
        .attr("stroke-width", 1)
        .on("mouseover", (event, d: BarDatum) => {
          const strokeColor = d3.select(event.currentTarget).attr("stroke");
          // 🔑 esto pinta SOLO el texto del padre
          d3.selectAll(`text[data-rowKey="${d.rowKey}"]`).attr("fill", strokeColor);
        })
        .on("mouseout", (event, d: BarDatum) => {
          d3.selectAll(`text[data-rowKey="${d.rowKey}"]`).attr("fill", parFmt.fontColor.value.value);
        });


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
        .attr("fill", d => {
          const key = d.rowKey.split("|")[1];
          const dp = this.ganttdataPoints.find(p => p.parent === key);
          return dp?.color ?? "#72c0ffff";
        })
        .attr("rx", (barCfg.barGroup.slices.find(s => s.name === "cornerRadius") as formattingSettings.Slider).value)
        .attr("ry", (barCfg.barGroup.slices.find(s => s.name === "cornerRadius") as formattingSettings.Slider).value);

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
        .attr("x", d => {
          const xVal = x(d.secondaryStart!);
          return xVal;
        })
        .attr("y", d => {
          const yVal = yScale(d.rowKey)! + yOff + this.barH / 2 - (d.isGroup ? 4 : 3);
          return yVal;
        })
        .attr("width", d => {
          const w = Math.max(0, x(d.secondaryEnd!) - x(d.secondaryStart!));
          return w;
        })
        .attr("height", d => {
          const h = d.isGroup ? 5 : 6;
          return h;
        })
        .attr("fill", d => {
          const color = d.isGroup ? "#d35400" : "#e67e22";
          return color;
        })
        .attr("rx", 2);

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

      // Texto vertical "Hoy"
      this.ganttG
        .selectAll(".today-label")
        .data([today])
        .join("text")
        .attr("class", "today-label")
        .text("Hoy") // o "Today"
        .attr("x", d => x(d) + 5) // desplazamiento horizontal para no solaparse con la línea
        .attr("y", 10)            // posición vertical inicial
        .attr("font-size", 15)
        .attr("fill", this.fmtSettings.timeMarkerCard.todayGroup.fontColor.value.value)
        .attr("writing-mode", "vertical-rl")  // texto vertical
        .attr("text-anchor", "start");

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

      // BARRA DE GRUPO
      bars.filter(d =>
        d.isGroup &&
        d.start instanceof Date &&
        !isNaN(d.start.getTime()) &&
        d.end instanceof Date &&
        !isNaN(d.end.getTime())
      )
        .attr("d", d => this.getGroupBarPath(x, yScale, d, taskFmt.taskHeight.value, this.barH))
        .attr("fill", d => `url(#${d.gradientId})`)
        .attr("stroke", d => {
          const key = d.rowKey.split("|")[0].replace(/^[A-Z]:/, "");
          const dp = this.ganttdataPoints.find(p => p.parent === key);
          return dp?.color ?? "#72c0ffff";
        })
        .attr("stroke-width", 1);

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

      const tooltipValues = dv.categorical.values.filter(val => val.source.roles && val.source.roles['tooltips']);

      const tooltipTargets = this.ganttG.selectAll<SVGRectElement, BarDatum>(".bar, .bar-secondary");

this.tooltipServiceWrapper.addTooltip<BarDatum>(
  tooltipTargets,
  (d: BarDatum) => {
    let taskName = "";
    let parentName = "";

    if (d.isGroup) {
      parentName = (d.rowKey || "").replace(/^G:/, "");
    } else {
      const [taskRaw, parentRaw] = (d.rowKey || "").split("|");
      taskName = (taskRaw || "").replace(/^T:/, "").replace(/^G:/, "");
      parentName = (parentRaw || "").replace(/^T:/, "").replace(/^G:/, "");
    }

    const tooltipItems: { displayName: string; value: string }[] = [
      { displayName: "Parent", value: parentName },
      ...(taskName ? [{ displayName: "Task", value: taskName }] : []),
      { displayName: "Inicio P", value: d.start.toLocaleString() },
      { displayName: "Fin P", value: d.end.toLocaleString() },
    ];

    const c = Number(d.completion);
    if (Number.isFinite(c) && c !== 0) {
      const pct = c > 1 ? c : c * 100;
      tooltipItems.push({ displayName: "Completado", value: `${Math.round(pct)}%` });
    }

    tooltipValues.forEach(val => {
      const v = val.values[d.index];
      tooltipItems.push({
        displayName: val.source.displayName,
        value: (v !== undefined && v !== null) ? String(v) : ""
      });
    });

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
        console.warn("⚠️ Dependencia inválida:", dep);
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
      }
      if (savedZoom) {
        this.ganttSVG.call(this.zoomBehavior.transform, savedZoom);
      }
    }

    this.host.eventService?.renderingFinished?.(opts.viewport);
  }

  private renderLanding(width: number, height: number) {
    this.landingG.attr("display", null).selectAll("*").remove();
    this.landingG.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "#F3F3F3");

    const img = 250;
    this.landingG.append("image")
      .attr("href", ypfBg)
      .attr("xlink:href", ypfBg)
      .attr("width", img)
      .attr("height", img)
      .attr("x", width / 2 - img / 2)
      .attr("y", height / 2 - img / 2 - 30)
      .attr("preserveAspectRatio", "xMidYMid meet");

    this.landingG.append("text")
      .text("Dev by Nico Pastorini with ❤️ for YPF")
      .attr("x", width / 2)
      .attr("y", height / 2 + img / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "hanging")
      .attr("fill", "#666")
      .attr("font-size", 18)
      .attr("font-family", "Segoe UI")
      .attr("font-weight", "bold");
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return this.fmtService.buildFormattingModel(this.fmtSettings);
  }

  private parseData(dv: DataView): Task[] {
    if (!dv.categorical?.categories?.length) return [];
    const cat = dv.categorical;

    const sVal = cat.values.find(v => v.source.roles?.startDate)?.values;
    const eVal = cat.values.find(v => v.source.roles?.endDate)?.values;
    const durVal = cat.values.find(v => v.source.roles?.duration)?.values;
    const compVal = cat.values.find(v => v.source.roles?.completion)?.values;
    const secStartVal = cat.values.find(v => v.source.roles?.secondaryStart)?.values;
    const secEndVal = cat.values.find(v => v.source.roles?.secondaryEnd)?.values;

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
    const rowCount = sVal?.length ?? 0;

    for (let i = 0; i < rowCount; i++) {
      const taskFields = taskCols.map(c => String(c.values[i] ?? ""));
      const parentTxt = parentCols.map(c => String(c.values[i] ?? "")).join(" | ") || "Sin grupo";

      const rawStart = sVal?.[i];
      const rawEnd = eVal?.[i];

      const start = rawStart ? new Date(rawStart as string) : null;
      const end = rawEnd ? new Date(rawEnd as string) : null;

      const isStartValid = start instanceof Date && !isNaN(start.getTime());
      const isEndValid = end instanceof Date && !isNaN(end.getTime());

      const duration = durVal ? Number(durVal[i]) : undefined;
      const fieldsWithDuration = durVal ? [...taskFields, duration?.toString() ?? ""] : taskFields;

      let predecessor: string | undefined;
      if (predCol) {
        const rawPred = String(predCol[i] ?? "").trim();
        if (rawPred !== "") predecessor = rawPred;
      }

      const secStart =
        typeof secStartVal?.[i] === "string" || typeof secStartVal?.[i] === "number"
          ? new Date(secStartVal[i] as string | number)
          : undefined;

      const secEnd =
        typeof secEndVal?.[i] === "string" || typeof secEndVal?.[i] === "number"
          ? new Date(secEndVal[i] as string | number)
          : undefined;

      const task: Task = {
        id: taskFields.join(" | "),
        parent: parentTxt,
        start: isStartValid ? start! : null,
        end: isEndValid ? end! : null,
        fields: fieldsWithDuration,
        completion: compVal ? Number(compVal[i]) : undefined,
        secondaryStart: secStart,
        secondaryEnd: secEnd,
        predecessor,
        index: i  // <<--- agregado
      };

      out.push(task);
    }

    return out;
  }

  private buildRows(tasks: Task[], cache: Map<string, boolean>) {
    const rows: VisualRow[] = [];
    this.groupRange.clear();

    const grouped = d3.group(tasks, t => t.parent);
    for (const [parent, list] of grouped.entries()) {
      this.groupRange.set(parent!, {
        start: d3.min(list, d => d.start)!,
        end: d3.max(list, d => d.end)!,
        secondaryStart: d3.min(list, d => d.secondaryStart),
        secondaryEnd: d3.max(list, d => d.secondaryEnd)
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
        list.forEach(t =>
          rows.push({
            id: t.id,
            isGroup: false,
            task: t,
            rowKey: `T:${t.id}|${parent}`,
            labelY: t.id
          })
        );
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

    if (this.selectedFormat === "Día") {
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
        .data(days.filter(d => d.getDay() === 6)) // sábados
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

    // Redibuja barras estándar
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
    this.ganttG.selectAll<SVGTextElement, BarDatum>(".duration-label")
      .attr("x", d => {
        const end = d.end instanceof Date ? d.end : null;
        const secEnd = d.secondaryEnd instanceof Date ? d.secondaryEnd : null;

        const baseDate = (end && secEnd && secEnd > end) ? secEnd : end;

        return baseDate ? newX(baseDate) + 4 : -9999;
      });

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
        this.getGroupBarPath(
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

    // pixeles por día = ancho visible / días visibles
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
        // Mostrar solo la primera jornada
        return [minDate, d3.timeDay.offset(minDate, 1)];
      case "Día":
        // Mostrar un mes desde minDate
        return [minDate, d3.timeMonth.offset(minDate, 1)];
      case "Mes":
        // Mostrar un año desde minDate
        return [minDate, d3.timeYear.offset(minDate, 1)];
      case "Año":
      default:
        // Todo el rango
        return [minDate, maxDate];
    }
  }

  private zoomToRange(start: Date, end: Date) {
    const visibleW = this.width - this.marginLeft;
    const rangeWidth = this.xOriginal(end) - this.xOriginal(start);
    const scale = visibleW / rangeWidth;

    const firstTask = this.cacheTasks.find(t => t.start && t.end);
    if (!firstTask) return;

    const barStart = this.xOriginal(firstTask.start!);

    // 👇 alinear inicio de la primera barra con el borde izquierdo del área de barras
    const translateX = (this.marginLeft - this.marginLeft) - barStart * scale + 10;

    const t = d3.zoomIdentity
      .translate(translateX, 0)
      .scale(scale);

    console.log("=== zoomToRange alineado ===");
    console.log("marginLeft:", this.marginLeft);
    console.log("barStart:", barStart);
    console.log("scale:", scale);
    console.log("translateX:", translateX);

    this.ganttSVG.call(this.zoomBehavior.transform, t);
  }











  private updateFormatButtonsUI(fmt: FormatType) {
    // solo marcar cuál está activo
    const buttons = this.rightBtns.selectAll("button");
    buttons.classed("active", d => d === fmt);
  }

}
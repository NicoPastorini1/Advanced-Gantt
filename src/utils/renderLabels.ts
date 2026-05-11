import * as d3 from "d3";

type LabelPosition = "end" | "center" | "start";

interface LabelOptions {
  svg: d3.Selection<SVGGElement, unknown, null, undefined>;
  bars: {
    id: string;
    taskName?: string;
    start: Date;
    end: Date;
    rowKey: string;
    labelY?: string;
    labelText?: string;
  }[];
  x: d3.ScaleTime<number, number>;
  y: d3.ScaleBand<string>;
  yOffset: number;
  barHeight: number;

  formatString?: string;
  labelPosition?: LabelPosition;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

function formatDurationText(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;

  if (minutes < 60) {
    return `${minutes}m`;
  } else if (days > 0) {
    return `${days}d ${remHours}h`;
  } else {
    return `${hours}h`;
  }
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function renderLabelContent(format: string, taskName: string, start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime();
  const duration = formatDurationText(ms);

  return format
    .replace(/\{task\}/g, taskName)
    .replace(/\{duration\}/g, duration)
    .replace(/\{start\}/g, formatDateShort(start))
    .replace(/\{end\}/g, formatDateShort(end));
}

function getLabelX(
  d: { start: Date; end: Date },
  x: d3.ScaleTime<number, number>,
  position: LabelPosition
): { x: number; anchor: string } {
  const startX = x(d.start);
  const endX = x(d.end);
  switch (position) {
    case "start":
      return { x: startX - 4, anchor: "end" };
    case "center":
      return { x: (startX + endX) / 2, anchor: "middle" };
    case "end":
    default:
      return { x: endX + 4, anchor: "start" };
  }
}

export function renderDurationLabels(opts: LabelOptions) {
  const {
    svg, bars, x, y, yOffset, barHeight,
    formatString = "{task} ({duration})",
    labelPosition = "end",
    fontFamily = "Segoe UI",
    fontSize = 11,
    fontColor = "#000000",
    bold = false,
    italic = false,
    underline = false
  } = opts;

  const filteredBars = bars.filter(d =>
    d.start instanceof Date &&
    !isNaN(d.start.getTime()) &&
    d.end instanceof Date &&
    !isNaN(d.end.getTime())
  );

  const groups = svg.selectAll<SVGGElement, BarData>(".duration-label-group")
    .data(filteredBars, (d: any) => d.id || d.rowKey || "")
    .join(
      enter => {
        const g = enter.append("g").attr("class", "duration-label-group");
        g.append("text").attr("class", "duration-label");
        return g;
      }
    )
    .attr("data-rowKey", d => d.rowKey);

  groups.each(function (d) {
    const g = d3.select(this);
    const textEl = g.select("text.duration-label");
    const text = d.labelText && d.labelText.trim() !== ""
      ? d.labelText
      : renderLabelContent(formatString, d.taskName || d.id, d.start, d.end);
    const pos = getLabelX(d, x, labelPosition);
    const labelYPos = y(d.rowKey)! + yOffset + barHeight / 2 + 4;

    textEl
      .text(text)
      .attr("x", pos.x)
      .attr("y", labelYPos)
      .attr("text-anchor", pos.anchor)
      .attr("dominant-baseline", "middle")
      .attr("font-size", fontSize)
      .attr("font-family", fontFamily)
      .attr("fill", fontColor)
      .attr("font-weight", bold ? "bold" : "normal")
      .attr("font-style", italic ? "italic" : "normal")
      .attr("text-decoration", underline ? "underline" : "none");
  });
}

interface BarData {
  start: Date;
  end: Date;
  id?: string;
  taskName?: string;
  rowKey?: string;
  labelText?: string;
}

export function updateLabelPositions(
  svg: d3.Selection<SVGGElement, unknown, null, undefined>,
  x: d3.ScaleTime<number, number>,
  labelPosition: LabelPosition
) {
  svg.selectAll<SVGGElement, BarData>(".duration-label-group").each(function (d) {
    const g = d3.select(this);
    const textEl = g.select<SVGTextElement>("text.duration-label");
    if (textEl.empty()) return;
    const pos = getLabelX(d, x, labelPosition);
    textEl
      .attr("x", pos.x)
      .attr("text-anchor", pos.anchor);
  });
}

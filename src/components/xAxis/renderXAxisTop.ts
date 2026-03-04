//render x axis top
import * as d3 from "d3";
import { VisualFormattingSettingsModel } from "../../settings";
import { esLocale } from "../../utils/esLocale";

function getMidTicks(intervals: Date[], domainEnd: Date): Date[] {
  return intervals.map((d, i) => {
    const start = d;
    const end = intervals[i + 1] || domainEnd;
    return new Date((start.getTime() + end.getTime()) / 2);
  });
}

export function renderXAxisTop(params: {
  xScale: d3.ScaleTime<number, number>;
  svg: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
  height: number;
  width: number;
  selectedFormat: string;
  translateX?: number;
  fmtSettings: VisualFormattingSettingsModel;
}): void {
  const {
    xScale,
    svg,
    height,
    width,
    selectedFormat,
    translateX = 0,
    fmtSettings
  } = params;

  const domainStart = xScale.domain()[0];
  const domainEnd = xScale.domain()[1];
  const axisFmt = fmtSettings.axisXCard;

  let intervals: Date[] = [];
  let labelFormat: (d: Date) => string;

  switch (selectedFormat) {
    case "Hora":
      intervals = d3.timeDays(domainStart, domainEnd);
      if (intervals.length === 0) intervals = [new Date(domainStart), new Date(domainEnd)];
      labelFormat = esLocale.format("%d/%m");
      break;
    case "Día":
      intervals = d3.timeMonths(domainStart, domainEnd);
      if (intervals.length === 0) intervals = [new Date(domainStart), new Date(domainEnd)];
      labelFormat = esLocale.format("%B");
      break;
    case "Mes":
      intervals = d3.timeYears(domainStart, domainEnd);
      if (intervals.length === 0) intervals = [new Date(domainStart), new Date(domainEnd)];
      labelFormat = d3.timeFormat("%Y");
      break;
    case "Año":
      intervals = d3.timeYears(domainStart, domainEnd);
      if (intervals.length === 0) intervals = [new Date(domainStart), new Date(domainEnd)];
      labelFormat = d3.timeFormat("%Y");
      break;
    case "Todo":
      intervals = d3.timeMonths(domainStart, domainEnd);
      if (intervals.length === 0) intervals = [new Date(domainStart), new Date(domainEnd)];
      labelFormat = esLocale.format("%B %Y");
      break;
    default:
      intervals = d3.timeMonths(domainStart, domainEnd);
      if (intervals.length === 0) intervals = [new Date(domainStart), new Date(domainEnd)];
      labelFormat = esLocale.format("%B %Y");
  }


  const labelData = intervals.slice(0, -1);
  const midPoints = getMidTicks(intervals, domainEnd);

  svg
    .attr("transform", `translate(${translateX}, 0)`)
    .attr("class", "x-axis-top");

  svg.selectAll("*").remove();

      if (selectedFormat !== "Año") {
    const labelData = intervals.slice(0, -1);
    svg.selectAll("text.x-label-top")
      .data(labelData)
      .enter()
      .append("text")
      .attr("class", "x-label-top")
      .attr("x", (d, i) => (xScale(d) + xScale(intervals[i + 1] ?? domainEnd)) / 2)
      .attr("y", height - 5)
      .attr("text-anchor", "middle")
      .attr("alignment-baseline", "baseline")
      .attr("font-size", axisFmt.fontSize.value)
      .attr("font-family", axisFmt.fontFamily.value)
      .attr("fill", axisFmt.fontColor.value.value)
      .attr("font-weight", axisFmt.bold.value ? "bold" : "normal")
      .attr("font-style", axisFmt.italic.value ? "italic" : "normal")
      .attr("text-decoration", axisFmt.underline.value ? "underline" : "none")
      .text(labelFormat);
  }
}

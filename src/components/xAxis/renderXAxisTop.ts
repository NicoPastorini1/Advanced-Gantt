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
      intervals = xScale.ticks(d3.timeDay.every(30));
      labelFormat = esLocale.format("%d %B");
      break;
    case "Día":
      intervals = d3.timeMonths(domainStart, domainEnd);
      labelFormat = esLocale.format("%B %y");
      break;
    case "Mes":
      intervals = d3.timeYears(domainStart, domainEnd);
      labelFormat = d3.timeFormat("%Y");
      break;
    case "Año":
      intervals = d3.timeYears(domainStart, domainEnd);
      labelFormat = d3.timeFormat("%Y");
      break;
    case "Todo":
      intervals = d3.timeMonths(domainStart, domainEnd);
      labelFormat = esLocale.format("%B %y");
      break;
    default:
      intervals = d3.timeMonths(domainStart, domainEnd);
      labelFormat = esLocale.format("%B %y");
  }


  const labelData = intervals.slice(0, -1);
  const midPoints = getMidTicks(intervals, domainEnd);

  svg
    .attr("transform", `translate(${translateX}, 0)`)
    .attr("class", "x-axis-top");

  svg.selectAll("*").remove();

      if(selectedFormat !== "Año"){
  svg.selectAll("text.x-label-top")
    .data(labelData)
    .enter()
    .append("text")
    .attr("class", "x-label-top")
    .attr("x", (d, i) => (xScale(d) + xScale(intervals[i + 1])) / 2)
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

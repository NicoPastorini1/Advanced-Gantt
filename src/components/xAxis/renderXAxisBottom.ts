import * as d3 from "d3";
import { VisualFormattingSettingsModel } from "../../settings";
import { esLocale } from "../../utils/esLocale";

type FormatType = 'Hora' | 'Día' | 'Mes' | 'Año' | 'Todo';


export function renderXAxisBottom(params: {
  xScale: d3.ScaleTime<number, number>;
  svg: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
  height: number;
  width: number;
  selectedFormat: FormatType;
  translateX?: number;
  fmtSettings: VisualFormattingSettingsModel;
}): void {
  const {
    xScale,
    svg,
    height,
    selectedFormat,
    translateX = 0,
    fmtSettings
  } = params;

  const domainStart = xScale.domain()[0];
  const domainEnd = xScale.domain()[1];
  const axisFmt = fmtSettings.axisXCard;
  const weekendFmt = fmtSettings.weekendCard;

  let formatFunc: (d: Date) => string;
  let intervals: Date[] = [];

  switch (selectedFormat) {
    case "Hora":
      const visibleHours = (domainEnd.getTime() - domainStart.getTime()) / (1000 * 60 * 60);
      const everyN = visibleHours > 48 ? 4 : visibleHours > 24 ? 2 : 1;
      formatFunc = esLocale.format("%H");
      intervals = xScale.ticks(d3.timeHour.every(everyN));
      break;
    case "Día":
      formatFunc = esLocale.format("%d");
      intervals = xScale.ticks(d3.timeDay.every(1));
      break;
    case "Mes":
      formatFunc = esLocale.format("%b");
      intervals = xScale.ticks(d3.timeMonth.every(1));
      break;
    case "Año":
      formatFunc = esLocale.format("%Y");
      intervals = xScale.ticks(d3.timeYear.every(1));
      break;
    case "Todo":
    default:
      formatFunc = esLocale.format("%d");
      intervals = xScale.ticks(d3.timeDay.every(1));
      break;
  }

  if (+intervals[intervals.length - 1] < +domainEnd) {
    intervals.push(new Date(domainEnd));
  }

  const labelData = intervals.slice(0, -1);

  svg
    .attr("class", "x-axis-bottom")
    .attr("transform", `translate(${translateX}, ${height})`);

  svg.selectAll("*").remove();

  if (selectedFormat === "Día" || selectedFormat === "Todo") {
    svg.selectAll("rect.x-label-bg")
      .data(labelData)
      .enter()
      .append("rect")
      .attr("class", "x-label-bg")
      .attr("x", (d, i) => Math.floor(xScale(d)))
      .attr("y", 0)
      .attr("width", (d, i) =>
        Math.floor(xScale(intervals[i + 1])) - Math.floor(xScale(d))
      )
      .attr("height", 40)
      .attr("stroke", "none")
      .attr("zindex", 1)
      .attr("fill", d =>
        (d.getDay() === 0 || d.getDay() === 6)
          ? weekendFmt.markerColor.value.value
          : "none"
      );
  }

  svg.selectAll("line.x-tick")
    .data(intervals)
    .enter()
    .append("line")
    .attr("class", "x-tick")
    .attr("x1", d => xScale(d))
    .attr("x2", d => xScale(d))
    .attr("y1", 30)
    .attr("y2", 0)
    .attr("stroke", "#bbb")
    .attr("stroke-width", 1.5);

  svg.append("line")
    .attr("class", "x-domain")
    .attr("x1", xScale.range()[0])
    .attr("x2", xScale.range()[1])
    .attr("y1", 30)
    .attr("y2", 30)
    .attr("stroke", "#bbb")
    .attr("stroke-width", 2);

  svg.selectAll("text.x-label")
    .data(labelData)
    .enter()
    .append("text")
    .attr("class", "x-label")
    .attr("x", (d, i) => (xScale(d) + xScale(intervals[i + 1])) / 2)
    .attr("y", 10)
    .attr("text-anchor", "middle")
    .attr("alignment-baseline", "hanging")
    .attr("font-size", axisFmt.fontSize.value)
    .attr("font-family", axisFmt.fontFamily.value)
    .attr("fill", axisFmt.fontColor.value.value)
    .attr("font-weight", axisFmt.bold.value ? "bold" : "normal")
    .attr("font-style", axisFmt.italic.value ? "italic" : "normal")
    .attr("text-decoration", axisFmt.underline.value ? "underline" : "none")
    .text(formatFunc);
}

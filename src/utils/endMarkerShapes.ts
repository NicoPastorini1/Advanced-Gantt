import * as d3 from "d3";

export function renderEndMarkerShape(
    selection: d3.Selection<SVGGElement, any, any, any>,
    shapeType: number,
    x: number,
    y: number,
    size: number,
    fill: string,
    stroke: string,
    strokeWidth: number
): void {
    selection.selectAll("*").remove();

    const halfSize = size;

    switch (shapeType) {
    case 1:
        selection.append("path")
            .attr("d", `M${x - halfSize},${y - halfSize} L${x + halfSize},${y} L${x - halfSize},${y + halfSize} Z`)
            .attr("fill", fill)
            .attr("stroke", stroke)
            .attr("stroke-width", strokeWidth);
        break;

    case 2:
        selection.append("circle")
            .attr("cx", x)
            .attr("cy", y)
            .attr("r", halfSize)
            .attr("fill", fill)
            .attr("stroke", stroke)
            .attr("stroke-width", strokeWidth);
        break;

    case 3:
        selection.append("path")
            .attr("d", `M${x},${y - halfSize} L${x + halfSize},${y} L${x},${y + halfSize} L${x - halfSize},${y} Z`)
            .attr("fill", fill)
            .attr("stroke", stroke)
            .attr("stroke-width", strokeWidth);
        break;

    case 4:
        selection.append("rect")
            .attr("x", x - 1)
            .attr("y", y - halfSize)
            .attr("width", 2)
            .attr("height", size)
            .attr("fill", fill)
            .attr("stroke", stroke)
            .attr("stroke-width", strokeWidth);
        break;

    case 5:
        break;

    default:
        selection.append("rect")
            .attr("x", x - halfSize)
            .attr("y", y - halfSize)
            .attr("width", size)
            .attr("height", size)
            .attr("fill", fill)
            .attr("stroke", stroke)
            .attr("stroke-width", strokeWidth);
        break;
}

}
import * as d3 from "d3";
import { VisualFormattingSettingsModel } from "../../settings";
export declare function renderXAxisBottom(params: {
    xScale: d3.ScaleTime<number, number>;
    svg: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
    height: number;
    width: number;
    selectedFormat: string;
    translateX?: number;
    fmtSettings: VisualFormattingSettingsModel;
}): void;

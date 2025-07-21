import * as d3 from "d3";
import { VisualFormattingSettingsModel } from "../../settings";
type FormatType = 'Hora' | 'Día' | 'Mes' | 'Año' | 'Todo';
export declare function renderXAxisBottom(params: {
    xScale: d3.ScaleTime<number, number>;
    svg: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
    height: number;
    width: number;
    selectedFormat: FormatType;
    translateX?: number;
    fmtSettings: VisualFormattingSettingsModel;
}): void;
export {};

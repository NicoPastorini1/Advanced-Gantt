import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import ISelectionID = powerbi.visuals.ISelectionId;
export interface BarDatum {
    id: string;
    start: Date;
    end: Date;
    rowKey: string;
    isGroup: boolean;
    index: number;
    completion?: number;
}
export interface GanttDataPoint {
    task: string;
    parent: string;
    startDate: Date;
    endDate: Date;
    color: string;
    selectionId: ISelectionID;
    index: number;
}
export declare class Visual implements IVisual {
    private container;
    private yAxisDiv;
    private yAxisSVG;
    private ganttDiv;
    private ganttSVG;
    private axisTopContentG;
    private axisBottomContentG;
    private leftBtns;
    private rightBtns;
    private leftG;
    private ganttG;
    private linesG;
    private landingG;
    private xAxisFixedG;
    private xAxisFixedDiv;
    private xAxisFixedSVG;
    private expanded;
    private cacheTasks;
    private groupRange;
    private selectedFormat;
    private lastOptions;
    private taskColCount;
    private taskColNames;
    private fmtService;
    private fmtSettings;
    private tooltipServiceWrapper;
    private allExpanded;
    private host;
    private ganttdataPoints;
    private currentZoomTransform?;
    private isZooming;
    private y;
    private getGroupBarPath;
    constructor(opts: VisualConstructorOptions);
    update(opts: VisualUpdateOptions): void;
    private renderLanding;
    getFormattingModel(): powerbi.visuals.FormattingModel;
    private parseData;
    private buildRows;
    private redrawZoomedElements;
}

import powerbi from "powerbi-visuals-api";
import ISelectionId = powerbi.visuals.ISelectionId;
import FormattingId = powerbi.visuals.FormattingId;
export interface Task {
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
    extraCols?: string[];
    legend?: string;
    legendEntries?: Task[];
}
export interface VisualRow {
    id: string;
    isGroup: boolean;
    task?: Task;
    rowKey: string;
    labelY: string;
    duration?: number;
    extraCols?: string[];
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
    selectionId: ISelectionId;
    legend?: string;
    gradientId?: string;
}
export interface GanttDataPoint {
    task: string;
    parent: string;
    startDate: Date;
    endDate: Date;
    color: string;
    selectionId: ISelectionId;
    index: number;
    completion?: number;
    secondaryStart?: Date;
    secondaryEnd?: Date;
}
export interface LegendDataPoint {
    legend: string;
    color: string;
    selectionId: ISelectionId;
    index: number;
    formattingId: FormattingId;
}
export type FormatType = 'Hora' | 'Día' | 'Mes' | 'Año' | 'Todo';
export interface GroupRange {
    start: Date;
    end: Date;
    secondaryStart?: Date;
    secondaryEnd?: Date;
}
export interface DependencyInfo {
    from: string;
    to: string;
}
export interface DependencyLine {
    fromRow: VisualRow;
    toRow: VisualRow;
}
export interface Margins {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
export interface ColumnWidths {
    task: number;
    start: number;
    end: number;
    extra: number[];
    secondaryStart?: number;
    secondaryEnd?: number;
    duration?: number;
}

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
  timelineDate?: Date;
  legendEntries?: Task[];
}

export interface VisualRow {
  id: string;
  isGroup: boolean;
  isTask?: boolean;
  isLegendGroup?: boolean;
  task?: Task;
  legendItems?: Task[];
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
  resolvedColor?: string;
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

export interface ParseDataResult {
  tasks: Task[];
  secondaryStartName: string;
  secondaryEndName: string;
  startName: string;
  endName: string;
  parentName: string;
  extraColNames: string[];
  taskColCount: number;
  taskColNames: string[];
}

export interface BuildRowsResult {
  visibleRows: VisualRow[];
  expanded: Map<string, boolean>;
}

export interface GroupRange {
  start: Date;
  end: Date;
  secondaryStart?: Date;
  secondaryEnd?: Date;
}

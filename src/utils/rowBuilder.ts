import * as d3 from "d3";
import { Task, VisualRow, GroupRange } from "../types";

export function buildRows(
  tasks: Task[],
  cache: Map<string, boolean>,
  showSubChildren = true
): { visibleRows: VisualRow[]; expanded: Map<string, boolean>; groupRange: Map<string, GroupRange> } {
  const rows: VisualRow[] = [];
  const groupRange = new Map<string, GroupRange>();

  const groupedByParent = d3.group(tasks, t => t.parent);
  for (const [parent, parentTasks] of groupedByParent.entries()) {
    const parentId = `P:${parent}`;
    const parentExp = cache.get(parentId) ?? false;

    groupRange.set(parentId, {
      start: d3.min(parentTasks, d => d.start)!,
      end: d3.max(parentTasks, d => d.end)!,
      secondaryStart: d3.min(parentTasks, d => d.secondaryStart),
      secondaryEnd: d3.max(parentTasks, d => d.secondaryEnd)
    });

    rows.push({
      id: parentId,
      isGroup: true,
      isTask: false,
      rowKey: parentId,
      labelY: parent!
    });

    if (parentExp) {
      const groupedByTask = d3.group(parentTasks, t => t.id);
      for (const [taskId, taskItems] of groupedByTask.entries()) {
        const taskRowId = `T:${taskId}|${parent}`;
        const taskExp = showSubChildren ? (cache.get(taskRowId) ?? false) : false;

        groupRange.set(taskRowId, {
          start: d3.min(taskItems, d => d.start)!,
          end: d3.max(taskItems, d => d.end)!,
          secondaryStart: d3.min(taskItems, d => d.secondaryStart),
          secondaryEnd: d3.max(taskItems, d => d.secondaryEnd)
        });

        rows.push({
          id: taskRowId,
          isGroup: true,
          isTask: true,
          rowKey: taskRowId,
          labelY: taskId,
          task: taskItems[0],
          legendItems: taskItems
        });

        cache.set(taskRowId, taskExp);
      }
    }
    cache.set(parentId, parentExp);
  }

  return { visibleRows: rows, expanded: cache, groupRange };
}

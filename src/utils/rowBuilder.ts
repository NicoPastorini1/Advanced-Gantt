import * as d3 from "d3";
import { Task, VisualRow, BuildRowsResult, GroupRange } from "../types";

export function buildRows(
  tasks: Task[],
  cache: Map<string, boolean>
): { visibleRows: VisualRow[]; expanded: Map<string, boolean>; groupRange: Map<string, GroupRange> } {
  const rows: VisualRow[] = [];
  const groupRange = new Map<string, GroupRange>();

  const tasksByIdParent = new Map<string, Task[]>();
  tasks.forEach(t => {
    const key = `${t.id}|${t.parent}`;
    if (!tasksByIdParent.has(key)) {
      tasksByIdParent.set(key, []);
    }
    tasksByIdParent.get(key)!.push(t);
  });

  const uniqueTasks: Task[] = [];
  tasksByIdParent.forEach((entries, key) => {
    const firstEntry = entries[0];
    uniqueTasks.push({
      ...firstEntry,
      timelineDate: entries.find(e => e.timelineDate instanceof Date)?.timelineDate,
      legendEntries: entries
    } as any);
  });

  const grouped = d3.group(uniqueTasks, t => t.parent);
  for (const [parent, list] of grouped.entries()) {
    const allEntries: Task[] = [];
    list.forEach(t => {
      const entries = (t as any).legendEntries || [t];
      allEntries.push(...entries);
    });

    groupRange.set(parent!, {
      start: d3.min(allEntries, d => d.start)!,
      end: d3.max(allEntries, d => d.end)!,
      secondaryStart: d3.min(allEntries, d => d.secondaryStart),
      secondaryEnd: d3.max(allEntries, d => d.secondaryEnd)
    });
    const groupDuration = list.reduce((sum, t) => {
      const dur = Number(t.fields[t.fields.length - 1]);
      return sum + (isNaN(dur) ? 0 : dur);
    }, 0);

    rows.push({
      id: parent!,
      isGroup: true,
      rowKey: `G:${parent}`,
      labelY: parent!,
      duration: groupDuration
    });

    const exp = cache.get(parent!) ?? false;
    if (exp) {
      list.forEach(t => {
        rows.push({
          id: t.id,
          isGroup: false,
          task: t,
          rowKey: `T:${t.id}|${parent}`,
          labelY: t.id
        });
      });
    }
    cache.set(parent!, exp);
  }
  return { visibleRows: rows, expanded: cache, groupRange };
}

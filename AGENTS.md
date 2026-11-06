# AGENTS.md

Power BI custom visual (Gantt) built with TypeScript + D3. No backend, no test suite; it runs inside Power BI Desktop / Service.

## Commands

- `npm install`
- `npm run package` — full build and the real verification gate: ESLint + TypeScript/webpack compile + `.pbiviz` output in `dist/`. Use this before finishing changes.
- `npm run lint` — ESLint only (`npx eslint .`), fast check.
- `npm start` — `pbiviz start` dev server; requires Power BI developer mode and a trusted pbiviz certificate (package checks the cert).
- `npx pbiviz package --verbose` — diagnostics when packaging fails.

Do not run bare `npx tsc --noEmit`: `powerbi-visuals-utils-formattingmodel` ships its own copy of `powerbi-visuals-api`, producing duplicate-declaration errors (TS6200/TS2374) unrelated to this code. `pbiviz package` is the typecheck.

There are no unit/integration tests. Verify behavior manually by loading the packaged `.pbiviz` in Power BI Desktop.

`watch_and_package.bat` is Windows-only and calls `chokidar`, which is not in `package.json`.

## Architecture

- Entry point: `src/visual.ts`, class `Visual implements IVisual`. Constructor builds the DOM shell; `update()` tears down and rebuilds all SVG/DOM on every call (~1,600 lines). Zoom uses the incremental path `redrawZoomedElements()` instead. When changing rows, bars, axes, or labels, check both paths.
- `src/settings.ts` defines `VisualFormattingSettingsModel`. Every formatting card must be (a) registered in `Model.cards` and (b) backed by an object in `capabilities.json`; otherwise it won't appear.
- `capabilities.json` defines data roles and the categorical `select` order. `createSelectorDataPoints()` in `src/utils/dataParser.ts` assumes `categories[0]` is task and `categories[1]` is parent. Do not reorder roles/select without updating parsing.
- `src/utils/dataParser.ts` maps roles to `Task`. `columns` is `GroupingOrMeasure`, so it can appear in both categories and values; both are handled.
- `src/utils/rowBuilder.ts` builds hierarchy rows with keys `P:<parent>` and `T:<taskId>|<parent>`. Group rows always render; task rows render when the parent expansion cache entry is true.
- Bar `rowKey` formats are load-bearing: `P:`/`G:` for groups, `T:<task>|<parent>` for child bars. `getBarColor()` (`src/utils/colorManager.ts`) and `completionCalculator.ts` parse these prefixes.
- Legend colors are persisted as a JSON string in `legendColorState.colorMap`; parent colors use the `colorSelector` object.
- Bar/path and completion caches (`barPaths.ts`, `completionCalculator.ts`) are module-level and cleared at the start of each `update()`. If you add caching, keep invalidation aligned with data updates.

## Repo-specific gotchas

- The visual is Spanish-first. `FormatType` is the union `'Hora' | 'Día' | 'Mes' | 'Año' | 'Todo'` and is persisted in `formatState.selectedFormat`. Do not translate these literals without changing zoom logic and persistence. Most UI labels (format buttons, parent buttons, landing page, settings `displayName`s) are hardcoded Spanish; `stringResources/` exists but is not the source for most strings.
- Zoom thresholds are duplicated in `src/components/xAxis/renderXAxisBottom.ts` and `Visual.updateSelectedFormatFromZoom()` in `visual.ts`. Keep them in sync.
- `renderXAxisBottom.ts` contains verbose `console.log` debug statements in the zoom hot path; avoid adding more.
- `update()` early-returns for updates that are not Data, Resize, or ViewMode. Formatting/UI changes must call `update(..., true)`, `redrawZoomedElements()`, or persist properties to take effect.
- Style entry is `style/visual.less` (referenced by `pbiviz.json`, also imported at the top of `src/visual.ts`). New LESS files must be imported.
- Package version comes from `pbiviz.json` `visual.version` (currently `1.0.0.21`), not `package.json` (`1.0.0.5`). Bump `pbiviz.json` when producing a new `.pbiviz`.
- Generated/ignored: `dist/`, `.tmp/`, `node_modules/`, `*.pbiviz`. Never edit them. `webpack.statistics.prod.html` is ignored; `webpack.statistics.dev.html` is tracked.

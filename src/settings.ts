"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsSlice = formattingSettings.SimpleSlice;
import FormattingSettingsGroup = formattingSettings.Group;
import Card = formattingSettings.SimpleCard;
import { Model, Slice, ColorPicker, SimpleCard, NumUpDown, ToggleSwitch, FontControl, CompositeCard, FontPicker } from "powerbi-visuals-utils-formattingmodel/lib/FormattingSettingsComponents";
import { GanttDataPoint } from "./visual";

/* DATA COLORS */

class ColorSelectorCardSettings extends SimpleCard {
    name: string = "colorSelector";
    displayName?: string = "Color del padre";
    slices: Slice[] = [];
}

class LegendDataPointCardSettings extends SimpleCard {
    name: string = "legendColorSelector";
    displayName?: string = "Legend colors";
    slices: Slice[] = [];
}

/* ────────────────────────────────
   EJE Y
──────────────────────────────── */
class AxisYCardSettings extends SimpleCard {

    name = "axisY";
    displayName = "Eje Y";

    public showLine: ToggleSwitch = new ToggleSwitch({
        name: "showLine",
        displayName: "Mostrar línea",
        value: true
    });

    public widthLine: NumUpDown = new NumUpDown({
        name: "widthLine",
        displayName: "Grosor de línea",
        value: 0.5
    });

    public lineColor: ColorPicker = new ColorPicker({
        name: "lineColor",
        displayName: "Color de línea",
        value: { value: "#666666" }
    });

    public tickColor: ColorPicker = new ColorPicker({
        name: "tickColor",
        displayName: "Color de ticks",
        value: { value: "#666666" }
    });

    public labelDisplayUnits: NumUpDown = new NumUpDown({
        name: "labelDisplayUnits",
        displayName: "Unidades de etiqueta",
        value: 0
    });


    public slices: FormattingSettingsSlice[] = [
        this.showLine,
        this.lineColor,
        this.tickColor,
        this.labelDisplayUnits,
        this.widthLine
    ];
}

class LegendCardSettings extends formattingSettings.SimpleCard {
    public show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Mostrar leyenda",
        value: true,
    });

    public position = new formattingSettings.ItemDropdown({
        name: "position",
        displayName: "Posición",
        items: [
            { displayName: "Arriba", value: "Top" },
            { displayName: "Abajo", value: "Bottom" },
            { displayName: "Izquierda", value: "Left" },
            { displayName: "Derecha", value: "Right" }
        ],
        value: { displayName: "Arriba", value: "Top" }
    });

    public fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Tamaño de fuente",
        value: 12,
        options: {
            minValue: { type: powerbi.visuals.ValidatorType.Min, value: 8 },
            maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 24 }
        }
    });

    public fontColor = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayName: "Color de texto",
        value: { value: "#333333" }
    });

    public backgroundColor = new formattingSettings.ColorPicker({
        name: "backgroundColor",
        displayName: "Color de fondo",
        value: { value: "#FFFFFF" }
    });

    public showTitle = new formattingSettings.ToggleSwitch({
        name: "showTitle",
        displayName: "Mostrar título",
        value: true,
    });

    public titleText = new formattingSettings.TextInput({
        name: "titleText",
        displayName: "Texto del título",
        value: "Categorías",
        placeholder: "Título de la leyenda"
    });

    name: string = "legend";
    displayName: string = "Leyenda";
    slices = [
        this.show,
        this.position,
        this.fontSize,
        this.fontColor,
        this.backgroundColor,
        this.showTitle,
        this.titleText
    ];
}
/* ────────────────────────────────
   EJE X
──────────────────────────────── */
class AxisXCardSettings extends SimpleCard {
    name: string = "axisXCard";
    displayName: string = "Eje X";

    public fontFamily: FontPicker = new FontPicker({
        name: "fontFamily",
        value: "Arial, sans-serif"
    });

    public fontSize: NumUpDown = new NumUpDown({
        name: "fontSize",
        value: 15
    });

    public bold: ToggleSwitch = new ToggleSwitch({
        name: "bold",
        value: false
    });

    public italic: ToggleSwitch = new ToggleSwitch({
        name: "italic",
        value: false
    });

    public underline: ToggleSwitch = new ToggleSwitch({
        name: "underline",
        value: false
    });

    public fontColor: ColorPicker = new ColorPicker({
        name: "fontColor",
        value: { value: "#000000" },
        displayName: "Color de fuente"
    });

    public font: FontControl = new FontControl({
        name: "font",
        displayName: "Fuente",
        fontFamily: this.fontFamily,
        fontSize: this.fontSize,
        bold: this.bold,
        italic: this.italic,
        underline: this.underline
    });


    public slices: formattingSettings.Slice[] = [this.font];
}

/* ────────────────────────────────
   BARRAS
──────────────────────────────── */
class BarLabelStyleGroup extends SimpleCard {
    name: string = "BarLabelStyleGroup";
    displayName: string = "Etiqueta";

    public fontFamily: FontPicker = new FontPicker({
        name: "fontFamily",
        value: "Arial, sans-serif"
    });

    public fontSize: NumUpDown = new NumUpDown({
        name: "fontSize",
        value: 15
    });

    public bold: ToggleSwitch = new ToggleSwitch({
        name: "bold",
        value: false
    });

    public italic: ToggleSwitch = new ToggleSwitch({
        name: "italic",
        value: false
    });

    public underline: ToggleSwitch = new ToggleSwitch({
        name: "underline",
        value: false
    });

    public fontColor: ColorPicker = new ColorPicker({
        name: "fontColor",
        value: { value: "#000000" },
        displayName: "Color de fuente"
    });

    public font: FontControl = new FontControl({
        name: "font",
        displayName: "Fuente",
        fontFamily: this.fontFamily,
        fontSize: this.fontSize,
        bold: this.bold,
        italic: this.italic,
        underline: this.underline
    });


    public slices: formattingSettings.Slice[] = [this.font];
}

class BarStyleGroup extends FormattingSettingsGroup {
    constructor() {
        super({
            displayName: "Estilo de barra",
            name: "barStyleGroup",
            slices: [
                new NumUpDown({
                    name: "barHeight",
                    displayName: "Alto de barra",
                    description: "Altura en píxeles; 0 = automático",
                    value: 30
                }),
                new formattingSettings.Slider({
                    name: "cornerRadius",
                    displayName: "Radio de esquinas",
                    value: 5
                }),
                new formattingSettings.Slider({
                    name: "opacity",
                    displayName: "Opacidad",
                    description: "0 = transparente, 1 = sólido",
                    value: 0.8
                }),
                new NumUpDown({
                    name: "strokeWidth",
                    displayName: "Ancho de borde",
                    value: 3
                })
            ]
        });
    }
}


class TodayMarkerStyleGroup extends SimpleCard {
    name: string = "todayMarkerGroup";
    displayName: string = "Today Marker";

    public fontFamily: FontPicker = new FontPicker({
        name: "fontFamily",
        value: "Arial, sans-serif"
    });

    public fontSize: NumUpDown = new NumUpDown({
        name: "fontSize",
        value: 15
    });

    public bold: ToggleSwitch = new ToggleSwitch({
        name: "bold",
        value: false
    });

    public italic: ToggleSwitch = new ToggleSwitch({
        name: "italic",
        value: false
    });

    public underline: ToggleSwitch = new ToggleSwitch({
        name: "underline",
        value: false
    });

    public fontColor: ColorPicker = new ColorPicker({
        name: "fontColor",
        value: { value: "#ff2929ff" },
        displayName: "Color de fuente"
    });



    public font: FontControl = new FontControl({
        name: "font",
        displayName: "Fuente",
        fontFamily: this.fontFamily,
        fontSize: this.fontSize,
        bold: this.bold,
        italic: this.italic,
        underline: this.underline
    });

    public markColor = new ColorPicker({
        name: "barColor",
        displayName: "Color de marcador",
        value: { value: "#ff2929ff" }
    });

    public slices: formattingSettings.Slice[] = [this.font, this.markColor];
}

class labelCardSettings extends SimpleCard {
    show = new ToggleSwitch({
        name: "show",
        displayName: "Mostrar etiqueta de duración",
        value: true
    });

    fontColor = new ColorPicker({
        name: "fontColor",
        displayName: "Color de fuente",
        value: { value: "#000000" }
    });

    backgroundColor = new ColorPicker({
        name: "backgroundColor",
        displayName: "Color de fondo",
        value: { value: "#ffffffff" }
    });

    fontSize = new NumUpDown({
        name: "fontSize",
        displayName: "Tamaño de fuente",
        value: 15
    });

    fontFamily = new FontPicker({
        name: "fontFamily",
        displayName: "Fuente",
        value: "Segoe UI"
    });

    name = "labelCard";
    displayName = "Etiquetas";
    slices: FormattingSettingsSlice[] = [this.show, this.fontColor, this.backgroundColor, this.fontSize, this.fontFamily];
}

/* Grupos compuestos */

class BarCardSettings extends CompositeCard {
    name = "barCard";
    displayName = "Barras";

    labelGroup = new BarLabelStyleGroup();
    barGroup = new BarStyleGroup();

    groups: formattingSettings.Group[] = [this.labelGroup, this.barGroup];
}

class TimeMarkerCardSettings extends CompositeCard {
    name = "timeMarkerCard";
    displayName = "Time Marker";

    todayGroup = new TodayMarkerStyleGroup();

    groups: formattingSettings.Group[] = [this.todayGroup];
}

/* ────────────────────────────────
   Encabezados
──────────────────────────────── */
class HeaderCardSettings extends SimpleCard {
    show = new ToggleSwitch({
        name: "show",
        displayName: "Mostrar encabezados",
        value: true
    });

    fontColor = new ColorPicker({
        name: "fontColor",
        displayName: "Color de fuente",
        value: { value: "#000000" }
    });

    backgroundColor = new ColorPicker({
        name: "backgroundColor",
        displayName: "Color de fondo",
        value: { value: "#ffffffff" }
    });

    fontSize = new NumUpDown({
        name: "fontSize",
        displayName: "Tamaño de fuente",
        value: 15
    });

    fontFamily = new FontPicker({
        name: "fontFamily",
        displayName: "Fuente",
        value: "Segoe UI"
    });

    name = "headerStyle";
    displayName = "Encabezados";
    slices: FormattingSettingsSlice[] = [this.show, this.fontColor, this.backgroundColor, this.fontSize, this.fontFamily];
}

/* ────────────────────────────────
   Tareas
──────────────────────────────── */
class TaskCardSetting extends SimpleCard {
    show = new ToggleSwitch({
        name: "show",
        displayName: "Mostrar tareas",
        value: true
    });

    showSecondaryColumns = new ToggleSwitch({
        name: "showSecondary",
        displayName: "Mostrar campos de Secondary",
        value: false
    });

    taskHeight = new NumUpDown({
        name: "taskHeight",
        displayName: "Alto de tarea",
        description: "Altura en píxeles; 0 = automático",
        value: 40
    });

    taskWidth = new NumUpDown({
        name: "taskWidth",
        displayName: "Ancho columna de tarea",
        description: "Altura en píxeles; 0 = automático",
        value: 250
    });

    startWidth = new NumUpDown({
        name: "startWidth",
        displayName: "Ancho columna de inicio",
        description: "Altura en píxeles; 0 = automático",
        value: 160
    });

    endWidth = new NumUpDown({
        name: "endWidth",
        displayName: "Ancho columna de fin",
        description: "Altura en píxeles; 0 = automático",
        value: 160
    });

    secStartWidth = new NumUpDown({
        name: "secStartWidth",
        displayName: "Ancho columna de inicio secundaria",
        description: "Altura en píxeles; 0 = automático",
        value: 160
    });

    secEndWidth = new NumUpDown({
        name: "secEndWidth",
        displayName: "Ancho columna de fin secundaria",
        description: "Altura en píxeles; 0 = automático",
        value: 160
    });

    fontColor = new ColorPicker({
        name: "fontColor",
        displayName: "Color de fuente",
        value: { value: "#000000" }
    });

    fontSize = new NumUpDown({
        name: "fontSize",
        displayName: "Tamaño de fuente",
        value: 15
    });

    fontFamily = new FontPicker({
        name: "fontFamily",
        displayName: "Fuente",
        value: "Segoe UI"
    });

    name = "taskStyle";
    displayName = "Tareas";
    slices: FormattingSettingsSlice[] = [this.show, this.showSecondaryColumns, this.taskHeight, this.fontColor, this.fontSize, this.fontFamily, this.taskWidth, this.startWidth, this.endWidth, this.secStartWidth, this.secEndWidth];
}

/* ────────────────────────────────
   Parent
──────────────────────────────── */
class ParentCardSetting extends SimpleCard {
    show = new ToggleSwitch({
        name: "show",
        displayName: "Mostrar Parent",
        value: true
    });

    fontColor = new ColorPicker({
        name: "fontColor",
        displayName: "Color de fuente",
        value: { value: "#000000" }
    });
    backgroundColor = new ColorPicker({
        name: "backgroundColor",
        displayName: "Color de fondo",
        value: { value: "#F3F7FAFF" }
    });
    fontSize = new NumUpDown({
        name: "fontSize",
        displayName: "Tamaño de fuente",
        value: 15
    });
    fontFamily = new FontPicker({
        name: "fontFamily",
        displayName: "Fuente",
        value: "Segoe UI"
    });

    name = "parentStyle";
    displayName = "Parent";
    slices: FormattingSettingsSlice[] = [this.show, this.fontColor, this.backgroundColor, this.fontSize, this.fontFamily];
}
/* ______________________
      Weekend
____________________*/
class WeekendCardSettings extends SimpleCard {
    show = new ToggleSwitch({
        name: "show",
        displayName: "Mostrar marcador",
        value: true
    })
    markerColor = new ColorPicker({
        name: "markerColor",
        displayName: "Color de marcador",
        value: { value: "#E6E6E6" }
    })
    name = "weekendCard";
    displayName = "Weekend";
    slices: formattingSettings.Slice[] = [this.show, this.markerColor]
}
/* ______________________
      Completion Label
____________________*/
class completionCardSettings extends SimpleCard {
    name: string = "completionStyleGroup";
    displayName: string = "Etiqueta % de completado";

    public fontFamily: FontPicker = new FontPicker({
        name: "fontFamily",
        value: "Arial, sans-serif"
    });

    public fontSize: NumUpDown = new NumUpDown({
        name: "fontSize",
        value: 15
    });

    public bold: ToggleSwitch = new ToggleSwitch({
        name: "bold",
        value: false
    });

    public italic: ToggleSwitch = new ToggleSwitch({
        name: "italic",
        value: false
    });

    public underline: ToggleSwitch = new ToggleSwitch({
        name: "underline",
        value: false
    });

    public fontColor: ColorPicker = new ColorPicker({
        name: "fontColor",
        value: { value: "#ffffffff" },
        displayName: "Color de fuente"
    });

    public font: FontControl = new FontControl({
        name: "font",
        displayName: "Fuente",
        fontFamily: this.fontFamily,
        fontSize: this.fontSize,
        bold: this.bold,
        italic: this.italic,
        underline: this.underline
    });


    public slices: formattingSettings.Slice[] = [this.font];
}
/* ────────────────────────────────
   MODELO GLOBAL
──────────────────────────────── */
export class VisualFormattingSettingsModel extends Model {
    axisYCard = new AxisYCardSettings();
    axisXCard = new AxisXCardSettings();
    barCard = new BarCardSettings();
    headerCard = new HeaderCardSettings();
    taskCard = new TaskCardSetting();
    parentCard = new ParentCardSetting();
    colorSelector = new ColorSelectorCardSettings();
    legendDataPoint = new LegendDataPointCardSettings();
    weekendCard = new WeekendCardSettings();
    completionCard = new completionCardSettings();
    timeMarkerCard = new TimeMarkerCardSettings();
    legend = new LegendCardSettings();
    labelCard = new labelCardSettings();

    cards: Card[] = [
        this.axisXCard,
        this.axisYCard,
        this.barCard,
        this.headerCard,
        this.taskCard,
        this.parentCard,
        this.colorSelector,
        this.legendDataPoint,
        this.weekendCard,
        this.completionCard,
        this.timeMarkerCard,
        this.legend,
        this.labelCard
    ];

    populateColorSelector(dataPoints: GanttDataPoint[]) {
        this.colorSelector.slices = [];
        const slices: Slice[] = this.colorSelector.slices;
        if (dataPoints) {
            dataPoints.forEach(dataPoint => {
                slices.push(new ColorPicker({
                    name: "fill",
                    displayName: dataPoint.parent,
                    value: { value: dataPoint.color },
                    selector: dataPoint.selectionId.getSelector(),
                }));
            });
        }
    }

    populateLegendDataPointSlices(dataPoints: any[]) {
        this.legendDataPoint.slices = [];
        const slices: Slice[] = this.legendDataPoint.slices;
        if (dataPoints) {
            dataPoints.forEach(dataPoint => {
                slices.push(new ColorPicker({
                    name: "fill",
                    displayName: dataPoint.legend,
                    value: { value: dataPoint.color },
                    selector: dataPoint.selectionId.getSelector()
                }));
            });
        }
    }

}

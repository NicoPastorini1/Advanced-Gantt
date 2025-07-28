import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsSlice = formattingSettings.SimpleSlice;
import FormattingSettingsGroup = formattingSettings.Group;
import Card = formattingSettings.SimpleCard;
import { Model, Slice, ColorPicker, SimpleCard, NumUpDown, ToggleSwitch, FontControl, CompositeCard, FontPicker } from "powerbi-visuals-utils-formattingmodel/lib/FormattingSettingsComponents";
import { GanttDataPoint } from "./visual";
declare class ColorSelectorCardSettings extends SimpleCard {
    name: string;
    displayName?: string;
    slices: Slice[];
}
declare class AxisYCardSettings extends SimpleCard {
    name: string;
    displayName: string;
    showLine: ToggleSwitch;
    widthLine: NumUpDown;
    lineColor: ColorPicker;
    tickColor: ColorPicker;
    labelDisplayUnits: NumUpDown;
    slices: FormattingSettingsSlice[];
}
declare class AxisXCardSettings extends SimpleCard {
    name: string;
    displayName: string;
    fontFamily: FontPicker;
    fontSize: NumUpDown;
    bold: ToggleSwitch;
    italic: ToggleSwitch;
    underline: ToggleSwitch;
    fontColor: ColorPicker;
    font: FontControl;
    slices: formattingSettings.Slice[];
}
declare class BarLabelStyleGroup extends SimpleCard {
    name: string;
    displayName: string;
    fontFamily: FontPicker;
    fontSize: NumUpDown;
    bold: ToggleSwitch;
    italic: ToggleSwitch;
    underline: ToggleSwitch;
    fontColor: ColorPicker;
    font: FontControl;
    slices: formattingSettings.Slice[];
}
declare class BarStyleGroup extends FormattingSettingsGroup {
    constructor();
}
declare class BarCardSettings extends CompositeCard {
    name: string;
    displayName: string;
    labelGroup: BarLabelStyleGroup;
    barGroup: BarStyleGroup;
    groups: formattingSettings.Group[];
}
declare class HeaderCardSettings extends SimpleCard {
    show: formattingSettings.ToggleSwitch;
    fontColor: formattingSettings.ColorPicker;
    backgroundColor: formattingSettings.ColorPicker;
    fontSize: formattingSettings.NumUpDown;
    fontFamily: formattingSettings.FontPicker;
    name: string;
    displayName: string;
    slices: FormattingSettingsSlice[];
}
declare class TaskCardSetting extends SimpleCard {
    show: formattingSettings.ToggleSwitch;
    taskHeight: formattingSettings.NumUpDown;
    fontColor: formattingSettings.ColorPicker;
    fontSize: formattingSettings.NumUpDown;
    fontFamily: formattingSettings.FontPicker;
    name: string;
    displayName: string;
    slices: FormattingSettingsSlice[];
}
declare class ParentCardSetting extends SimpleCard {
    show: formattingSettings.ToggleSwitch;
    fontColor: formattingSettings.ColorPicker;
    backgroundColor: formattingSettings.ColorPicker;
    fontSize: formattingSettings.NumUpDown;
    fontFamily: formattingSettings.FontPicker;
    name: string;
    displayName: string;
    slices: FormattingSettingsSlice[];
}
declare class WeekendCardSettings extends SimpleCard {
    show: formattingSettings.ToggleSwitch;
    markerColor: formattingSettings.ColorPicker;
    name: string;
    displayName: string;
    slices: formattingSettings.Slice[];
}
declare class completionCardSettings extends SimpleCard {
    name: string;
    displayName: string;
    fontFamily: FontPicker;
    fontSize: NumUpDown;
    bold: ToggleSwitch;
    italic: ToggleSwitch;
    underline: ToggleSwitch;
    fontColor: ColorPicker;
    font: FontControl;
    slices: formattingSettings.Slice[];
}
declare class adminSettings extends SimpleCard {
    Alto: formattingSettings.NumUpDown;
    Ancho: formattingSettings.NumUpDown;
    Pad: formattingSettings.NumUpDown;
    mTop: formattingSettings.NumUpDown;
    mBottom: formattingSettings.NumUpDown;
    mLeft: formattingSettings.NumUpDown;
    mRight: formattingSettings.NumUpDown;
    name: string;
    displayName: string;
    slices: formattingSettings.Slice[];
}
export declare class VisualFormattingSettingsModel extends Model {
    axisYCard: AxisYCardSettings;
    axisXCard: AxisXCardSettings;
    barCard: BarCardSettings;
    headerCard: HeaderCardSettings;
    taskCard: TaskCardSetting;
    parentCard: ParentCardSetting;
    adminCard: adminSettings;
    colorSelector: ColorSelectorCardSettings;
    weekendCard: WeekendCardSettings;
    completionCard: completionCardSettings;
    cards: Card[];
    populateColorSelector(dataPoints: GanttDataPoint[]): void;
}
export {};

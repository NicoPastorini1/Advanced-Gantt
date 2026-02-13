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
declare class LegendDataPointCardSettings extends SimpleCard {
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
declare class LegendCardSettings extends formattingSettings.SimpleCard {
    show: formattingSettings.ToggleSwitch;
    position: formattingSettings.ItemDropdown;
    fontSize: formattingSettings.NumUpDown;
    fontColor: formattingSettings.ColorPicker;
    backgroundColor: formattingSettings.ColorPicker;
    showTitle: formattingSettings.ToggleSwitch;
    titleText: formattingSettings.TextInput;
    name: string;
    displayName: string;
    slices: (formattingSettings.ToggleSwitch | formattingSettings.NumUpDown | formattingSettings.ColorPicker | formattingSettings.ItemDropdown | formattingSettings.TextInput)[];
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
declare class TodayMarkerStyleGroup extends SimpleCard {
    name: string;
    displayName: string;
    fontFamily: FontPicker;
    fontSize: NumUpDown;
    bold: ToggleSwitch;
    italic: ToggleSwitch;
    underline: ToggleSwitch;
    fontColor: ColorPicker;
    font: FontControl;
    markColor: formattingSettings.ColorPicker;
    slices: formattingSettings.Slice[];
}
declare class labelCardSettings extends SimpleCard {
    show: formattingSettings.ToggleSwitch;
    fontColor: formattingSettings.ColorPicker;
    backgroundColor: formattingSettings.ColorPicker;
    fontSize: formattingSettings.NumUpDown;
    fontFamily: formattingSettings.FontPicker;
    name: string;
    displayName: string;
    slices: FormattingSettingsSlice[];
}
declare class BarCardSettings extends CompositeCard {
    name: string;
    displayName: string;
    labelGroup: BarLabelStyleGroup;
    barGroup: BarStyleGroup;
    groups: formattingSettings.Group[];
}
declare class TimeMarkerCardSettings extends CompositeCard {
    name: string;
    displayName: string;
    todayGroup: TodayMarkerStyleGroup;
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
    showSecondaryColumns: formattingSettings.ToggleSwitch;
    taskHeight: formattingSettings.NumUpDown;
    taskWidth: formattingSettings.NumUpDown;
    startWidth: formattingSettings.NumUpDown;
    endWidth: formattingSettings.NumUpDown;
    secStartWidth: formattingSettings.NumUpDown;
    secEndWidth: formattingSettings.NumUpDown;
    fontColor: formattingSettings.ColorPicker;
    fontSize: formattingSettings.NumUpDown;
    fontFamily: formattingSettings.FontPicker;
    name: string;
    displayName: string;
    slices: FormattingSettingsSlice[];
}
declare class SecondaryBarCardSettings extends SimpleCard {
    name: string;
    displayName: string;
    show: ToggleSwitch;
    barHeight: NumUpDown;
    opacity: formattingSettings.Slider;
    barColor: ColorPicker;
    strokeColor: ColorPicker;
    strokeWidth: NumUpDown;
    lineStyle: formattingSettings.ItemDropdown;
    endMarkerShape: NumUpDown;
    endMarkerSize: NumUpDown;
    slices: formattingSettings.Slice[];
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
export declare class VisualFormattingSettingsModel extends Model {
    axisYCard: AxisYCardSettings;
    axisXCard: AxisXCardSettings;
    barCard: BarCardSettings;
    secondaryBarCard: SecondaryBarCardSettings;
    headerCard: HeaderCardSettings;
    taskCard: TaskCardSetting;
    parentCard: ParentCardSetting;
    colorSelector: ColorSelectorCardSettings;
    legendDataPoint: LegendDataPointCardSettings;
    weekendCard: WeekendCardSettings;
    completionCard: completionCardSettings;
    timeMarkerCard: TimeMarkerCardSettings;
    legend: LegendCardSettings;
    labelCard: labelCardSettings;
    cards: Card[];
    populateColorSelector(dataPoints: GanttDataPoint[]): void;
    populateLegendDataPointSlices(dataPoints: any[]): void;
    populateEndMarkerShapes(dataPoints: any[]): void;
}
export {};

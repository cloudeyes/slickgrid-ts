import { stringBetween } from "./common";

export function convertEditors(text: string): string {
  text = text.replace(/    this._init\(\);\n/gm, "    this.init();\n");
  text = text.replace(/  this._init\(\);\n/gm, "");
  text = text.replace("FloatEditor.DefaultDecimalPlaces = null;\n", "");
  text = text.replace(
    "class FloatEditor {\n",
    "class FloatEditor {\n\n  static DefaultDecimalPlaces = null;\n"
  );
  text = text.replace("Slick.Editors = Editors;\n", "");

  text = text.replace(
    stringBetween(
      text,
      "class PercentCompleteEditor {",
      "derecated');\n}\n",
      true
    ),
    ""
  );
  const exportBlock = `\n/** *
 * Contains basic SlickGrid editors.
 * @module Editors
 * @namespace Slick
 */

const Editors = {
  Text: TextEditor,
  Integer: IntegerEditor,
  Float: FloatEditor,
  Date: DateEditor,
  YesNoSelect: YesNoSelectEditor,
  Checkbox: CheckboxEditor,
  LongText: LongTextEditor
};

export default Editors;\n`;
  text = text.replace(exportBlock, "");
  text = text + exportBlock;
  return text;
}

import { appendSelfRef, stringBetween } from "./common";

export function convertGrid(text: string): string {
  text = text.replace(
    /^(  private columnDefaults = {\n)/gm,
    "$1    width: undefined as (number | undefined),\n"
  );

  text = text.replace(/(trigger\([\s\S]*?)(?=self\.)self\./gm, "$1this.");
  text = text.replace(/(?!private) (cssShow|oldProps)/g, " self.$1");
  text = text.replace(/(?!private) (scrollTo\()/g, " this.$1");
  text = text.replace(/private (self|this)\./g, "private ");

  // optional 파라메터
  text = text.replace("trigger(evt, args, e) {", "trigger(evt, args, e?) {");
  text = text.replace(
    "getVisibleRange(viewportTop, viewportLeft)",
    "getVisibleRange(viewportTop, viewportLeft?)"
  );

  [
    "  private cacheCssForHiddenInit() {",
    "  private restoreCssFromHiddenInit() {",
    "  private createColumnHeaders() {",
    "  private setupColumnReorder() {",
  ].forEach((it) => {
    const body = stringBetween(text, it, "///");
    text = appendSelfRef(text, it);
    const body2 = body
      .replace(/(trigger\([\s\S]*?)(?=this\.)this\./gm, "self.$1self.")
      .replace(/columns\[/g, "self.columns[");
    text = text.replace(body, body2);
  });

  text = text.replace("let sortOpts = null;", "let sortOpts;");
  text = text.replace(
    stringBetween(text, "// jquery prior to version 1.8", "verArray[0] >= 2;"),
    ""
  );
  text = text.replace(
    "private jQueryNewWidthBehaviour = false;",
    "private jQueryNewWidthBehaviour = true;"
  );

  text = text.replace(/\.owningElement/, '["owningElement"]');
  text = text.replace("class SlickGrid {", "export default class SlickGrid {");
  return text;
}

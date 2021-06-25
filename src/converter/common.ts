/* eslint-disable no-regex-spaces */
import { transform } from "lebab";

export function es5toes6(text: string): string {
  const { code, warnings } = transform(
    text,
    [
      "let",
      "arrow",
      "arrow-return",
      "for-of",
      "for-each",
      "arg-rest",
      "obj-method",
      "no-strict",
      "exponent",
      "multi-var",
    ] // transforms to apply
  );
  console.log("warnings:", warnings);
  return code;
}

export function convertCommon(text: string): string {
  text =
    [
      "/* eslint-disable @typescript-eslint/no-this-alias */",
      "/* eslint-disable no-constant-condition */",
    ].join("\n") +
    "\n" +
    text;
  text = es5toes6(text);
  text = text.replace("./interact.js", "interactjs");
  // prettier-ignore
  text = text.replace([
    "// Slick.Grid globals pretense",
    "Slick.Grid = SlickGrid;\n",
    "export default SlickGrid;\n\n",
  ].join("\n"), "");

  // 최외곽 함수 정의를 클래스로 변환
  {
    for (const matched of text.matchAll(/^function (.+?)\((.*?)\)\s?{/gm)) {
      const [found, name, argsStr] = matched;
      const args = argsStr.split(",").map((it) => it.trim());
      const fields = args.map((it) => `  private ${it};`).join("\n");
      const fieldsAssigns = args
        .map((it) => `    this.${it} = ${it};`)
        .join("\n");
      // prettier-ignore
      text = text.replace(
        found, [
          `class ${name} {\n`,
          `${fields}\n`,
          `  constructor(${argsStr}) {`,
          `${fieldsAssigns}`,
          `    this._init();`,
          `  }\n`
        ].join('\n')
      );
    }
  }

  // 클래스 본문의 let, const 문을 private 으로 변경
  const letMatcher = /^  let ([^;]+);/gm;
  for (const l of text.matchAll(letMatcher)) {
    let replaced = `  private ${l[1]};`;
    const vars = l[1].split(",");
    if (vars.length > 1) {
      replaced = vars.map((it) => `  private ${it.trim()}`).join(";\n");
    }
    text = text.replace(l[0], replaced);
  }
  text = text.replace(/^  const (.*)\n/gm, "  private $1\n");

  text = text.replace(
    /^  this\.(.*)\s?=\s?function(\(.*\))\s?\{/gm,
    "  function $1$2 {"
  );

  // 함수 정의 부분을 private 함수로 변경
  text = text.replace(/^  function /gm, "  ///\n  private ");

  // $extend 를 이용한 Public API 노출 부분 삭제
  {
    const matcher = /^  \/\/ Public API[\s\S]*?(?=\n.*?init\(\))/m;
    const matches = text.match(matcher);
    let apiDefs = "";
    if (matches) {
      const txt = matches[0];
      const apis = [] as string[];
      // on.*: new Slick.Event(), 부분을 public 필드로 변경
      for (const m of txt.matchAll(/\s+(.+?): (.*),/g)) {
        const name = m[1];
        const internalName = m[2];
        if (name.startsWith("on")) {
          apis.push(`  ${name} = ${m[2]};`);
          text = text.replace(
            `function ${name}()`,
            `function ${name}(this: any)`
          );
        } else {
          text = text.replace(`private ${name}(`, `${name}(`);
          text = text.replace(`private ${internalName}(`, `${internalName}(`);
        }
      }
      apiDefs = apis.join("\n") + "\n";
    }
    text = text.replace(matcher, "");
    text = text.replace("\n  init();\n", apiDefs);
  }

  // this.func = () => {... 패턴에서 this 삭제
  text = text.replace(/^  this\.(.*=>)/gm, "  private $1");

  // init() => _init() 함수로 변경
  // finishInitialization() -> init() 함수로 변경
  text = text.replace(/(\binit\(\))/g, "_$1");
  text = text.replace("_init() {", "private _init() {");
  text = text.replace(/finishInitialization\(\)/g, "init()");

  // each(function() { 패턴 수정
  text = text.replace(/(\.each\(function\s*)\(\)\s*{/gm, "$1(_?: any) {");
  {
    for (const m of text.matchAll(/^(.*)(\.each\(function\s*)\((.*)\) {/gm)) {
      // const padding = " ".repeat(m[1].length - m[1].trim().length);
      // const assignSelf = padding + "const self = this;";
      text = text.replace(
        m[0],
        `${m[1]}${m[2]}(this: any, ${m[3]}) {`
        //`${assignSelf}\n${m[1]}${m[2]}(this: any, ${m[3]}) {`
      );
    }
  }
  text = text.replace(/, _\?: any\)/gm, ")");
  text = text.replace(/= \[\];/g, " = [] as any[];");
  text = text.replace(/(\$.*?)\.(width|height)\(\)/g, "$1.$2()!");

  // interactjs
  text = text.replace(/interact\(/g, "(interact as any)(");

  // Not null assertions
  text = text.replace(/\.(parentNode)\./g, ".$1!.");

  // for (xxx in yyy) loop
  {
    for (const m of text.matchAll(/^\s*for \((const|let) (.+) in/gm)) {
      const padding = " ".repeat(m[0].length - m[0].trim().length);
      text = text.replace(
        m[0],
        `${padding}let ${m[2]};\n${padding}for(${m[2]} in`
      );
    }
  }

  return text;
}

export function appendSelfRef(text: string, pattern: string): string {
  const padding = " ".repeat(pattern.length - pattern.trim().length);
  return text.replace(pattern, `${pattern}\n${padding}  const self = this;`);
}

export function stringBetween(
  text: string,
  start: string,
  end: string,
  include = false
): string {
  let idxFrom = text.indexOf(start);
  let idxTo = text.indexOf(end, idxFrom);
  if (!include) {
    idxFrom += start.length;
  } else {
    idxTo += end.length;
  }
  return text.substr(idxFrom, idxTo - idxFrom);
}

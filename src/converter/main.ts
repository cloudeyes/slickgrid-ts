/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-regex-spaces */
import fs from "fs";
import { convertCommon } from "./common";
import { convertEditors } from "./editors";
import { convertGrid } from "./grid";

type ConverterFunc = (text: string) => string;

function convertFile(filePath: string, converter?: ConverterFunc) {
  console.log("converting:", filePath);

  const data = fs.readFileSync(filePath);
  let text = data.toString();

  text = convertCommon(text);
  if (converter) {
    text = converter(text);
  }

  try {
    const outPath = filePath.replace("/js", "").replace(".es6.js", ".ts");
    fs.writeFileSync(outPath, text, {
      encoding: "utf8",
    });
  } catch (error) {
    console.error(error);
  }
}

[
  { path: "./src/slickgrid/js/slick.grid.es6.js", converter: convertGrid },
  /*
  {
    path: "./src/slickgrid/js/slick.editors.es6.js",
    converter: convertEditors,
  },
  */
].forEach((it) => convertFile(it.path, it.converter));

import * as fs from "fs";
import * as pdf from "pdf-parse";

let argv = process.argv;
// argv[0]: node
// argv[1]: index.js
// argv[2]: file.pdf
if (argv.length < 2) {
  console.error("no input file specified");
  process.exit(1);
}

let dataBuffer = fs.readFileSync(argv[2]);

let options = {
  // pdf.js version to use
  version: "v2.0.550",

  // a callback function to parse text and construct data.text
  pagerender: (pageData: any) => {
    // check documents https://mozilla.github.io/pdf.js/
    let renderOptions = {
      // replaces all occurrences of whitespace with standard spaces (0x20). The default value is `false`.
      normalizeWhitespace: true,
      // do not attempt to combine same line TextItem's. The default value is `false`.
      disableCombineTextItems: false
    };

    return pageData.getTextContent(renderOptions).then(function(textContent) {
      let lastY,
        text = "";
      for (let item of textContent.items) {
        if (lastY == item.transform[5] || !lastY) {
          text += item.str;
        } else {
          text += "\n" + item.str;
        }
        lastY = item.transform[5];
      }
      return text;
    });
  }
};

pdf(dataBuffer, options).then(function(data) {
  console.log(data);
  // number of pages: 3
  // console.log(data.numpages);

  // number of rendered pages: 3
  // console.log(data.numrender);

  // PDF info:
  // { PDFFormatVersion: '1.4',
  //   IsAcroFormPresent: false,
  //   IsXFAPresent: false,
  //   Title: '利用明細書',
  //   Author: 'svf',
  //   Creator:
  //    'SVF for Java Print 9.2 (Revision 9.2.0.38 build 201403061545)',
  //   Producer: 'SVF for Java Print',
  //   CreationDate: '20181231174500+09\'00\'' }
  // console.log(data.info);

  // PDF metadata
  // null
  // console.log(data.metadata);

  // PDF.js version: 1.10.100
  // check https://mozilla.github.io/pdf.js/getting_started/
  // console.log(data.version);

  // PDF text
  // console.log(data.text);
});

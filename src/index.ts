import { inspector } from "eyes";
import * as pdfExtract from "pdf-extract";

let argv = process.argv;
// argv[0]: node
// argv[1]: index.js
// argv[2]: file.pdf
if (argv.length < 2) {
  console.error("no input file specified");
  process.exit(1);
}

let inspect = inspector({ maxLength: 20000 });
let options = {
  type: "text" // extract the actual text in the pdf file
};

interface PDFDataIface {
  hash: string;
  text_pages: string[];
  pdf_path: string;
  single_page_pdf_file_paths: string[];
}

function parsePDF(
  file: string,
  callback: (err: any, pages?: string[]) => void
) {
  let processor = pdfExtract(file, options, (err: any) => {
    if (err) {
      return callback(err);
    }
  });
  processor.on("complete", (data: PDFDataIface) => {
    // inspect(data, "extracted text pages");
    callback(null, data.text_pages);
  });
  processor.on("error", (err: any) => {
    // inspect(err, "error while extracting pages");
    return callback(err);
  });
}

let localCurrencyPattern = /^([0-9]{2}\/[0-9]{2}\/[0-9]{2})\s+(.+)\s+([A-Z]+)\s+([0-9-‑.,]+)(\s+([0-9]{2}\/[0-9]{2}\/[0-9]{2}))?$/;
let localCurrencyWithComissionPattern = /^([0-9]{2}\/[0-9]{2}\/[0-9]{2})\s+(.+)\s+([A-Z]+)\s+([0-9-‑.,]+)\s+([0-9-‑.,]+)(\s+([0-9]{2}\/[0-9]{2}\/[0-9]{2}))?$/;
let exchangePattern = /^([0-9]{2}\/[0-9]{2}\/[0-9]{2})\s+(.+)\s+([A-Z]+)\s+(([0-9-‑.,]+)\s+){4}([0-9]{2}\/[0-9]{2}\/[0-9]{2})$/;

let foreignCurrencyTailPattern = /^\s+[A-Z]+(\s+[0-9-‑.,]+)+$/;
let systemPattern = /(会員氏名|カード番号|(\*\*\*\*‑){3}|PDF出力日|ソニー銀行|お取引|通貨|現地手数料|マイナス表記)/;

parsePDF(argv[2], (err, pages) => {
  if (err) return console.error(err);
  let errors: string[] = [];
  pages.forEach((page, i) => {
    let lines = page.split(/[\x0D\n]+/g);
    errors = errors.concat(
      lines.filter(
        line =>
          !localCurrencyPattern.test(line) &&
          !localCurrencyWithComissionPattern.test(line) &&
          !exchangePattern.test(line) &&
          !foreignCurrencyTailPattern.test(line) &&
          !systemPattern.test(line)
      )
    );
    lines = lines.filter(
      line =>
        localCurrencyPattern.test(line) ||
        localCurrencyWithComissionPattern.test(line) ||
        exchangePattern.test(line)
    );
    inspect(lines, `extracted text page: ${i}`);
  });
  errors = errors.filter(
    error => error !== "\x0C" && !/^\s+.+\s+.+\s+様$/.test(error)
  );
  inspect(errors, `errors`);
});

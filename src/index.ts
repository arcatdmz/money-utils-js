import * as fs from "fs";
import * as path from "path";
import * as pdfExtract from "pdf-extract";

let argv = process.argv;
// argv[0]: node
// argv[1]: index.js
// argv[2]: file.pdf
if (argv.length < 2) {
  console.error("no input file specified");
  process.exit(1);
}

let inputPath = argv[2],
  stat = fs.statSync(inputPath);

if (stat.isDirectory()) {
  let files = fs.readdirSync(inputPath);
  files.forEach(file => {
    file = path.join(inputPath, file);
    parseSonyBankWALLETPDF(file, (err, entries) =>
      resultsHandler(file, err, entries)
    );
  });
} else {
  parseSonyBankWALLETPDF(inputPath, (err, entries) =>
    resultsHandler(inputPath, err, entries)
  );
}

let firstLine = true;
function resultsHandler(file: string, err: any, entries: EntryIface[]) {
  if (err) {
    if (err.error === "unknown entries") {
      console.error(`${err.error} in ${file}`, err.entries);
    } else {
      console.error(err);
    }
    return;
  }
  if (entries.length <= 0) {
    return;
  }

  // print results
  let keys = Object.keys(entries[0]);
  if (firstLine) {
    console.log(keys.join(","));
    firstLine = false;
  }
  entries.forEach(entry => console.log(keys.map(key => entry[key]).join(",")));
}

interface PDFDataIface {
  hash: string;
  text_pages: string[];
  pdf_path: string;
  single_page_pdf_file_paths: string[];
}

interface EntryIface {
  date: string;
  item: string;
  currency: string;
  price: number;
  comission: number;
}

function parsePDF(
  file: string,
  callback: (err: any, pages?: string[]) => void
) {
  let options = {
      type: "text" // extract the actual text in the pdf file
    },
    processor = pdfExtract(file, options, (err: any) => {
      if (err) {
        return callback(err);
      }
    });
  processor.on("complete", (data: PDFDataIface) => {
    callback(null, data.text_pages);
  });
  processor.on("error", (err: any) => {
    return callback(err);
  });
}

function parseSonyBankWALLETPDF(
  file: string,
  callback: (err: any, entries?: EntryIface[]) => void
) {
  let localCurrencyPattern = /^([0-9]{2}\/[0-9]{2}\/[0-9]{2})\s+(.+?)\s+([A-Z]+)\s+([0-9-‑.,]+)(\s+([0-9]{2}\/[0-9]{2}\/[0-9]{2}))?$/;
  let localCurrencyWithComissionPattern = /^([0-9]{2}\/[0-9]{2}\/[0-9]{2})\s+(.+?)\s+([A-Z]+)\s+([0-9-‑.,]+)\s+([0-9-‑.,]+)(\s+([0-9]{2}\/[0-9]{2}\/[0-9]{2}))?$/;
  let exchangePattern = /^([0-9]{2}\/[0-9]{2}\/[0-9]{2})\s+(.+?)\s+([A-Z]+)\s+([0-9-‑.,]+)\s+([0-9-‑.,]+)?\s+([0-9-‑.,]+)\s+([0-9-‑.,]+)(\s+([0-9]{2}\/[0-9]{2}\/[0-9]{2}))?$/;

  let foreignCurrencyTailPattern = /^\s+[A-Z]+(\s+[0-9-‑.,]+)+$/;
  let systemPattern = /(会員氏名|カード番号|(\*\*\*\*‑){3}|PDF出力日|ソニー銀行|お取引|通貨|現地手数料|マイナス表記|^\s+.+\s+.+\s+様$)/;

  let entries: EntryIface[] = [];
  parsePDF(file, (err, pages) => {
    if (err) return callback(err);
    let unknownEntries: string[] = [];
    pages.forEach((page, i) => {
      let lines = page.split(/[\x0C\x0D\n]+/g);
      unknownEntries = unknownEntries.concat(
        lines.filter(
          line =>
            line.length > 0 &&
            !localCurrencyPattern.test(line) &&
            !localCurrencyWithComissionPattern.test(line) &&
            !exchangePattern.test(line) &&
            !foreignCurrencyTailPattern.test(line) &&
            !systemPattern.test(line)
        )
      );
      let pageEntries: EntryIface[] = [];
      lines.forEach(line => {
        let results: RegExpExecArray = null,
          date: string,
          item: string,
          currency: string,
          price: number,
          comission: number;
        results =
          localCurrencyPattern.exec(line) ||
          localCurrencyWithComissionPattern.exec(line);
        if (results) {
          date = results[1];
          item = results[2];
          currency = results[3];
          price = parseFloat(results[4]);
          comission =
            results[5] && results[5].indexOf("/") < 0
              ? parseFloat(results[5])
              : 0;
        } else if ((results = exchangePattern.exec(line))) {
          date = results[1];
          item = results[2];
          currency = results[3];
          price = parseFloat(results[4]);

          // 現地手数料?, ATM手数料, 海外取引経費
          comission =
            (results[5] ? parseFloat(results[5]) : 0) +
            parseFloat(results[6]) +
            parseFloat(results[7]);
        }
        if (price) {
          pageEntries.push({ date, item, currency, price, comission });
        }
      });
      if (pageEntries.length > 0) entries = entries.concat(pageEntries);
    });
    if (unknownEntries.length > 0) {
      callback({
        error: "unknown entries",
        entries: unknownEntries
      });
    } else {
      callback(null, entries);
    }
  });
}

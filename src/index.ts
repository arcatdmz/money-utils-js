import * as fs from "fs";
import * as path from "path";
import * as pdfExtract from "pdf-extract";

// default currency
let defaultCurrency = "JPY";

// convert currencies with the following conversion rates
let currencyConversionTable = {
  USD: 112,
  EUR: 128,
  CAD: 85
};

// exclude data entries with the following item names
let excludes = /(ＡＭＡＺＯＮ．ＣＯ．ＪＰ|Ａｍａｚｏｎ Ｄｏｗｎｌｏａｄｓ)/;

/**
 * header text
 */
function header() {
  return ["date", "p", "category", "fee", "detail", "-", "currency"].join(",");
}

/**
 * function to get text from a data entry
 * @param entry
 */
function entryToText(entry: EntryIface) {
  let values = [
    entry.date.replace(/\//g, ""), // date
    "", // p
    "", // category
    convertPrice(entry.price + entry.comission, entry.currency), // fee
    entry.item, // detail
    "", // -
    entry.currency === defaultCurrency ? "" : entry.currency // currency
  ];
  return values.join(",");
}

/**
 * function to get text from a set of data entries in a single file
 * @param file
 * @param err
 * @param entries
 */
function entriesToText(file: string, err: any, entries: EntryIface[]) {
  if (err) {
    if (err.error === "unknown entries") {
      console.error(`${err.error} in ${file}`, err.entries);
    } else {
      console.error(err);
    }
    return null;
  }
  if (entries.length <= 0) {
    return null;
  }

  // print results
  return entries
    .filter(entry => !excludes.test(entry.item))
    .map(entry => entryToText(entry))
    .join("\r\n");
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
          price = parsePrice(results[4]);
          comission =
            results[5] && results[5].indexOf("/") < 0
              ? parsePrice(results[5])
              : 0;
        } else if ((results = exchangePattern.exec(line))) {
          date = results[1];
          item = results[2];
          currency = results[3];
          price = parsePrice(results[4]);

          // 現地手数料?, ATM手数料, 海外取引経費
          comission =
            (results[5] ? parsePrice(results[5]) : 0) +
            parsePrice(results[6]) +
            parsePrice(results[7]);
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

function parsePrice(price: string) {
  return parseFloat(price.replace(/,/g, ""));
}

function convertPrice(price: number, currency: string) {
  if (
    currency === defaultCurrency ||
    typeof currencyConversionTable[currency] !== "number"
  )
    return price;
  return price * currencyConversionTable[currency];
}

// get arguments
//   argv[0]: node
//   argv[1]: index.js
//   argv[2]: input.pdf
//   argv[3]: output.csv
let argv = process.argv;
if (argv.length < 2) {
  console.error("no input file specified");
  process.exit(1);
}
let inputPath = argv[2],
  outputPath = argv.length > 3 && argv[3],
  stat = fs.statSync(inputPath);

// convert PDF file(s) to text
let promises: Promise<string>[];
if (stat.isDirectory()) {
  let files = fs.readdirSync(inputPath);
  promises = files.map(file => {
    file = path.join(inputPath, file);
    return new Promise<string>((resolve, reject) => {
      parseSonyBankWALLETPDF(file, (err, entries) => {
        resolve(entriesToText(file, err, entries));
      });
    });
  });
} else {
  promises = [
    new Promise<string>((resolve, reject) => {
      parseSonyBankWALLETPDF(inputPath, (err, entries) =>
        resolve(entriesToText(inputPath, err, entries))
      );
    })
  ];
}

Promise.all(promises).then(results => {
  results = results.filter(result => typeof result === "string");

  // add header
  results.unshift(header());

  // print text
  let text = results.join("\r\n");
  if (outputPath) {
    fs.writeFileSync(outputPath, text);
  } else {
    console.log(text);
  }
});

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

parsePDF(argv[2], (err, pages) => {
  if (err) return console.error(err);
  pages.forEach((page, i) => {
    let lines = page.split(/[\015\n]+/g);
    lines = lines.filter(line => /^[0-9]{2}\/[0-9]{2}\/[0-9]{2}/g.test(line));
    inspect(lines, `extracted text page: ${i}`);
  });
});

declare module "pdf-parse" {
  type PdfParseResult = {
    numpages?: number;
    text: string;
  };

  function pdfParse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>,
  ): Promise<PdfParseResult>;

  export default pdfParse;
}

declare module "pdf-parse/lib/pdf-parse.js" {
  type PdfParseResult = {
    numpages?: number;
    text: string;
  };

  function pdfParse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>,
  ): Promise<PdfParseResult>;

  export default pdfParse;
}

/**
 * PDF parsing for field maps.
 *
 * Renders each page of a PDF (already in a Buffer) to a PNG buffer, suitable
 * for sending to the vision model. Uses `pdf-to-img` which is Windows-friendly
 * and works in Node serverless environments without native canvas bugs.
 */

import { pdf } from 'pdf-to-img';

export interface RenderedPage {
  pageNumber: number;
  pngBuffer: Buffer;
  width: number;
  height: number;
}

/**
 * Read width/height from the IHDR chunk of a PNG buffer.
 * PNG header: 8 bytes signature, then 4-byte length, "IHDR", 4-byte width
 * (big-endian), 4-byte height (big-endian).
 */
function readPngDimensions(buf: Buffer): { width: number; height: number } {
  // Offset 16: width (uint32 BE). Offset 20: height (uint32 BE).
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

/**
 * Render every page of the PDF to a PNG buffer.
 *
 * @param pdfBuffer  Raw PDF bytes
 * @param scale  Rendering scale. 2.0 ≈ 144 DPI, good balance between
 *               vision-model accuracy and payload size.
 */
export async function renderPdfPages(
  pdfBuffer: Buffer,
  scale = 2.0,
): Promise<RenderedPage[]> {
  const document = await pdf(pdfBuffer, { scale });

  const results: RenderedPage[] = [];
  let pageNumber = 0;
  for await (const pngBuffer of document) {
    pageNumber += 1;
    const { width, height } = readPngDimensions(pngBuffer as Buffer);
    results.push({
      pageNumber,
      pngBuffer: pngBuffer as Buffer,
      width,
      height,
    });
  }
  return results;
}

/**
 * Render a specific page (1-indexed).
 */
export async function renderPdfPage(
  pdfBuffer: Buffer,
  pageNumber: number,
  scale = 2.0,
): Promise<RenderedPage> {
  const document = await pdf(pdfBuffer, { scale });
  const pngBuffer = (await document.getPage(pageNumber)) as Buffer;
  const { width, height } = readPngDimensions(pngBuffer);
  return { pageNumber, pngBuffer, width, height };
}

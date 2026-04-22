import { extractText } from 'unpdf';

export async function parsePDF(buffer: Buffer): Promise<string> {
  const { text } = await extractText(new Uint8Array(buffer));
  return text.join('\n\n');
}

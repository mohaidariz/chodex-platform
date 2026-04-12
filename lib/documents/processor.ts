export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // Dynamic import to avoid issues with server components
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)
  return data.text
}

export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

export async function extractTextFromTXT(buffer: Buffer): Promise<string> {
  return buffer.toString('utf-8')
}

export async function extractText(buffer: Buffer, fileType: string): Promise<string> {
  const type = fileType.toLowerCase()

  if (type === 'pdf' || type === 'application/pdf') {
    return extractTextFromPDF(buffer)
  }

  if (
    type === 'docx' ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return extractTextFromDOCX(buffer)
  }

  if (type === 'txt' || type === 'text/plain') {
    return extractTextFromTXT(buffer)
  }

  throw new Error(`Unsupported file type: ${fileType}`)
}

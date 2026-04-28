export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT || 'whisper-1';

  if (!endpoint || !apiKey) throw new Error('AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY must be set');

  // Map mime type to a file extension Whisper accepts
  let ext = 'webm';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) ext = 'mp4';
  else if (mimeType.includes('wav')) ext = 'wav';
  else if (mimeType.includes('ogg')) ext = 'ogg';

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), `audio.${ext}`);
  form.append('model', deployment);

  const res = await fetch(
    `${endpoint}/openai/deployments/${deployment}/audio/transcriptions?api-version=2024-06-01`,
    {
      method: 'POST',
      headers: { 'api-key': apiKey },
      body: form,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper transcription failed: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return (data.text || '').trim();
}

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_TTS_DEPLOYMENT || 'tts-1';

  if (!endpoint || !apiKey) throw new Error('AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY must be set');

  const res = await fetch(
    `${endpoint}/openai/deployments/${deployment}/audio/speech?api-version=2025-01-01-preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({ model: 'tts-1', input: text, voice: 'nova', response_format: 'mp3' }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS synthesis failed: ${res.status} — ${err}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

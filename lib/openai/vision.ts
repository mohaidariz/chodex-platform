/**
 * Azure OpenAI vision helper.
 *
 * Sends a single image (as a base64 data URL) to the gpt-4o deployment
 * with a system prompt and a user instruction, and returns the parsed
 * JSON response.
 *
 * Uses the same env vars as the chat helper:
 *   AZURE_OPENAI_ENDPOINT       e.g. https://norrplex-openai-prod.openai.azure.com
 *   AZURE_OPENAI_DEPLOYMENT     e.g. gpt-4o
 *   AZURE_OPENAI_API_KEY
 */

export async function visionExtractJSON<T = unknown>(args: {
  systemPrompt: string;
  userPrompt: string;
  imageBase64: string;     // raw base64 (no data: prefix)
  imageMimeType?: string;  // defaults to image/png
  maxTokens?: number;      // defaults to 4000
  temperature?: number;    // defaults to 0
}): Promise<T> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT!;
  const apiKey = process.env.AZURE_OPENAI_API_KEY!;

  const mime = args.imageMimeType ?? 'image/png';
  const dataUrl = `data:${mime};base64,${args.imageBase64}`;

  const res = await fetch(
    `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-08-01-preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: args.systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: args.userPrompt },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            ],
          },
        ],
        temperature: args.temperature ?? 0,
        max_tokens: args.maxTokens ?? 4000,
        response_format: { type: 'json_object' },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Azure OpenAI vision error: ${res.status} ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Azure OpenAI vision returned empty content');

  try {
    return JSON.parse(content) as T;
  } catch (e) {
    throw new Error(`Failed to parse vision JSON output: ${(e as Error).message}\nRaw: ${content.slice(0, 500)}`);
  }
}

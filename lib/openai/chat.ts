export async function generateChatResponse(
  messages: { role: string; content: string }[],
  systemPrompt: string
): Promise<string> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT!;
  const apiKey = process.env.AZURE_OPENAI_API_KEY!;

  const res = await fetch(
    `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Azure OpenAI error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

export type AzureTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

export async function generateChatResponseWithTools(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  tools: AzureTool[],
  executeTool: ToolExecutor
): Promise<string> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT!;
  const apiKey = process.env.AZURE_OPENAI_API_KEY!;

  const allMessages: any[] = [{ role: 'system', content: systemPrompt }, ...messages];

  // Tool-call loop — max 5 rounds to guard against runaway chains
  for (let round = 0; round < 5; round++) {
    const res = await fetch(
      `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          messages: allMessages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? 'auto' : undefined,
          temperature: 0.3,
          max_tokens: 1000,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Azure OpenAI error: ${res.status} ${err}`);
    }

    const data = await res.json();
    const choice = data.choices[0];
    const message = choice.message;

    // No tool calls — return the text
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content ?? '';
    }

    // Append assistant message with tool calls, then execute each
    allMessages.push(message);

    for (const toolCall of message.tool_calls) {
      let result: string;
      try {
        const args = JSON.parse(toolCall.function.arguments);
        result = await executeTool(toolCall.function.name, args);
      } catch (e) {
        result = JSON.stringify({ error: 'Tool execution failed', details: String(e) });
      }

      allMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  // Fallback: final call without tools after loop limit
  const res = await fetch(
    `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({ messages: allMessages, temperature: 0.3, max_tokens: 1000 }),
    }
  );
  const data = await res.json();
  return data.choices[0].message.content ?? '';
}

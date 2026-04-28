import { NextRequest, NextResponse } from 'next/server';
import { runChatPipeline } from '@/lib/chat/pipeline';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationId, orgSlug, visitorName, visitorEmail } = body;

    if (!message || !orgSlug) {
      return NextResponse.json({ error: 'Missing message or orgSlug' }, { status: 400 });
    }

    const result = await runChatPipeline({ message, conversationId, orgSlug, visitorName, visitorEmail });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: error.message || 'Chat failed' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

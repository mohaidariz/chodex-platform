import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio, synthesizeSpeech } from '@/lib/openai/voice';
import { runChatPipeline } from '@/lib/chat/pipeline';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const audioBlob = form.get('audio') as Blob | null;
    const orgSlug = form.get('orgSlug') as string | null;
    const conversationId = (form.get('conversationId') as string | null) || undefined;
    const visitorName = (form.get('visitorName') as string | null) || undefined;
    const visitorEmail = (form.get('visitorEmail') as string | null) || undefined;
    const noAudio = form.get('noAudio') === 'true';

    if (!audioBlob || !orgSlug) {
      return NextResponse.json({ error: 'Missing audio or orgSlug' }, { status: 400 });
    }

    // 1. Speech-to-text
    const audioBuffer = Buffer.from(await audioBlob.arrayBuffer());
    const transcript = await transcribeAudio(audioBuffer, audioBlob.type || 'audio/webm');

    if (!transcript) {
      return NextResponse.json({ error: 'Could not transcribe audio — please speak clearly and try again.' }, { status: 422 });
    }

    // 2. Run chat pipeline with the transcript
    const chatResult = await runChatPipeline({
      message: transcript,
      conversationId,
      orgSlug,
      visitorName,
      visitorEmail,
    });

    // 3. Text-to-speech (skip if caller is muted)
    let audioBase64: string | null = null;
    let ttsError: string | null = null;
    if (!noAudio) {
      try {
        const speechBuffer = await synthesizeSpeech(chatResult.response);
        audioBase64 = speechBuffer.toString('base64');
      } catch (err: any) {
        console.error('TTS error:', err);
        ttsError = err.message;
      }
    }

    return NextResponse.json({
      transcript,
      response: chatResult.response,
      conversationId: chatResult.conversationId,
      audioBase64,
      ttsError,
      sources: chatResult.sources,
    });
  } catch (error: any) {
    console.error('Voice route error:', error);
    return NextResponse.json({ error: error.message || 'Voice processing failed' }, { status: 500 });
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

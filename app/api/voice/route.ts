import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio, synthesizeSpeech } from '@/lib/openai/voice';
import { runChatPipeline } from '@/lib/chat/pipeline';

export const maxDuration = 60;

let diagnosticLogged = false;

export async function POST(request: NextRequest) {
  // One-time env-presence log per container — never logs values
  if (!diagnosticLogged) {
    diagnosticLogged = true;
    console.log('[voice] env check —',
      'AZURE_OPENAI_ENDPOINT:', !!process.env.AZURE_OPENAI_ENDPOINT,
      'AZURE_OPENAI_API_KEY:', !!process.env.AZURE_OPENAI_API_KEY,
      'AZURE_OPENAI_WHISPER_DEPLOYMENT:', !!process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT,
      'AZURE_OPENAI_TTS_DEPLOYMENT:', !!process.env.AZURE_OPENAI_TTS_DEPLOYMENT,
      'AZURE_OPENAI_DEPLOYMENT:', !!process.env.AZURE_OPENAI_DEPLOYMENT,
    );
  }

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
    let transcript: string;
    try {
      transcript = await transcribeAudio(audioBuffer, audioBlob.type || 'audio/webm');
    } catch (err: any) {
      console.error('[voice] STT error:', err.message);
      return NextResponse.json(
        { error: `Could not transcribe audio — ${err.message}` },
        { status: 422 }
      );
    }

    if (!transcript) {
      return NextResponse.json(
        { error: 'Could not transcribe audio — please speak clearly and try again.' },
        { status: 422 }
      );
    }

    console.log('[voice] transcript:', transcript.slice(0, 80));

    // 2. Chat pipeline
    const chatResult = await runChatPipeline({
      message: transcript,
      conversationId,
      orgSlug,
      visitorName,
      visitorEmail,
    });

    // 3. Text-to-speech
    let audioBase64: string | null = null;
    let ttsError: string | null = null;
    if (!noAudio) {
      try {
        const speechBuffer = await synthesizeSpeech(chatResult.response);
        audioBase64 = speechBuffer.toString('base64');
      } catch (err: any) {
        console.error('[voice] TTS error:', err.message);
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
    console.error('[voice] unhandled error:', error.message);
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

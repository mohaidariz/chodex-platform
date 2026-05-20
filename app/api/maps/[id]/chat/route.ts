import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateChatResponse } from '@/lib/openai/chat';
import { haversineMeters, pointToSegmentMeters } from '@/lib/maps/geo';

export const maxDuration = 60;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  message: string;
  history?: ChatMessage[];
  position?: { lat: number; lng: number; accuracy?: number } | null;
  radius_m?: number;
}

/**
 * POST /api/maps/[id]/chat
 *
 * Field-view agent. Takes the user's current GPS position, the user's message,
 * and conversation history, and returns the agent's response. The agent has
 * access to:
 *   - the map's metadata
 *   - all features within `radius_m` of the user (full label, source_id, type)
 *   - the conversation history
 *
 * Stateless — the client keeps the message history.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = createServiceRoleClient();
    const { data: profile } = await service
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();
    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No organization' }, { status: 400 });
    }

    const { data: map } = await service
      .from('maps')
      .select('*')
      .eq('id', params.id)
      .single();
    if (!map) return NextResponse.json({ error: 'Map not found' }, { status: 404 });
    if (map.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: RequestBody = await req.json();
    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    const radiusM = body.radius_m && body.radius_m > 0 ? body.radius_m : 50;

    // Pull all features for this map and compute distances if position is given.
    const { data: features } = await service
      .from('map_features')
      .select('feature_type, lat, lng, end_lat, end_lng, source_id, label, page_number, props')
      .eq('map_id', params.id);

    let nearby: Array<{
      feature_type: string;
      label: string | null;
      source_id: string | null;
      page_number: number;
      distance_m: number;
      props: Record<string, unknown>;
    }> = [];

    if (body.position && features) {
      const pos = body.position;
      const withDist = features.map((f: any) => {
        let d: number;
        if (f.end_lat != null && f.end_lng != null) {
          d = pointToSegmentMeters(
            pos.lat, pos.lng,
            f.lat, f.lng,
            f.end_lat, f.end_lng,
          );
        } else {
          d = haversineMeters(pos.lat, pos.lng, f.lat, f.lng);
        }
        return {
          feature_type: f.feature_type,
          label: f.label ?? null,
          source_id: f.source_id ?? null,
          page_number: f.page_number,
          distance_m: d,
          props: f.props ?? {},
        };
      });
      nearby = withDist
        .filter((x) => x.distance_m <= radiusM)
        .sort((a, b) => a.distance_m - b.distance_m)
        .slice(0, 50);
    }

    // Build the system prompt with map context
    const mapTypeText =
      map.map_type === 'byggkarta'
        ? 'Byggkarta (cable construction map)'
        : map.map_type === 'borrkarta'
        ? 'Borrkarta (drilling map)'
        : 'utility map';

    const positionText = body.position
      ? `The user is currently at latitude ${body.position.lat.toFixed(6)}, longitude ${body.position.lng.toFixed(6)} (GPS accuracy ±${Math.round(body.position.accuracy ?? 0)}m).`
      : 'The user has not shared their GPS position yet — ask them to enable location, or answer in general terms.';

    let nearbyText: string;
    if (!body.position) {
      nearbyText = 'No GPS, so no nearby-features list available.';
    } else if (nearby.length === 0) {
      nearbyText = `No features extracted within ${radiusM}m of the user's current position. Either they are not standing in the project area, or extraction did not cover that part of the map. Be honest about this when relevant.`;
    } else {
      const list = nearby
        .map((f, i) => {
          const idPart = f.source_id ? ` [${f.source_id}]` : '';
          const labelPart = f.label ? ` — ${f.label.replace(/\s+/g, ' ').trim()}` : '';
          return `${i + 1}. ${f.feature_type}${idPart}${labelPart} — ${Math.round(f.distance_m)}m away (page ${f.page_number})`;
        })
        .join('\n');
      nearbyText = `Features extracted within ${radiusM}m of the user's current position (closest first, up to 50):\n${list}`;
    }

    const systemPrompt = `You are a field assistant for a Swedish utility-contractor crew working with a ${mapTypeText} from E.ON Energidistribution.

The user is on site with an iPad, looking at the construction map. Your job is to answer their questions about what is near them: which cables run here, what is planned to be dug or drilled, what infrastructure is nearby, what cable types and dimensions to use.

CONTEXT:
- Project map: "${map.name}"${map.project_code ? ` (IBnr: ${map.project_code})` : ''}
- Map type: ${mapTypeText}
- ${positionText}

${nearbyText}

GUIDELINES:
- Answer in the user's language (Swedish if they write Swedish, English if they write English).
- Be concise — crews are on site, they want short, actionable answers.
- Quote cable types exactly as they appear (e.g. "AMCL 3*95/16", "FeAl 3*99").
- Reference specific identifiers when relevant (LS00xxxx, JUH36xxxxx, K1xxxxx, 744xxxxxx).
- If something is uncertain (props.uncertain is true on a feature), say so — don't pretend to be certain.
- If the user asks about something that is not in the nearby list, say honestly that you don't see it on the map near their current position. Suggest they check the dashboard or move closer.
- NEVER invent cable types, depths, or coordinates that aren't in your context.
- For safety: remind the user that the map is a planning document and they should still call Ledningskollen before digging if they haven't.`;

    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
    const messages = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: body.message },
    ];

    const reply = await generateChatResponse(messages, systemPrompt);

    return NextResponse.json({
      reply,
      nearby_count: nearby.length,
      radius_m: radiusM,
    });
  } catch (error: any) {
    console.error('Field chat error:', error);
    return NextResponse.json(
      { error: error?.message || 'Chat failed' },
      { status: 500 },
    );
  }
}

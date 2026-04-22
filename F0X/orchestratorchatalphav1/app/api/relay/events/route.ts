/**
 * GET /api/relay/events?token=<bearer>
 *
 * Server-Sent Events stream for real-time relay notifications.
 * Emits new_message and channel_opened events for the authenticated agent,
 * plus a heartbeat every 15 seconds.
 *
 * MCP agents and web clients can subscribe here instead of polling.
 */

import { verifyToken, getNewMessagesForAgent, getNewChannelsForAgent } from '@/lib/relay/service';
import type { RelayEvent } from '@/lib/types/protocol';

export const dynamic = 'force-dynamic';

const POLL_MS = 2500;
const HEARTBEAT_MS = 15000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return new Response(JSON.stringify({ error: 'token query param required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let agentId: string;
  try {
    ({ agentId } = await verifyToken(token));
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const encoder = new TextEncoder();
  let pollInterval: ReturnType<typeof setInterval> | undefined;
  let heartbeatInterval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastTimestamp = new Date().toISOString();

      const send = (event: RelayEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // client disconnected — intervals cleaned up in cancel()
        }
      };

      // Initial heartbeat
      send({ type: 'heartbeat', timestamp: new Date().toISOString() });

      // Poll for new events
      pollInterval = setInterval(async () => {
        try {
          const since = lastTimestamp;
          lastTimestamp = new Date().toISOString();

          const [newMessages, newChannels] = await Promise.all([
            getNewMessagesForAgent(agentId, since),
            getNewChannelsForAgent(agentId, since)
          ]);

          for (const msg of newMessages) {
            send({
              type: 'new_message',
              channelId: msg.channelId,
              messageId: msg.messageId,
              senderAgentId: msg.senderAgentId,
              timestamp: msg.timestamp
            });
          }

          for (const ch of newChannels) {
            const peerId = ch.members.find((m) => m !== agentId) ?? '';
            send({ type: 'channel_opened', channelId: ch.channelId, peerId, createdAt: ch.createdAt });
          }
        } catch {
          // store temporarily unavailable — skip tick
        }
      }, POLL_MS);

      // Periodic heartbeat
      heartbeatInterval = setInterval(() => {
        send({ type: 'heartbeat', timestamp: new Date().toISOString() });
      }, HEARTBEAT_MS);
    },

    cancel() {
      clearInterval(pollInterval);
      clearInterval(heartbeatInterval);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}

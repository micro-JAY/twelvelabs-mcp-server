/**
 * Conversation Tools
 *
 * These tools let you inspect what actually happened during a practice session:
 * the full back-and-forth transcript, plus the structured data extracted via
 * the ElevenLabs data_collection and evaluation_criteria analysis.
 *
 * This is the primary debugging tool — when an interview goes wrong, you
 * can pull the conversation here and read exactly what was said and scored.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, formatError, validatePathSegment } from "../client.js";
import type { ConversationDetail, ConversationListResponse } from "../types.js";

export function registerConversationTools(server: McpServer): void {

  // ── List All Conversations ─────────────────────────────────────────────────

  server.registerTool(
    "twelvelabs_list_conversations",
    {
      title: "List All Conversations",
      description: `List recent conversations across all agents in your account.

To filter by agent, use twelvelabs_list_agent_conversations instead.

Args:
  - limit: Number of conversations to return (1–100, default 20)
  - agent_id: Optional — filter to a specific agent

Returns: List of conversations with ID, status, duration, and agent ID.

Tip: To filter by agent, either pass agent_id here or use twelvelabs_list_agent_conversations.`,
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(20).describe("Max results"),
        agent_id: z.string().optional().describe("Optional agent ID filter"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ limit, agent_id }) => {
      try {
        const params: Record<string, unknown> = { page_size: limit };
        if (agent_id) {
          validatePathSegment(agent_id, "agent_id");
          params.agent_id = agent_id;
        }

        const data = await apiGet<ConversationListResponse>("/v1/convai/conversations", params);
        const convos = data.conversations ?? [];
        if (!convos.length) return { content: [{ type: "text", text: "No conversations found." }] };

        const lines = convos.map((c) => {
          const ts = c.start_time_unix_secs
            ? new Date(c.start_time_unix_secs * 1000).toISOString()
            : "unknown";
          const dur = c.call_duration_secs ? `${c.call_duration_secs}s` : "?s";
          return `• ${c.conversation_id} | agent: ${c.agent_id} | ${c.status} | ${dur} | ${ts}`;
        });

        return { content: [{ type: "text", text: `${convos.length} conversation(s):\n\n${lines.join("\n")}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  // ── Get Full Conversation ──────────────────────────────────────────────────

  server.registerTool(
    "twelvelabs_get_conversation",
    {
      title: "Get Conversation Transcript and Analysis",
      description: `Get the complete transcript and post-call analysis for a conversation.

Returns two things:
1. The full turn-by-turn transcript (what the agent and user actually said)
2. The analysis: data_collection fields (scores, email, role, recommendation)
   and evaluation_criteria results (booleans like interview_completed)

This is your primary tool for debugging: if scores are wrong, feedback is
missing, or the interview ended incorrectly, read the transcript here first.

Args:
  - conversation_id: The conversation ID (from twelvelabs_list_conversations)

Returns: Formatted transcript + structured analysis data.`,
      inputSchema: z.object({
        conversation_id: z.string().min(1).describe("The conversation ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ conversation_id }) => {
      try {
        validatePathSegment(conversation_id, "conversation_id");
        const convo = await apiGet<ConversationDetail>(
          `/v1/convai/conversations/${conversation_id}`
        );

        const ts = convo.start_time_unix_secs
          ? new Date(convo.start_time_unix_secs * 1000).toISOString()
          : "unknown";
        const dur = convo.call_duration_secs ? `${convo.call_duration_secs}s` : "unknown";

        // Format transcript — each turn labelled clearly
        const transcriptLines = (convo.transcript ?? []).map((msg) => {
          const label = msg.role === "agent" ? "🤖 Agent" : "👤 User";
          const time = msg.time_in_call_secs !== undefined ? ` [${msg.time_in_call_secs}s]` : "";
          return `${label}${time}: ${msg.message}`;
        });

        // Format data_collection as key: value pairs
        const dc = convo.analysis?.data_collection ?? {};
        const dcLines = Object.entries(dc).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`);

        // Format evaluation_criteria
        const ec = convo.analysis?.evaluation_criteria ?? {};
        const ecLines = Object.entries(ec).map(([k, v]) => `  ${k}: ${v ? "✅" : "❌"}`);

        const sections = [
          `# Conversation ${convo.conversation_id}`,
          `Status: ${convo.status} | Duration: ${dur} | Started: ${ts}`,
          `Agent: ${convo.agent_id}`,
          ``,
          `## Transcript`,
          transcriptLines.length ? transcriptLines.join("\n") : "(no transcript available)",
          ``,
          `## Data Collection`,
          dcLines.length ? dcLines.join("\n") : "  (none)",
          ``,
          `## Evaluation Criteria`,
          ecLines.length ? ecLines.join("\n") : "  (none)",
        ];

        return { content: [{ type: "text", text: sections.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );
}

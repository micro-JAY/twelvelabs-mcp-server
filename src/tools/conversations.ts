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
import { apiDelete, apiGet, apiPatch, apiPost, formatError, validatePathSegment } from "../client.js";
import type { ConversationDetail, ConversationListResponse } from "../types.js";

const conversationStatuses = ["initiated", "in-progress", "processing", "done", "failed"] as const;

interface ConversationTag {
  readonly id: string;
  readonly title: string;
  readonly description?: string | null;
}

interface ConversationTagListResponse {
  readonly conversation_tags?: ConversationTag[];
  readonly has_more?: boolean;
  readonly next_cursor?: string;
}

function conversationTimestamp(conversation: ConversationDetail): number | undefined {
  const metadata = conversation.metadata as { start_time_unix_secs?: unknown } | undefined;
  return conversation.start_time_unix_secs ?? (typeof metadata?.start_time_unix_secs === "number" ? metadata.start_time_unix_secs : undefined);
}

function conversationDuration(conversation: ConversationDetail): number | undefined {
  const metadata = conversation.metadata as { call_duration_secs?: unknown } | undefined;
  return conversation.call_duration_secs ?? (typeof metadata?.call_duration_secs === "number" ? metadata.call_duration_secs : undefined);
}

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
  - cursor: Cursor from a previous response, for the next page
  - agent_id: Optional — filter to a specific agent
  - call_successful: Filter by success evaluation result
  - start_after_unix/start_before_unix: Filter by conversation start timestamp
  - min_duration_secs/max_duration_secs: Filter by call duration
  - rating_min/rating_max: Filter by overall rating (1–5)
  - exclude_statuses: Hide conversations in one or more statuses
  - tag_ids: Return only conversations carrying one or more tag IDs

Returns: List of conversations with ID, status, duration, and agent ID.

Tip: To filter by agent, either pass agent_id here or use twelvelabs_list_agent_conversations.`,
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(20).describe("Max results"),
        cursor: z.string().min(1).optional().describe("Pagination cursor from the previous response"),
        agent_id: z.string().optional().describe("Optional agent ID filter"),
        call_successful: z.enum(["success", "failure", "unknown"]).optional().describe("Filter by success evaluation"),
        start_after_unix: z.number().int().nonnegative().optional().describe("Include conversations started after this Unix timestamp"),
        start_before_unix: z.number().int().nonnegative().optional().describe("Include conversations started before this Unix timestamp"),
        min_duration_secs: z.number().int().nonnegative().optional().describe("Minimum call duration in seconds"),
        max_duration_secs: z.number().int().nonnegative().optional().describe("Maximum call duration in seconds"),
        rating_min: z.number().int().min(1).max(5).optional().describe("Minimum overall rating"),
        rating_max: z.number().int().min(1).max(5).optional().describe("Maximum overall rating"),
        exclude_statuses: z.array(z.enum(conversationStatuses)).min(1).max(5).optional().describe("Statuses to omit"),
        tag_ids: z.array(z.string().min(1)).min(1).max(50).optional().describe("Conversation tag IDs to require"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ limit, cursor, agent_id, call_successful, start_after_unix, start_before_unix, min_duration_secs, max_duration_secs, rating_min, rating_max, exclude_statuses, tag_ids }) => {
      try {
        if (start_after_unix !== undefined && start_before_unix !== undefined && start_after_unix > start_before_unix) {
          return { content: [{ type: "text", text: "Error: start_after_unix must not be later than start_before_unix." }] };
        }
        if (min_duration_secs !== undefined && max_duration_secs !== undefined && min_duration_secs > max_duration_secs) {
          return { content: [{ type: "text", text: "Error: min_duration_secs must not exceed max_duration_secs." }] };
        }
        if (rating_min !== undefined && rating_max !== undefined && rating_min > rating_max) {
          return { content: [{ type: "text", text: "Error: rating_min must not exceed rating_max." }] };
        }
        const params: Record<string, unknown> = {
          page_size: limit,
          cursor,
          call_successful,
          call_start_after_unix: start_after_unix,
          call_start_before_unix: start_before_unix,
          call_duration_min_secs: min_duration_secs,
          call_duration_max_secs: max_duration_secs,
          rating_min,
          rating_max,
          exclude_statuses,
          tag_ids,
        };
        if (agent_id) {
          validatePathSegment(agent_id, "agent_id");
          params.agent_id = agent_id;
        }
        for (const tagId of tag_ids ?? []) validatePathSegment(tagId, "tag_id");

        const data = await apiGet<ConversationListResponse>("/v1/convai/conversations", params);
        const convos = data.conversations ?? [];
        if (!convos.length) return { content: [{ type: "text", text: "No conversations found." }] };

        const lines = convos.map((c) => {
          const ts = c.start_time_unix_secs
            ? new Date(c.start_time_unix_secs * 1000).toISOString()
            : "unknown";
          const dur = c.call_duration_secs ? `${c.call_duration_secs}s` : "?s";
          const score = c.call_successful ? ` | success: ${c.call_successful}` : "";
          const tags = c.tag_ids?.length ? ` | tags: ${c.tag_ids.join(", ")}` : "";
          return `• ${c.conversation_id} | agent: ${c.agent_name ?? c.agent_id} | ${c.status} | ${dur}${score}${tags} | ${ts}`;
        });
        const pagination = data.has_more && data.next_cursor
          ? `\n\nMore results are available. Next cursor: ${data.next_cursor}`
          : "";
        return { content: [{ type: "text", text: `${convos.length} conversation(s):\n\n${lines.join("\n")}${pagination}` }] };
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

        const startTime = conversationTimestamp(convo);
        const duration = conversationDuration(convo);
        const ts = startTime
          ? new Date(startTime * 1000).toISOString()
          : "unknown";
        const dur = duration !== undefined ? `${duration}s` : "unknown";

        // Format transcript — each turn labelled clearly
        const transcriptLines = (convo.transcript ?? []).map((msg) => {
          const label = msg.role === "agent" ? "🤖 Agent" : "👤 User";
          const time = msg.time_in_call_secs !== undefined ? ` [${msg.time_in_call_secs}s]` : "";
          const backchannel = msg.ignored_as_backchannel ? " [ignored backchannel]" : "";
          return `${label}${time}${backchannel}: ${msg.message}`;
        });

        // Format data_collection as key: value pairs
        const dc = convo.analysis?.data_collection ?? {};
        const richDc = convo.analysis?.data_collection_results ?? {};
        const dcLines = [
          ...Object.entries(dc).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`),
          ...Object.entries(richDc).map(([k, v]) => `  ${k}: ${JSON.stringify(v.value ?? v.result ?? "not set")}${v.rationale ? ` — ${v.rationale}` : ""}`),
        ];

        // Format evaluation_criteria
        const ec = convo.analysis?.evaluation_criteria ?? {};
        const richEc = convo.analysis?.evaluation_criteria_results ?? {};
        const ecLines = [
          ...Object.entries(ec).map(([k, v]) => `  ${k}: ${v ? "✅" : "❌"}`),
          ...Object.entries(richEc).map(([k, v]) => `  ${k}: ${v.result ?? "not set"}${v.rationale ? ` — ${v.rationale}` : ""}`),
        ];

        const sections = [
          `# Conversation ${convo.conversation_id}`,
          `Status: ${convo.status} | Duration: ${dur} | Started: ${ts}`,
          `Agent: ${convo.agent_name ?? convo.agent_id}`,
          `Version: ${convo.version_id ?? "unknown"} | Environment: ${convo.environment ?? "production"}`,
          `Audio: ${convo.has_audio ? "available" : "not available"} | Auxiliary audio: ${convo.has_auxiliary_audio ? "available" : "not available"}`,
          `Tags: ${convo.tag_ids?.join(", ") || "(none)"}`,
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

  // ── Re-run Conversation Analysis ──────────────────────────────────────────

  server.registerTool(
    "twelvelabs_rerun_conversation_analysis",
    {
      title: "Re-run Conversation Analysis",
      description: `⚠️ This starts a new post-call analysis using the agent's current evaluation and data-collection configuration. Confirm with the user before calling.

Use this after changing an agent's evaluation criteria or data collection to apply
those changes to a completed conversation. The response may be processing; call
twelvelabs_get_conversation afterwards to read the refreshed analysis.

Args:
  - conversation_id: Completed conversation ID to analyse again`,
      inputSchema: z.object({
        conversation_id: z.string().min(1).describe("Completed conversation ID"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ conversation_id }) => {
      try {
        validatePathSegment(conversation_id, "conversation_id");
        const result = await apiPost<ConversationDetail>(`/v1/convai/conversations/${conversation_id}/analysis/run`, {});
        return { content: [{ type: "text", text: `✅ Analysis rerun requested for ${result.conversation_id}. Current status: ${result.status}.` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  // ── Re-run One Conversation Evaluation ─────────────────────────────────────

  server.registerTool(
    "twelvelabs_rerun_conversation_evaluation",
    {
      title: "Re-run Conversation Evaluation",
      description: `⚠️ This starts a new evaluation of a completed conversation. Confirm with the user before calling.

Re-run one evaluation criterion without rerunning the full analysis. Use scope
"conversation" for this conversation only, or "agent" for an agent-scoped rule.

Args:
  - conversation_id: Completed conversation ID
  - evaluation_id: ID of the evaluation criterion
  - scope: Evaluation scope (default conversation)`,
      inputSchema: z.object({
        conversation_id: z.string().min(1).describe("Completed conversation ID"),
        evaluation_id: z.string().min(1).describe("Evaluation criterion ID"),
        scope: z.enum(["conversation", "agent"]).default("conversation").describe("Evaluation scope"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ conversation_id, evaluation_id, scope }) => {
      try {
        validatePathSegment(conversation_id, "conversation_id");
        validatePathSegment(evaluation_id, "evaluation_id");
        const result = await apiPost<ConversationDetail>(
          `/v1/convai/conversations/${conversation_id}/analysis/evaluations/run`,
          { evaluation_id, scope }
        );
        return { content: [{ type: "text", text: `✅ Evaluation ${evaluation_id} rerun requested for ${result.conversation_id}. Current status: ${result.status}.` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  // ── Conversation Tags ──────────────────────────────────────────────────────

  server.registerTool(
    "twelvelabs_list_conversation_tags",
    {
      title: "List Conversation Tags",
      description: `List workspace conversation tags. Use tag IDs to filter history or assign tags to conversations.`,
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(50).describe("Maximum tags to return"),
        cursor: z.string().min(1).optional().describe("Pagination cursor from a previous response"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ limit, cursor }) => {
      try {
        const data = await apiGet<ConversationTagListResponse>("/v1/convai/tags", { page_size: limit, cursor });
        const tags = data.conversation_tags ?? [];
        const lines = tags.map((tag) => `• ${tag.title} — ID: ${tag.id}${tag.description ? `\n  ${tag.description}` : ""}`);
        const pagination = data.has_more && data.next_cursor ? `\n\nMore results are available. Next cursor: ${data.next_cursor}` : "";
        return { content: [{ type: "text", text: tags.length ? `${tags.length} tag(s):\n\n${lines.join("\n")}${pagination}` : "No conversation tags found." }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  server.registerTool(
    "twelvelabs_create_conversation_tag",
    {
      title: "Create Conversation Tag",
      description: `⚠️ This creates a workspace conversation tag. Confirm with the user before calling.`,
      inputSchema: z.object({
        title: z.string().min(1).max(120).describe("Tag title"),
        description: z.string().max(1_000).optional().describe("Optional tag description"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ title, description }) => {
      try {
        const tag = await apiPost<ConversationTag>("/v1/convai/tags", { title, ...(description !== undefined ? { description } : {}) });
        return { content: [{ type: "text", text: `✅ Created conversation tag ${tag.title} (ID: ${tag.id}).` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  server.registerTool(
    "twelvelabs_update_conversation_tag",
    {
      title: "Update Conversation Tag",
      description: `⚠️ This changes a workspace conversation tag. Confirm with the user before calling. Omitted fields are unchanged.`,
      inputSchema: z.object({
        tag_id: z.string().min(1).describe("Tag ID"),
        title: z.string().min(1).max(120).optional().describe("New tag title"),
        description: z.string().max(1_000).nullable().optional().describe("New description; null removes it"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ tag_id, title, description }) => {
      try {
        validatePathSegment(tag_id, "tag_id");
        if (title === undefined && description === undefined) {
          return { content: [{ type: "text", text: "Error: Provide a title and/or description to update." }] };
        }
        const tag = await apiPatch<ConversationTag>(`/v1/convai/tags/${tag_id}`, {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
        });
        return { content: [{ type: "text", text: `✅ Updated conversation tag ${tag.title} (ID: ${tag.id}).` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  server.registerTool(
    "twelvelabs_assign_conversation_tags",
    {
      title: "Assign Conversation Tags",
      description: `⚠️ This adds workspace tags to a conversation. Confirm with the user before calling. Existing tags are left in place and assigning an existing tag is a no-op.`,
      inputSchema: z.object({
        conversation_id: z.string().min(1).describe("Conversation ID"),
        tag_ids: z.array(z.string().min(1)).min(1).max(50).describe("Tag IDs to assign"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ conversation_id, tag_ids }) => {
      try {
        validatePathSegment(conversation_id, "conversation_id");
        for (const tagId of tag_ids) validatePathSegment(tagId, "tag_id");
        await apiPost<void>(`/v1/convai/conversations/${conversation_id}/tags`, { tag_ids });
        return { content: [{ type: "text", text: `✅ Assigned ${tag_ids.length} tag(s) to conversation ${conversation_id}.` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  server.registerTool(
    "twelvelabs_remove_conversation_tag",
    {
      title: "Remove Conversation Tag",
      description: `⚠️ This removes a tag from a conversation. Confirm with the user before calling. The tag itself remains available in the workspace.`,
      inputSchema: z.object({
        conversation_id: z.string().min(1).describe("Conversation ID"),
        tag_id: z.string().min(1).describe("Tag ID to remove"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ conversation_id, tag_id }) => {
      try {
        validatePathSegment(conversation_id, "conversation_id");
        validatePathSegment(tag_id, "tag_id");
        await apiDelete(`/v1/convai/conversations/${conversation_id}/tags/${tag_id}`);
        return { content: [{ type: "text", text: `✅ Removed tag ${tag_id} from conversation ${conversation_id}.` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  server.registerTool(
    "twelvelabs_delete_conversation_tag",
    {
      title: "Delete Conversation Tag",
      description: `⚠️ IRREVERSIBLE. This deletes a workspace conversation tag and removes it from associated conversations. Confirm with the user before calling.`,
      inputSchema: z.object({
        tag_id: z.string().min(1).describe("Tag ID to permanently delete"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ tag_id }) => {
      try {
        validatePathSegment(tag_id, "tag_id");
        await apiDelete(`/v1/convai/tags/${tag_id}`);
        return { content: [{ type: "text", text: `✅ Deleted conversation tag ${tag_id}.` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );
}

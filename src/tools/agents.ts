/**
 * Agent Tools
 *
 * These tools let Claude inspect and modify ElevenLabs Conversational AI agents
 * via the TwelveLabs MCP server. The most important one is twelvelabs_get_agent,
 * which returns the FULL config including the system prompt, LLM model, voice
 * settings, and webhook — things the official ElevenLabs MCP connector doesn't
 * expose.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, apiPatch, formatError, validatePathSegment } from "../client.js";
import type {
  AgentDetail,
  AgentListResponse,
  ConversationListResponse,
} from "../types.js";

/** Register all agent-related tools onto the MCP server instance. */
export function registerAgentTools(server: McpServer): void {

  // ── List Agents ────────────────────────────────────────────────────────────

  server.registerTool(
    "twelvelabs_list_agents",
    {
      title: "List Agents",
      description: `List all Conversational AI agents in your ElevenLabs account.

Returns each agent's ID, name, and creation timestamp. Use this to find agent IDs
before calling twelvelabs_get_agent for full details.

Returns: Array of { agent_id, name, created_at_unix_secs }`,
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => {
      try {
        const data = await apiGet<AgentListResponse>("/v1/convai/agents");
        const agents = data.agents ?? [];
        const lines = agents.map((a) => {
          const ts = a.created_at_unix_secs
            ? new Date(a.created_at_unix_secs * 1000).toISOString()
            : "unknown";
          return `• ${a.name} — ID: ${a.agent_id} (created ${ts})`;
        });
        const text = agents.length
          ? `Found ${agents.length} agent(s):\n\n${lines.join("\n")}`
          : "No agents found.";
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  // ── Get Agent ──────────────────────────────────────────────────────────────

  server.registerTool(
    "twelvelabs_get_agent",
    {
      title: "Get Agent Config",
      description: `Get the FULL configuration of an ElevenLabs agent, including fields the
official ElevenLabs MCP connector does not expose:

- Complete system prompt text
- LLM model (e.g., gpt-4.1-nano, claude-3-5-haiku)
- Temperature setting
- All knowledge base document references
- Voice ID and TTS settings (stability, similarity_boost)
- Language configuration
- Webhook URL (if configured)
- First message

Args:
  - agent_id: The agent's ID string (get from twelvelabs_list_agents)

Returns: Full agent configuration as formatted text.`,
      inputSchema: z.object({
        agent_id: z.string().min(1).describe("The agent ID — get from twelvelabs_list_agents"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ agent_id }) => {
      try {
        validatePathSegment(agent_id, "agent_id");
        const agent = await apiGet<AgentDetail>(`/v1/convai/agents/${agent_id}`);
        const cfg = agent.conversation_config;
        const agentCfg = cfg?.agent;
        const promptCfg = agentCfg?.prompt;
        const tts = cfg?.tts;
        const webhook = agent.platform_settings?.webhook;

        // Truncate prompt for display — full prompt can be many KB
        const promptText = promptCfg?.prompt ?? "";
        const promptPreview = promptText.length > 500
          ? promptText.slice(0, 500) + `\n... [${promptText.length} chars total — truncated for display]`
          : promptText;

        const kbDocs = (promptCfg?.knowledge_base ?? [])
          .map((d) => `  • ${d.name} (${d.id}) — usage: ${d.usage_mode}`)
          .join("\n") || "  (none)";

        const text = [
          `# Agent: ${agent.name}`,
          `**ID:** ${agent.agent_id}`,
          ``,
          `## LLM`,
          `Model: ${promptCfg?.llm ?? "not set"}`,
          `Temperature: ${promptCfg?.temperature ?? "not set"}`,
          ``,
          `## Voice (TTS)`,
          `Voice ID: ${tts?.voice_id ?? "not set"}`,
          `Stability: ${tts?.stability ?? "not set"}`,
          `Similarity Boost: ${tts?.similarity_boost ?? "not set"}`,
          `Model: ${tts?.model_id ?? "not set"}`,
          ``,
          `## Language`,
          `${agentCfg?.language ?? "not set"}`,
          ``,
          `## First Message`,
          agentCfg?.first_message ?? "(not set)",
          ``,
          `## Knowledge Base Documents`,
          kbDocs,
          ``,
          `## System Prompt (preview)`,
          promptPreview,
          ``,
          `## Webhook`,
          webhook?.url ? `URL: ${webhook.url}` : "(not configured)",
        ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  // ── Get Full System Prompt ─────────────────────────────────────────────────

  server.registerTool(
    "twelvelabs_get_agent_prompt",
    {
      title: "Get Agent System Prompt (Full)",
      description: `Get the complete, untruncated system prompt for an ElevenLabs agent.

Use this when you need to read, review, or edit the full prompt text.
twelvelabs_get_agent truncates the prompt to 500 chars for readability —
this tool returns the entire thing.

Args:
  - agent_id: The agent ID`,
      inputSchema: z.object({
        agent_id: z.string().min(1).describe("The agent ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ agent_id }) => {
      try {
        validatePathSegment(agent_id, "agent_id");
        const agent = await apiGet<AgentDetail>(`/v1/convai/agents/${agent_id}`);
        const prompt = agent.conversation_config?.agent?.prompt?.prompt ?? "";
        const text = prompt.length
          ? `System prompt (${prompt.length} chars):\n\n${prompt}`
          : "No system prompt configured.";
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  // ── Update Agent Prompt ────────────────────────────────────────────────────

  server.registerTool(
    "twelvelabs_update_agent_prompt",
    {
      title: "Update Agent System Prompt",
      description: `Replace the system prompt and/or first message for an ElevenLabs agent.

This uses a PATCH request, so any fields you omit are left unchanged.
Only touches prompt text and first_message — does not affect voice, LLM model,
or other settings.

Args:
  - agent_id: The agent ID
  - prompt: New system prompt text (omit to leave unchanged)
  - first_message: New first message (omit to leave unchanged)

Returns: Confirmation with the updated agent name.`,
      inputSchema: z.object({
        agent_id: z.string().min(1).describe("The agent ID"),
        prompt: z.string().max(100_000).optional().describe("New system prompt text (max 100K chars)"),
        first_message: z.string().max(5_000).optional().describe("New first message (max 5K chars)"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ agent_id, prompt, first_message }) => {
      try {
        validatePathSegment(agent_id, "agent_id");
        if (!prompt && !first_message) {
          return { content: [{ type: "text", text: "Error: Provide at least one of prompt or first_message." }] };
        }

        // Build a minimal patch body — only include keys the caller provided.
        // The ElevenLabs PATCH endpoint merges, so omitted keys are untouched.
        const agentUpdate: Record<string, unknown> = {};
        const promptUpdate: Record<string, unknown> = {};

        if (prompt !== undefined) promptUpdate.prompt = prompt;
        if (Object.keys(promptUpdate).length) agentUpdate.prompt = promptUpdate;
        if (first_message !== undefined) agentUpdate.first_message = first_message;

        await apiPatch(`/v1/convai/agents/${agent_id}`, {
          conversation_config: { agent: agentUpdate },
        });

        const parts: string[] = [];
        if (prompt !== undefined) parts.push(`system prompt (${prompt.length} chars)`);
        if (first_message !== undefined) parts.push("first message");

        return {
          content: [{ type: "text", text: `✅ Updated ${parts.join(" and ")} for agent ${agent_id}.` }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  // ── Update Agent Settings ─────────────────────────────────────────────────

  server.registerTool(
    "twelvelabs_update_agent_settings",
    {
      title: "Update Agent Settings",
      description: `Update voice, LLM, temperature, or language settings for an agent.

All parameters are optional — only provide the ones you want to change.
Omitted values are left unchanged (PATCH semantics).

Args:
  - agent_id: The agent ID
  - temperature: LLM temperature 0.0–1.0 (higher = more varied responses)
  - voice_id: ElevenLabs voice ID string
  - stability: TTS voice stability 0.0–1.0
  - similarity_boost: TTS voice similarity boost 0.0–1.0
  - language: Language code string (e.g. "en", "ja")

Returns: Confirmation of what was changed.`,
      inputSchema: z.object({
        agent_id: z.string().min(1).describe("The agent ID"),
        temperature: z.number().min(0).max(1).optional().describe("LLM temperature 0-1"),
        voice_id: z.string().optional().describe("ElevenLabs voice ID"),
        stability: z.number().min(0).max(1).optional().describe("TTS stability 0-1"),
        similarity_boost: z.number().min(0).max(1).optional().describe("TTS similarity boost 0-1"),
        language: z.string().optional().describe("Language code, e.g. 'en' or 'ja'"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ agent_id, temperature, voice_id, stability, similarity_boost, language }) => {
      try {
        validatePathSegment(agent_id, "agent_id");
        const conversationConfig: Record<string, unknown> = {};

        if (temperature !== undefined) {
          conversationConfig.agent = {
            prompt: { temperature },
            ...(language !== undefined ? { language } : {}),
          };
        } else if (language !== undefined) {
          conversationConfig.agent = { language };
        }

        const ttsUpdate: Record<string, unknown> = {};
        if (voice_id !== undefined) ttsUpdate.voice_id = voice_id;
        if (stability !== undefined) ttsUpdate.stability = stability;
        if (similarity_boost !== undefined) ttsUpdate.similarity_boost = similarity_boost;
        if (Object.keys(ttsUpdate).length) conversationConfig.tts = ttsUpdate;

        if (!Object.keys(conversationConfig).length) {
          return { content: [{ type: "text", text: "Error: Provide at least one setting to update." }] };
        }

        await apiPatch(`/v1/convai/agents/${agent_id}`, { conversation_config: conversationConfig });

        const changed: string[] = [];
        if (temperature !== undefined) changed.push(`temperature → ${temperature}`);
        if (voice_id !== undefined) changed.push(`voice_id → ${voice_id}`);
        if (stability !== undefined) changed.push(`stability → ${stability}`);
        if (similarity_boost !== undefined) changed.push(`similarity_boost → ${similarity_boost}`);
        if (language !== undefined) changed.push(`language → ${language}`);

        return { content: [{ type: "text", text: `✅ Updated: ${changed.join(", ")} for agent ${agent_id}.` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  // ── List Agent Conversations ───────────────────────────────────────────────

  server.registerTool(
    "twelvelabs_list_agent_conversations",
    {
      title: "List Agent Conversations",
      description: `List recent conversations for a specific ElevenLabs agent.

Useful for finding conversation IDs to pass to twelvelabs_get_conversation
for full transcripts and data collection analysis.

Args:
  - agent_id: The agent ID
  - limit: Number of conversations to return (1–100, default 20)

Returns: List of conversations with ID, status, duration, and timestamp.`,
      inputSchema: z.object({
        agent_id: z.string().min(1).describe("The agent ID"),
        limit: z.number().int().min(1).max(100).default(20).describe("Max results (default 20)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ agent_id, limit }) => {
      try {
        validatePathSegment(agent_id, "agent_id");
        const data = await apiGet<ConversationListResponse>(
          "/v1/convai/conversations",
          { agent_id, page_size: limit }
        );
        const convos = data.conversations ?? [];
        if (!convos.length) return { content: [{ type: "text", text: "No conversations found for this agent." }] };

        const lines = convos.map((c) => {
          const ts = c.start_time_unix_secs
            ? new Date(c.start_time_unix_secs * 1000).toISOString()
            : "unknown time";
          const dur = c.call_duration_secs ? `${c.call_duration_secs}s` : "unknown duration";
          return `• ${c.conversation_id} | ${c.status} | ${dur} | ${ts}`;
        });
        return { content: [{ type: "text", text: `${convos.length} conversation(s):\n\n${lines.join("\n")}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  // ── Get/Set Webhook ────────────────────────────────────────────────────────

  server.registerTool(
    "twelvelabs_get_agent_webhook",
    {
      title: "Get Agent Webhook Config",
      description: `Get the post-call webhook URL configured for an agent.

Args:
  - agent_id: The agent ID`,
      inputSchema: z.object({
        agent_id: z.string().min(1),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ agent_id }) => {
      try {
        validatePathSegment(agent_id, "agent_id");
        const agent = await apiGet<AgentDetail>(`/v1/convai/agents/${agent_id}`);
        const webhook = agent.platform_settings?.webhook;
        const text = webhook?.url
          ? `Webhook URL: ${webhook.url}\nSecret configured: ${!!webhook.secret}`
          : "No webhook configured for this agent.";
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  server.registerTool(
    "twelvelabs_set_agent_webhook",
    {
      title: "Set Agent Webhook URL",
      description: `Set or update the post-call webhook URL for an ElevenLabs agent.

ElevenLabs will POST a payload to this URL after each conversation ends,
containing the transcript and data collection results. Pass an empty string
to remove the webhook.

Args:
  - agent_id: The agent ID
  - url: The webhook URL (empty string to remove)`,
      inputSchema: z.object({
        agent_id: z.string().min(1),
        url: z.string().max(2_000).refine(
          (val) => val === "" || /^https:\/\/.+/.test(val),
          { message: "Webhook URL must use HTTPS (or be empty to remove)" }
        ).describe("Webhook URL (HTTPS required), or empty string to remove"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ agent_id, url }) => {
      try {
        validatePathSegment(agent_id, "agent_id");
        await apiPatch(`/v1/convai/agents/${agent_id}`, {
          platform_settings: { webhook: { url: url || null } },
        });
        const text = url
          ? `✅ Webhook set to: ${url}`
          : "✅ Webhook removed from agent.";
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );
}

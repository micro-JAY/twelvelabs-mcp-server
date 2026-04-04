/**
 * Voice Tools
 *
 * Lets you browse available voices so you can find voice IDs
 * to pass to twelvelabs_update_agent_settings.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, formatError } from "../client.js";
import type { VoicesResponse } from "../types.js";

export function registerVoiceTools(server: McpServer): void {

  server.registerTool(
    "twelvelabs_list_voices",
    {
      title: "List Voices",
      description: `List available voices in your ElevenLabs account.

Returns voice IDs, names, categories, and labels.
Use the voice_id values with twelvelabs_update_agent_settings.

Args:
  - search: Optional text filter applied to voice names`,
      inputSchema: z.object({
        search: z.string().optional().describe("Filter voices by name (case-insensitive)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ search }) => {
      try {
        const data = await apiGet<VoicesResponse>("/v1/voices");
        let voices = data.voices ?? [];

        if (search) {
          const q = search.toLowerCase();
          voices = voices.filter((v) => v.name.toLowerCase().includes(q));
        }

        if (!voices.length) {
          return { content: [{ type: "text", text: search ? `No voices matching "${search}".` : "No voices found." }] };
        }

        const lines = voices.map((v) => {
          const labels = v.labels ? Object.entries(v.labels).map(([k, val]) => `${k}:${val}`).join(", ") : "";
          const desc = labels ? ` [${labels}]` : "";
          return `• ${v.name}${desc}\n  ID: ${v.voice_id} | category: ${v.category ?? "unknown"}`;
        });

        return { content: [{ type: "text", text: `${voices.length} voice(s):\n\n${lines.join("\n\n")}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );
}

/**
 * Knowledge Base Tools
 *
 * ElevenLabs lets you attach documents to agents — the agent can reference
 * these during conversations. This file provides tools to list, read, add,
 * and delete those documents.
 *
 * Two usage modes exist per document:
 *  - "auto"   → RAG mode: ElevenLabs retrieves relevant chunks per turn
 *  - "prompt" → Always include: the full document is injected every turn
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, apiPost, apiDelete, formatError, validatePathSegment } from "../client.js";
import type { KnowledgeBaseDoc, KnowledgeBaseListResponse } from "../types.js";

export function registerKnowledgeBaseTools(server: McpServer): void {

  // ── List KB Docs ───────────────────────────────────────────────────────────

  server.registerTool(
    "twelvelabs_list_kb_docs",
    {
      title: "List Knowledge Base Documents",
      description: `List all documents in your ElevenLabs knowledge base.

Note: KB documents exist at the account level, not per-agent. They are
referenced from agents via the agent's knowledge_base config array.
Use twelvelabs_get_agent to see which docs a specific agent has attached.

Returns: Each doc's ID, name, type (file/url), size, and creation date.`,
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => {
      try {
        const data = await apiGet<KnowledgeBaseListResponse>("/v1/convai/knowledge-base");
        const docs = data.documents ?? [];
        if (!docs.length) return { content: [{ type: "text", text: "No knowledge base documents found." }] };

        const lines = docs.map((d) => {
          const size = d.metadata?.size_bytes ? `${Math.round(d.metadata.size_bytes / 1024)}KB` : "unknown size";
          const ts = d.metadata?.created_at_unix_secs
            ? new Date(d.metadata.created_at_unix_secs * 1000).toISOString().split("T")[0]
            : "unknown date";
          return `• ${d.name} — ID: ${d.id} | type: ${d.type} | ${size} | created: ${ts}`;
        });
        return { content: [{ type: "text", text: `${docs.length} document(s):\n\n${lines.join("\n")}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  // ── Get KB Doc ─────────────────────────────────────────────────────────────

  server.registerTool(
    "twelvelabs_get_kb_doc",
    {
      title: "Get Knowledge Base Document",
      description: `Get the full content of a knowledge base document, including its extracted text.

Args:
  - doc_id: The document ID (from twelvelabs_list_kb_docs)

Returns: Document metadata plus the full extracted text content.`,
      inputSchema: z.object({
        doc_id: z.string().min(1).describe("The document ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ doc_id }) => {
      try {
        validatePathSegment(doc_id, "doc_id");
        const doc = await apiGet<KnowledgeBaseDoc>(`/v1/convai/knowledge-base/${doc_id}`);

        // Strip HTML tags from extracted_inner_html to get readable plain text
        const rawHtml = doc.extracted_inner_html ?? "";
        const plainText = rawHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

        const text = [
          `# ${doc.name}`,
          `ID: ${doc.id}`,
          `Type: ${doc.type}`,
          `Size: ${doc.metadata?.size_bytes ? `${doc.metadata.size_bytes} bytes` : "unknown"}`,
          `Supported usages: ${doc.supported_usages?.join(", ") ?? "unknown"}`,
          ``,
          `## Content`,
          plainText || "(no content extracted)",
        ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  // ── Add KB Text ────────────────────────────────────────────────────────────

  server.registerTool(
    "twelvelabs_add_kb_text",
    {
      title: "Add Text Document to Knowledge Base",
      description: `Add a plain text document to the ElevenLabs knowledge base.

After adding, attach it to an agent by updating the agent's knowledge_base
config with the returned document ID.

Args:
  - name: Display name for the document
  - text: The full text content to store

Returns: The new document's ID and name.`,
      inputSchema: z.object({
        name: z.string().min(1).max(200).describe("Display name for the document"),
        text: z.string().min(1).max(500_000).describe("The full text content (max 500K chars)"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ name, text }) => {
      try {
        // ElevenLabs text KB endpoint expects multipart form data.
        // We POST as JSON to the /text endpoint instead, which accepts
        // { name, text } directly.
        const result = await apiPost<{ id: string; name: string }>(
          "/v1/convai/knowledge-base/text",
          { name, text }
        );
        return {
          content: [{
            type: "text",
            text: `✅ Document created:\nName: ${result.name}\nID: ${result.id}\n\nTo attach to an agent, use twelvelabs_update_agent_kb with this ID.`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  // ── Add KB URL ─────────────────────────────────────────────────────────────

  server.registerTool(
    "twelvelabs_add_kb_url",
    {
      title: "Add URL to Knowledge Base",
      description: `Add a web page to the knowledge base by URL. ElevenLabs will crawl
the URL and extract the text content.

Args:
  - name: Display name for the document
  - url: The URL to crawl

Returns: The new document's ID.`,
      inputSchema: z.object({
        name: z.string().min(1).max(200).describe("Display name for the document"),
        url: z.string().url().max(2_000).refine(val => val.startsWith("https://"), { message: "URL must use HTTPS" }).describe("The URL to crawl (HTTPS required)"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ name, url }) => {
      try {
        const result = await apiPost<{ id: string; name: string }>(
          "/v1/convai/knowledge-base/url",
          { name, url }
        );
        return {
          content: [{
            type: "text",
            text: `✅ URL document created:\nName: ${result.name}\nID: ${result.id}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );

  // ── Delete KB Doc ──────────────────────────────────────────────────────────

  server.registerTool(
    "twelvelabs_delete_kb_doc",
    {
      title: "Delete Knowledge Base Document",
      description: `Permanently delete a knowledge base document.

WARNING: This is irreversible. The document will also be detached from any
agents that reference it.

Args:
  - doc_id: The document ID to delete`,
      inputSchema: z.object({
        doc_id: z.string().min(1).describe("The document ID to delete"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ doc_id }) => {
      try {
        validatePathSegment(doc_id, "doc_id");
        await apiDelete(`/v1/convai/knowledge-base/${doc_id}`);
        return { content: [{ type: "text", text: `✅ Document ${doc_id} deleted.` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }] };
      }
    }
  );
}

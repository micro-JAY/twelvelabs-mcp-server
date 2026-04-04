#!/usr/bin/env node
/**
 * TwelveLabs MCP Server — Main Entry Point
 *
 * ─── What is an MCP server? ──────────────────────────────────────────────────
 *
 * MCP (Model Context Protocol) is a standard that lets an LLM call "tools"
 * that live in an external process. Instead of hardcoding API calls inside the
 * LLM host (like Claude.ai), MCP separates the tool implementations into a
 * standalone server process that Claude talks to over a simple protocol.
 *
 * The flow:
 *   Claude (client) ──stdio──► TwelveLabs MCP Server (this file) ──HTTPS──► ElevenLabs API
 *
 * Claude sends a JSON message like:
 *   { method: "tools/call", params: { name: "twelvelabs_get_agent", arguments: { agent_id: "..." } } }
 *
 * The MCP server receives it, calls ElevenLabs, and streams back:
 *   { content: [{ type: "text", text: "Agent: Tonari-Tutor-v1.2 ..." }] }
 *
 * ─── Transport: stdio ────────────────────────────────────────────────────────
 *
 * We use stdio transport — meaning Claude's host process (e.g. Claude Desktop)
 * spawns this Node.js process as a child and communicates via stdin/stdout.
 * That's why you'll see console.error() instead of console.log() for logging:
 * stdout is reserved for the MCP protocol messages; anything we log must go to
 * stderr to avoid corrupting the protocol stream.
 *
 * ─── Tool registration ───────────────────────────────────────────────────────
 *
 * Each tool is defined in a separate file under src/tools/. We call
 * register*Tools(server) here to attach them all to the McpServer instance.
 * McpServer then handles the protocol machinery (list_tools, call_tool, etc.)
 * automatically — we never write raw protocol handlers.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { initClient } from "./client.js";
import { registerAgentTools } from "./tools/agents.js";
import { registerKnowledgeBaseTools } from "./tools/knowledge-base.js";
import { registerConversationTools } from "./tools/conversations.js";
import { registerVoiceTools } from "./tools/voices.js";

// ── Server Instantiation ──────────────────────────────────────────────────────
//
// McpServer is the SDK class that handles the MCP protocol. Give it a name
// and version — Claude sees these when it connects and lists available servers.

const server = new McpServer({
  name: "twelvelabs-mcp-server",
  version: "1.0.0",
});

// ── Register All Tools ────────────────────────────────────────────────────────
//
// Each register*Tools call adds a group of related tools to the server.
// The server exposes the full list when Claude calls tools/list.

registerAgentTools(server);
registerKnowledgeBaseTools(server);
registerConversationTools(server);
registerVoiceTools(server);

// ── Start ─────────────────────────────────────────────────────────────────────
//
// initClient() reads the ElevenLabs API key from the environment and builds the
// shared Axios instance. It exits with an error if the key is missing so you
// get a clear message instead of a mysterious 401 later.
//
// StdioServerTransport wires stdin → MCP protocol parser → tool dispatch →
// stdout. Once connected, the process stays alive waiting for tool calls.

async function main() {
  initClient();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stderr is safe — it goes to the host's log, not the protocol stream
  console.error("[twelvelabs-mcp] Server running via stdio — ready for tool calls.");

  // Graceful shutdown — clean up MCP connection on process signals
  const shutdown = async () => {
    console.error("[twelvelabs-mcp] Shutting down...");
    try {
      await server.close();
    } catch {
      // Ignore close errors during shutdown
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

process.on("unhandledRejection", (reason) => {
  console.error("[twelvelabs-mcp] Unhandled rejection:", reason);
  // Don't exit — let the MCP protocol handle it
});

main().catch((err) => {
  console.error("[twelvelabs-mcp] Fatal startup error:", err);
  process.exit(1);
});

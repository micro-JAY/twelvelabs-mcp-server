# TwelveLabs MCP Server

> **This project is not affiliated with TwelveLabs (the video understanding platform).** It is an MCP server for the **[ElevenLabs](https://elevenlabs.io) Conversational AI API** — voice agents, knowledge bases, conversations, and TTS. The name "TwelveLabs" is the project codename only.

An enhanced MCP (Model Context Protocol) server that gives any compatible MCP
client direct access to the ElevenLabs Conversational AI API -- including
capabilities the official ElevenLabs MCP connector doesn't expose.

## What this covers

- **Agents** -- list, get full config (including LLM model + temperature), update prompt/settings, manage webhooks and file uploads
- **Knowledge Base** -- list, read full content, add text/URL docs, delete docs
- **Conversations** -- filter and tag history, inspect transcripts, and rerun post-call analysis/evaluations
- **Voices** -- list and search available voices

## Prerequisites

- **Node.js >= 18**
- **ElevenLabs API key** -- get one at [elevenlabs.io](https://elevenlabs.io)

## Quick Start

### Option A: npx (no clone needed)

```bash
ELEVENLABS_API_KEY=your-key npx twelvelabs-mcp-server
```

### Option B: Clone and build

```bash
git clone https://github.com/micro-JAY/twelvelabs-mcp-server.git
cd twelvelabs-mcp-server
npm install --include=dev
npm run build
```

### Connect an MCP client

Add an equivalent server entry to your MCP client's configuration. The config
file location and surrounding syntax vary by client; this is the standard stdio
server definition:

```json
{
  "mcpServers": {
    "twelvelabs": {
      "command": "node",
      "args": ["/path/to/twelvelabs-mcp-server/dist/index.js"],
      "env": {
        "ELEVENLABS_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart or reconnect your MCP client. You should see `twelvelabs` in its
available tools list.

### Use it

Ask your MCP-enabled assistant to use the tools, for example:

> "List my agents"
> "Get the full config for agent_1001kjbh14xce5kbreh55ydf4rae"
> "Show me the last 10 conversations for that agent"
> "Get the transcript and analysis for conversation_xyz"

### Compatibility

This server works with MCP clients that support the **stdio** transport and let
you configure environment variables for a local server process. Clients that
only support remote HTTP MCP servers need a compatible stdio bridge or proxy.

## Tool Reference

### Agent Tools
| Tool | What it does |
|------|-------------|
| `twelvelabs_list_agents` | List all agents in your account |
| `twelvelabs_get_agent` | Full config: LLM model, voice, KB docs, webhook, prompt preview |
| `twelvelabs_get_agent_prompt` | Full untruncated system prompt text |
| `twelvelabs_update_agent_prompt` | Replace system prompt and/or first message |
| `twelvelabs_update_agent_settings` | Change temperature, voice, TTS settings, language |
| `twelvelabs_update_agent_conversation_capabilities` | Enable chat file uploads and set the maximum-duration message |
| `twelvelabs_list_agent_conversations` | Recent conversations for one agent |
| `twelvelabs_get_agent_webhook` | Current webhook URL |
| `twelvelabs_set_agent_webhook` | Set or remove webhook URL |

### Knowledge Base Tools
| Tool | What it does |
|------|-------------|
| `twelvelabs_list_kb_docs` | All KB docs with size and creation date |
| `twelvelabs_get_kb_doc` | Full extracted text content of a doc |
| `twelvelabs_add_kb_text` | Add a plain text document |
| `twelvelabs_add_kb_url` | Add a web page by URL |
| `twelvelabs_delete_kb_doc` | Permanently delete a doc |

### Conversation Tools
| Tool | What it does |
|------|-------------|
| `twelvelabs_list_conversations` | Filter history by agent, time, success, duration, rating, status, and tags |
| `twelvelabs_get_conversation` | Full transcript, audio/tag metadata, data collection, and evaluation results |
| `twelvelabs_rerun_conversation_analysis` | Reanalyse a completed conversation using current agent settings |
| `twelvelabs_rerun_conversation_evaluation` | Rerun a single evaluation criterion for a completed conversation |
| `twelvelabs_list_conversation_tags` | List workspace conversation tags |
| `twelvelabs_create_conversation_tag` | Create a workspace conversation tag |
| `twelvelabs_update_conversation_tag` | Rename a tag or change its description |
| `twelvelabs_assign_conversation_tags` | Apply one or more tags to a conversation |
| `twelvelabs_remove_conversation_tag` | Remove a tag from a conversation |
| `twelvelabs_delete_conversation_tag` | Permanently delete a workspace conversation tag |

### Voice Tools
| Tool | What it does |
|------|-------------|
| `twelvelabs_list_voices` | Browse available voices with IDs and labels |

## Security

- **Input validation** -- all tool parameters are validated with Zod schemas before reaching the API
- **HTTPS enforcement** -- webhook URLs are validated to use HTTPS only
- **Path traversal protection** -- document and agent IDs are sanitized to prevent path traversal
- **Error sanitization** -- internal errors are caught and returned as safe MCP error responses; raw stack traces are never exposed to the client

## Development

```bash
npm run dev   # watch mode with tsx -- auto-reloads on file changes
npm run build # compile to dist/
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -m 'feat: add my feature'`)
4. Push to the branch (`git push origin feat/my-feature`)
5. Open a Pull Request

## License

MIT -- see [LICENSE](./LICENSE) for details.

## Architecture Note

All tools share a single Axios client instance (`src/client.ts`) initialised from
`ELEVENLABS_API_KEY` at startup. Tool implementations live in `src/tools/` -- one
file per domain -- and are registered onto the McpServer in `src/index.ts`. The
server communicates over stdio transport (stdin/stdout), which is why all debug
logging uses `console.error` (stderr), not `console.log`.

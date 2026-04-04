# TwelveLabs MCP Server

An enhanced MCP (Model Context Protocol) server that gives Claude direct access to
the ElevenLabs Conversational AI API — including capabilities the official
ElevenLabs MCP connector doesn't expose.

## What this covers

- **Agents** — list, get full config (including LLM model + temperature), update prompt/settings, manage webhooks
- **Knowledge Base** — list, read full content, add text/URL docs, delete docs
- **Conversations** — list, get full transcript + data_collection analysis
- **Voices** — list and search available voices

## Quick Start

### 1. Build

```bash
npm install --include=dev
npm run build
```

### 2. Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "twelvelabs": {
      "command": "node",
      "args": ["/Volumes/TONARI_DRIVE/Dev/tonarilabs/twelvelabs-mcp-server/dist/index.js"],
      "env": {
        "ELEVENLABS_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Then restart Claude Desktop. You should see "twelvelabs" in the available tools panel.

### 3. Use it

In any Claude conversation:

> "List my agents"
> "Get the full config for agent_1001kjbh14xce5kbreh55ydf4rae"
> "Show me the last 10 conversations for that agent"
> "Get the transcript and analysis for conversation_xyz"

## Tool Reference

### Agent Tools
| Tool | What it does |
|------|-------------|
| `twelvelabs_list_agents` | List all agents in your account |
| `twelvelabs_get_agent` | Full config: LLM model, voice, KB docs, webhook, prompt preview |
| `twelvelabs_get_agent_prompt` | Full untruncated system prompt text |
| `twelvelabs_update_agent_prompt` | Replace system prompt and/or first message |
| `twelvelabs_update_agent_settings` | Change temperature, voice, TTS settings, language |
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
| `twelvelabs_list_conversations` | Recent conversations (optionally filtered by agent) |
| `twelvelabs_get_conversation` | Full transcript + data_collection + evaluation_criteria |

### Voice Tools
| Tool | What it does |
|------|-------------|
| `twelvelabs_list_voices` | Browse available voices with IDs and labels |

## Development

```bash
npm run dev   # watch mode with tsx — auto-reloads on file changes
npm run build # compile to dist/
```

## Architecture Note

All tools share a single Axios client instance (`src/client.ts`) initialised from
`ELEVENLABS_API_KEY` at startup. Tool implementations live in `src/tools/` — one
file per domain — and are registered onto the McpServer in `src/index.ts`. The
server communicates over stdio transport (stdin/stdout), which is why all debug
logging uses `console.error` (stderr), not `console.log`.

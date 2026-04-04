/**
 * TypeScript interfaces for the ElevenLabs Conversational AI API responses
 * used by TwelveLabs MCP tools.
 *
 * We define these manually rather than generating them from an OpenAPI spec
 * because (a) ElevenLabs' spec is incomplete/inconsistent, and (b) we only
 * need the fields we actually surface to the LLM — extra fields we ignore.
 *
 * All interfaces use readonly where the data comes from the API and we
 * have no reason to mutate it locally.
 */

// ─── Agents ──────────────────────────────────────────────────────────────────

export interface AgentSummary {
  readonly agent_id: string;
  readonly name: string;
  readonly created_at_unix_secs?: number;
  readonly access_level?: string;
}

export interface AgentListResponse {
  readonly agents: AgentSummary[];
  readonly has_more?: boolean;
  readonly next_cursor?: string;
}

export interface KnowledgeBaseRef {
  readonly id: string;
  readonly name: string;
  readonly type: "file" | "url";
  readonly usage_mode: "auto" | "prompt";
}

export interface AgentPromptConfig {
  readonly prompt: string;
  readonly knowledge_base?: KnowledgeBaseRef[];
  readonly temperature?: number;
  readonly llm?: string;
}

export interface AgentConfig {
  readonly first_message?: string;
  readonly prompt: AgentPromptConfig;
  readonly language?: string;
}

export interface TtsConfig {
  readonly voice_id?: string;
  readonly stability?: number;
  readonly similarity_boost?: number;
  readonly model_id?: string;
}

export interface ConversationConfig {
  readonly agent?: AgentConfig;
  readonly tts?: TtsConfig;
}

export interface WebhookConfig {
  readonly url?: string;
  readonly secret?: string;
}

export interface PlatformSettings {
  readonly webhook?: WebhookConfig;
}

export interface AgentDetail {
  readonly agent_id: string;
  readonly name: string;
  readonly conversation_config?: ConversationConfig;
  readonly platform_settings?: PlatformSettings;
  readonly metadata?: { readonly created_at_unix_secs?: number };
}

// ─── Knowledge Base ──────────────────────────────────────────────────────────

export interface KnowledgeBaseDoc {
  readonly id: string;
  readonly name: string;
  readonly type: "file" | "url";
  readonly metadata?: {
    readonly created_at_unix_secs?: number;
    readonly size_bytes?: number;
  };
  readonly supported_usages?: string[];
  readonly extracted_inner_html?: string;
  readonly filename?: string;
}

export interface KnowledgeBaseListResponse {
  readonly documents?: KnowledgeBaseDoc[];
}

// ─── Conversations ────────────────────────────────────────────────────────────

export interface ConversationSummary {
  readonly conversation_id: string;
  readonly agent_id: string;
  readonly status: string;
  readonly start_time_unix_secs?: number;
  readonly call_duration_secs?: number;
  readonly metadata?: Record<string, unknown>;
}

export interface ConversationListResponse {
  readonly conversations: ConversationSummary[];
  readonly has_more?: boolean;
  readonly next_cursor?: string;
}

export interface TranscriptMessage {
  readonly role: "agent" | "user";
  readonly message: string;
  readonly time_in_call_secs?: number;
}

export interface DataCollectionResult {
  readonly [field: string]: string | boolean | number | null;
}

export interface EvaluationCriteriaResult {
  readonly [criterion: string]: boolean;
}

export interface ConversationAnalysis {
  readonly data_collection?: DataCollectionResult;
  readonly evaluation_criteria?: EvaluationCriteriaResult;
  readonly call_successful?: string;
}

export interface ConversationDetail {
  readonly conversation_id: string;
  readonly agent_id: string;
  readonly status: string;
  readonly start_time_unix_secs?: number;
  readonly call_duration_secs?: number;
  readonly transcript?: TranscriptMessage[];
  readonly analysis?: ConversationAnalysis;
  readonly metadata?: Record<string, unknown>;
}

// ─── Voices ──────────────────────────────────────────────────────────────────

export interface VoiceSummary {
  readonly voice_id: string;
  readonly name: string;
  readonly category?: string;
  readonly labels?: Record<string, string>;
  readonly description?: string;
}

export interface VoicesResponse {
  readonly voices: VoiceSummary[];
}

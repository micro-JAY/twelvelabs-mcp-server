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
  readonly max_conversation_duration_message?: string;
}

export interface FileInputConfig {
  readonly enabled?: boolean;
  readonly max_files_per_conversation?: number;
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
  readonly file_input?: FileInputConfig;
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
  readonly agent_name?: string | null;
  readonly call_successful?: "success" | "failure" | "unknown";
  readonly call_success_score?: number;
  readonly transcript_summary?: string;
  readonly call_summary_title?: string;
  readonly termination_reason?: string;
  readonly tag_ids?: string[];
  readonly sentiment_analysis?: ConversationSentiment;
  readonly metadata?: Record<string, unknown>;
}

export interface ConversationSentiment {
  readonly overall_label?: "positive" | "neutral" | "negative";
  readonly overall_sentiment_score?: number;
  readonly overall_frustration_score?: number;
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
  readonly ignored_as_backchannel?: boolean;
  readonly user_identifier?: string;
  readonly contextual_update_info?: {
    readonly context_id?: string;
    readonly is_superseded?: boolean;
  };
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
  readonly data_collection_results?: Record<string, ConversationAnalysisResult>;
  readonly evaluation_criteria_results?: Record<string, ConversationAnalysisResult>;
  readonly call_successful?: string;
  readonly call_success_score?: number;
  readonly transcript_summary?: string;
  readonly call_summary_title?: string;
}

export interface ConversationAnalysisResult {
  readonly criteria_id?: string;
  readonly data_collection_id?: string;
  readonly result?: string;
  readonly value?: string | number | boolean | null | Record<string, unknown>;
  readonly rationale?: string;
}

export interface ConversationDetail {
  readonly conversation_id: string;
  readonly agent_id: string;
  readonly status: string;
  readonly start_time_unix_secs?: number;
  readonly call_duration_secs?: number;
  readonly agent_name?: string | null;
  readonly branch_id?: string | null;
  readonly version_id?: string | null;
  readonly environment?: string;
  readonly has_audio?: boolean;
  readonly has_user_audio?: boolean;
  readonly has_response_audio?: boolean;
  readonly has_auxiliary_audio?: boolean;
  readonly tag_ids?: string[];
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

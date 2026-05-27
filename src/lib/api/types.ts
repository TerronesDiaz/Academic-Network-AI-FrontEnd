export interface TokenResponse {
	access_token: string;
	refresh_token: string;
	token_type: string;
}

export interface ScholarMetrics {
	citations_all: number;
	citations_since_2021: number;
	h_index_all: number;
	h_index_since_2021: number;
	i10_index_all: number;
	i10_index_since_2021: number;
	publications_count: number;
	captured_at: string;
}

export interface OpenAlexMetrics {
	total_citations: number;
	publications_count: number;
	h_index: number;
	i10_index: number;
	citations_since_2021: number;
	publications_since_2021: number;
	h_index_since_2021: number;
	i10_index_since_2021: number;
}

export interface Author {
	id: number;
	scholar_user_id: string;
	canonical_name: string;
	affiliation: string;
	email_domain: string;
	profile_url: string;
	image_url: string;
	base_citations: number;
	openalex_citations: number | null;
	is_active: boolean;
	created_at: string;
	updated_at: string;
	latest_indicators?: Record<string, unknown> | null;
	scholar_metrics?: ScholarMetrics | null;
	openalex_metrics?: OpenAlexMetrics | null;
}

export interface PaginatedAuthors {
	total: number;
	limit: number;
	offset: number;
	items: Author[];
}

export interface PublicationItem {
	id: number;
	title: string;
	venue: string | null;
	publication_year: number | null;
	document_type: string | null;
	doi: string | null;
	external_id: string | null;
	sources: string[];
	external_metadata: ExternalMetadata[];
	citations_count: number;
	openalex_citations: number | null;
	scholar_citations: number | null;
	enriched_at: string | null;
}

export interface PublicationDetail extends PublicationItem {
	authors: PublicationAuthor[];
}

export interface PublicationAuthor {
	author_id: number | null;
	canonical_name: string | null;
	observed_signature: string | null;
	author_position: number | null;
	is_profile_owner: boolean;
	resolution_status?: string | null;
	resolution_method?: string | null;
	resolution_model?: string | null;
	resolution_confidence?: string | null;
}

export interface AuthorPublication extends PublicationItem {
	author_position: number | null;
	is_profile_owner: boolean;
	observed_signature: string | null;
	observed_signatures: string[];
}

export interface ExternalMetadata {
	source: string;
	source_id: number;
	external_id: string | null;
	doi: string | null;
	document_type: string | null;
	citations_count: number | null;
	venue: string | null;
	match_confidence: string | null;
	enriched_at: string | null;
}

export interface PaginatedPublications {
	total: number;
	limit: number;
	offset: number;
	items: PublicationItem[];
}

export interface Coauthor {
	author_id: number;
	canonical_name: string;
	shared_publications_count: number;
}

export interface NetworkData {
	nodes: NetworkNode[];
	edges: NetworkEdge[];
}

export interface NetworkNode {
	id: number;
	label: string;
	publications: number;
	h_index: number;
	pagerank: number;
	scholar_citations: number;
	openalex_citations: number;
	openalex_h_index: number;
	openalex_i10_index: number;
}

export interface NetworkEdge {
	source: number;
	target: number;
	weight: number;
}

export interface NetworkStats {
	nodes: number;
	edges: number;
	density: number;
	average_degree: number;
	connected_components: number;
}

export interface IndicatorRow {
	[key: string]: unknown;
	author_name: string;
}

export interface PaginatedIndicators {
	total: number;
	limit: number;
	offset: number;
	run_id: string;
	items: IndicatorRow[];
}

export interface IndicatorSummary {
	authors: number;
	total_publications: number;
	total_citations: number;
	total_citations_scholar: number;
	total_citations_openalex: number;
	average_h_index: number;
	median_h_index: number;
	top_h_index: IndicatorRow[];
}

export interface EvaluationResult {
	system: Record<string, number | string>;
	baseline: Record<string, number | string>;
	gold_total: number;
	gold_easy: number;
	gold_hard: number;
	system_coverage: number;
	report_path: string;
}

export interface PipelineRun {
	id: string;
	stage: string;
	source: string;
	started_at: string;
	finished_at: string | null;
	status: string;
	notes: string | null;
	duration_seconds: number | null;
	error_detail?: BudgetErrorDetail | null;
	enrichment?: EnrichmentRunStats | null;
	llm_usage?: LLMUsage | null;
}

export interface BudgetErrorDetail {
	code: string;
	message: string;
	resets_at: string | null;
	resets_in_seconds: number | null;
}

export interface PipelineRunRequest {
	stage: string;
	limit?: number | null;
	csv_dir?: string;
	enrich_workers?: number | null;
	build_only?: boolean;
	gold_path?: string;
	use_llm?: boolean;
	llm_provider?: string;
	force?: boolean;
	max_llm_budget_usd?: number | null;
}

export interface PaginatedPipelineRuns {
	total: number;
	limit: number;
	offset: number;
	items: PipelineRun[];
}

export interface EnrichmentRunStats {
	run_id: string;
	source_name: string;
	started_at: string;
	finished_at: string | null;
	duration_seconds: number | null;
	limit_n: number | null;
	max_workers: number;
	max_requests_per_second: number;
	max_attempts: number;
	mailto: string | null;
	api_key_configured: boolean;
	publications_queued: number;
	matched: number;
	unmatched_saved: number;
	transient_deferred: number;
	status: string;
	error_message: string | null;
	error_detail: BudgetErrorDetail | null;
	last_progress_at: string | null;
	publications_processed: number;
	progress_fraction: number | null;
}

export interface EnrichmentDeferral {
	id: number;
	run_id: string;
	publication_id: number;
	phase: string;
	attempts_used: number;
	http_status: number | null;
	error_message: string | null;
	created_at: string;
}

export interface PaginatedEnrichmentRuns {
	total: number;
	limit: number;
	offset: number;
	items: EnrichmentRunStats[];
}

export interface PaginatedEnrichmentDeferrals {
	total: number;
	limit: number;
	offset: number;
	items: EnrichmentDeferral[];
}

export interface LLMUsage {
	run_id: string;
	model_id: string | null;
	total_calls: number;
	success_calls: number;
	error_calls: number;
	total_input_tokens: number;
	total_output_tokens: number;
	total_cost_usd: number;
	signatures_evaluated: number;
	avg_latency_ms: number;
	p95_latency_ms: number;
}

export interface LLMUsageByModel {
	model_id: string;
	calls: number;
	input_tokens: number;
	output_tokens: number;
	cost_usd: number;
	signatures_evaluated: number;
}

export interface LLMSummary {
	total_calls: number;
	success_calls: number;
	error_calls: number;
	total_input_tokens: number;
	total_output_tokens: number;
	total_cost_usd: number;
	total_signatures_evaluated: number;
	avg_latency_ms: number;
	by_model: LLMUsageByModel[];
}
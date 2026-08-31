export interface TokenResponse {
	access_token: string;
	refresh_token: string;
	token_type: string;
}

export interface MessageRef {
	code: string;
	params?: Record<string, string | number | boolean | null>;
}

export interface ProductAccount {
	id: string;
	name: string;
	slug: string;
	role: 'owner' | 'admin' | 'reviewer' | 'viewer' | 'platform_operator';
}

export interface ProductProject {
	id: string;
	account_id: string;
	institution_id: string;
	name: string;
	slug: string;
	status: string;
	active_dataset_version_id: string | null;
	published_snapshot_id: string | null;
	created_at: string;
}

export interface ProductWorkflow {
	id: string;
	project_id: string;
	dataset_version_id: string;
	workflow_id: string;
	status: string;
	current_step: string | null;
	error_code: string | null;
	error_message: string | null;
	started_at: string;
	finished_at: string | null;
	steps: Array<{
		key: string;
		status: string;
		attempt: number;
		started_at: string | null;
		finished_at: string | null;
		output: Record<string, unknown>;
	}>;
}

export interface ProductProjectDetail {
	id: string;
	account_id: string;
	name: string;
	slug: string;
	status: string;
	institution: {
		id: string;
		name: string;
		scholar_org_id: string | null;
		scholar_org_url: string | null;
		openalex_id: string | null;
		ror_id: string | null;
		country_code: string | null;
		verified_domain: string | null;
		verification_status: string;
	};
	active_dataset: Record<string, unknown> | null;
	latest_import: InstitutionBootstrap | null;
	source_status: CompositeSourceStatus;
	latest_workflow: ProductWorkflow | null;
}

export interface CompositeSourceStatus {
	composite_state: 'awaiting_scholar' | 'awaiting_openalex' | 'enriching_openalex' | 'ready' | 'failed';
	primary_source: 'google_scholar';
	primary: InstitutionBootstrap | null;
	supplemental: InstitutionBootstrap | null;
	reconciliation: {
		openalex_profiles_matched: number;
		openalex_profiles_expanded: number;
		openalex_profiles_merged: number;
		openalex_profiles_candidate: number;
		openalex_profiles_excluded: number;
		openalex_works_matched_existing: number;
		openalex_works_added: number;
		openalex_works_excluded: number;
	};
}

export interface InstitutionCandidate {
	key: string;
	display_name: string;
	country_code: string | null;
	city: string | null;
	domains: string[];
	homepage_url: string | null;
	ror_id: string | null;
	openalex_id: string | null;
	works_count: number | null;
	cited_by_count: number | null;
	sources: string[];
}

export interface InstitutionSearchResponse {
	query: string;
	items: InstitutionCandidate[];
	warnings: string[];
}

export interface InstitutionBootstrap {
	import_id: string;
	dataset_version_id: string;
	source: string;
	status: string;
	received_items: number;
	expected_items: number;
	progress: number;
	imported_authors: number;
	imported_works: number;
	source_complete: boolean;
	scholar_recommended: boolean;
	api_cost_usd: number;
	phase: string;
	phase_label: string;
	phase_processed: number;
	phase_total: number;
	progress_message: string | null;
	message_ref?: MessageRef | null;
	progress_updated_at: string | null;
	error_message: string | null;
	error_ref?: MessageRef | null;
}

export interface ProductQuality {
	passed: boolean;
	roster_coverage: number;
	work_coverage: number;
	sampled_error_rate: number | null;
	pending_risk_groups: number;
	critical_issue_count: number;
	terminal_exclusions: number;
	gates: Record<string, { passed?: boolean; [key: string]: unknown }>;
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
	scholar_user_id: string | null;
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
	average_scholar_h_index: number;
	median_scholar_h_index: number;
	average_openalex_h_index: number;
	median_openalex_h_index: number;
	top_h_index: IndicatorRow[];
}

export interface EvaluationResult {
	evaluation_kind?: 'profile_owner_proxy';
	is_human_gold?: false;
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
	llm_model?: string | null;
	llm_workers?: number | null;
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

export interface LLMCatalogResponse {
	claude: string[];
	ollama: string[];
	runpod: string[];
	zai: string[];
}

export interface ValidationCandidate {
	id: number;
	canonical_name: string;
	affiliation: string | null;
	email_domain: string | null;
	scholar_user_id: string | null;
	profile_url: string | null;
	image_url: string | null;
	base_citations: number;
	publications_count: number;
	match_score: number | null;
	evidence_source: string | null;
	evidence_status: 'pending' | 'partial' | 'complete';
	evidence_version: string | null;
	evidence_rank: number | null;
	direct_source_authorship: boolean;
	publication_on_scholar_profile: boolean;
	target_signature_in_source_byline: boolean;
	scholar_signature_confirmed: boolean;
	openalex_authorship_confirmed: boolean;
	source_authorship_position: number | null;
	topic_similarity: number | null;
	coauthor_score: number | null;
	name_score: number | null;
	temporal_score: number | null;
	overall_score: number | null;
	evidence: ValidationCandidateEvidence;
}

export interface ValidationTopic {
	id?: string | null;
	name: string;
	score?: number | null;
	field?: string | null;
	publication_count?: number;
}

export interface ValidationPublication {
	id: number;
	title: string;
	publication_year: number | null;
	venue: string | null;
	doi: string | null;
	openalex_id: string | null;
	citations: number;
	topics: ValidationTopic[];
	similarity?: number | null;
	reason?: string | null;
}

export interface ValidationCoauthorEvidence {
	author_id: number | null;
	openalex_author_id?: string | null;
	name: string;
	shared_publications_count: number;
	on_source_publication: boolean;
	provenance?: string;
}

export interface ValidationCandidateEvidence {
	profile_summary_es?: string | null;
	topics?: ValidationTopic[];
	representative_publications?: ValidationPublication[];
	related_publications?: ValidationPublication[];
	coauthors?: ValidationCoauthorEvidence[];
	activity?: { first_year: number | null; last_year: number | null };
	direct_source_authorship?: boolean;
	publication_on_scholar_profile?: boolean;
	target_signature_in_source_byline?: boolean;
	scholar_signature_confirmed?: boolean;
	openalex_authorship_confirmed?: boolean;
	external_identities?: Array<{
		source: string;
		external_id: string;
		display_name: string | null;
		orcid: string | null;
		state: 'candidate' | 'probable' | 'confirmed' | 'quarantined' | 'rejected';
		confidence: number | null;
	}>;
	similarity_method?: string;
	warnings?: Array<{ code: string; message: string; author_ids?: number[] }>;
}

export interface ValidationSourceContext {
	publication: ValidationPublication | null;
	authorships: Array<{
		author_id: number | null;
		name: string | null;
		position: number | null;
		openalex_author_id?: string | null;
		resolved: boolean;
		provenance:
			| 'scholar_profile_owner'
			| 'openalex'
			| 'manual'
			| 'raw_signature'
			| 'observed_signature';
		provenances?: string[];
		name_variants?: string[];
		is_target_signature: boolean;
	}>;
}

export interface ValidationPrimarySourceEvidence {
	status: 'confirmed' | 'matched' | 'unmatched' | 'transient' | 'conflict';
	source: string;
	endpoint: string | null;
	match_method: string | null;
	confidence: number;
	claimed_names: string[];
	resolved_author_id: number | null;
}

export interface ValidationCandidateCoverage {
	author_id: number;
	occurrence_count: number;
	complete_evidence_count: number;
	primary_source_confirmed_count: number;
	scholar_confirmed_count: number;
	openalex_confirmed_count: number;
	target_signature_count: number;
	primary_source_conflict_count: number;
	min_overall_score: number | null;
	max_overall_score: number | null;
}

export interface ValidationEntry {
	id: number;
	run_id: string;
	observed_signature_id: number;
	observed_signature: string;
	source: string;
	case_kind: 'identity_review' | 'suggested_match' | 'external_verification' | 'data_gap';
	created_at: string;
	candidates: ValidationCandidate[];
	llm_reasoning: string | null;
	publications: ValidationPublication[];
	source_context: ValidationSourceContext | null;
	primary_source_evidence: ValidationPrimarySourceEvidence[];
	evidence_status: 'pending' | 'partial' | 'complete';
	evidence_version: string | null;
}

export type ValidationPhase =
	| 'quick_confirmation'
	| 'identity_resolution'
	| 'external_audit'
	| 'abstention'
	| 'data_gap';

export interface ValidationAliasEligibility {
	eligible: boolean;
	reason: string | null;
}

export interface ExternalDirectoryPerson {
	id: number;
	display_name: string;
	source: string;
	external_id: string;
	orcid: string | null;
	profile_url: string;
	last_known_institutions: string[];
}

export interface ValidationGroup {
	id: number;
	run_id: string;
	phase: ValidationPhase;
	normalized_signature: string;
	display_signature: string;
	occurrence_count: number;
	status: string;
	proposed_author_id: number | null;
	proposed_external_person: {
		id: number;
		display_name: string;
		source: string;
		external_id: string;
		orcid: string | null;
		profile_url: string;
		affiliations_at_publication: string[];
	} | null;
	accepted_external_person_id: number | null;
	risk_flags: string[];
	is_external_sample: boolean;
	review_stratum: string;
	bulk_action_safe: boolean;
	decision_scope: 'occurrence' | 'group';
	related_occurrence_count: number;
	related_pending_count: number;
	automation_reason: 'source_bound_openalex' | 'source_bound_openalex_control_sample' | null;
	is_automatic_audit: boolean;
	evidence_summary: Record<string, unknown>;
	can_decide: boolean;
	representative_entry: ValidationEntry;
	representative_occurrences: ValidationEntry[];
	candidate_summaries: ValidationCandidateCoverage[];
	alias_eligibility: Record<number, ValidationAliasEligibility>;
	repair_status: 'resolved' | 'source_rejected' | 'abstained' | 'profile_signature' | null;
	repair_evidence: Array<Record<string, unknown>>;
	duplicate_review_id: number | null;
	duplicate_review_status: 'pending' | 'same' | 'different' | 'deferred' | null;
}

export interface ValidationRelatedOccurrence {
	group_id: number;
	status: string;
	phase: ValidationPhase;
	is_current: boolean;
	entry: ValidationEntry;
}

export interface ValidationPhaseProgress {
	phase: Exclude<ValidationPhase, 'abstention' | 'data_gap'>;
	label: string;
	order: number;
	pending_groups: number;
	pending_occurrences: number;
	pending_technical_rows: number;
	deferred_groups: number;
	accepted_groups: number;
	accepted_occurrences: number;
	accepted_technical_rows: number;
	external_groups: number;
	system_external_groups: number;
	system_external_occurrences: number;
	system_external_technical_rows: number;
	data_gap_groups: number;
	data_gap_occurrences: number;
	data_gap_technical_rows: number;
	total_groups: number;
	total_occurrences: number;
	total_technical_rows: number;
	can_decide: boolean;
	is_current: boolean;
}

export interface ValidationWorkflow {
	run_id: string;
	algorithm_version: string;
	evidence_version: string;
	audit_version: string | null;
	decision_safe: boolean;
	integrity_issues: Array<Record<string, unknown>>;
	current_phase: Exclude<ValidationPhase, 'abstention' | 'data_gap'> | null;
	complete: boolean;
	phases: ValidationPhaseProgress[];
	abstention_groups: number;
	abstention_occurrences: number;
	data_gap_groups: number;
	data_gap_occurrences: number;
	data_gap_technical_rows: number;
	stratum_counts: Record<string, Record<string, { groups: number; occurrences: number; technical_rows: number }>>;
	counter_definitions: Record<string, string>;
	auto_repaired_occurrences: number;
	auto_resolved_identity_occurrences: number;
	auto_source_bound_eligible_occurrences: number;
	auto_source_bound_accepted_occurrences: number;
	auto_source_bound_audit_occurrences: number;
	auto_scholar_eligible_occurrences: number;
	auto_scholar_accepted_occurrences: number;
	source_rejected_occurrences: number;
	external_sample_reviewed: number;
	external_sample_false_negatives: number;
	external_sample_error_rate: number;
}

export interface RepairRunStatus {
	repair_run_id: string | null;
	review_run_id?: string | null;
	repair_version: string;
	scope?: 'residual' | 'identity' | 'all' | null;
	status: 'not_run' | 'running' | 'complete' | 'failed';
	stats: Record<string, unknown>;
	started_at?: string | null;
	completed_at?: string | null;
	error_message?: string | null;
}

export interface ValidationGroupDecision {
	id: number;
	status: string;
	display_signature: string;
	occurrence_count: number;
	author_name: string | null;
	remaining_phase_groups: number;
	remaining_deferred_groups: number;
	undo_expires_at: string | null;
	expanded_external_sample: number;
}

export interface ValidationSummary {
	pending: number;
	accepted: number;
	external: number;
	deferred: number;
	by_source: Record<string, number>;
	source_counts: Record<string, ValidationStatusCounts>;
	case_kind_counts: Record<string, ValidationStatusCounts>;
	active_run: ValidationReviewRun | null;
	has_unpublished_changes: boolean;
	active_refresh: ValidationRefresh | null;
	undo_blocked_until: string | null;
}

export interface ValidationReviewRun {
	run_id: string;
	algorithm_version: string;
	evidence_version: string;
	audit_version: string | null;
	decision_safe: boolean;
	integrity_issues: Array<Record<string, unknown>>;
	snapshot_at: string;
	state: string;
	metrics: Record<string, unknown>;
	evaluated_at: string | null;
	ready_at: string | null;
	activated_at: string | null;
	error_message: string | null;
}

export interface ValidationStatusCounts {
	pending: number;
	accepted: number;
	external: number;
	deferred: number;
}

export interface ValidationDecision {
	id: number;
	status: string;
	observed_signature: string;
	author_name: string | null;
	remaining_pending: number;
	remaining_deferred: number;
	undo_expires_at: string | null;
}

export interface DuplicateReviewAuthor {
	id: number;
	canonical_name: string;
	affiliation: string | null;
	scholar_user_id: string | null;
	profile_url: string | null;
	publications_count: number;
}

export interface DuplicateReviewEntry {
	id: number;
	author_a: DuplicateReviewAuthor;
	author_b: DuplicateReviewAuthor;
	evidence_version: string;
	evidence: {
		same_normalized_name?: boolean;
		shared_publications_count?: number;
		publication_overlap?: number;
		shared_coauthors_count?: number;
		shared_publication_titles?: string[];
		safe_auto_merge?: boolean;
		score?: number;
		confidence_tier?: string;
		signals?: Record<string, number | null>;
		independent_evidence_families?: string[];
		hard_vetoes?: string[];
		shared_coauthors?: string[];
	};
	status: 'pending' | 'same' | 'different' | 'deferred';
	merge_proposed: boolean;
	created_at: string;
}

export interface AuthorMergeAudit {
	id: number;
	source_author_id: number;
	target_author_id: number;
	source_name: string;
	target_name: string;
	merge_batch_id: string | null;
	scorer_version: string | null;
	automatic: boolean;
	reason: string | null;
	evidence: DuplicateReviewEntry['evidence'];
	performed_by: string;
	created_at: string;
	undone_at: string | null;
	undone_by: string | null;
}

export interface AuthorGroupMergeResult {
	canonical_author_id: number;
	merge_batch_id: string;
	merged_author_ids: number[];
	merge_event_ids: number[];
	duplicate_review_ids: number[];
}

export interface DuplicateScorerMetrics {
	scorer_version: string;
	enabled: boolean;
	required_annotations: number;
	annotated_merges: number;
	adjudicated_pairs: number;
	true_merges: number;
	false_merges: number;
	precision: number | null;
	threshold: number;
}

export interface ValidationRefresh {
	run_id: string;
	stage: string;
	status: string;
}

export interface ValidationPreparation {
	run_id: string | null;
	review_run_id: string | null;
	status: 'not_started' | 'queued' | 'running' | 'success' | 'error';
	progress: {
		phase?: string;
		message?: string;
		detail?: string;
		processed?: number;
		total?: number;
		unit?: string;
		updated_at?: string;
	};
	error_message: string | null;
}

export type GoldStudyState =
	| 'preparing'
	| 'draft'
	| 'annotating'
	| 'adjudicating'
	| 'frozen'
	| 'evaluated'
	| 'archived'
	| 'failed';

export interface GoldStudy {
	id: string;
	name: string;
	source_run_id: string;
	protocol_version: string;
	namespace_version: string;
	sampling_seed: number;
	target_case_count: number;
	required_annotations: number;
	state: GoldStudyState;
	sample_hash: string | null;
	config: {
		quotas?: Record<string, number>;
		frame_counts?: Record<string, number>;
		directory_hash?: string;
	};
	roles: Array<'manager' | 'annotator' | 'adjudicator'>;
	task_counts: Record<string, number>;
	case_count: number;
	members: Array<{ user_id: number; role: string; code: string }>;
	created_at: string;
	frozen_at: string | null;
	evaluated_at: string | null;
}

export interface GoldBlindPublication {
	title: string;
	year: number | null;
	venue: string | null;
	doi: string | null;
	abstract: string | null;
	byline: Array<{
		name: string;
		position: number | null;
		affiliations: unknown[];
	}>;
	links: Array<{ label: string; url: string }>;
}

export interface VerifiedEvidenceSource {
	id?: number | null;
	source: string;
	family: string;
	status: 'matched' | 'unmatched' | 'conflict' | 'transient_error';
	url: string | null;
	match_method: string | null;
	title: string | null;
	year: number | null;
	doi: string | null;
	byline: Array<{
		name: string;
		position: number | null;
		orcid?: string | null;
		affiliations: unknown[];
	}>;
	retrieved_at: string | null;
	provider: string | null;
}

export interface GoldAnnotationDraft {
	cluster_key: string;
	label:
		| 'author'
		| 'not_in_directory'
		| 'insufficient_evidence'
		| 'external'
		| 'unresolved';
	canonical_author_id: number | null;
	original_canonical_author_id?: number | null;
	rationale: string | null;
	affiliation_at_publication: 'institutional' | 'external' | 'mixed' | 'unknown';
}

export interface GoldCase {
	id: number;
	stratum: string;
	evidence: {
		schema_version?: string;
		observed_signature: string;
		context_type: string;
		evidence_status?: 'ready' | 'insufficient' | 'conflict' | 'transient_error';
		affiliation_at_publication?: 'institutional' | 'external' | 'mixed' | 'unknown';
		affiliation_claims?: string[];
		verified_sources?: VerifiedEvidenceSource[];
		publication: GoldBlindPublication | null;
	};
	annotation: GoldAnnotationDraft | null;
}

export interface GoldTask {
	id: number;
	namespace_key: string;
	status: string;
	case_count: number;
	cases: GoldCase[];
	curator_annotations?: Array<{
		curator: string;
		case_id: number;
		cluster_key: string;
		label: string;
		canonical_author_id: number | null;
		rationale: string | null;
		affiliation_at_publication?: 'institutional' | 'external' | 'mixed' | 'unknown';
	}>;
}

export interface GoldDirectoryAuthor {
	id: number;
	canonical_name: string;
	affiliation: string | null;
	email_domain: string | null;
	profile_url: string | null;
}

export type BenchmarkPilotState =
	| 'preparing'
	| 'labeling'
	| 'completed'
	| 'exported'
	| 'archived'
	| 'failed';

export interface BenchmarkPilotExport {
	directory: string;
	snapshot_hash: string;
	case_count: number;
	files: string[];
	benchmark_command: string;
	benchmark_commands?: { frozen: string; native_search: string };
}

export interface BenchmarkModelOption {
	id: string;
	model: string;
	provider: string;
	connection: 'coding_plan' | 'standard_api' | 'local';
	configured: boolean;
	native_search_configured: boolean;
	native_search_requirement: string | null;
	workers: number;
	reasoning: string | null;
}

export interface BenchmarkRunStatus {
	run_id: string;
	study_id: string;
	state: 'queued' | 'running' | 'reporting' | 'completed' | 'failed';
	track: 'frozen' | 'native-search';
	scope: 'smoke' | 'full';
	models: string[];
	case_count: number;
	requests_per_model: number;
	total_requests: number;
	completed_requests: number;
	current_model: string | null;
	active_models?: string[];
	model_progress?: Record<string, { completed: number; total: number }>;
	current_model_completed_requests?: number;
	current_model_total_requests?: number;
	last_progress_at?: string | null;
	score_revision?: number;
	rescored_at?: string | null;
	scored_snapshot_hash?: string;
	created_at: string;
	started_at: string | null;
	completed_at: string | null;
	error: string | null;
	results?: {
		track: string;
		prediction_snapshot_hash?: string;
		rescored_after_label_change?: boolean;
		total_cost_usd?: number;
		models: Record<string, {
			cases: number;
			correct: number;
			incorrect?: number;
			exact_accuracy: number;
			invalid_or_error: number;
			wrong_author_assignments: number;
			requests: number;
			successful_requests: number;
			stability_rate: number | null;
			cost_usd: number;
			cost_per_case_usd: number | null;
			cost_per_correct_usd: number | null;
			projected_cost_per_1000_usd: number | null;
			throughput_requests_per_second: number | null;
			elapsed_seconds?: number;
			usage: {
				input_tokens: number;
				output_tokens: number;
				cache_write_tokens: number;
				cache_read_tokens: number;
			};
			latency_ms: { p50: number; p95: number; mean: number };
		}>;
		pareto_frontier: string[];
	};
}

export interface BenchmarkPredictionItem {
	case_id: string;
	repetition: number;
	suite: string;
	stratum: string;
	observed_signature?: string | null;
	publication_title?: string | null;
	publication_year?: number | null;
	status: 'success' | 'error';
	raw_response: string;
	parsed_response: Record<string, unknown> | null;
	parse_error: string | null;
	returned_reasoning: string | null;
	usage: {
		input_tokens?: number;
		output_tokens?: number;
		cache_write_tokens?: number;
		cache_read_tokens?: number;
	};
	cost_usd: number;
	latency_ms: number;
	attempts: number;
	error: string | null;
	finish_reason: string | null;
	completed_at: string | null;
	search: { calls?: number; citations?: string[] };
	candidate_names?: Record<string, string | null>;
	evaluation: {
		status: 'correct' | 'incorrect' | 'invalid';
		model_answer: Record<string, unknown> | null;
		correct_answer: Record<string, unknown>;
		invalid_reason: string | null;
		mismatch_fields: string[];
	} | null;
}

export interface BenchmarkPredictionPage {
	run_id: string;
	model_id: string;
	total: number;
	offset: number;
	limit: number;
	items: BenchmarkPredictionItem[];
}

export interface BenchmarkRunOptions {
	case_count: number;
	stability_case_count: number;
	full_requests_per_model: number;
	smoke_case_count: number;
	smoke_requests_per_model: number;
	models: BenchmarkModelOption[];
	runs: BenchmarkRunStatus[];
}

export interface BenchmarkPilotStudy {
	id: string;
	name: string;
	sampling_seed: number;
	target_case_count: number;
	state: BenchmarkPilotState;
	config: {
		pilot_version?: string;
		quotas?: Record<string, number>;
		frame_counts?: Record<string, number>;
		evidence_protocol?: 'legacy' | 'evidence-v2';
	};
	frame_hash: string;
	sample_hash: string;
	directory_hash: string;
	labeled_count: number;
	remaining_count: number;
	flagged_count: number;
	outcome_counts: Record<string, number>;
	created_at: string;
	completed_at: string | null;
	exported_at: string | null;
	export_manifest: Partial<BenchmarkPilotExport>;
	evidence_run_id: string | null;
	supersedes_study_id: string | null;
	archived_at: string | null;
	archive_reason: string | null;
}

export interface BenchmarkPilotCandidate {
	id: number;
	canonical_name: string;
	affiliation: string | null;
	email_domain: string | null;
	profile_url: string | null;
	profile_summary: string;
	publication_count: number;
	publication_year_min: number | null;
	publication_year_max: number | null;
	topics: Array<{ name: string; field: string | null; publication_count: number }>;
	frequent_venues: Array<{ name: string; publication_count: number }>;
	frequent_coauthors: Array<{ name: string; shared_publications_count: number }>;
	representative_publications: Array<Record<string, unknown>>;
	evidence_scope: 'independent_profile_excluding_current_work';
}

export interface BenchmarkPilotLabel {
	label:
		| 'author'
		| 'not_in_directory'
		| 'insufficient_evidence'
		| 'external'
		| 'unresolved';
	canonical_author_id: number | null;
	canonical_author_name?: string | null;
	external_person_id?: number | null;
	external_person_name?: string | null;
	rationale: string | null;
	flagged: boolean;
	affiliation_at_publication: 'institutional' | 'external' | 'mixed' | 'unknown';
	selected_source_ids: number[];
}

export interface BenchmarkPilotExternalPerson {
	id: number;
	display_name: string;
	source: string;
	external_id: string;
	orcid: string | null;
	aliases: string[];
	affiliations_at_publication: string[];
	last_known_institutions: string[];
	works_count: number;
	cited_by_count: number;
	confidence: number;
	evidence_version: string;
	profile_url: string;
	evidence_urls: string[];
}

export interface BenchmarkPilotCase {
	id: number;
	position: number;
	suite: 'identity' | 'external' | 'directory_identity';
	stratum:
		| 'identity_multiple'
		| 'identity_single'
		| 'external_strict_empty'
		| 'candidate_multiple'
		| 'candidate_single'
		| 'identified_external'
		| 'strict_empty_evidence_ready'
		| 'evidence_insufficient';
	candidate_ids: number[];
	evidence: {
		schema_version?: string;
		observed_signature: string;
		context_type: string;
		evidence_status?: 'ready' | 'insufficient' | 'conflict' | 'transient_error';
		affiliation_at_publication?: 'institutional' | 'external' | 'mixed' | 'unknown';
		affiliation_claims?: string[];
		external_identity_candidates?: BenchmarkPilotExternalPerson[];
		verified_sources?: VerifiedEvidenceSource[];
		publication: GoldBlindPublication | null;
		candidates: BenchmarkPilotCandidate[];
		candidate_generation: {
			strict_candidate_count: number;
			displayed_candidate_count: number;
			ranking_hidden: boolean;
			identified_external_count?: number;
		};
	};
	snapshot_hash: string;
	label: BenchmarkPilotLabel | null;
}

export interface GoldMetrics {
	n_cases: number;
	n_namespaces: number;
	inter_annotator: {
		fleiss_kappa_class: number | null;
		fleiss_kappa_same_different: number | null;
	};
	classification: {
		macro_f1: number;
		false_external: number;
		false_internal: number;
		exact_author_accuracy: number | null;
	};
	ranking: {
		candidate_recall_at_5: number | null;
		top1_accuracy: number | null;
	};
	clustering: {
		b3_precision: number;
		b3_recall: number;
		b3_f1: number;
		k_metric: number;
	};
	name_only_baseline: {
		b3_precision: number;
		b3_recall: number;
		b3_f1: number;
		k_metric: number;
	};
	pairwise: {
		precision: number;
		recall: number;
		f1: number;
		tp: number;
		fp: number;
		fn: number;
		tn: number;
	};
	weighted_exact_accuracy: number | null;
	prediction_coverage: number;
	by_stratum: Record<string, { n: number; accuracy: number | null }>;
}

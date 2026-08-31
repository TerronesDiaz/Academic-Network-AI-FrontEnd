import { browser } from '$app/environment';
import { auth } from '$lib/auth';
import { ApiClientError, type MessageParams } from '$lib/i18n/errors';
import type {
	TokenResponse,
	PaginatedAuthors,
	PaginatedPublications,
	PublicationDetail,
	Coauthor,
	NetworkData,
	NetworkStats,
	PaginatedIndicators,
	IndicatorSummary,
	EvaluationResult,
	PaginatedPipelineRuns,
	PipelineRunRequest,
	PaginatedEnrichmentRuns,
	PaginatedEnrichmentDeferrals,
	AuthorPublication,
	LLMSummary,
	LLMCatalogResponse,
	ValidationDecision,
	DuplicateReviewEntry,
	AuthorMergeAudit,
	AuthorGroupMergeResult,
	DuplicateScorerMetrics,
	ValidationEntry,
	ValidationGroup,
	ValidationGroupDecision,
	ValidationRelatedOccurrence,
	ExternalDirectoryPerson,
	ValidationPhase,
	ValidationRefresh,
	ValidationPreparation,
	ValidationSummary,
	ValidationWorkflow,
	RepairRunStatus,
	GoldDirectoryAuthor,
	GoldAnnotationDraft,
	GoldMetrics,
	GoldStudy,
	GoldTask,
	BenchmarkPilotCase,
	BenchmarkPilotExternalPerson,
	BenchmarkPilotExport,
	BenchmarkRunOptions,
	BenchmarkRunStatus,
	BenchmarkPredictionPage,
	BenchmarkPilotLabel,
	BenchmarkPilotStudy,
	ProductAccount,
	ProductProject,
	ProductProjectDetail,
	ProductWorkflow,
	ProductQuality,
	InstitutionSearchResponse,
	InstitutionBootstrap
} from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function productApiBase(): string {
	return API_BASE;
}

function getToken(): string | null {
	if (!browser) return null;
	return localStorage.getItem('access_token');
}

function setTokens(access: string, refresh: string) {
	if (!browser) return;
	localStorage.setItem('access_token', access);
	localStorage.setItem('refresh_token', refresh);
}

function clearTokensAndLogout() {
	if (!browser) return;
	localStorage.removeItem('access_token');
	localStorage.removeItem('refresh_token');
	localStorage.removeItem('active_project_id');
	auth.logout();
}

async function request<T>(
	path: string,
	options: RequestInit = {},
	retry = true
): Promise<T> {
	const token = getToken();
	const headers: Record<string, string> = {
		...(options.headers as Record<string, string> ?? {})
	};
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}
	const activeProject = browser ? localStorage.getItem('active_project_id') : null;
	if (activeProject) headers['X-Project-ID'] = activeProject;
	if (!(options.body instanceof FormData)) {
		headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
	}

	const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });

	if (res.status === 401 && browser) {
		if (retry) {
			const refreshed = await refreshToken();
			if (refreshed) {
				return request<T>(path, options, false);
			}
		}
		clearTokensAndLogout();
		throw new ApiClientError(401, 'auth.authentication_required');
	}

	if (!res.ok) {
		const body = await res.text();
		let detail: unknown = body;
		let code = `http.${res.status}`;
		let params: MessageParams = {};
		try {
			const parsed = JSON.parse(body) as {
				detail?: unknown;
				code?: unknown;
				params?: unknown;
			};
			detail = parsed.detail ?? body;
			const nested = typeof detail === 'object' && detail !== null
				? detail as { code?: unknown; params?: unknown }
				: undefined;
			if (typeof parsed.code === 'string') code = parsed.code;
			else if (typeof nested?.code === 'string') code = nested.code;
			const candidateParams = parsed.params ?? nested?.params;
			if (candidateParams && typeof candidateParams === 'object') params = candidateParams as MessageParams;
		} catch {
			// Keep plain-text API errors as-is.
		}
		const technicalDetail = typeof detail === 'string' ? detail : JSON.stringify(detail);
		throw new ApiClientError(res.status, code, params, technicalDetail || res.statusText);
	}

	return res.json();
}

async function refreshToken(): Promise<boolean> {
	const refresh = browser ? localStorage.getItem('refresh_token') : null;

	try {
		const res = await fetch(`${API_BASE}/auth/refresh`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(refresh ? { refresh_token: refresh } : {}),
			credentials: 'include'
		});
		if (!res.ok) return false;
		const data: TokenResponse = await res.json();
		if (refresh) setTokens(data.access_token, data.refresh_token);
		else auth.session();
		return true;
	} catch {
		return false;
	}
}

export async function login(username: string, password: string): Promise<TokenResponse> {
	const res = await fetch(`${API_BASE}/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ username, password })
	});
	if (!res.ok) {
		const body = await res.text();
		let detail = body;
		try {
			const parsed = JSON.parse(body) as { detail?: unknown };
			if (typeof parsed.detail === 'string') detail = parsed.detail;
		} catch {
			// Keep plain-text API errors as-is.
		}
		throw new ApiClientError(res.status, 'auth.invalid_credentials', {}, detail || 'Invalid credentials');
	}
	const data: TokenResponse = await res.json();
	setTokens(data.access_token, data.refresh_token);
	return data;
}

export async function logout(): Promise<void> {
	try {
		await fetch(`${API_BASE}/auth/logout`, {
			method: 'POST',
			credentials: 'include'
		});
	} finally {
		clearTokensAndLogout();
	}
}

export function isAuthenticated(): boolean {
	return !!getToken();
}

export async function restoreCookieSession(): Promise<boolean> {
	try {
		const response = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
		if (!response.ok) return false;
		auth.session();
		return true;
	} catch {
		return false;
	}
}

export function oidcLoginUrl(): string {
	return `${API_BASE}/auth/oidc/login`;
}

export function setActiveProject(projectId: string | null) {
	if (!browser) return;
	if (projectId) localStorage.setItem('active_project_id', projectId);
	else localStorage.removeItem('active_project_id');
}

// ── Commercial product workflow ─────────────────────────────────────────────

export function listProductAccounts(): Promise<ProductAccount[]> {
	return request<ProductAccount[]>('/v1/accounts');
}

export function createProductAccount(body: { name: string; slug: string }): Promise<ProductAccount> {
	return request<ProductAccount>('/v1/accounts', { method: 'POST', body: JSON.stringify(body) });
}

export function listProductProjects(): Promise<ProductProject[]> {
	return request<ProductProject[]>('/v1/projects');
}

export function createProductProject(body: {
	account_id: string;
	name: string;
	slug: string;
	institution_name: string;
	scholar_org_id?: string;
	openalex_id?: string;
	ror_id?: string;
	country_code?: string;
	verified_domain?: string;
}): Promise<ProductProject> {
	return request<ProductProject>('/v1/projects', { method: 'POST', body: JSON.stringify(body) });
}

export function searchInstitutions(query: string, countryCode?: string): Promise<InstitutionSearchResponse> {
	const params = new URLSearchParams({ q: query });
	if (countryCode) params.set('country_code', countryCode);
	return request<InstitutionSearchResponse>(`/v1/institutions/search?${params.toString()}`);
}

export function startInstitutionBootstrap(projectId: string): Promise<InstitutionBootstrap> {
	setActiveProject(projectId);
	return request<InstitutionBootstrap>(`/v1/projects/${projectId}/bootstrap/openalex`, {
		method: 'POST'
	});
}

export function getLatestInstitutionImport(projectId: string): Promise<InstitutionBootstrap> {
	setActiveProject(projectId);
	return request<InstitutionBootstrap>(`/v1/projects/${projectId}/imports/latest`);
}

export function setScholarOrganization(projectId: string, scholarOrgId: string): Promise<{
	scholar_org_id: string;
	scholar_org_url: string;
}> {
	setActiveProject(projectId);
	return request(`/v1/projects/${projectId}/institution/scholar`, {
		method: 'PUT', body: JSON.stringify({ scholar_org_id: scholarOrgId })
	});
}

export function setInstitutionIdentity(projectId: string, body: {
	display_name: string;
	openalex_id: string;
	ror_id?: string;
	country_code?: string;
	verified_domain?: string;
}): Promise<Record<string, unknown>> {
	setActiveProject(projectId);
	return request(`/v1/projects/${projectId}/institution/identity`, {
		method: 'PUT', body: JSON.stringify(body)
	});
}

export function getProductProject(projectId: string): Promise<ProductProjectDetail> {
	setActiveProject(projectId);
	return request<ProductProjectDetail>(`/v1/projects/${projectId}`);
}

export function createScholarPairing(projectId: string): Promise<{
	import_id: string;
	dataset_version_id: string;
	pairing_token: string;
	expires_at: string;
	scholar_org_url: string;
}> {
	setActiveProject(projectId);
	return request(`/v1/projects/${projectId}/scholar/pair`, {
		method: 'POST',
		body: JSON.stringify({ connector_version: 'chrome-v1' })
	});
}

export function startProductWorkflow(
	projectId: string,
	body: {
		use_llm: boolean;
		max_llm_budget_usd?: number | null;
		mode?: 'retry' | 'restart';
		start_from?: 'canonicalize' | 'refresh_catalog' | 'disambiguate';
	}
): Promise<ProductWorkflow> {
	setActiveProject(projectId);
	return request<ProductWorkflow>(`/v1/projects/${projectId}/workflow`, {
		method: 'POST', body: JSON.stringify(body)
	});
}

export function getProductWorkflow(projectId: string): Promise<ProductWorkflow> {
	setActiveProject(projectId);
	return request<ProductWorkflow>(`/v1/projects/${projectId}/workflow`);
}

export function completeProductReview(projectId: string): Promise<{ accepted: boolean }> {
	setActiveProject(projectId);
	return request(`/v1/projects/${projectId}/review/complete`, { method: 'POST' });
}

export function getProductQuality(projectId: string): Promise<ProductQuality> {
	setActiveProject(projectId);
	return request<ProductQuality>(`/v1/projects/${projectId}/quality`);
}

export function publishProductSnapshot(
	projectId: string,
	body: { visibility: 'private' | 'unlisted' | 'public'; public_slug?: string | null }
): Promise<{ id: string; visibility: string; public_slug: string | null; payload_hash: string }> {
	setActiveProject(projectId);
	return request(`/v1/projects/${projectId}/publish`, {
		method: 'POST', body: JSON.stringify(body)
	});
}

// ── Authors ──────────────────────────────────────────────────────────────────

export async function listAuthors(params?: {
	search?: string;
	source?: string;
	sort?: string;
	active_only?: boolean;
	limit?: number;
	offset?: number;
}): Promise<PaginatedAuthors> {
	const qs = new URLSearchParams();
	if (params?.search) qs.set('search', params.search);
	if (params?.source) qs.set('source', params.source);
	if (params?.sort) qs.set('sort', params.sort);
	if (params?.active_only) qs.set('active_only', 'true');
	if (params?.limit) qs.set('limit', String(params.limit));
	if (params?.offset) qs.set('offset', String(params.offset));
	return request<PaginatedAuthors>(`/authors?${qs.toString()}`);
}

export async function getAuthor(authorId: number) {
	return request<import('./types').Author>(`/authors/${authorId}`);
}

export async function getAuthorPublications(
	authorId: number,
	params?: { source?: string; sort?: string; limit?: number; offset?: number }
) {
	const qs = new URLSearchParams();
	if (params?.source) qs.set('source', params.source);
	if (params?.sort) qs.set('sort', params.sort);
	if (params?.limit) qs.set('limit', String(params.limit));
	if (params?.offset) qs.set('offset', String(params.offset));
	return request<{ total: number; limit: number; offset: number; items: AuthorPublication[] }>(
		`/authors/${authorId}/publications?${qs.toString()}`
	);
}

export async function getAuthorCoauthors(authorId: number) {
	return request<Coauthor[]>(`/authors/${authorId}/coauthors`);
}

export async function getAuthorIndicatorHistory(authorId: number) {
	return request<Record<string, unknown>[]>(`/authors/${authorId}/indicators/history`);
}

// ── Publications ─────────────────────────────────────────────────────────────

export async function listPublications(params?: {
	search?: string;
	year?: number;
	type?: string;
	source?: string;
	sort?: string;
	limit?: number;
	offset?: number;
}): Promise<PaginatedPublications> {
	const qs = new URLSearchParams();
	if (params?.search) qs.set('search', params.search);
	if (params?.year) qs.set('year', String(params.year));
	if (params?.type) qs.set('type', params.type);
	if (params?.source) qs.set('source', params.source);
	if (params?.sort) qs.set('sort', params.sort);
	if (params?.limit) qs.set('limit', String(params.limit));
	if (params?.offset) qs.set('offset', String(params.offset));
	return request<PaginatedPublications>(`/publications?${qs.toString()}`);
}

export async function getPublication(publicationId: number) {
	return request<PublicationDetail>(`/publications/${publicationId}`);
}

// ── Network ──────────────────────────────────────────────────────────────────

export async function getNetwork(): Promise<NetworkData> {
	return request<NetworkData>('/network');
}

export async function getNetworkStats(): Promise<NetworkStats> {
	return request<NetworkStats>('/network/stats');
}

// ── Indicators ───────────────────────────────────────────────────────────────

export async function listIndicators(params?: {
	limit?: number;
	offset?: number;
	sort?: string;
}): Promise<PaginatedIndicators> {
	const qs = new URLSearchParams();
	if (params?.limit) qs.set('limit', String(params.limit));
	if (params?.offset) qs.set('offset', String(params.offset));
	if (params?.sort) qs.set('sort', params.sort);
	return request<PaginatedIndicators>(`/indicators?${qs.toString()}`);
}

export async function getIndicatorSummary(params?: {
	top_n?: number;
}): Promise<IndicatorSummary> {
	const qs = new URLSearchParams();
	if (params?.top_n) qs.set('top_n', String(params.top_n));
	return request<IndicatorSummary>(`/indicators/summary?${qs.toString()}`);
}

// ── Evaluation ───────────────────────────────────────────────────────────────

export async function getEvaluation(): Promise<EvaluationResult> {
	return request<EvaluationResult>('/evaluation');
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function listPipelineRuns(params?: {
	limit?: number;
	offset?: number;
}): Promise<PaginatedPipelineRuns> {
	const qs = new URLSearchParams();
	if (params?.limit) qs.set('limit', String(params.limit));
	if (params?.offset) qs.set('offset', String(params.offset));
	return request<PaginatedPipelineRuns>(`/pipeline/runs?${qs.toString()}`);
}

export async function getPipelineRun(runId: string) {
	return request<import('./types').PipelineRun>(`/pipeline/runs/${runId}`);
}

export async function listEnrichmentRuns(params?: {
	limit?: number;
	offset?: number;
}): Promise<PaginatedEnrichmentRuns> {
	const qs = new URLSearchParams();
	if (params?.limit) qs.set('limit', String(params.limit));
	if (params?.offset) qs.set('offset', String(params.offset));
	return request<PaginatedEnrichmentRuns>(`/pipeline/enrichment-runs?${qs.toString()}`);
}

export async function getEnrichmentRun(runId: string) {
	return request<import('./types').EnrichmentRunStats>(`/pipeline/enrichment-runs/${runId}`);
}

export async function listEnrichmentDeferrals(
	runId: string,
	params?: { limit?: number; offset?: number }
): Promise<PaginatedEnrichmentDeferrals> {
	const qs = new URLSearchParams();
	if (params?.limit) qs.set('limit', String(params.limit));
	if (params?.offset) qs.set('offset', String(params.offset));
	return request<PaginatedEnrichmentDeferrals>(
		`/pipeline/enrichment-runs/${runId}/deferrals?${qs.toString()}`
	);
}

export async function launchPipelineRun(body: PipelineRunRequest) {
	return request<{ run_id: string; stage: string; status: string }>('/pipeline/run', {
		method: 'POST',
		body: JSON.stringify(body)
	});
}

export async function getLLMSummary(): Promise<LLMSummary> {
	return request<LLMSummary>('/pipeline/llm-summary');
}

export async function getLLMModels(): Promise<LLMCatalogResponse> {
	return request<LLMCatalogResponse>('/pipeline/llm-models');
}

// ── Human validation ────────────────────────────────────────────────────────

export async function getValidationSummary(): Promise<ValidationSummary> {
	return request<ValidationSummary>('/validation/summary');
}

export async function getValidationWorkflow(): Promise<ValidationWorkflow> {
	return request<ValidationWorkflow>('/validation/workflow');
}

export async function getValidationPreparation(): Promise<ValidationPreparation> {
	return request<ValidationPreparation>('/validation/workflow/preparation');
}

export async function prepareValidationWorkflow(): Promise<ValidationPreparation> {
	return request<ValidationPreparation>('/validation/workflow/prepare', { method: 'POST' });
}

export async function getNextValidationGroup(params?: {
	phase?: ValidationPhase;
	status?: 'pending' | 'deferred' | 'abstained' | 'accepted' | 'source_rejected';
}): Promise<ValidationGroup | null> {
	const qs = new URLSearchParams();
	if (params?.phase) qs.set('phase', params.phase);
	if (params?.status) qs.set('status', params.status);
	return request<ValidationGroup | null>(`/validation/groups/next?${qs.toString()}`);
}

export async function getRepairStatus(): Promise<RepairRunStatus> {
	return request<RepairRunStatus>('/validation/repairs/status');
}

export async function refreshRepairs(options?: {
	scope?: 'residual' | 'identity' | 'all';
	apply_decisions?: boolean;
}): Promise<RepairRunStatus> {
	return request<RepairRunStatus>('/validation/repairs/refresh', {
		method: 'POST',
		body: JSON.stringify({
			scope: options?.scope ?? 'residual',
			apply_decisions: options?.apply_decisions ?? true
		})
	});
}

export async function getValidationGroupOccurrences(
	groupId: number,
	params?: { limit?: number; offset?: number }
): Promise<{ total: number; limit: number; offset: number; items: ValidationEntry[] }> {
	const qs = new URLSearchParams();
	if (params?.limit) qs.set('limit', String(params.limit));
	if (params?.offset) qs.set('offset', String(params.offset));
	return request(`/validation/groups/${groupId}/occurrences?${qs.toString()}`);
}

export async function getValidationGroup(groupId: number): Promise<ValidationGroup> {
	return request<ValidationGroup>(`/validation/groups/${groupId}`);
}

export async function getValidationRelatedOccurrences(
	groupId: number
): Promise<{ total: number; items: ValidationRelatedOccurrence[] }> {
	return request(`/validation/groups/${groupId}/related`);
}

export async function acceptValidationGroup(
	groupId: number,
	authorId: number,
	options?: { note?: string; create_alias?: boolean }
): Promise<ValidationGroupDecision> {
	return request<ValidationGroupDecision>(`/validation/groups/${groupId}/accept`, {
		method: 'POST',
		body: JSON.stringify({
			author_id: authorId,
			note: options?.note || null,
			create_alias: options?.create_alias ?? false
		})
	});
}

export async function compareValidationGroupCandidate(
	groupId: number,
	authorId: number
): Promise<ValidationGroup> {
	return request<ValidationGroup>(
		`/validation/groups/${groupId}/candidates/${authorId}/evidence`,
		{ method: 'POST' }
	);
}

export async function markValidationGroupExternal(
	groupId: number,
	reasonCode: string,
	note?: string,
	externalPersonId?: number | null
): Promise<ValidationGroupDecision> {
	return request<ValidationGroupDecision>(`/validation/groups/${groupId}/external`, {
		method: 'POST',
		body: JSON.stringify({
			reason_code: reasonCode,
			note: note || null,
			external_person_id: externalPersonId ?? null
		})
	});
}

export async function searchValidationExternalDirectory(
	query: string
): Promise<ExternalDirectoryPerson[]> {
	return request<ExternalDirectoryPerson[]>(
		`/validation/external-directory?q=${encodeURIComponent(query)}`
	);
}

export async function deferValidationGroup(
	groupId: number,
	note?: string
): Promise<ValidationGroupDecision> {
	return request<ValidationGroupDecision>(`/validation/groups/${groupId}/defer`, {
		method: 'POST',
		body: JSON.stringify({ note: note || null })
	});
}

export async function undoValidationGroupDecision(
	groupId: number
): Promise<ValidationGroupDecision> {
	return request<ValidationGroupDecision>(`/validation/groups/${groupId}/undo`, {
		method: 'POST'
	});
}

export async function getNextValidationEntry(params?: {
	source?: string;
	case_kind?: 'identity_review' | 'suggested_match' | 'external_verification' | 'data_gap';
	status?: 'pending' | 'deferred';
}): Promise<ValidationEntry | null> {
	const qs = new URLSearchParams();
	if (params?.source) qs.set('source', params.source);
	if (params?.case_kind) qs.set('case_kind', params.case_kind);
	if (params?.status) qs.set('status', params.status);
	return request<ValidationEntry | null>(`/validation/entries/next?${qs.toString()}`);
}

export async function acceptValidationEntry(
	entryId: number,
	authorId: number,
	note?: string
): Promise<ValidationDecision> {
	return request<ValidationDecision>(`/validation/entries/${entryId}/accept`, {
		method: 'POST',
		body: JSON.stringify({ author_id: authorId, note: note || null })
	});
}

export async function compareValidationCandidate(
	entryId: number,
	authorId: number
): Promise<ValidationEntry> {
	return request<ValidationEntry>(
		`/validation/entries/${entryId}/candidates/${authorId}/evidence`,
		{ method: 'POST' }
	);
}

export async function markValidationEntryExternal(
	entryId: number,
	note?: string
): Promise<ValidationDecision> {
	return request<ValidationDecision>(`/validation/entries/${entryId}/external`, {
		method: 'POST',
		body: JSON.stringify({ note: note || null })
	});
}

export async function deferValidationEntry(
	entryId: number,
	note?: string
): Promise<ValidationDecision> {
	return request<ValidationDecision>(`/validation/entries/${entryId}/defer`, {
		method: 'POST',
		body: JSON.stringify({ note: note || null })
	});
}

export async function undoValidationDecision(entryId: number): Promise<ValidationDecision> {
	return request<ValidationDecision>(`/validation/entries/${entryId}/undo`, {
		method: 'POST'
	});
}

export async function refreshValidationDerivedData(): Promise<ValidationRefresh> {
	return request<ValidationRefresh>('/validation/refresh-derived', { method: 'POST' });
}

export async function listDuplicateReviews(
	status: 'pending' | 'same' | 'different' | 'deferred' = 'pending',
	duplicateId?: number | null
): Promise<{ total: number; items: DuplicateReviewEntry[] }> {
	const params = new URLSearchParams({ status });
	if (duplicateId) params.set('duplicate_id', String(duplicateId));
	return request(`/validation/duplicates?${params.toString()}`);
}

export async function reviewDuplicate(
	duplicateId: number,
	decision: 'same' | 'different' | 'deferred',
	note?: string
): Promise<DuplicateReviewEntry> {
	return request(`/validation/duplicates/${duplicateId}/review`, {
		method: 'POST',
		body: JSON.stringify({ decision, note: note || null })
	});
}

export async function mergeAuthorGroup(payload: {
	author_ids: number[];
	canonical_author_id: number;
	note?: string;
}): Promise<AuthorGroupMergeResult> {
	return request<AuthorGroupMergeResult>('/validation/duplicates/merge-group', {
		method: 'POST',
		body: JSON.stringify({ ...payload, note: payload.note || null })
	});
}

export async function listAuthorMerges(): Promise<AuthorMergeAudit[]> {
	return request<AuthorMergeAudit[]>('/validation/duplicates/merges?include_undone=true');
}

export async function undoAuthorMerge(mergeEventId: number): Promise<AuthorMergeAudit> {
	return request<AuthorMergeAudit>(`/validation/duplicates/merges/${mergeEventId}/undo`, {
		method: 'POST'
	});
}

export async function undoAuthorMergeBatch(batchId: string): Promise<AuthorMergeAudit[]> {
	return request<AuthorMergeAudit[]>(`/validation/duplicates/merge-batches/${batchId}/undo`, {
		method: 'POST'
	});
}

export async function getDuplicateGoldMetrics(): Promise<DuplicateScorerMetrics> {
	return request<DuplicateScorerMetrics>('/validation/duplicates/gold/metrics');
}

export async function labelAuthorMergeGold(
	mergeEventId: number,
	label: 'same' | 'different' | 'uncertain'
): Promise<DuplicateScorerMetrics> {
	return request<DuplicateScorerMetrics>(`/validation/duplicates/merges/${mergeEventId}/gold-label`, {
		method: 'POST',
		body: JSON.stringify({ label })
	});
}

// ── Formal Gold Standard ────────────────────────────────────────────────────

export async function listGoldStudies(): Promise<GoldStudy[]> {
	return request<GoldStudy[]>('/validation/gold/studies');
}

export async function createGoldStudy(payload: {
	name: string;
	source_run_id: string;
	sampling_seed: number;
}): Promise<GoldStudy> {
	return request<GoldStudy>('/validation/gold/studies', {
		method: 'POST',
		body: JSON.stringify(payload)
	});
}

export async function addGoldStudyMember(
	studyId: string,
	userId: number,
	role: 'manager' | 'annotator' | 'adjudicator'
): Promise<{ user_id: number; role: string; code: string }> {
	return request(`/validation/gold/studies/${studyId}/members`, {
		method: 'POST',
		body: JSON.stringify({ user_id: userId, role })
	});
}

export async function startGoldStudy(studyId: string): Promise<GoldStudy> {
	return request<GoldStudy>(`/validation/gold/studies/${studyId}/start`, { method: 'POST' });
}

export async function getNextGoldTask(studyId: string): Promise<GoldTask | null> {
	return request<GoldTask | null>(`/validation/gold/studies/${studyId}/tasks/next`);
}

export async function saveGoldTask(
	studyId: string,
	taskId: number,
	items: Array<{
		case_id: number;
		cluster_key: string;
		label: GoldAnnotationDraft['label'];
		canonical_author_id: number | null;
		rationale: string | null;
		affiliation_at_publication: GoldAnnotationDraft['affiliation_at_publication'];
	}>,
	submit = false
): Promise<{ status: string; submitted_at: string | null }> {
	return request(`/validation/gold/studies/${studyId}/tasks/${taskId}/${submit ? 'submit' : 'draft'}`, {
		method: submit ? 'POST' : 'PUT',
		body: JSON.stringify({ items })
	});
}

export async function getNextGoldAdjudication(studyId: string): Promise<GoldTask | null> {
	return request<GoldTask | null>(`/validation/gold/studies/${studyId}/adjudications/next`);
}

export async function adjudicateGoldTask(
	studyId: string,
	taskId: number,
	items: Array<{
		case_id: number;
		cluster_key: string;
		label: GoldAnnotationDraft['label'];
		canonical_author_id: number | null;
		reason: string | null;
		affiliation_at_publication: GoldAnnotationDraft['affiliation_at_publication'];
	}>
): Promise<{ status: string }> {
	return request(`/validation/gold/studies/${studyId}/tasks/${taskId}/adjudicate`, {
		method: 'POST',
		body: JSON.stringify({ items })
	});
}

export async function freezeGoldStudy(studyId: string): Promise<GoldStudy> {
	return request<GoldStudy>(`/validation/gold/studies/${studyId}/freeze`, { method: 'POST' });
}

export async function evaluateGoldStudy(
	studyId: string
): Promise<{ metrics: GoldMetrics; exports: { files: string[] } }> {
	return request(`/validation/gold/studies/${studyId}/evaluate`, { method: 'POST' });
}

export async function getGoldMetrics(studyId: string): Promise<GoldMetrics> {
	return request<GoldMetrics>(`/validation/gold/studies/${studyId}/metrics`);
}

export async function promoteGoldStudy(studyId: string): Promise<Record<string, number>> {
	return request(`/validation/gold/studies/${studyId}/promote`, { method: 'POST' });
}

export async function searchGoldDirectory(
	studyId: string,
	query: string
): Promise<GoldDirectoryAuthor[]> {
	return request<GoldDirectoryAuthor[]>(
		`/validation/gold/studies/${studyId}/directory?q=${encodeURIComponent(query)}`
	);
}

// ── Fast single-reviewer benchmark pilot ───────────────────────────────────

export async function listBenchmarkPilots(): Promise<BenchmarkPilotStudy[]> {
	return request<BenchmarkPilotStudy[]>('/validation/gold/pilots');
}

export async function createBenchmarkPilot(payload: {
	name: string;
	sampling_seed: number;
	target_case_count?: number;
	evidence_protocol?: 'legacy' | 'evidence-v2';
	supersedes_study_id?: string | null;
}): Promise<BenchmarkPilotStudy> {
	return request<BenchmarkPilotStudy>('/validation/gold/pilots', {
		method: 'POST',
		body: JSON.stringify(payload)
	});
}

export async function deleteBenchmarkPilot(studyId: string): Promise<{
	deleted_study_id: string;
	deleted_case_count: number;
	deleted_label_count: number;
}> {
	return request(`/validation/gold/pilots/${studyId}`, { method: 'DELETE' });
}

export async function archiveBenchmarkPilot(
	studyId: string,
	reason = 'evidence-v1-superseded'
): Promise<BenchmarkPilotStudy> {
	return request<BenchmarkPilotStudy>(`/validation/gold/pilots/${studyId}/archive`, {
		method: 'POST',
		body: JSON.stringify({ reason })
	});
}

export async function getNextBenchmarkPilotCase(studyId: string): Promise<BenchmarkPilotCase | null> {
	return request<BenchmarkPilotCase | null>(`/validation/gold/pilots/${studyId}/cases/next`);
}

export async function getBenchmarkPilotCaseByPosition(
	studyId: string,
	position: number
): Promise<BenchmarkPilotCase> {
	return request<BenchmarkPilotCase>(
		`/validation/gold/pilots/${studyId}/cases/position/${position}`
	);
}

export async function getAdjacentBenchmarkPilotCase(
	studyId: string,
	caseId: number,
	direction: 'previous' | 'next'
): Promise<BenchmarkPilotCase | null> {
	return request<BenchmarkPilotCase | null>(
		`/validation/gold/pilots/${studyId}/cases/${caseId}/adjacent?direction=${direction}`
	);
}

export async function saveBenchmarkPilotLabel(
	studyId: string,
	caseId: number,
	payload: BenchmarkPilotLabel
): Promise<{ study: BenchmarkPilotStudy; case: BenchmarkPilotCase }> {
	return request(`/validation/gold/pilots/${studyId}/cases/${caseId}/label`, {
		method: 'PUT',
		body: JSON.stringify(payload)
	});
}

export async function searchBenchmarkPilotDirectory(
	studyId: string,
	query: string
): Promise<GoldDirectoryAuthor[]> {
	return request<GoldDirectoryAuthor[]>(
		`/validation/gold/pilots/${studyId}/directory?q=${encodeURIComponent(query)}`
	);
}

export async function searchBenchmarkPilotExternalDirectory(
	studyId: string,
	query: string
): Promise<BenchmarkPilotExternalPerson[]> {
	return request<BenchmarkPilotExternalPerson[]>(
		`/validation/gold/pilots/${studyId}/external-directory?q=${encodeURIComponent(query)}`
	);
}

export async function finalizeBenchmarkPilot(studyId: string): Promise<BenchmarkPilotStudy> {
	return request<BenchmarkPilotStudy>(`/validation/gold/pilots/${studyId}/finalize`, {
		method: 'POST'
	});
}

export async function exportBenchmarkPilot(studyId: string): Promise<BenchmarkPilotExport> {
	return request<BenchmarkPilotExport>(`/validation/gold/pilots/${studyId}/export`, {
		method: 'POST'
	});
}

export async function reopenBenchmarkPilot(studyId: string): Promise<{
	study: BenchmarkPilotStudy;
	preserved_benchmark_run_count: number;
}> {
	return request(`/validation/gold/pilots/${studyId}/reopen`, {
		method: 'POST',
		body: JSON.stringify({ preserve_benchmarks: true })
	});
}

export async function rebaseBenchmarkPilotCatalog(studyId: string): Promise<{
	study: BenchmarkPilotStudy;
	rebase: {
		case_count: number;
		labels_carried: number;
		review_required: number;
		candidate_sets_changed: number;
		evidence_changed: number;
	};
	preserved_benchmark_run_count: number;
}> {
	return request(`/validation/gold/pilots/${studyId}/rebase-catalog`, {
		method: 'POST',
		body: JSON.stringify({})
	});
}

export async function downloadBenchmarkPilot(studyId: string): Promise<void> {
	const token = getToken();
	const headers: Record<string, string> = {};
	if (token) headers.Authorization = `Bearer ${token}`;
	const project = browser ? localStorage.getItem('active_project_id') : null;
	if (project) headers['X-Project-ID'] = project;
	const response = await fetch(`${API_BASE}/validation/gold/pilots/${studyId}/export.zip`, {
		headers,
		credentials: 'include'
	});
	if (!response.ok) throw new Error((await response.text()) || response.statusText);
	const blob = await response.blob();
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = `benchmark-pilot-${studyId}.zip`;
	anchor.click();
	URL.revokeObjectURL(url);
}

export async function getBenchmarkRunOptions(studyId: string): Promise<BenchmarkRunOptions> {
	return request<BenchmarkRunOptions>(`/validation/gold/pilots/${studyId}/benchmark/options`);
}

export async function startBenchmarkRun(
	studyId: string,
	payload: { models: string[]; track: 'frozen' | 'native-search'; scope: 'smoke' | 'full' }
): Promise<BenchmarkRunStatus> {
	return request<BenchmarkRunStatus>(`/validation/gold/pilots/${studyId}/benchmark/runs`, {
		method: 'POST',
		body: JSON.stringify(payload)
	});
}

export async function getBenchmarkRun(studyId: string, runId: string): Promise<BenchmarkRunStatus> {
	return request<BenchmarkRunStatus>(
		`/validation/gold/pilots/${studyId}/benchmark/runs/${encodeURIComponent(runId)}`
	);
}

export async function getBenchmarkPredictions(
	studyId: string,
	runId: string,
	modelId: string,
	offset = 0,
	limit = 10
): Promise<BenchmarkPredictionPage> {
	const params = new URLSearchParams({
		model_id: modelId,
		offset: String(offset),
		limit: String(limit)
	});
	return request<BenchmarkPredictionPage>(
		`/validation/gold/pilots/${studyId}/benchmark/runs/${encodeURIComponent(runId)}/predictions?${params}`
	);
}

export async function downloadBenchmarkArtifact(
	studyId: string,
	runId: string,
	artifact: 'report' | 'comparison' | 'summary'
): Promise<void> {
	const token = getToken();
	const headers: Record<string, string> = {};
	if (token) headers.Authorization = `Bearer ${token}`;
	const project = browser ? localStorage.getItem('active_project_id') : null;
	if (project) headers['X-Project-ID'] = project;
	const response = await fetch(
		`${API_BASE}/validation/gold/pilots/${studyId}/benchmark/runs/${encodeURIComponent(runId)}/artifacts/${artifact}`,
		{ headers, credentials: 'include' }
	);
	if (!response.ok) throw new Error((await response.text()) || response.statusText);
	const blob = await response.blob();
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = artifact === 'comparison' ? 'benchmark-comparison.csv' : artifact === 'summary' ? 'benchmark-summary.json' : 'benchmark-report.md';
	anchor.click();
	URL.revokeObjectURL(url);
}

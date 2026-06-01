import { browser } from '$app/environment';
import { auth } from '$lib/auth';
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
	LLMCatalogResponse
} from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
	if (!(options.body instanceof FormData)) {
		headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
	}

	const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

	if (res.status === 401 && retry && browser) {
		const refreshed = await refreshToken();
		if (refreshed) {
			return request<T>(path, options, false);
		}
		clearTokensAndLogout();
		throw new Error('Authentication required');
	}

	if (!res.ok) {
		const detail = await res.text();
		throw new Error(detail || res.statusText);
	}

	return res.json();
}

async function refreshToken(): Promise<boolean> {
	const refresh = browser ? localStorage.getItem('refresh_token') : null;
	if (!refresh) return false;

	try {
		const res = await fetch(`${API_BASE}/auth/refresh`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ refresh_token: refresh })
		});
		if (!res.ok) return false;
		const data: TokenResponse = await res.json();
		setTokens(data.access_token, data.refresh_token);
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
		const detail = await res.text();
		throw new Error(detail || 'Invalid credentials');
	}
	const data: TokenResponse = await res.json();
	setTokens(data.access_token, data.refresh_token);
	return data;
}

export function logout() {
	clearTokensAndLogout();
}

export function isAuthenticated(): boolean {
	return !!getToken();
}

// ── Authors ──────────────────────────────────────────────────────────────────

export async function listAuthors(params?: {
	search?: string;
	source?: string;
	sort?: string;
	limit?: number;
	offset?: number;
}): Promise<PaginatedAuthors> {
	const qs = new URLSearchParams();
	if (params?.search) qs.set('search', params.search);
	if (params?.source) qs.set('source', params.source);
	if (params?.sort) qs.set('sort', params.sort);
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
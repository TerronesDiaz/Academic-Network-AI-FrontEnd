// Deliberately separate from production JWT, project and legacy benchmark clients.
const base = import.meta.env.VITE_SUPERVISED_PILOT_URL || 'http://localhost:8793';
const tokenKey = 'udec-supervised-pilot-token-v1';
export function loggedIn() { return !!sessionStorage.getItem(tokenKey); }
export function logout() { sessionStorage.removeItem(tokenKey); }
export async function api<T>(path: string, body?: unknown): Promise<T> {
	const token = sessionStorage.getItem(tokenKey);
	const response = await fetch(`${base}${path}`, {
		method: body === undefined ? 'GET' : 'POST', cache: 'no-store', credentials: 'omit',
		headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	if (!response.ok) {
		const data = await response.json().catch(() => ({}));
		if (response.status === 401) logout();
		throw new Error(typeof data.detail === 'string' ? data.detail : `Solicitud rechazada (${response.status})`);
	}
	return response.json();
}
export async function login(username: string, password: string) {
	const result = await api<{ access_token: string }>('/login', { username, password });
	sessionStorage.setItem(tokenKey, result.access_token);
}
export type Paper = {title: string | null; year: number | null; venue: string | null; publication: {canonical_id: string; doi: string | null}; coauthors: {raw_name: string}[]; coauthors_known: boolean; affiliations: {institution: string | null}[]};
export type Candidate = {author_id: string; name: string; papers: Paper[]};
export type CaseRow = {occurrence_id: string; signature: string; title: string | null; position: number | null; state: string; institutional_state: string};
export type Comparison = {human_decision: {kind: string; author_id: string | null; note: string}; top1: {candidate_id: string; score: number} | null; top5: {candidate_id: string; name: string; score: number}[]; human_rank: number | null; candidate_status: string; correct: boolean | null; error_type: string | null; features: Record<string, Record<string, number | null>>; model_hash: string; prediction_timestamp: string; annotation_timestamp: string; note: string};
export type InstitutionLabel = {udec_status: 'YES' | 'NO' | 'UNKNOWN'; affiliations: string; period_note: string; evidence_note: string; sources: string; external_research: boolean; record_issue: 'NONE' | 'INCOMPLETE_METADATA' | 'CORRUPT_RECORD'};
export type InstitutionReview = {label: InstitutionLabel; at: string; reviewer_id: number; post_reveal: boolean; scope: string};
export type InstitutionSummary = {reviewed: number; pending: number; total: number; counts: Record<string,number>; catalog_by_udec: Record<string,Record<string,number>>; post_reveal: number; external_research: number; record_issues: Record<string,number>};
export type CaseDetail = {occurrence_id: string; state: string; occurrence: {raw_signature: string; author_position: number | null; source_occurrence_id: string | null; cutoff: string}; query: Paper; byline: {position: number | null; names: string[]}[]; candidates: Candidate[]; evidence_hash: string; temporal_mode: string; annotation: {human_label: {kind: string; author_id: string | null; note: string}} | null; comparison?: Comparison; institutional_review: InstitutionReview | null};
export type Measure = {numerator: number; denominator: number; value: number | null; reason: string | null};
export type Metrics = {total: number; reviewed: number; revealed: number; EXISTING: number; candidate_pool_recall: Measure; MRR: Measure; 'R@1': Measure; 'R@3': Measure; 'R@5': Measure; insufficient: Measure; candidate_generation_errors: number; ranking_errors: number; external_descriptive: unknown[]};

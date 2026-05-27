<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { listPipelineRuns, listEnrichmentRuns, launchPipelineRun, getLLMSummary } from '$lib/api/client';
	import type { PipelineRun, EnrichmentRunStats, EnrichmentDeferral, LLMSummary } from '$lib/api/types';

	let runs = $state<PipelineRun[]>([]);
	let enrichmentRuns = $state<EnrichmentRunStats[]>([]);
	let deferrals = $state<EnrichmentDeferral[]>([]);
	let llmSummary = $state<LLMSummary | null>(null);
	let loading = $state(true);
	let error = $state('');
	let activeTab = $state<'runs' | 'enrichment' | 'launch'>('runs');
	let selectedEnrichmentRunId = $state('');
	let showDeferrals = $state(false);

	let launchStage = $state('migrate');
	let launchLimit = $state('');
	let launchCsvDir = $state('output');
	let launchEnrichWorkers = $state('4');
	let launchBuildOnly = $state(false);
	let launchGoldPath = $state('docs/gold_standard.csv');
	let launchUseLlm = $state(false);
	let launchForce = $state(false);
	let launchLlmBudget = $state('');
	let launchLlmProvider = $state('claude');
	let launchStatus = $state('');
	let launchError = $state('');
	let launchLoading = $state(false);

	const individualStages = [
		{ id: 'extract',       label: 'Extract',       desc: 'Scrape Google Scholar org list',        detail: 'Scrapes the Google Scholar organization list using Playwright. Reads the UdeC portal and saves raw author names, affiliations, and profile links as output/authors_extracted.csv.' },
		{ id: 'normalize',     label: 'Normalize',     desc: 'Clean and deduplicate author names',    detail: 'Cleans extracted names: trims whitespace, removes duplicates, separates compound names, and standardizes formatting. Outputs authors_normalized.csv.' },
		{ id: 'profile',       label: 'Profile',       desc: 'Visit profiles for publications & metrics', detail: 'Visits each author\'s individual Google Scholar profile. Collects publications (title, venue, year, citations), top co-authors, and summary metrics (h-index, i10-index). Outputs CSVs.' },
		{ id: 'db-profile',    label: 'DB Profile',    desc: 'Profile directly to PostgreSQL',       detail: 'Same as profile, but writes publications, co-author edges, and observed name signatures directly to PostgreSQL tables. Requires a prior migrate run (schema must exist).' },
		{ id: 'migrate',       label: 'Migrate',       desc: 'Load all CSVs into the database',       detail: 'Loads all CSV files into PostgreSQL using upserts: authors, metrics snapshots, observed signatures, publications with authorships, and coauthor edges. Also recalculates edges from resolved authorships and backfills author positions. Safe to re-run.' },
		{ id: 'enrich',        label: 'Enrich',        desc: 'Query OpenAlex for DOIs & metadata',   detail: 'Enriches publications by querying the OpenAlex API. Fetches DOIs, abstracts, document types, venue normalization, and external citation counts. Resumable — skips already-enriched publications. Rate-limited to respect API limits.' },
		{ id: 'disambiguate',  label: 'Disambiguate',  desc: 'AND pipeline: cluster & resolve',      detail: 'Author Name Disambiguation pipeline. Phase 1: namespace clustering via co-author overlap and year range. Phase 2: institutional filter using UdeC directory. Phase 3: BGE-M3 semantic embedding resolver. Optional Phase 4: LLM fallback for persistent ambiguous signatures (enable "Use LLM" below; select Claude or local model).' },
		{ id: 'indicators',    label: 'Indicators',    desc: 'Compute h-index, PageRank & report',   detail: 'Computes bibliometric and network indicators per author: total publications, total citations, h-index, i10-index, PageRank, betweenness centrality, and clustering coefficient. Writes docs/indicators_report.md and appends a new snapshot for longitudinal analysis.' },
		{ id: 'evaluate',      label: 'Evaluate',      desc: 'Build gold standard & score AND',      detail: 'Formal evaluation (Phase 6). Builds a gold standard from profile-owner publications, then computes B-Cubed F1, K-metric, and Macro F1 for both the AND system and a name-only baseline. Separates results into easy and hard (ambiguous) entries. Writes docs/evaluation_report.md.' },
	];

	const compositeStages = [
		{
			id: 'from-csvs',
			label: 'From CSVs',
			desc: 'Database pipeline when CSVs already exist',
			detail: 'Database-side pipeline for when CSVs already exist in output/. Runs 4 stages in order: migrate → enrich → disambiguate → indicators. Each stage is idempotent — safe to re-run if interrupted. Requires CSVs from prior extract, normalize, and profile runs.',
			flow: 'migrate → enrich → disambiguate → indicators',
		},
		{
			id: 'full',
			label: 'Full Pipeline',
			desc: 'Complete end-to-end from scratch',
			detail: 'Complete linear pipeline from scratch. Runs all 7 stages in order: extract → normalize → profile → migrate → enrich → disambiguate → indicators. Requires PostgreSQL, network access, and Playwright. The same limit value caps both profile scraping and publication enrichment. Stages are idempotent where documented.',
			flow: 'extract → normalize → profile → migrate → enrich → disambiguate → indicators',
		},
	];

	$effect(() => {
		if (browser && !$auth) goto('/login');
	});

	async function fetchData() {
		loading = true;
		error = '';
		try {
			const [runsData, enrichData, llmData] = await Promise.all([
				listPipelineRuns({ limit: 50 }),
				listEnrichmentRuns({ limit: 50 }),
				getLLMSummary()
			]);
			runs = runsData.items;
			enrichmentRuns = enrichData.items;
			llmSummary = llmData;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load pipeline data';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (browser && $auth) fetchData();
	});

	async function handleLaunch() {
		launchLoading = true;
		launchError = '';
		launchStatus = '';
		launchedRunId = '';
		enrichProgress = null;
		try {
			const result = await launchPipelineRun({
				stage: launchStage,
				limit: launchLimit ? parseInt(launchLimit) : null,
				csv_dir: launchCsvDir,
				enrich_workers: launchEnrichWorkers ? parseInt(launchEnrichWorkers) : null,
				build_only: launchBuildOnly,
				gold_path: launchGoldPath,
				use_llm: launchUseLlm,
				llm_provider: launchUseLlm ? launchLlmProvider : undefined,
				force: launchForce,
				max_llm_budget_usd: launchLlmBudget ? parseFloat(launchLlmBudget) : null
			});
			launchStatus = `Pipeline run queued! Run ID: ${result.run_id}, Stage: ${result.stage}`;
			launchedRunId = result.run_id;
			if (launchStage === 'enrich' || launchStage === 'from-csvs' || launchStage === 'full') {
				startProgressPolling(result.run_id);
			}
		} catch (e) {
			if (e instanceof Error) {
				try {
					const parsed = JSON.parse(e.message);
					const detail = parsed.detail ?? parsed;
					if (detail?.code === 'openalex_budget_exhausted') {
						budgetError = { code: detail.code, message: detail.message, resets_at: detail.resets_at, resets_in_seconds: detail.resets_in_seconds };
						launchError = '';
						launchLoading = false;
						return;
					}
				} catch {}
			}
			launchError = e instanceof Error ? e.message : 'Failed to launch pipeline';
		} finally {
			launchLoading = false;
		}
	}

	let launchedRunId = $state('');
	let enrichProgress = $state<EnrichmentRunStats | null>(null);
	let budgetError = $state<{ code: string; message: string; resets_at: string | null; resets_in_seconds: number | null } | null>(null);
	let progressTimer: ReturnType<typeof setInterval> | null = null;

	function stopPolling() {
		if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
	}

	function startProgressPolling(runId: string) {
		stopPolling();
		budgetError = null;
		launchError = '';
		const MAX_POLL_ERRORS = 5;
		let pollErrors = 0;
		progressTimer = setInterval(async () => {
			try {
				const stats = await (await import('$lib/api/client')).getEnrichmentRun(runId);
				enrichProgress = stats;
				pollErrors = 0;
				if (stats.status === 'success' || stats.status === 'error') {
					stopPolling();
					if (stats.status === 'success') {
						launchStatus = `Pipeline run completed! ${stats.matched} enriched, ${stats.transient_deferred} deferred.`;
					} else if (stats.status === 'error') {
						if (stats.error_detail?.code === 'openalex_budget_exhausted') {
							budgetError = stats.error_detail;
						} else {
							launchError = stats.error_message || 'Enrichment failed with an error.';
						}
					}
					launchedRunId = '';
				}
			} catch (e) {
				pollErrors++;
				if (e instanceof Error && e.message === 'Authentication required') {
					stopPolling();
					goto('/login');
					return;
				}
				if (pollErrors >= MAX_POLL_ERRORS) {
					stopPolling();
					launchError = 'Lost connection to the server. Please refresh the page.';
					launchedRunId = '';
				}
			}
		}, 2000);
	}

	$effect(() => {
		return () => stopPolling();
	});

	function fmtProgress(pct: number | null) {
		if (pct == null) return 0;
		return Math.round(pct * 100);
	}

	function fmtBudgetCountdown(seconds: number | null) {
		if (seconds == null) return '';
		if (seconds < 60) return `${seconds}s`;
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		if (h > 0) return `${h}h ${m}m`;
		return `${m}m`;
	}

	async function loadDeferrals(runId: string) {
		selectedEnrichmentRunId = runId;
		showDeferrals = true;
		try {
			const data = await import('$lib/api/client').then((m) =>
				m.listEnrichmentDeferrals(runId)
			);
			deferrals = data.items;
		} catch {
			deferrals = [];
		}
	}

	function statusBadgeClass(status: string) {
		if (status === 'success') return 'bg-green-100 text-green-800';
		if (status === 'running' || status === 'queued') return 'bg-yellow-100 text-yellow-800';
		if (status === 'error') return 'bg-red-100 text-red-800';
		return 'bg-gray-100 text-gray-600';
	}

	function fmtDate(d: string | null) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function fmtDuration(s: number | null) {
		if (s == null) return '—';
		if (s < 60) return `${s.toFixed(1)}s`;
		const m = Math.floor(s / 60);
		const sec = Math.round(s % 60);
		return `${m}m ${sec}s`;
	}
</script>

<div>
	<a href="/" class="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 mb-3 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">
		<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
		Home
	</a>
	<h1 class="text-2xl font-bold text-gray-900 mb-6">Pipeline</h1>

	<div class="flex gap-1 mb-6 overflow-x-auto" role="tablist" aria-label="Pipeline views">
		<button
			role="tab"
			aria-selected={activeTab === 'runs'}
			class="px-4 py-2 text-sm rounded-md whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500 {activeTab === 'runs' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border hover:bg-gray-50'}"
			onclick={() => (activeTab = 'runs')}>Pipeline Runs</button>
		<button
			role="tab"
			aria-selected={activeTab === 'enrichment'}
			class="px-4 py-2 text-sm rounded-md whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500 {activeTab === 'enrichment' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border hover:bg-gray-50'}"
			onclick={() => (activeTab = 'enrichment')}>Enrichment Runs</button>
		<button
			role="tab"
			aria-selected={activeTab === 'launch'}
			class="px-4 py-2 text-sm rounded-md whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500 {activeTab === 'launch' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border hover:bg-gray-50'}"
			onclick={() => (activeTab = 'launch')}>Launch Pipeline</button>
	</div>

	{#if error}
		<div role="alert" class="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
	{/if}

	{#if loading && activeTab !== 'launch'}
		<div class="bg-white rounded-lg shadow p-8 animate-pulse">
			{#each Array(5) as _}
				<div class="flex gap-4 py-3 border-b border-gray-100">
					<div class="h-4 bg-gray-200 rounded w-20"></div>
					<div class="h-4 bg-gray-100 rounded w-24"></div>
					<div class="h-4 bg-gray-100 rounded w-32"></div>
					<div class="h-4 bg-gray-100 rounded w-16"></div>
					<div class="h-4 bg-gray-100 rounded w-16"></div>
				</div>
			{/each}
		</div>
	{:else if activeTab === 'runs'}
		{#if llmSummary && llmSummary.total_calls > 0}
			<div class="bg-white rounded-lg shadow p-4 mb-4">
				<h3 class="text-sm font-semibold text-gray-700 mb-3">LLM Usage Summary (Cumulative)</h3>
				<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
					<div class="bg-indigo-50 rounded p-2 text-center">
						<div class="text-lg font-bold text-indigo-700">{llmSummary.total_calls.toLocaleString()}</div>
						<div class="text-xs text-gray-500">Total Calls</div>
					</div>
					<div class="bg-blue-50 rounded p-2 text-center">
						<div class="text-lg font-bold text-blue-700">{(llmSummary.total_input_tokens + llmSummary.total_output_tokens).toLocaleString()}</div>
						<div class="text-xs text-gray-500">Total Tokens</div>
					</div>
					<div class="bg-emerald-50 rounded p-2 text-center">
						<div class="text-lg font-bold text-emerald-700">${llmSummary.total_cost_usd.toFixed(4)}</div>
						<div class="text-xs text-gray-500">Total Cost (USD)</div>
					</div>
					<div class="bg-purple-50 rounded p-2 text-center">
						<div class="text-lg font-bold text-purple-700">{llmSummary.total_signatures_evaluated.toLocaleString()}</div>
						<div class="text-xs text-gray-500">Signatures Evaluated</div>
					</div>
				</div>
				{#if llmSummary.by_model.length > 0}
					<div class="mt-3 text-xs text-gray-500">
						By model:
						{#each llmSummary.by_model as model}
							<span class="inline-block bg-gray-100 px-2 py-0.5 rounded ml-1">{model.model_id}: {model.calls} calls, ${model.cost_usd.toFixed(4)}</span>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
		<div class="bg-white rounded-lg shadow overflow-hidden" role="tabpanel" aria-label="Pipeline runs">
			{#if runs.length === 0}
				<p class="p-12 text-center text-gray-500">No pipeline runs recorded yet</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200" aria-label="Pipeline runs history">
						<thead class="bg-gray-50">
							<tr>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">ID</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Stage</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Source</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Started</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Finished</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Duration</th>
				<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Status</th>
				<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">LLM</th>
				<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Notes</th>
							</tr>
						</thead>
						<tbody class="bg-white divide-y divide-gray-100">
							{#each runs as run}
								<tr class="hover:bg-gray-50">
									<td class="px-4 py-3 text-xs text-gray-500 font-mono">{run.id.slice(0, 8)}...</td>
									<td class="px-4 py-3 text-sm font-medium text-gray-900">{run.stage}</td>
									<td class="px-4 py-3 text-sm text-gray-600">{run.source}</td>
									<td class="px-4 py-3 text-sm text-gray-600">{fmtDate(run.started_at)}</td>
									<td class="px-4 py-3 text-sm text-gray-600">{fmtDate(run.finished_at)}</td>
									<td class="px-4 py-3 text-sm text-gray-600">{fmtDuration(run.duration_seconds)}</td>
								<td class="px-4 py-3">
									<span class="inline-flex text-xs font-medium px-2 py-0.5 rounded-full {statusBadgeClass(run.status)}">{run.status}</span>
								</td>
								<td class="px-4 py-3 text-xs text-gray-500">
									{#if run.llm_usage && run.llm_usage.total_calls > 0}
										<span class="inline-flex items-center gap-1 text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded" title="{run.llm_usage.total_calls} calls ({run.llm_usage.success_calls} ok, {run.llm_usage.error_calls} errors), {run.llm_usage.total_input_tokens.toLocaleString()} in + {run.llm_usage.total_output_tokens.toLocaleString()} out tokens, ${run.llm_usage.total_cost_usd.toFixed(4)}, {run.llm_usage.signatures_evaluated} signatures, avg {run.llm_usage.avg_latency_ms}ms, p95 {run.llm_usage.p95_latency_ms}ms{run.llm_usage.model_id ? ', model: ' + run.llm_usage.model_id : ''}">
											<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
											{run.llm_usage.total_calls} / ${run.llm_usage.total_cost_usd.toFixed(3)}
										</span>
									{:else}
										—
									{/if}
								</td>
									<td class="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{run.notes || '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{:else if activeTab === 'enrichment'}
		<div class="bg-white rounded-lg shadow overflow-hidden" role="tabpanel" aria-label="Enrichment runs">
			<h2 class="text-lg font-semibold text-gray-900 p-4 pb-2">Enrichment Run Statistics</h2>
			{#if enrichmentRuns.length === 0}
				<p class="px-4 pb-6 text-gray-500">No enrichment runs recorded yet</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200" aria-label="Enrichment run statistics">
						<thead class="bg-gray-50">
							<tr>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Run ID</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Source</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Started</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Duration</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Queued</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Matched</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Deferred</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Progress</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Status</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Actions</th>
							</tr>
						</thead>
						<tbody class="bg-white divide-y divide-gray-100">
							{#each enrichmentRuns as run}
								<tr class="hover:bg-gray-50">
									<td class="px-3 py-2 text-xs font-mono text-gray-500">{run.run_id.slice(0, 8)}...</td>
									<td class="px-3 py-2 text-sm text-gray-700">{run.source_name}</td>
									<td class="px-3 py-2 text-sm text-gray-600">{fmtDate(run.started_at)}</td>
									<td class="px-3 py-2 text-sm text-gray-600">{fmtDuration(run.duration_seconds)}</td>
									<td class="px-3 py-2 text-sm text-gray-700">{run.publications_queued}</td>
									<td class="px-3 py-2 text-sm text-green-700">{run.matched}</td>
									<td class="px-3 py-2 text-sm text-amber-700">{run.transient_deferred}</td>
									<td class="px-3 py-2">
										{#if run.publications_queued > 0 && run.progress_fraction != null}
											<div class="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
												<div class="h-2 bg-indigo-500 rounded-full transition-all" style="width: {Math.round(run.progress_fraction * 100)}%"></div>
											</div>
											<div class="text-[10px] text-gray-400 mt-0.5">{Math.round(run.progress_fraction * 100)}%</div>
										{:else}
											<span class="text-xs text-gray-400">—</span>
										{/if}
									</td>
									<td class="px-3 py-2">
										<span class="inline-flex text-xs font-medium px-2 py-0.5 rounded-full {statusBadgeClass(run.status)}">{run.status}</span>
									</td>
									<td>
										<button class="text-xs text-indigo-600 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded" onclick={() => loadDeferrals(run.run_id)} aria-label="View deferrals for run {run.run_id.slice(0, 8)}">Deferrals</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		{#if showDeferrals}
			<section class="mt-6 bg-white rounded-lg shadow overflow-hidden" aria-labelledby="deferrals-heading">
				<h3 id="deferrals-heading" class="text-lg font-semibold text-gray-900 p-4 pb-2">Deferrals for Run {selectedEnrichmentRunId.slice(0, 8)}...</h3>
				{#if deferrals.length === 0}
					<p class="p-4 text-gray-500">No deferrals found.</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200" aria-label="Enrichment deferrals">
							<thead class="bg-gray-50">
								<tr>
									<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Pub ID</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Phase</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Attempts</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">HTTP Status</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Error</th>
								</tr>
							</thead>
							<tbody class="bg-white divide-y divide-gray-100">
								{#each deferrals as d}
									<tr>
										<td class="px-3 py-2 text-sm text-gray-700">{d.publication_id}</td>
										<td class="px-3 py-2 text-sm text-gray-700">{d.phase}</td>
										<td class="px-3 py-2 text-sm text-gray-700">{d.attempts_used}</td>
										<td class="px-3 py-2 text-sm text-gray-700">{d.http_status ?? '—'}</td>
										<td class="px-3 py-2 text-sm text-gray-500 max-w-xs truncate">{d.error_message ?? '—'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>
		{/if}
	{:else if activeTab === 'launch'}
		<div role="tabpanel" aria-label="Launch pipeline">
			<h2 class="text-lg font-semibold text-gray-900 mb-4">Launch Pipeline Stage</h2>

			{#if launchStatus}
				<div role="status" class="mb-4 p-3 bg-green-50 text-green-700 rounded text-sm">{launchStatus}</div>
			{/if}
			{#if launchError}
				<div role="alert" class="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{launchError}</div>
			{/if}

			{#if budgetError}
				<div role="alert" class="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
					<div class="flex items-start gap-3">
						<svg class="w-5 h-5 text-amber-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
						<div>
							<p class="text-sm font-medium text-amber-800">{budgetError.message}</p>
							{#if budgetError.resets_in_seconds != null}
								<p class="text-xs text-amber-600 mt-1">
									Budget resets in {fmtBudgetCountdown(budgetError.resets_in_seconds)}.
									{#if budgetError.resets_at}
										({new Date(budgetError.resets_at).toLocaleTimeString()})
									{/if}
								</p>
							{/if}
						</div>
						<button onclick={() => (budgetError = null)} class="ml-auto text-amber-500 hover:text-amber-700" aria-label="Dismiss">&times;</button>
					</div>
				</div>
			{/if}

			{#if enrichProgress}
				{@const pct = fmtProgress(enrichProgress.progress_fraction)}
				<div class="mb-4 bg-white border border-indigo-200 rounded-lg p-4" aria-live="polite">
					<div class="flex items-center justify-between mb-2">
						<span class="text-sm font-medium text-indigo-800">
							{enrichProgress.status === 'running' ? 'Enrichment in progress...' : enrichProgress.status === 'success' ? 'Enrichment complete' : 'Enrichment finished'}
						</span>
						<span class="text-xs text-indigo-600">{enrichProgress.publications_processed} / {enrichProgress.publications_queued} publications</span>
					</div>
					<div class="w-full bg-gray-200 rounded-full h-3 mb-2 overflow-hidden">
						<div class="bg-indigo-600 h-3 rounded-full transition-all duration-500 ease-out" style="width: {pct}%"></div>
					</div>
					<div class="flex gap-4 text-xs text-gray-500">
						<span>Matched: <strong class="text-green-600">{enrichProgress.matched}</strong></span>
						<span>Deferred: <strong class="text-amber-600">{enrichProgress.transient_deferred}</strong></span>
						<span>Unmatched: <strong>{enrichProgress.unmatched_saved}</strong></span>
						<span>{pct}% complete</span>
					</div>
				</div>
			{/if}

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
				<section class="bg-white rounded-lg shadow p-5" aria-labelledby="individual-heading">
					<h3 id="individual-heading" class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Individual Stages</h3>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
						{#each individualStages as stage}
							<button
								class="text-left px-3 py-2.5 rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 {launchStage === stage.id ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}"
								onclick={() => (launchStage = stage.id)}
								aria-pressed={launchStage === stage.id}
								title={stage.detail}
							>
								<div class="text-sm font-medium text-gray-900">{stage.label}</div>
								<div class="text-xs text-gray-500 mt-0.5 leading-relaxed">{stage.desc}</div>
							</button>
						{/each}
					</div>
				</section>

				<section class="bg-white rounded-lg shadow p-5" aria-labelledby="composite-heading">
					<h3 id="composite-heading" class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Full Pipelines</h3>
					<div class="space-y-2">
						{#each compositeStages as stage}
							<button
								class="w-full text-left px-4 py-3 rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 {launchStage === stage.id ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}"
								onclick={() => (launchStage = stage.id)}
								aria-pressed={launchStage === stage.id}
								title={stage.detail}
							>
								<div class="flex items-center gap-2">
									<span class="text-sm font-semibold text-gray-900">{stage.label}</span>
									<span class="inline-flex items-center gap-0.5 text-[11px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">
										<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
										Pipeline
									</span>
								</div>
								<div class="text-xs text-gray-500 mt-1 leading-relaxed">{stage.desc}</div>
								<div class="mt-2 flex items-center gap-1 text-xs text-gray-400">
									<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
									<span>{stage.flow}</span>
								</div>
							</button>
						{/each}
					</div>
				</section>
			</div>

			<div class="bg-white rounded-lg shadow p-5">
				<h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Configuration</h3>

				<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
					<div>
						<label for="limit" class="block text-xs font-medium text-gray-700 mb-1">Limit (optional)</label>
						<input id="limit" type="number" bind:value={launchLimit} placeholder="No limit" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900" />
						<p class="mt-1 text-[11px] text-gray-400 leading-relaxed">
							{#if launchStage === 'full'}
								Cap for both profile extraction and enrichment.
							{:else if launchStage === 'from-csvs'}
								Cap for enrichment. Useful for partial runs.
							{:else if launchStage === 'profile' || launchStage === 'db-profile'}
								Max author profiles to visit and scrape.
							{:else if launchStage === 'enrich'}
								Max publications to enrich via OpenAlex.
							{/if}
						</p>
					</div>

					<div>
						<label for="csvdir" class="block text-xs font-medium text-gray-700 mb-1">CSV Directory</label>
						<input id="csvdir" type="text" bind:value={launchCsvDir} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900" />
						<p class="mt-1 text-[11px] text-gray-400 leading-relaxed">
							{#if launchStage === 'full'}
								Write/read directory during the run.
							{:else if launchStage === 'from-csvs'}
								Must contain CSVs from prior extract → normalize → profile.
							{:else}
								CSV source directory for migrate stages.
							{/if}
						</p>
					</div>

					<div>
						<label for="workers" class="block text-xs font-medium text-gray-700 mb-1">Enrich Workers</label>
						<input id="workers" type="number" bind:value={launchEnrichWorkers} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900" />
						<p class="mt-1 text-[11px] text-gray-400 leading-relaxed">Parallel OpenAlex API workers. Default: 4.</p>
					</div>
				</div>

				{#if launchStage === 'evaluate'}
					<div class="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center gap-4">
						<div class="flex items-center gap-2">
							<input type="checkbox" id="buildOnly" bind:checked={launchBuildOnly} class="rounded focus:ring-1 focus:ring-indigo-500" />
							<label for="buildOnly" class="text-sm text-gray-700">Build gold standard only</label>
						</div>
						<div class="flex-1">
							<label for="goldpath" class="block text-xs font-medium text-gray-700 mb-1">Gold Standard Path</label>
							<input id="goldpath" type="text" bind:value={launchGoldPath} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900" />
						</div>
					</div>
				{/if}

				{#if launchStage === 'disambiguate' || launchStage === 'from-csvs' || launchStage === 'full'}
					<div class="mt-4 pt-4 border-t border-gray-100 space-y-3">
						<div class="flex items-center gap-2">
							<input type="checkbox" id="useLlm" bind:checked={launchUseLlm} class="rounded focus:ring-1 focus:ring-indigo-500" />
							<label for="useLlm" class="text-sm font-medium text-gray-700">Use LLM fallback</label>
						</div>

						{#if launchUseLlm}
							<div class="ml-6 space-y-3">
								<div>
									<label for="llmProvider" class="block text-xs font-medium text-gray-700 mb-1">LLM Provider</label>
									<select id="llmProvider" bind:value={launchLlmProvider} class="w-56 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900 bg-white">
										<option value="claude">Claude Sonnet 4 (Anthropic)</option>
										<option value="ollama">Granite 4.1 8B (local, Ollama)</option>
									</select>
								</div>
								{#if launchLlmProvider === 'claude'}
									<div>
										<label for="llmBudget" class="block text-xs font-medium text-gray-700 mb-1">Max budget (USD, optional)</label>
										<input id="llmBudget" type="number" step="0.01" min="0" bind:value={launchLlmBudget} placeholder="No limit" class="w-48 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900" />
										<p class="mt-0.5 text-[10px] text-gray-400">If the estimated cost exceeds this, Claude is skipped entirely — no API calls are made. Leave empty for no limit.</p>
									</div>
								{/if}
								{#if launchStage === 'disambiguate'}
									<div class="flex items-center gap-2">
										<input type="checkbox" id="force" bind:checked={launchForce} class="rounded focus:ring-1 focus:ring-indigo-500" />
										<label for="force" class="text-sm font-medium text-red-700">Force reset previous resolutions</label>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}

				<button onclick={handleLaunch} disabled={launchLoading} class="mt-5 w-full py-2.5 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors" aria-busy={launchLoading}>
					{launchLoading ? 'Launching...' : 'Launch Pipeline'}
				</button>
			</div>
		</div>
	{/if}
</div>
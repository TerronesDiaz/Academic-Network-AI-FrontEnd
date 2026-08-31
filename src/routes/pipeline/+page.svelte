<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { listPipelineRuns, listEnrichmentRuns, launchPipelineRun, getLLMSummary, getLLMModels } from '$lib/api/client';
	import type { PipelineRun, EnrichmentRunStats, EnrichmentDeferral, LLMSummary, LLMCatalogResponse } from '$lib/api/types';
	import { ApiClientError, userError } from '$lib/i18n/errors';
	import * as m from '$lib/paraglide/messages.js';

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
	let launchLlmModel = $state('');
	let launchLlmWorkers = $state('');
	let llmCatalog = $state<LLMCatalogResponse | null>(null);
	let llmCatalogLoading = $state(false);
	let launchStatus = $state('');
	let launchError = $state('');
	let launchLoading = $state(false);

	const individualStages = [
		{ id: 'extract', label: m.pipeline_stage_extract_label(), desc: m.pipeline_stage_extract_desc(), detail: m.pipeline_stage_extract_detail() },
		{ id: 'normalize', label: m.pipeline_stage_normalize_label(), desc: m.pipeline_stage_normalize_desc(), detail: m.pipeline_stage_normalize_detail() },
		{ id: 'profile', label: m.pipeline_stage_profile_label(), desc: m.pipeline_stage_profile_desc(), detail: m.pipeline_stage_profile_detail() },
		{ id: 'db-profile', label: m.pipeline_stage_db_profile_label(), desc: m.pipeline_stage_db_profile_desc(), detail: m.pipeline_stage_db_profile_detail() },
		{ id: 'migrate', label: m.pipeline_stage_migrate_label(), desc: m.pipeline_stage_migrate_desc(), detail: m.pipeline_stage_migrate_detail() },
		{ id: 'enrich', label: m.pipeline_stage_enrich_label(), desc: m.pipeline_stage_enrich_desc(), detail: m.pipeline_stage_enrich_detail() },
		{ id: 'disambiguate', label: m.pipeline_stage_disambiguate_label(), desc: m.pipeline_stage_disambiguate_desc(), detail: m.pipeline_stage_disambiguate_detail() },
		{ id: 'enrich-validation-evidence', label: m.pipeline_stage_review_enrich_label(), desc: m.pipeline_stage_review_enrich_desc(), detail: m.pipeline_stage_review_enrich_detail() },
		{ id: 'validation-evidence', label: m.pipeline_stage_review_build_label(), desc: m.pipeline_stage_review_build_desc(), detail: m.pipeline_stage_review_build_detail() },
		{ id: 'indicators', label: m.pipeline_stage_indicators_label(), desc: m.pipeline_stage_indicators_desc(), detail: m.pipeline_stage_indicators_detail() },
		{ id: 'evaluate', label: m.pipeline_stage_evaluate_label(), desc: m.pipeline_stage_evaluate_desc(), detail: m.pipeline_stage_evaluate_detail() }
	];

	const compositeStages = [
		{
			id: 'from-csvs',
			label: m.pipeline_stage_csv_label(),
			desc: m.pipeline_stage_csv_desc(),
			detail: m.pipeline_stage_csv_detail(),
			flow: 'migrate → enrich → disambiguate → indicators',
		},
		{
			id: 'full',
			label: m.pipeline_stage_full_label(),
			desc: m.pipeline_stage_full_desc(),
			detail: m.pipeline_stage_full_detail(),
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
			error = userError(e, m.pipeline_load_failed());
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (browser && $auth) fetchData();
	});

	async function loadLLMCatalog() {
		if (llmCatalogLoading) return;
		llmCatalogLoading = true;
		try {
			llmCatalog = await getLLMModels();
		} catch {
			llmCatalog = { claude: [], ollama: [], runpod: [], zai: [] };
		} finally {
			llmCatalogLoading = false;
		}
	}

	function onLlmProviderChange(provider: string) {
		launchLlmProvider = provider;
		launchLlmModel = '';
	}

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
				llm_model: launchUseLlm && launchLlmModel ? launchLlmModel : null,
				llm_workers: launchUseLlm && launchLlmWorkers ? parseInt(launchLlmWorkers) : null,
				force: launchForce,
				max_llm_budget_usd: launchLlmBudget ? parseFloat(launchLlmBudget) : null
			});
			launchStatus = m.pipeline_queued_success({ runId: result.run_id, stage: result.stage });
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
			launchError = userError(e, m.pipeline_launch_failed());
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
						launchStatus = m.pipeline_completed_success({ matched: stats.matched, deferred: stats.transient_deferred });
					} else if (stats.status === 'error') {
						if (stats.error_detail?.code === 'openalex_budget_exhausted') {
							budgetError = stats.error_detail;
						} else {
							launchError = m.pipeline_enrichment_failed();
						}
					}
					launchedRunId = '';
				}
			} catch (e) {
				pollErrors++;
				if (e instanceof ApiClientError && e.status === 401) {
					stopPolling();
					goto('/login');
					return;
				}
				if (pollErrors >= MAX_POLL_ERRORS) {
					stopPolling();
					launchError = m.pipeline_connection_lost();
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

<div class="app-page">
	<header class="page-header"><h1 class="page-heading">Pipeline</h1></header>

	<div class="tabs overflow-x-auto" role="tablist" aria-label={m.pipeline_views()}>
		<button
			role="tab"
			aria-selected={activeTab === 'runs'}
			class="tab whitespace-nowrap {activeTab === 'runs' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'runs')}>{m.pipeline_runs()}</button>
		<button
			role="tab"
			aria-selected={activeTab === 'enrichment'}
			class="tab whitespace-nowrap {activeTab === 'enrichment' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'enrichment')}>{m.pipeline_enrichment_runs()}</button>
		<button
			role="tab"
			aria-selected={activeTab === 'launch'}
			class="tab whitespace-nowrap {activeTab === 'launch' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'launch')}>{m.pipeline_launch()}</button>
	</div>

	{#if error}
		<div role="alert" class="notice-error">{error}</div>
	{/if}

	{#if loading && activeTab !== 'launch'}
		<div class="surface p-8 animate-pulse">
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
			<section>
				<h2 class="mb-3 text-sm font-semibold text-gray-700">{m.pipeline_llm_summary()}</h2>
				<div class="metric-strip">
					<div class="metric-cell">
						<div class="metric-value text-lg">{llmSummary.total_calls.toLocaleString()}</div>
						<div class="metric-label">{m.pipeline_total_calls()}</div>
					</div>
					<div class="metric-cell">
						<div class="metric-value text-lg">{(llmSummary.total_input_tokens + llmSummary.total_output_tokens).toLocaleString()}</div>
						<div class="metric-label">{m.pipeline_total_tokens()}</div>
					</div>
					<div class="metric-cell">
						<div class="metric-value text-lg">${llmSummary.total_cost_usd.toFixed(4)}</div>
						<div class="metric-label">{m.pipeline_total_cost()}</div>
					</div>
					<div class="metric-cell">
						<div class="metric-value text-lg">{llmSummary.total_signatures_evaluated.toLocaleString()}</div>
						<div class="metric-label">{m.pipeline_signatures()}</div>
					</div>
				</div>
				{#if llmSummary.by_model.length > 0}
					<div class="mt-3 text-xs text-gray-500">
						{m.pipeline_by_model()}
						{#each llmSummary.by_model as model}
							<span class="inline-block bg-gray-100 px-2 py-0.5 rounded ml-1">{model.model_id}: {model.calls} {m.pipeline_calls()}, ${model.cost_usd.toFixed(4)}</span>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
		<div class="data-shell" role="tabpanel" aria-label="Pipeline runs">
			{#if runs.length === 0}
				<p class="p-12 text-center text-gray-500">{m.pipeline_no_runs()}</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="data-table" aria-label={m.pipeline_history()}>
						<thead class="bg-gray-50">
							<tr>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">ID</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_stage()}</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_source()}</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_started()}</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_finished()}</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_duration()}</th>
				<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_status()}</th>
				<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">LLM</th>
				<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_notes()}</th>
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
		<div class="data-shell" role="tabpanel" aria-label="Enrichment runs">
			<h2 class="text-lg font-semibold text-gray-900 p-4 pb-2">{m.pipeline_enrichment_stats()}</h2>
			{#if enrichmentRuns.length === 0}
				<p class="px-4 pb-6 text-gray-500">{m.pipeline_no_enrichment()}</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="data-table" aria-label={m.pipeline_enrichment_table()}>
						<thead class="bg-gray-50">
							<tr>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_run_id()}</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_source()}</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_started()}</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_duration()}</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_queued()}</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_matched()}</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_deferred()}</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_progress()}</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_status()}</th>
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_actions()}</th>
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
										<button class="text-xs text-indigo-600 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded" onclick={() => loadDeferrals(run.run_id)} aria-label={m.pipeline_view_deferrals({ runId: run.run_id.slice(0, 8) })}>{m.pipeline_deferrals()}</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		{#if showDeferrals}
			<section class="surface" aria-labelledby="deferrals-heading">
				<h3 id="deferrals-heading" class="text-lg font-semibold text-gray-900 p-4 pb-2">{m.pipeline_deferrals_for({ runId: selectedEnrichmentRunId.slice(0, 8) })}</h3>
				{#if deferrals.length === 0}
					<p class="p-4 text-gray-500">{m.pipeline_no_deferrals()}</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="data-table" aria-label={m.pipeline_deferrals_table()}>
							<thead class="bg-gray-50">
								<tr>
									<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_publication_id()}</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_phase()}</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_attempts()}</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_http_status()}</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.pipeline_error()}</th>
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
			<h2 class="text-lg font-semibold text-gray-900 mb-4">{m.pipeline_launch_stage()}</h2>

			{#if launchStatus}
				<div role="status" class="mb-4 p-3 bg-green-50 text-green-700 rounded text-sm">{launchStatus}</div>
			{/if}
			{#if launchError}
				<div role="alert" class="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{launchError}</div>
			{/if}

			{#if budgetError}
				<div role="alert" class="notice-warning">
					<div class="flex items-start gap-3">
						<svg class="w-5 h-5 text-amber-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
						<div>
							<p class="text-sm font-medium text-amber-800">{m.pipeline_budget_exhausted()}</p>
							{#if budgetError.resets_in_seconds != null}
								<p class="text-xs text-amber-600 mt-1">
									{m.pipeline_budget_resets({ time: fmtBudgetCountdown(budgetError.resets_in_seconds) })}
									{#if budgetError.resets_at}
										({new Date(budgetError.resets_at).toLocaleTimeString()})
									{/if}
								</p>
							{/if}
						</div>
						<button onclick={() => (budgetError = null)} class="ml-auto text-amber-500 hover:text-amber-700" aria-label={m.pipeline_dismiss()}>&times;</button>
					</div>
				</div>
			{/if}

			{#if enrichProgress}
				{@const pct = fmtProgress(enrichProgress.progress_fraction)}
				<div class="mb-4 bg-white border border-indigo-200 rounded-lg p-4" aria-live="polite">
					<div class="flex items-center justify-between mb-2">
						<span class="text-sm font-medium text-indigo-800">
							{enrichProgress.status === 'running' ? m.pipeline_enrichment_running() : enrichProgress.status === 'success' ? m.pipeline_enrichment_complete() : m.pipeline_enrichment_finished()}
						</span>
						<span class="text-xs text-indigo-600">{m.pipeline_publications_progress({ processed: enrichProgress.publications_processed, total: enrichProgress.publications_queued })}</span>
					</div>
					<div class="w-full bg-gray-200 rounded-full h-3 mb-2 overflow-hidden">
						<div class="bg-indigo-600 h-3 rounded-full transition-all duration-500 ease-out" style="width: {pct}%"></div>
					</div>
					<div class="flex gap-4 text-xs text-gray-500">
						<span>{m.pipeline_matched()}: <strong class="text-green-600">{enrichProgress.matched}</strong></span>
						<span>{m.pipeline_deferred()}: <strong class="text-amber-600">{enrichProgress.transient_deferred}</strong></span>
						<span>{m.pipeline_unmatched()}: <strong>{enrichProgress.unmatched_saved}</strong></span>
						<span>{m.pipeline_percent_complete({ percent: pct })}</span>
					</div>
				</div>
			{/if}

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
				<section class="surface p-5" aria-labelledby="individual-heading">
					<h3 id="individual-heading" class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{m.pipeline_individual()}</h3>
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

				<section class="surface p-5" aria-labelledby="composite-heading">
					<h3 id="composite-heading" class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{m.pipeline_full()}</h3>
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

			<div class="surface p-5">
				<h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">{m.pipeline_configuration()}</h3>

				<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
					<div>
						<label for="limit" class="block text-xs font-medium text-gray-700 mb-1">{m.pipeline_optional_limit()}</label>
						<input id="limit" type="number" bind:value={launchLimit} placeholder={m.pipeline_no_limit()} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900" />
						<p class="mt-1 text-[11px] text-gray-400 leading-relaxed">
							{#if launchStage === 'full'}
								{m.pipeline_limit_full_help()}
							{:else if launchStage === 'from-csvs'}
								{m.pipeline_limit_csv_help()}
							{:else if launchStage === 'profile' || launchStage === 'db-profile'}
								{m.pipeline_limit_profile_help()}
							{:else if launchStage === 'enrich'}
								{m.pipeline_limit_enrich_help()}
							{/if}
						</p>
					</div>

					<div>
						<label for="csvdir" class="block text-xs font-medium text-gray-700 mb-1">{m.pipeline_csv_directory()}</label>
						<input id="csvdir" type="text" bind:value={launchCsvDir} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900" />
						<p class="mt-1 text-[11px] text-gray-400 leading-relaxed">
							{#if launchStage === 'full'}
								{m.pipeline_csv_full_help()}
							{:else if launchStage === 'from-csvs'}
								{m.pipeline_csv_existing_help()}
							{:else}
								{m.pipeline_csv_migrate_help()}
							{/if}
						</p>
					</div>

					<div>
						<label for="workers" class="block text-xs font-medium text-gray-700 mb-1">{m.pipeline_enrich_workers()}</label>
						<input id="workers" type="number" bind:value={launchEnrichWorkers} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900" />
						<p class="mt-1 text-[11px] text-gray-400 leading-relaxed">{m.pipeline_openalex_workers_help()}</p>
					</div>
				</div>

				{#if launchStage === 'evaluate'}
					<div class="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center gap-4">
						<div class="flex items-center gap-2">
							<input type="checkbox" id="buildOnly" bind:checked={launchBuildOnly} class="rounded focus:ring-1 focus:ring-indigo-500" />
							<label for="buildOnly" class="text-sm text-gray-700">{m.pipeline_build_gold()}</label>
						</div>
						<div class="flex-1">
							<label for="goldpath" class="block text-xs font-medium text-gray-700 mb-1">{m.pipeline_gold_path()}</label>
							<input id="goldpath" type="text" bind:value={launchGoldPath} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900" />
						</div>
					</div>
				{/if}

				{#if launchStage === 'disambiguate' || launchStage === 'validation-evidence' || launchStage === 'from-csvs' || launchStage === 'full'}
					<div class="mt-4 pt-4 border-t border-gray-100 space-y-3">
						<div class="flex items-center gap-2">
							<input type="checkbox" id="useLlm" bind:checked={launchUseLlm} class="rounded focus:ring-1 focus:ring-indigo-500" onchange={() => { if (launchUseLlm && !llmCatalog) loadLLMCatalog(); }} />
								<label for="useLlm" class="text-sm font-medium text-gray-700">{launchStage === 'validation-evidence' ? m.pipeline_generate_evidence() : m.pipeline_use_llm()}</label>
							{#if launchUseLlm && !llmCatalog && !llmCatalogLoading}
								<button onclick={loadLLMCatalog} class="text-xs text-indigo-600 hover:underline focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded" type="button">{m.pipeline_load_models()}</button>
							{/if}
							{#if llmCatalogLoading}
								<span class="text-xs text-gray-400">{m.pipeline_loading_models()}</span>
							{/if}
						</div>

							{#if launchUseLlm}
								<div class="ml-6 space-y-3">
									{#if launchStage === 'validation-evidence'}
										<p class="rounded-md bg-indigo-50 p-3 text-xs text-indigo-800">{m.pipeline_evidence_help()}</p>
									{:else}
									<div>
									<label for="llmProvider" class="block text-xs font-medium text-gray-700 mb-1">{m.pipeline_provider()}</label>
									<select id="llmProvider" bind:value={launchLlmProvider} onchange={(e) => onLlmProviderChange((e.target as HTMLSelectElement).value)} class="w-56 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900 bg-white">
										<option value="claude">Claude (Anthropic)</option>
										<option value="ollama">Ollama (local)</option>
										<option value="runpod">RunPod (remote Ollama)</option>
										<option value="zai">{m.pipeline_provider_zai()}</option>
									</select>
								</div>

								{#if llmCatalog && (llmCatalog[launchLlmProvider as keyof LLMCatalogResponse]?.length || 0) > 0}
									<div>
										<label for="llmModel" class="block text-xs font-medium text-gray-700 mb-1">{m.pipeline_model()}</label>
										<select id="llmModel" bind:value={launchLlmModel} class="w-64 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900 bg-white">
											<option value="">{m.pipeline_default_model()}</option>
											{#each llmCatalog[launchLlmProvider as keyof LLMCatalogResponse] as model}
												<option value={model}>{model}</option>
											{/each}
										</select>
										<p class="mt-0.5 text-[10px] text-gray-400">{m.pipeline_model_help()}</p>
									</div>
								{/if}

								<div>
									<label for="llmWorkers" class="block text-xs font-medium text-gray-700 mb-1">{m.pipeline_llm_workers()}</label>
									<input id="llmWorkers" type="number" min="1" max="64" bind:value={launchLlmWorkers} placeholder={m.pipeline_provider_default()} class="w-32 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900" />
									<p class="mt-0.5 text-[10px] text-gray-400">{m.pipeline_workers_help()}</p>
								</div>

								{#if launchLlmProvider === 'claude'}
									<div>
										<label for="llmBudget" class="block text-xs font-medium text-gray-700 mb-1">{m.pipeline_budget()}</label>
										<input id="llmBudget" type="number" step="0.01" min="0" bind:value={launchLlmBudget} placeholder={m.pipeline_no_limit()} class="w-48 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900" />
										<p class="mt-0.5 text-[10px] text-gray-400">{m.pipeline_budget_help()}</p>
									</div>
								{/if}
									{#if launchStage === 'disambiguate'}
									<div class="flex items-center gap-2">
										<input type="checkbox" id="force" bind:checked={launchForce} class="rounded focus:ring-1 focus:ring-indigo-500" />
										<label for="force" class="text-sm font-medium text-red-700">{m.pipeline_force_reset()}</label>
									</div>
									{/if}
									{/if}
								</div>
						{/if}
					</div>
				{/if}

				<button onclick={handleLaunch} disabled={launchLoading} class="mt-5 w-full py-2.5 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors" aria-busy={launchLoading}>
					{launchLoading ? m.pipeline_launching() : m.pipeline_launch_button()}
				</button>
			</div>
		</div>
	{/if}
</div>

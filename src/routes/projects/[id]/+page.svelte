<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import {
		completeProductReview,
		createScholarPairing,
		getProductProject,
		getProductQuality,
		productApiBase,
		publishProductSnapshot,
		searchInstitutions,
		setActiveProject,
		setInstitutionIdentity,
		setScholarOrganization,
		startInstitutionBootstrap,
		startProductWorkflow
	} from '$lib/api/client';
	import type { InstitutionBootstrap, InstitutionCandidate, ProductProjectDetail, ProductQuality } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages.js';
	import { formatNumber, formatPercent, formatTime } from '$lib/i18n/format';
	import { translateMessageRef, userError } from '$lib/i18n/errors';

	let project = $state<ProductProjectDetail | null>(null);
	let quality = $state<ProductQuality | null>(null);
	let pairing = $state<Awaited<ReturnType<typeof createScholarPairing>> | null>(null);
	let loading = $state(true);
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');
	let useLlm = $state(false);
	let publicSlug = $state('');
	let visibility = $state<'private' | 'unlisted' | 'public'>('private');
	let scholarValue = $state('');
	let connectorReady = $state(false);
	let connectorVersion = $state('');
	let connectorProgress = $state('');
	let connectorLaunchActive = $state(false);
	let connectorPaused = $state(false);
	let connectorPauseRequested = $state(false);
	let connectorResumable = $state(false);
	let identityCandidates = $state<InstitutionCandidate[]>([]);
	let identifying = $state(false);

	let projectId = $derived($page.params.id ?? '');
	let workflow = $derived(project?.latest_workflow ?? null);
	let sourceStatus = $derived(project?.source_status ?? null);
	let scholarImport = $derived(sourceStatus?.primary ?? null);
	let openAlexImport = $derived(sourceStatus?.supplemental ?? null);
	let scholarTransferActive = $derived(connectorLaunchActive || Boolean(
		scholarImport && scholarImport.received_items > 0
		&& ['receiving', 'validating'].includes(scholarImport.status)
	));
	let connectorSupportsPause = $derived.by(() => {
		const [major = 0, minor = 0] = connectorVersion.split('.').map(Number);
		return major > 1 || (major === 1 && minor >= 3);
	});
	let scholarProgressText = $derived.by(() => {
		if (connectorPaused) return connectorProgress || m.project_paused_progress();
		if (connectorProgress) return connectorProgress;
		if (scholarImport?.message_ref) return translateMessageRef(scholarImport.message_ref, scholarImport.progress_message ?? undefined);
		if (scholarImport?.progress_message) return scholarImport.progress_message;
		if (scholarTransferActive) {
			if (scholarImport && scholarImport.phase_total > 0) {
				return m.project_processing_profiles({ processed: formatNumber(scholarImport.phase_processed), total: formatNumber(scholarImport.phase_total), received: formatNumber(scholarImport.received_items) });
			}
			return m.project_connector_active_received({ received: formatNumber(scholarImport?.received_items ?? 0) });
		}
		return m.project_waiting_connector();
	});
	let scholarOrgId = $derived.by(() => {
		const match = scholarValue.match(/(?:[?&]org=|^)(\d{5,30})(?:&|$)/);
		return match?.[1] ?? '';
	});
	let scholarSearchUrl = $derived(
		`https://scholar.google.com/citations?view_op=search_authors&mauthors=${encodeURIComponent(project?.institution.name ?? '')}`
	);
	const steps = [
		['institution_confirmed', m.project_step_institution()], ['canonicalize', m.project_step_canonicalize()],
		['enrich_sources', m.project_step_sources()], ['refresh_catalog', m.project_step_catalog()],
		['disambiguate', m.project_step_disambiguate()],
		['repair_integrity', m.project_step_integrity()], ['build_review_evidence', m.project_step_evidence()],
		['expert_review', m.nav_validation()], ['quality_check', m.project_step_quality()],
		['indicators', m.nav_indicators()], ['altmetrics', m.project_step_altmetrics()], ['snapshot', m.project_step_snapshot()]
	];
	const workflowStepKeys = steps.slice(1).map((item) => item[0]);
	const statusLabels: Record<string, string> = {
		pending: m.status_pending(), queued: m.status_queued(), running: m.status_running(),
		complete: m.status_complete(), failed: m.status_failed(), skipped: m.project_altmetrics_skipped()
	};
	const projectStatusLabels: Record<string, string> = {
		draft: m.project_status_draft(), connecting_scholar: m.project_status_connecting_scholar(),
		institution_confirmed: m.project_status_institution_confirmed(), processing: m.project_status_processing(),
		expert_review: m.project_status_expert_review(), ready_to_publish: m.project_status_ready_to_publish(),
		published: m.project_status_published(), failed: m.project_status_failed()
	};
	let workflowPercent = $derived.by(() => {
		if (!workflow) return 0;
		const completed = workflowStepKeys.filter((key) => ['complete', 'skipped'].includes(stepStatus(key))).length;
		return completed / workflowStepKeys.length;
	});

	onMount(() => {
		setActiveProject(projectId);
		void refresh();
		const listener = (event: MessageEvent) => {
			if (event.source !== window || !event.data) return;
			if (event.data.type === 'ACADEMICNETWORK_CONNECTOR_READY') {
				connectorReady = true;
				connectorVersion = String(event.data.version || '');
				const state = event.data.importState;
				if (state) {
					connectorLaunchActive = Boolean(state.active);
					connectorPauseRequested = Boolean(state.pauseRequested);
					connectorResumable = Boolean(state.resumable);
					connectorPaused = Boolean(state.paused || (state.resumable && !state.active));
				}
			}
			if (event.data.type === 'ACADEMICNETWORK_SCHOLAR_PROGRESS') {
				connectorLaunchActive = true;
				connectorPaused = false;
				connectorProgress = m.project_processing();
			}
			if (event.data.type === 'ACADEMICNETWORK_SCHOLAR_PAUSE_REQUESTED') {
				connectorPauseRequested = true;
				connectorProgress = m.project_finishing_before_pause();
			}
			if (event.data.type === 'ACADEMICNETWORK_SCHOLAR_PAUSED') {
				connectorLaunchActive = false;
				connectorPauseRequested = false;
				connectorPaused = true;
				connectorResumable = true;
				connectorProgress = m.project_scholar_paused_counts({ profiles: event.data.profiles ?? 0, works: event.data.works ?? 0 });
			}
			if (event.data.type === 'ACADEMICNETWORK_SCHOLAR_COMPLETE') {
				connectorLaunchActive = false;
				connectorPaused = false;
				connectorPauseRequested = false;
				connectorResumable = false;
				connectorProgress = m.project_scholar_complete_counts({ profiles: event.data.profiles ?? 0, works: event.data.works ?? 0 });
				notice = connectorProgress;
				void refresh();
			}
			if (event.data.type === 'ACADEMICNETWORK_SCHOLAR_ERROR') {
				connectorLaunchActive = false;
				error = m.project_scholar_failed();
			}
		};
		window.addEventListener('message', listener);
		window.postMessage({ type: 'ACADEMICNETWORK_DETECT_CONNECTOR' }, window.location.origin);
		const timer = window.setInterval(() => {
			if (['importing_sources', 'connecting_scholar', 'processing', 'quality_check'].includes(project?.status ?? '') || workflow?.status === 'running') void refresh(true);
		}, 2500);
		return () => {
			window.removeEventListener('message', listener);
			window.clearInterval(timer);
		};
	});

	async function refresh(silent = false) {
		try {
			project = await getProductProject(projectId);
			if (['ready_to_publish', 'published'].includes(project.status)) quality = await getProductQuality(projectId);
		} catch (value) {
			if (!silent) error = message(value);
		} finally {
			loading = false;
		}
	}

	async function bootstrap() {
		busy = true; error = ''; notice = '';
		try {
			await startInstitutionBootstrap(projectId);
			notice = m.project_openalex_resumed();
			await refresh();
		} catch (value) { error = message(value); }
		finally { busy = false; }
	}

	async function identifyInstitution() {
		if (!project) return;
		identifying = true; error = '';
		try {
			const result = await searchInstitutions(project.institution.name, project.institution.country_code || undefined);
			identityCandidates = result.items.filter((candidate) => Boolean(candidate.openalex_id));
			if (!identityCandidates.length) error = m.project_identity_not_found();
		} catch (value) { error = message(value); }
		finally { identifying = false; }
	}

	async function useInstitution(candidate: InstitutionCandidate) {
		if (!candidate.openalex_id) return;
		busy = true; error = ''; notice = '';
		try {
			await setInstitutionIdentity(projectId, {
				display_name: candidate.display_name,
				openalex_id: candidate.openalex_id,
				ror_id: candidate.ror_id || undefined,
				country_code: candidate.country_code || undefined,
				verified_domain: candidate.domains[0] || undefined
			});
			identityCandidates = [];
			notice = m.project_identity_confirmed();
			await refresh();
		} catch (value) { error = message(value); }
		finally { busy = false; }
	}

	async function pair() {
		busy = true; error = ''; notice = '';
		try {
			if (!project?.institution.scholar_org_id) {
				if (!scholarOrgId) {
					error = m.project_scholar_required();
					return;
				}
				await setScholarOrganization(projectId, scholarOrgId);
				await refresh();
			}
			pairing = await createScholarPairing(projectId);
			if (connectorReady) {
				connectorLaunchActive = true;
				connectorPaused = false;
				connectorResumable = true;
				connectorProgress = m.project_opening_scholar();
				window.postMessage({
					type: 'ACADEMICNETWORK_START_SCHOLAR_IMPORT',
					apiBase: productApiBase(),
					token: pairing.pairing_token,
					scholarUrl: pairing.scholar_org_url,
					expiresAt: pairing.expires_at
				}, window.location.origin);
				notice = m.project_extension_received();
			} else {
				await navigator.clipboard?.writeText(pairing.pairing_token);
				notice = m.project_extension_code_copied();
			}
			await refresh();
		} catch (value) { error = message(value); }
		finally { busy = false; }
	}

	function pauseScholar() {
		connectorPauseRequested = true;
		connectorProgress = m.project_finishing_before_pause();
		window.postMessage({ type: 'ACADEMICNETWORK_PAUSE_SCHOLAR_IMPORT' }, window.location.origin);
	}

	function resumeScholar() {
		error = '';
		connectorPaused = false;
		connectorPauseRequested = false;
		connectorLaunchActive = true;
		connectorProgress = m.project_preparing_resume();
		window.postMessage({ type: 'ACADEMICNETWORK_RESUME_SCHOLAR_IMPORT' }, window.location.origin);
	}

	async function start(mode: 'retry' | 'restart' = 'restart') {
		busy = true; error = '';
		try {
			await startProductWorkflow(projectId, { use_llm: useLlm, mode });
			notice = mode === 'retry' ? m.project_retrying_stage() : m.project_restarted();
			await refresh();
		}
		catch (value) { error = message(value); }
		finally { busy = false; }
	}

	async function refreshCatalogAndReanalyze() {
		busy = true; error = '';
		try {
			await startProductWorkflow(projectId, {
				use_llm: false,
				mode: 'restart',
				start_from: 'refresh_catalog'
			});
			notice = m.project_catalog_refresh_started();
			await refresh();
		}
		catch (value) { error = message(value); }
		finally { busy = false; }
	}

	async function finishReview() {
		busy = true; error = '';
		try { await completeProductReview(projectId); notice = m.project_review_closed(); await refresh(); }
		catch (value) { error = message(value); }
		finally { busy = false; }
	}

	async function publish() {
		busy = true; error = '';
		try {
			const result = await publishProductSnapshot(projectId, { visibility, public_slug: visibility === 'private' ? null : publicSlug });
			notice = result.public_slug ? m.project_published_at({ path: `/public/v1/snapshots/${result.public_slug}` }) : m.project_private_updated();
			await refresh();
		} catch (value) { error = message(value); }
		finally { busy = false; }
	}

	function stepStatus(key: string) {
		if (key === 'institution_confirmed') return project?.institution.verification_status === 'verified' ? 'complete' : project?.status === 'importing_sources' ? 'running' : 'pending';
		if (key === 'expert_review') return workflow?.status === 'awaiting_review' ? 'running' : workflow?.status === 'complete' ? 'complete' : 'pending';
		const step = workflow?.steps.find((step) => step.key === key);
		if (key === 'altmetrics' && step?.status === 'complete' && step.output?.status === 'SKIPPED') return 'skipped';
		return step?.status ?? 'pending';
	}
	function currentStepProgress() {
		const step = workflow?.steps.find((item) => item.key === workflow?.current_step);
		const progress = step?.output?.progress;
		return progress && typeof progress === 'object'
			? progress as Record<string, unknown>
			: null;
	}
	function elapsedLabel(value: unknown) {
		const seconds = typeof value === 'number' ? value : 0;
		const minutes = Math.floor(seconds / 60);
		const remainder = seconds % 60;
		return minutes ? `${formatNumber(minutes)} min ${formatNumber(remainder)} s` : `${formatNumber(remainder)} s`;
	}
	function timeLabel(value: unknown) {
		if (typeof value !== 'string' || !value) return m.project_starting_label();
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? m.project_starting_label() : formatTime(date);
	}
	function message(value: unknown) { return userError(value); }
</script>

<div class="app-page">
{#if loading}<p class="empty-state">{m.common_loading()}</p>{:else if project}
	<header class="page-header">
		<div><p class="page-kicker">{project.institution.name}</p><h1 class="page-heading">{project.name}</h1><p class="page-description">{m.project_state({ status: projectStatusLabels[project.status] ?? project.status })}</p></div>
		<button onclick={() => refresh()} class="btn-secondary">{m.common_refresh()}</button>
	</header>
	{#if error}<div class="notice-error">{error}</div>{/if}
	{#if notice}<div class="notice-success">{notice}</div>{/if}

	<section class="surface">
		<h2 class="surface-header text-lg font-semibold">{m.project_progress_title()}</h2>
		<ol class="divide-y divide-gray-100">
			{#each steps as item, index}
				<li class="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-l-2 px-4 py-2.5 {stepStatus(item[0]) === 'running' ? 'border-indigo-600 bg-indigo-50/50' : 'border-transparent'}">
					<span class="text-xs tabular-nums text-gray-400">{index + 1}</span><p class="text-sm font-medium">{item[1]}</p><p class="text-xs {stepStatus(item[0]) === 'complete' ? 'text-emerald-700' : 'text-gray-600'}">{statusLabels[stepStatus(item[0])] ?? stepStatus(item[0])}</p>
				</li>
			{/each}
		</ol>
	</section>

	{#if project.status === 'importing_sources'}
		<section class="surface border-l-4 border-l-indigo-600 p-6">
			<h2 class="text-xl font-semibold">{m.project_dataset_title()}</h2>
			<p class="mt-2 text-gray-700">{m.project_dataset_help()}</p>
			<div class="mt-5 grid gap-4 md:grid-cols-2">
				{@render SourceCard(m.project_scholar_primary(), scholarImport)}
				{@render SourceCard(m.project_openalex_required(), openAlexImport)}
			</div>
			{#if openAlexImport?.status === 'failed'}<button onclick={bootstrap} disabled={busy} class="mt-4 rounded-lg bg-red-800 px-5 py-2.5 text-white">{m.project_retry_openalex()}</button>{/if}
		</section>
	{:else if project.status === 'draft' && project.institution.openalex_id}
		<section class="surface p-6">
			<h2 class="text-xl font-semibold">{m.project_start_scholar()}</h2>
			<p class="mt-2 text-gray-600">{m.project_start_scholar_help()}</p>
			{@render ScholarConnector()}
		</section>
	{:else if project.status === 'institution_confirmed'}
		<section class="surface p-6">
			<h2 class="text-xl font-semibold">{m.project_data_ready()}</h2>
			<p class="mt-2 text-gray-600">{m.project_data_summary({ authors: scholarImport ? formatNumber(scholarImport.imported_authors) : '—', works: scholarImport ? formatNumber(scholarImport.imported_works) : '—', profiles: formatNumber(sourceStatus?.reconciliation.openalex_profiles_matched ?? 0), added: formatNumber(sourceStatus?.reconciliation.openalex_works_added ?? 0) })}</p>
			<label class="mt-4 flex gap-2 text-sm"><input type="checkbox" bind:checked={useLlm}/> {m.project_use_llm()}</label>
			<button onclick={() => start('restart')} disabled={busy} class="mt-4 rounded-lg bg-indigo-700 px-5 py-2.5 text-white">{m.project_continue_disambiguation()}</button>
		</section>
	{/if}

	{#if workflow?.status === 'running'}
		<section class="surface border-l-4 border-l-indigo-600 p-6">
			<div class="flex flex-wrap items-center justify-between gap-2"><h2 class="text-xl font-semibold">{m.project_processing()}</h2><span class="rounded-full bg-indigo-700 px-3 py-1 text-sm text-white">{formatPercent(workflowPercent, 0)}</span></div>
			<p class="mt-3">{m.project_current_stage({ stage: String(workflow.current_step ?? m.project_preparing()) })}</p>
			<div class="mt-4 h-3 overflow-hidden rounded-full bg-white"><div class="h-full bg-indigo-600 transition-all" style={`width: ${Math.max(2, workflowPercent * 100)}%`}></div></div>
			<p class="mt-2 text-sm text-gray-600">{m.project_steps_done({ done: workflow.steps.filter((step) => step.status === 'complete').length, total: workflow.steps.length })}</p>
			{#if currentStepProgress()}
				<p class="mt-1 text-sm text-gray-600">{m.project_stage_time({ elapsed: elapsedLabel(currentStepProgress()?.elapsed_seconds), heartbeat: timeLabel(currentStepProgress()?.heartbeat_at) })}</p>
				{#if currentStepProgress()?.detail}<p class="mt-2 text-sm text-indigo-800">{String(currentStepProgress()?.detail)}</p>{/if}
				{#if typeof currentStepProgress()?.processed === 'number' && typeof currentStepProgress()?.total === 'number'}
					<p class="mt-2 text-sm font-medium text-indigo-900">{m.project_step_progress({ processed: formatNumber(Number(currentStepProgress()?.processed)), total: formatNumber(Number(currentStepProgress()?.total)), unit: m.project_items() })}</p>
				{/if}
				{#if currentStepProgress()?.updated_at}<p class="mt-1 text-xs text-gray-500">{m.project_last_progress({ time: timeLabel(currentStepProgress()?.updated_at) })}</p>{/if}
			{/if}
			<p class="mt-2 text-xs text-gray-500">{m.project_processing_help()}</p>
		</section>
	{:else if workflow?.status === 'failed'}
		<section class="surface border-l-4 border-l-red-600 p-6">
			<h2 class="text-xl font-semibold text-red-900">{m.project_processing_stopped()}</h2>
			<p class="mt-2 text-red-800">{m.project_stage({ stage: workflow.current_step ?? m.project_unknown_stage() })}</p>
			<p class="mt-2 break-words text-sm text-red-800">{workflow.error_message ?? m.project_server_failure()}</p>
			<p class="mt-3 text-sm text-red-800">{m.project_retry_help()}</p>
			<div class="mt-4 flex flex-wrap gap-3">
				<button onclick={() => start('retry')} disabled={busy} class="rounded-lg bg-red-800 px-5 py-2.5 text-white">{busy ? m.project_starting() : m.project_retry_stage()}</button>
				<button onclick={() => start('restart')} disabled={busy} class="rounded-lg border border-red-800 bg-white px-5 py-2.5 text-red-900">{m.project_restart()}</button>
			</div>
		</section>
	{/if}

	{#if ['draft', 'connecting_scholar'].includes(project.status) && !project.institution.openalex_id}
		<section class="surface border-l-4 border-l-amber-500 p-6">
			<h2 class="text-xl font-semibold">{m.project_identity_title()}</h2>
			{#if project.status === 'connecting_scholar'}
				<p class="mt-2 font-medium text-indigo-800">{connectorProgress || m.project_scholar_pending()}</p>
				{#if pairing && !connectorReady}<div class="mt-4 rounded-lg bg-gray-950 p-4 text-white break-all"><p class="text-xs text-gray-400">{m.project_code_valid_until({ time: formatTime(pairing.expires_at) })}</p><code>{pairing.pairing_token}</code></div>{/if}
			{/if}
			<p class="mt-2 text-gray-700">{m.project_identity_help()}</p>
			<button onclick={identifyInstitution} disabled={identifying} class="mt-4 rounded-lg border border-amber-700 px-4 py-2">{identifying ? m.common_searching() : m.project_find_identity()}</button>
			{#if identityCandidates.length}<div class="mt-4 space-y-2">{#each identityCandidates as candidate}<button onclick={() => useInstitution(candidate)} disabled={busy} class="block w-full rounded-lg border bg-white p-3 text-left hover:border-indigo-500"><span class="font-medium">{candidate.display_name}</span><span class="ml-2 text-sm text-gray-600">{candidate.city ?? candidate.country_code} · {m.project_candidate_works({ count: candidate.works_count == null ? '—' : formatNumber(candidate.works_count) })}</span></button>{/each}</div>{/if}
		</section>
	{:else if project.status === 'connecting_scholar'}
		<section class="surface border-l-4 border-l-indigo-600 p-6">
			<h2 class="text-xl font-semibold">{m.project_importing_scholar()}</h2>
			<p class="mt-2" aria-live="polite">{scholarProgressText}</p>
			{#if scholarTransferActive}
				<div class="mt-4 h-2 overflow-hidden rounded-full bg-white" aria-hidden="true"><div class="h-full w-2/3 animate-pulse rounded-full bg-indigo-600"></div></div>
				<p class="mt-2 text-sm font-medium {connectorPaused ? 'text-amber-800' : 'text-green-800'}">{connectorPaused ? m.project_checkpoint_paused() : connectorPauseRequested ? m.project_finishing_before_pause() : m.project_import_active()}</p>
			{/if}
			{#if !connectorReady}
				<p class="mt-2 text-sm text-indigo-900">{m.project_reload_connector()}</p>
			{/if}
			<div class="mt-4">
				{@render ScholarConnector(true)}
			</div>
			{#if pairing && !connectorReady}<div class="mt-4 rounded-lg bg-gray-950 p-4 text-white break-all"><p class="text-xs text-gray-400">{m.project_code_valid_until({ time: formatTime(pairing.expires_at) })}</p><code>{pairing.pairing_token}</code></div>{/if}
		</section>
	{/if}

	{#if workflow?.status === 'awaiting_review'}
		<section class="surface border-l-4 border-l-amber-500 p-6"><h2 class="text-xl font-semibold">{m.project_review_pending()}</h2><p class="mt-2">{m.project_review_help()}</p><div class="mt-4 flex flex-wrap gap-3"><a href="/validation?phase=current" class="btn-primary">{m.project_continue_review()}</a><button onclick={finishReview} disabled={busy} class="btn-secondary">{m.project_close_review()}</button></div><div class="mt-5 border-t border-gray-200 pt-4"><p class="max-w-3xl text-sm text-gray-600">{m.project_catalog_refresh_help()}</p><button onclick={refreshCatalogAndReanalyze} disabled={busy} class="mt-3 text-sm font-semibold text-indigo-700 hover:underline disabled:opacity-40">{m.project_catalog_refresh_action()}</button></div></section>
	{:else if ['ready_to_publish', 'published'].includes(project.status)}
		<section class="surface p-6"><h2 class="text-xl font-semibold">{m.project_quality_publish()}</h2>{#if quality}<div class="metric-strip mt-4">{@render Metric(m.project_roster_coverage(), formatPercent(quality.roster_coverage))}{@render Metric(m.project_work_coverage(), formatPercent(quality.work_coverage))}{@render Metric(m.project_pending(), formatNumber(quality.pending_risk_groups))}{@render Metric(m.project_exclusions(), formatNumber(quality.terminal_exclusions))}</div>{/if}<div class="mt-5 flex flex-wrap gap-3"><select bind:value={visibility} class="rounded-md border p-2"><option value="private">{m.project_private()}</option><option value="unlisted">{m.project_unlisted()}</option><option value="public">{m.project_public()}</option></select>{#if visibility !== 'private'}<input bind:value={publicSlug} class="rounded-md border p-2" placeholder="public-slug" />{/if}<button onclick={publish} disabled={busy || !quality?.passed} class="btn-primary">{m.project_publish_snapshot()}</button></div><div class="mt-5 border-t border-gray-200 pt-4"><p class="max-w-3xl text-sm text-gray-600">{m.project_catalog_refresh_help()}</p><button onclick={refreshCatalogAndReanalyze} disabled={busy} class="mt-3 text-sm font-semibold text-indigo-700 hover:underline disabled:opacity-40">{m.project_catalog_refresh_action()}</button></div></section>
	{/if}
{/if}
</div>

{#snippet ScholarConnector(retrying = false)}
	<div class="mt-4 space-y-3">
		{#if !project?.institution.scholar_org_id}
			<a href={scholarSearchUrl} target="_blank" rel="noreferrer" class="inline-block text-sm font-medium text-indigo-700 underline">{m.project_scholar_search()}</a>
			<input bind:value={scholarValue} class="block w-full rounded-lg border bg-white p-2.5" placeholder={m.project_scholar_placeholder()} />
		{/if}
		<div class="flex flex-wrap items-center gap-3">
			{#if scholarTransferActive && connectorSupportsPause}
				<button onclick={connectorPaused ? resumeScholar : pauseScholar} disabled={connectorPauseRequested} class="rounded-lg px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50 {connectorPaused ? 'bg-green-700' : 'bg-amber-700'}">{connectorPaused ? m.project_continue_checkpoint() : connectorPauseRequested ? m.project_pause_requested() : m.project_pause()}</button>
				<span class="text-sm {connectorPaused ? 'text-amber-800' : 'text-green-700'}">{connectorPaused ? (connectorResumable ? m.project_checkpoint_available() : m.project_preparing_resume()) : m.project_connector_retry_blocked()}</span>
			{:else}
				<button onclick={pair} disabled={busy || scholarTransferActive || (!project?.institution.scholar_org_id && !scholarOrgId)} class="rounded-lg bg-indigo-700 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? m.project_preparing_connector() : scholarTransferActive ? m.project_import_in_progress() : connectorReady ? (retrying ? m.project_retry_connect() : m.project_connect_import()) : (retrying ? m.project_generate_new_access() : m.project_generate_access())}</button>
				<span class="text-sm {scholarTransferActive || connectorReady ? 'text-green-700' : 'text-gray-500'}">{scholarTransferActive ? (connectorSupportsPause ? m.project_connector_retry_blocked() : m.project_update_extension()) : connectorReady ? m.project_extension_detected() : m.project_extension_missing()}</span>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet Metric(label: string, value: string)}<div class="metric-cell"><p class="metric-label">{label}</p><p class="metric-value">{value}</p></div>{/snippet}

{#snippet SourceCard(label: string, item: InstitutionBootstrap | null)}
	<div class="rounded-lg border bg-white p-4">
		<p class="font-semibold">{label}</p>
		<p class="mt-1 text-sm text-gray-600">{statusLabels[item?.status ?? 'queued'] ?? m.status_queued()}</p>
		<div class="mt-3 h-2 overflow-hidden rounded-full bg-gray-100"><div class="h-full bg-indigo-600" style={`width: ${Math.max(item ? 2 : 0, (item?.progress ?? 0) * 100)}%`}></div></div>
		{#if item?.message_ref || item?.progress_message}<p class="mt-2 text-xs text-gray-600">{translateMessageRef(item?.message_ref, item?.progress_message ?? undefined)}</p>{/if}
		{#if item?.error_ref || item?.error_message}<p class="mt-2 break-words text-xs text-red-800">{translateMessageRef(item?.error_ref, item?.error_message ?? undefined)}</p>{/if}
	</div>
{/snippet}

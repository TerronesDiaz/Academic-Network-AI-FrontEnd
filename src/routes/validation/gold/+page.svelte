<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { auth } from '$lib/auth';
	import {
		addGoldStudyMember,
		adjudicateGoldTask,
		createGoldStudy,
		evaluateGoldStudy,
		freezeGoldStudy,
		getGoldMetrics,
		getNextGoldAdjudication,
		getNextGoldTask,
		getValidationWorkflow,
		listGoldStudies,
		promoteGoldStudy,
		saveGoldTask,
		searchGoldDirectory,
		startGoldStudy
	} from '$lib/api/client';
	import type {
		GoldAnnotationDraft,
		GoldDirectoryAuthor,
		GoldMetrics,
		GoldStudy,
		GoldTask
	} from '$lib/api/types';
	import { userError } from '$lib/i18n/errors';
	import * as m from '$lib/paraglide/messages.js';

	let studies = $state<GoldStudy[]>([]);
	let study = $state<GoldStudy | null>(null);
	let task = $state<GoldTask | null>(null);
	let assignments = $state<Record<number, GoldAnnotationDraft>>({});
	let metrics = $state<GoldMetrics | null>(null);
	let loading = $state(true);
	let working = $state(false);
	let error = $state('');
	let notice = $state('');
	let newName = $state('Gold Standard UdeC');
	let sourceRun = $state('');
	let samplingSeed = $state(20260803);
	let memberUserId = $state<number | null>(null);
	let directoryQuery = $state('');
	let directoryResults = $state<GoldDirectoryAuthor[]>([]);
	let directoryCaseId = $state<number | null>(null);
	let promotionConfirmed = $state(false);

	const stages = [
		{ state: 'draft', label: m.gold_stage_prepare() },
		{ state: 'annotating', label: m.gold_stage_annotate() },
		{ state: 'adjudicating', label: m.gold_stage_adjudicate() },
		{ state: 'frozen', label: m.gold_stage_freeze() },
		{ state: 'evaluated', label: m.gold_stage_evaluate() }
	] as const;

	let isManager = $derived(study?.roles.includes('manager') ?? false);
	let isAnnotator = $derived(study?.roles.includes('annotator') ?? false);
	let isAdjudicator = $derived(study?.roles.includes('adjudicator') ?? false);
	let curatorCount = $derived(study?.members.filter((member) => member.role === 'annotator').length ?? 0);

	onMount(() => {
		if (!$auth) {
			goto('/login');
			return;
		}
		void loadStudies();
	});

	function apiMessage(value: unknown, fallback: string) {
		return userError(value, fallback);
	}

	async function loadStudies(preferredId?: string) {
		loading = true;
		error = '';
		try {
			studies = await listGoldStudies();
			if (studies.length === 0 && !sourceRun) {
				const workflow = await getValidationWorkflow();
				sourceRun = workflow.run_id;
			}
			study = studies.find((item) => item.id === preferredId) ?? studies[0] ?? null;
			await loadCurrentWork();
		} catch (value) {
			error = apiMessage(value, m.gold_load_error());
		} finally {
			loading = false;
		}
	}

	async function chooseStudy(value: GoldStudy) {
		study = value;
		task = null;
		metrics = null;
		await loadCurrentWork();
	}

	async function loadCurrentWork() {
		if (!study) return;
		task = null;
		assignments = {};
		if (study.state === 'annotating' && isAnnotator) {
			task = await getNextGoldTask(study.id);
			seedAssignments();
		} else if (study.state === 'adjudicating' && isAdjudicator) {
			task = await getNextGoldAdjudication(study.id);
			seedAssignments();
		} else if (study.state === 'evaluated') {
			metrics = await getGoldMetrics(study.id);
		}
	}

	function formatPercent(value: number | null | undefined, digits = 1) {
		return typeof value === 'number' && Number.isFinite(value)
			? `${(value * 100).toFixed(digits)}%`
			: '—';
	}

	function formatDecimal(value: number | null | undefined, digits = 3) {
		return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
	}

	function seedAssignments() {
		assignments = {};
		for (const item of task?.cases ?? []) {
			assignments[item.id] = item.annotation ?? {
				cluster_key: '',
				label: 'insufficient_evidence',
				canonical_author_id: null,
				rationale: null,
				affiliation_at_publication: item.evidence.affiliation_at_publication ?? 'unknown'
			};
		}
	}

	async function createStudy() {
		if (!sourceRun.trim()) {
			error = m.gold_source_run_required();
			return;
		}
		working = true;
		error = '';
		try {
			const created = await createGoldStudy({
				name: newName,
				source_run_id: sourceRun.trim(),
				sampling_seed: samplingSeed
			});
			notice = m.gold_created_notice();
			await loadStudies(created.id);
		} catch (value) {
			error = apiMessage(value, m.gold_create_error());
		} finally {
			working = false;
		}
	}

	async function addCurator() {
		if (!study || !memberUserId) return;
		working = true;
		error = '';
		try {
			await addGoldStudyMember(study.id, memberUserId, 'annotator');
			memberUserId = null;
			notice = m.gold_curator_added();
			await loadStudies(study.id);
		} catch (value) {
			error = apiMessage(value, m.gold_add_curator_error());
		} finally {
			working = false;
		}
	}

	async function beginStudy() {
		if (!study) return;
		working = true;
		error = '';
		try {
			await startGoldStudy(study.id);
			notice = m.gold_started_notice();
			await loadStudies(study.id);
		} catch (value) {
			error = apiMessage(value, m.gold_start_error());
		} finally {
			working = false;
		}
	}

	function setOutcome(caseId: number, label: GoldAnnotationDraft['label']) {
		const current = assignments[caseId];
		assignments[caseId] = {
			...current,
			label,
			canonical_author_id: label === 'author' ? current?.canonical_author_id ?? null : null,
			cluster_key:
				label === 'not_in_directory' || label === 'external'
					? current?.cluster_key || `externo-${caseId}`
					: label === 'insufficient_evidence' || label === 'unresolved'
						? current?.cluster_key || `sin-resolver-${caseId}`
						: current?.canonical_author_id
							? `autor-${current.canonical_author_id}`
							: ''
		};
	}

	async function openDirectory(caseId: number) {
		directoryCaseId = caseId;
		directoryQuery = '';
		directoryResults = [];
	}

	async function searchDirectory() {
		if (!study || directoryQuery.trim().length < 2) return;
		working = true;
		try {
			directoryResults = await searchGoldDirectory(study.id, directoryQuery.trim());
		} catch (value) {
			error = apiMessage(value, 'No fue posible consultar el directorio.');
		} finally {
			working = false;
		}
	}

	function chooseAuthor(author: GoldDirectoryAuthor) {
		if (directoryCaseId === null) return;
		assignments[directoryCaseId] = {
			...assignments[directoryCaseId],
			label: 'author',
			canonical_author_id: author.id,
			cluster_key: `autor-${author.id}`,
			affiliation_at_publication:
				assignments[directoryCaseId]?.affiliation_at_publication ?? 'unknown'
		};
		directoryCaseId = null;
	}

	function completeAssignments() {
		return (task?.cases ?? []).every((item) => {
			const value = assignments[item.id];
			return Boolean(
				value?.cluster_key.trim() &&
				(value.label !== 'author' || value.canonical_author_id) &&
				(study?.state !== 'adjudicating' || value.rationale?.trim())
			);
		});
	}

	function annotationPayload() {
		return (task?.cases ?? []).map((item) => ({
			case_id: item.id,
			cluster_key: assignments[item.id].cluster_key.trim(),
			label: assignments[item.id].label,
			canonical_author_id: assignments[item.id].canonical_author_id,
			rationale: assignments[item.id].rationale,
			affiliation_at_publication: assignments[item.id].affiliation_at_publication
		}));
	}

	async function saveWork(submit: boolean) {
		if (!study || !task) return;
		if (submit && !completeAssignments()) {
			error = m.gold_complete_error();
			return;
		}
		working = true;
		error = '';
		try {
			await saveGoldTask(study.id, task.id, annotationPayload(), submit);
			notice = submit ? m.gold_submitted_notice() : m.gold_draft_saved();
			if (submit) await loadStudies(study.id);
		} catch (value) {
			error = apiMessage(value, m.gold_save_error());
		} finally {
			working = false;
		}
	}

	async function submitAdjudication() {
		if (!study || !task || !completeAssignments()) {
			error = m.gold_adjudication_incomplete();
			return;
		}
		working = true;
		try {
			await adjudicateGoldTask(
				study.id,
				task.id,
				annotationPayload().map((item) => ({ ...item, reason: item.rationale }))
			);
			notice = m.gold_adjudicated_notice();
			await loadStudies(study.id);
		} catch (value) {
			error = apiMessage(value, m.gold_adjudicate_error());
		} finally {
			working = false;
		}
	}

	async function freeze() {
		if (!study) return;
		working = true;
		try {
			await freezeGoldStudy(study.id);
			notice = m.gold_frozen_notice();
			await loadStudies(study.id);
		} catch (value) {
			error = apiMessage(value, m.gold_freeze_error());
		} finally {
			working = false;
		}
	}

	async function evaluate() {
		if (!study) return;
		working = true;
		try {
			const result = await evaluateGoldStudy(study.id);
			metrics = result.metrics;
			notice = m.gold_evaluated_notice();
			await loadStudies(study.id);
		} catch (value) {
			error = apiMessage(value, m.gold_evaluate_error());
		} finally {
			working = false;
		}
	}

	async function promote() {
		if (!study || !promotionConfirmed) return;
		working = true;
		try {
			const result = await promoteGoldStudy(study.id);
			notice = m.gold_promoted_notice({ summary: Object.entries(result).map(([key, value]) => `${value} ${key}`).join(', ') });
			promotionConfirmed = false;
		} catch (value) {
			error = apiMessage(value, m.gold_promote_error());
		} finally {
			working = false;
		}
	}
</script>

<svelte:head>
	<title>{m.gold_title()} | Academic Network</title>
</svelte:head>

<div class="app-page">
	<a href="/validation" class="text-sm text-indigo-700 hover:underline">{m.gold_back_operational()}</a>
	<header class="page-header">
		<div>
			<p class="page-kicker">{m.gold_thesis_evaluation()}</p>
			<h1 class="page-heading">{m.gold_title()}</h1>
			<p class="page-description">{m.gold_intro()}</p>
		</div>
		<nav class="flex gap-5 text-sm" aria-label={m.gold_modes_label()}>
			<a href="/validation/gold" aria-current="page" class="tab tab-active">{m.gold_formal()}</a>
			<a href="/validation/gold/pilot" class="tab">{m.gold_quick_sample()}</a>
		</nav>
	</header>

	{#if error}<div role="alert" class="notice-error">{error}</div>{/if}
	{#if notice}<div role="status" class="notice-success">{notice}</div>{/if}

	{#if loading}
		<div class="empty-state">{m.gold_loading()}</div>
	{:else if studies.length === 0}
		<section class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
			<div class="surface p-6">
				<h2 class="text-xl font-semibold">{m.gold_no_study()}</h2>
				<p class="mt-2 text-gray-600">{m.gold_no_study_help()}</p>
				<ol class="mt-5 space-y-3 text-sm text-gray-700">
					<li><strong>1.</strong> {m.gold_step_link_run()}</li>
					<li><strong>2.</strong> {m.gold_step_curators()}</li>
					<li><strong>3.</strong> {m.gold_step_freeze_sample()}</li>
				</ol>
			</div>
			<form class="surface p-6" onsubmit={(event) => { event.preventDefault(); void createStudy(); }}>
				<h2 class="text-lg font-semibold">{m.gold_create_draft()}</h2>
				<label class="mt-4 block text-sm font-medium" for="study-name">{m.gold_name()}</label>
				<input id="study-name" bind:value={newName} class="mt-1 w-full rounded-lg border px-3 py-2" />
				<label class="mt-4 block text-sm font-medium" for="source-run">{m.gold_run_id()}</label>
				<input id="source-run" bind:value={sourceRun} class="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
				<p class="mt-1 text-xs text-gray-500">{m.gold_run_help()}</p>
				<label class="mt-4 block text-sm font-medium" for="seed">{m.gold_seed()}</label>
				<input id="seed" type="number" bind:value={samplingSeed} class="mt-1 w-full rounded-lg border px-3 py-2" />
				<button disabled={working} class="mt-5 w-full rounded-lg bg-indigo-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{m.gold_create_only()}</button>
			</form>
		</section>
	{:else if study}
		{#if studies.length > 1}
			<nav aria-label={m.gold_studies_label()} class="flex flex-wrap gap-2">
				{#each studies as item}
					<button onclick={() => void chooseStudy(item)} class="rounded-lg border px-3 py-2 text-sm {item.id === study?.id ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'bg-white'}">{item.name}</button>
				{/each}
			</nav>
		{/if}

		<section class="surface p-5">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 class="text-xl font-semibold">{study.name}</h2>
					<p class="mt-1 font-mono text-xs text-gray-500">{study.protocol_version} · {study.namespace_version} · {study.source_run_id}</p>
				</div>
				<span class="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium">{m.gold_cases({ count: study.case_count || study.target_case_count })}</span>
			</div>
			<ol class="mt-6 grid overflow-hidden border-y border-gray-200 md:grid-cols-5 md:divide-x">
				{#each stages as stage, index}
					{@const activeIndex = stages.findIndex((item) => item.state === study?.state)}
					<li class="border-l-2 p-3 text-sm {index <= activeIndex ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900' : 'border-transparent text-gray-400'}">
						<span class="block text-xs font-bold">{m.gold_step({ number: index + 1 })}</span>{stage.label}
					</li>
				{/each}
			</ol>
		</section>

		{#if study.state === 'draft' && isManager}
			<section class="grid gap-6 lg:grid-cols-2">
				<div class="surface p-6">
					<h2 class="text-lg font-semibold">{m.gold_team()}</h2>
					<p class="mt-1 text-sm text-gray-600">{m.gold_team_help()}</p>
					<div class="mt-4 space-y-2">
						{#each study.members as member}
							<div class="flex justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"><span>{member.code}</span><span>{m.gold_member({ role: member.role, userId: member.user_id })}</span></div>
						{/each}
					</div>
					<form class="mt-4 flex gap-2" onsubmit={(event) => { event.preventDefault(); void addCurator(); }}>
						<input aria-label={m.gold_curator_id()} type="number" bind:value={memberUserId} placeholder={m.gold_user_id()} class="min-w-0 flex-1 rounded-lg border px-3 py-2" />
						<button disabled={working || curatorCount >= 3} class="rounded-lg border border-indigo-600 px-4 py-2 font-medium text-indigo-700 disabled:opacity-50">{m.gold_add_curator()}</button>
					</form>
				</div>
				<div class="surface p-6">
					<h2 class="text-lg font-semibold">{m.gold_sample()}</h2>
					<dl class="mt-4 grid grid-cols-2 gap-3 text-sm">
						{#each Object.entries(study.config.quotas ?? {}) as [name, count]}
							<div class="rounded-lg bg-gray-50 p-3"><dt class="text-gray-500">{name.replaceAll('_', ' ')}</dt><dd class="text-xl font-bold">{count}</dd></div>
						{/each}
					</dl>
					<p class="mt-4 text-sm text-gray-600">{m.gold_sample_help({ seed: study.sampling_seed })}</p>
					<button onclick={() => void beginStudy()} disabled={working || curatorCount !== 3} class="mt-5 w-full rounded-lg bg-indigo-700 px-4 py-2.5 font-semibold text-white disabled:opacity-40">{curatorCount === 3 ? m.gold_start() : m.gold_missing_curators({ count: 3 - curatorCount })}</button>
				</div>
			</section>
		{:else if study.state === 'annotating'}
			{#if isAnnotator && task}
				<section class="space-y-5">
					<div class="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
						<p class="text-xs font-bold uppercase tracking-wide text-indigo-700">{m.gold_blind_namespace()}</p>
						<h2 class="mt-1 text-2xl font-bold">{task.namespace_key}</h2>
						<p class="mt-1 text-sm text-indigo-900">{m.gold_blind_help()}</p>
					</div>
					{#each task.cases as item, index}
						<article class="rounded-xl border bg-white p-5">
							<div class="flex flex-wrap justify-between gap-3">
								<div><p class="text-xs font-bold text-gray-500">{m.gold_case({ number: index + 1 })}</p><h3 class="text-xl font-semibold">{item.evidence.observed_signature}</h3></div>
								<span class="h-fit rounded-full bg-gray-100 px-3 py-1 text-xs">{item.stratum.replaceAll('_', ' ')}</span>
							</div>
							{#if item.evidence.publication}
								<div class="mt-4 rounded-lg bg-gray-50 p-4">
									<h4 class="font-semibold">{item.evidence.publication.title}</h4>
									<p class="text-sm text-gray-600">{item.evidence.publication.year ?? m.gold_unknown_year()} · {item.evidence.publication.venue ?? m.gold_source_unavailable()}</p>
									<p class="mt-2 text-sm"><strong>{m.gold_signers()}</strong> {item.evidence.publication.byline.map((author) => author.name).join(', ') || m.gold_not_available_plural()}</p>
									<div class="mt-2 flex gap-3 text-sm">{#each item.evidence.publication.links as link}<a class="text-indigo-700 hover:underline" href={link.url} target="_blank" rel="noreferrer">{m.gold_open_link({ label: link.label })}</a>{/each}</div>
								</div>
							{:else}<p class="mt-4 text-sm text-amber-800">{m.gold_no_source()}</p>{/if}
							{#if item.evidence.evidence_status}
								<p class="mt-3 text-sm font-medium text-gray-700">
									{item.evidence.evidence_status === 'ready'
										? m.pilot_evidence_ready()
										: item.evidence.evidence_status === 'conflict'
											? m.pilot_evidence_conflict()
											: m.pilot_evidence_insufficient()}
								</p>
							{/if}
							{#if item.evidence.verified_sources?.length}
								<div class="mt-3 space-y-2">
									<h4 class="text-sm font-semibold">{m.pilot_verified_sources()}</h4>
									{#each item.evidence.verified_sources as source}
										<div class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
											<p class="font-semibold">{source.title ?? source.source} {source.year ? `· ${source.year}` : ''}</p>
											{#if source.byline.length}<p class="mt-1"><strong>{m.pilot_source_byline()}:</strong> {source.byline.map((author) => author.name).join(', ')}</p>{/if}
											{#if source.url}<a class="mt-1 inline-block text-indigo-700 hover:underline" href={source.url} target="_blank" rel="noreferrer">{m.pilot_open_source()}</a>{/if}
										</div>
									{/each}
								</div>
							{/if}
							<div class="mt-4 grid gap-2 sm:grid-cols-3" role="group" aria-label={m.gold_case_decision()}>
								<button onclick={() => void openDirectory(item.id)} class="rounded-lg border px-3 py-2 text-sm font-medium {assignments[item.id]?.label === 'author' ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : ''}">{m.gold_udec_person()}</button>
								<button onclick={() => setOutcome(item.id, 'not_in_directory')} class="rounded-lg border px-3 py-2 text-sm font-medium {assignments[item.id]?.label === 'not_in_directory' ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : ''}">{m.gold_external_person()}</button>
								<button onclick={() => setOutcome(item.id, 'insufficient_evidence')} class="rounded-lg border px-3 py-2 text-sm font-medium {assignments[item.id]?.label === 'insufficient_evidence' ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : ''}">{m.gold_insufficient()}</button>
							</div>
							<label class="mt-4 block text-sm font-medium" for={`affiliation-${item.id}`}>{m.pilot_affiliation_question()}</label>
							<select id={`affiliation-${item.id}`} bind:value={assignments[item.id].affiliation_at_publication} class="mt-1 w-full rounded-lg border px-3 py-2">
								<option value="institutional">{m.pilot_affiliation_institutional()}</option>
								<option value="external">{m.pilot_affiliation_external()}</option>
								<option value="mixed">{m.pilot_affiliation_mixed()}</option>
								<option value="unknown">{m.pilot_affiliation_unknown()}</option>
							</select>
							<label class="mt-4 block text-sm font-medium" for={`cluster-${item.id}`}>{m.gold_cluster()}</label>
							<input id={`cluster-${item.id}`} bind:value={assignments[item.id].cluster_key} class="mt-1 w-full rounded-lg border px-3 py-2" placeholder={m.gold_cluster_placeholder()} />
							<label class="mt-3 block text-sm font-medium" for={`reason-${item.id}`}>{m.gold_rationale()}</label>
							<textarea id={`reason-${item.id}`} bind:value={assignments[item.id].rationale} rows="2" class="mt-1 w-full rounded-lg border px-3 py-2"></textarea>
						</article>
					{/each}
					<div class="sticky bottom-4 flex justify-end gap-3 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur">
						<button onclick={() => void saveWork(false)} disabled={working} class="rounded-lg border px-4 py-2 font-medium">{m.gold_save_draft()}</button>
						<button onclick={() => void saveWork(true)} disabled={working || !completeAssignments()} class="rounded-lg bg-indigo-700 px-5 py-2 font-semibold text-white disabled:opacity-40">{m.gold_submit_namespace()}</button>
					</div>
				</section>
			{:else if isManager}
				<section class="surface p-6">
					<h2 class="text-lg font-semibold">{m.gold_annotation_progress()}</h2>
					<p class="mt-1 text-gray-600">{m.gold_annotation_manager_help()}</p>
					<div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						{#each Object.entries(study.task_counts) as [status, count]}
							<div class="rounded-lg bg-gray-50 p-4"><p class="text-xs font-bold uppercase text-gray-500">{status.replaceAll('_', ' ')}</p><p class="mt-1 text-2xl font-bold">{count}</p></div>
						{/each}
					</div>
				</section>
			{:else}
				<div class="empty-state"><h2 class="text-lg font-semibold">{m.gold_annotation_progress()}</h2><p class="mt-2 text-gray-600">{m.gold_no_task()}</p></div>
			{/if}
		{:else if study.state === 'adjudicating'}
			{#if isAdjudicator && task}
				<section class="surface p-6">
					<h2 class="text-xl font-semibold">{m.gold_adjudicate({ namespace: task.namespace_key })}</h2>
					<p class="mt-1 text-gray-600">{m.gold_adjudicate_help()}</p>
					<div class="mt-5 overflow-x-auto"><table class="w-full text-left text-sm"><thead><tr class="border-b"><th class="p-2">{m.gold_curator()}</th><th class="p-2">{m.gold_case_column()}</th><th class="p-2">{m.gold_class()}</th><th class="p-2">Cluster</th><th class="p-2">{m.gold_reason()}</th></tr></thead><tbody>{#each task.curator_annotations ?? [] as row}<tr class="border-b"><td class="p-2 font-semibold">{row.curator}</td><td class="p-2">{row.case_id}</td><td class="p-2">{row.label}</td><td class="p-2">{row.cluster_key}</td><td class="p-2">{row.rationale ?? '—'}</td></tr>{/each}</tbody></table></div>
					<p class="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{m.gold_final_partition_help()}</p>
					{#each task.cases as item}
						<div class="mt-4 rounded-lg border p-4">
							<strong>{item.evidence.observed_signature}</strong>
							{#if item.evidence.publication}
								<div class="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
									<p class="font-semibold">{item.evidence.publication.title}</p>
									<p class="text-gray-600">{item.evidence.publication.year ?? m.gold_unknown_year()} · {item.evidence.publication.venue ?? m.gold_source_unavailable()}</p>
									<p class="mt-1"><strong>{m.gold_signers()}</strong> {item.evidence.publication.byline.map((author) => author.name).join(', ') || m.gold_not_available_plural()}</p>
								</div>
							{/if}
							<div class="mt-3 flex flex-wrap gap-2"><button onclick={() => void openDirectory(item.id)} class="rounded border px-3 py-1.5">UdeC</button><button onclick={() => setOutcome(item.id, 'not_in_directory')} class="rounded border px-3 py-1.5">{m.gold_external_short()}</button><button onclick={() => setOutcome(item.id, 'insufficient_evidence')} class="rounded border px-3 py-1.5">{m.gold_unresolved_short()}</button></div>
							<label class="mt-3 block text-sm font-medium" for={`adjudication-affiliation-${item.id}`}>{m.pilot_affiliation_question()}</label>
							<select id={`adjudication-affiliation-${item.id}`} bind:value={assignments[item.id].affiliation_at_publication} class="mt-1 w-full rounded border px-3 py-2"><option value="institutional">{m.pilot_affiliation_institutional()}</option><option value="external">{m.pilot_affiliation_external()}</option><option value="mixed">{m.pilot_affiliation_mixed()}</option><option value="unknown">{m.pilot_affiliation_unknown()}</option></select>
							<input bind:value={assignments[item.id].cluster_key} class="mt-3 w-full rounded border px-3 py-2" placeholder={m.gold_final_cluster()} />
							<textarea bind:value={assignments[item.id].rationale} class="mt-2 w-full rounded border px-3 py-2" placeholder={m.gold_adjudication_reason()}></textarea>
						</div>
					{/each}
					<button onclick={() => void submitAdjudication()} disabled={working || !completeAssignments()} class="mt-5 rounded-lg bg-indigo-700 px-5 py-2.5 font-semibold text-white disabled:opacity-40">{m.gold_save_final()}</button>
				</section>
			{:else if isManager}
				<section class="empty-state"><h2 class="text-lg font-semibold">{m.gold_annotations_done()}</h2><p class="mt-2 text-gray-600">{m.gold_freeze_help()}</p><button onclick={() => void freeze()} disabled={working} class="btn-primary mt-5">{m.gold_freeze_decisions()}</button></section>
			{/if}
		{:else if study.state === 'frozen' || study.state === 'evaluated'}
			<section class="space-y-6">
				{#if metrics}
					<div class="metric-strip lg:grid-cols-3">
						<div class="metric-cell"><p class="metric-label">B-Cubed F1 · {m.gold_system()}</p><p class="metric-value">{formatPercent(metrics.clustering.b3_f1)}</p><p class="mt-2 text-xs text-gray-500">{m.gold_baseline({ value: formatPercent(metrics.name_only_baseline.b3_f1) })}</p></div>
						<div class="metric-cell"><p class="metric-label">{m.gold_pairwise_f1()}</p><p class="metric-value">{formatPercent(metrics.pairwise.f1)}</p><p class="mt-2 text-xs text-gray-500">{m.gold_same_person()}</p></div>
						<div class="metric-cell"><p class="metric-label">{m.gold_exact_author()}</p><p class="metric-value">{formatPercent(metrics.classification.exact_author_accuracy)}</p><p class="mt-2 text-xs text-gray-500">{m.gold_exact_author_help()}</p></div>
						<div class="metric-cell"><p class="metric-label">{m.gold_fleiss()}</p><p class="metric-value">{formatDecimal(metrics.inter_annotator.fleiss_kappa_class)}</p></div>
						<div class="metric-cell"><p class="metric-label">{m.gold_candidate_recall()}</p><p class="metric-value">{formatPercent(metrics.ranking.candidate_recall_at_5)}</p></div>
						<div class="metric-cell"><p class="metric-label">{m.gold_prediction_coverage()}</p><p class="metric-value">{formatPercent(metrics.prediction_coverage)}</p></div>
					</div>
				{/if}
				{#if study.state === 'frozen' && isManager}<div class="rounded-xl border bg-white p-6"><h2 class="text-lg font-semibold">{m.gold_immutable_decisions()}</h2><p class="mt-1 text-gray-600">{m.gold_evaluate_help()}</p><button onclick={() => void evaluate()} disabled={working} class="mt-4 rounded-lg bg-indigo-700 px-5 py-2.5 font-semibold text-white">{m.gold_generate_reports()}</button></div>{/if}
				{#if study.state === 'evaluated' && isManager}<div class="rounded-xl border border-red-200 bg-white p-6"><h2 class="text-lg font-semibold">{m.gold_optional_promotion()}</h2><p class="mt-1 text-gray-600">{m.gold_promotion_help()}</p><label class="mt-4 flex items-start gap-3"><input type="checkbox" bind:checked={promotionConfirmed} class="mt-1" /><span>{m.gold_promotion_confirm()}</span></label><button onclick={() => void promote()} disabled={working || !promotionConfirmed} class="mt-4 rounded-lg bg-red-700 px-5 py-2.5 font-semibold text-white disabled:opacity-40">{m.gold_promote()}</button></div>{/if}
			</section>
		{/if}
	{/if}
</div>

{#if directoryCaseId !== null}
	<div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="directory-title">
		<div class="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
			<div class="flex justify-between"><div><h2 id="directory-title" class="text-xl font-semibold">{m.gold_directory()}</h2><p class="text-sm text-gray-600">{m.gold_directory_help()}</p></div><button onclick={() => (directoryCaseId = null)} aria-label={m.common_close()} class="text-2xl">×</button></div>
			<form class="mt-4 flex gap-2" onsubmit={(event) => { event.preventDefault(); void searchDirectory(); }}><input bind:value={directoryQuery} class="min-w-0 flex-1 rounded-lg border px-3 py-2" placeholder={m.pilot_directory_placeholder()} /><button class="rounded-lg bg-indigo-700 px-4 py-2 text-white">{m.common_search()}</button></form>
			<div class="mt-4 space-y-2">{#each directoryResults as author}<button onclick={() => chooseAuthor(author)} class="block w-full rounded-lg border p-3 text-left hover:border-indigo-500"><strong>{author.canonical_name}</strong><span class="block text-sm text-gray-600">{author.affiliation ?? m.gold_no_affiliation()}</span></button>{/each}</div>
		</div>
	</div>
{/if}

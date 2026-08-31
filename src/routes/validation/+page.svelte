<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { auth } from '$lib/auth';
	import {
		acceptValidationGroup,
		compareValidationGroupCandidate,
		deferValidationGroup,
		getValidationPreparation,
		getNextValidationGroup,
		getValidationGroup,
		getValidationGroupOccurrences,
		getValidationRelatedOccurrences,
		getValidationWorkflow,
		listAuthors,
		listDuplicateReviews,
		markValidationGroupExternal,
		prepareValidationWorkflow,
		refreshValidationDerivedData,
		searchValidationExternalDirectory,
		undoValidationGroupDecision
	} from '$lib/api/client';
	import type {
		Author,
		ExternalDirectoryPerson,
		ValidationCandidate,
		ValidationCandidateCoverage,
		ValidationGroup,
		ValidationGroupDecision,
		ValidationPhase,
		ValidationPreparation,
		ValidationRelatedOccurrence,
		ValidationWorkflow
	} from '$lib/api/types';
	import { formatDate } from '$lib/i18n/format';
	import { userError } from '$lib/i18n/errors';
	import * as m from '$lib/paraglide/messages.js';

	type GuidedPhase = Exclude<ValidationPhase, 'abstention' | 'data_gap'>;

	let workflow = $state<ValidationWorkflow | null>(null);
	let preparation = $state<ValidationPreparation | null>(null);
	let unresolvedDuplicateCount = $state(0);
	let preparingWorkflow = $state(false);
	let group = $state<ValidationGroup | null>(null);
	let viewedPhase = $state<GuidedPhase | null>(null);
	let queueStatus = $state<'pending' | 'deferred'>('pending');
	let loading = $state(true);
	let deciding = $state(false);
	let undoing = $state(false);
	let refreshing = $state(false);
	let error = $state('');
	let notice = $state('');
	let note = $state('');
	let showNote = $state(false);
	let authorQuery = $state('');
	let searchedQuery = $state('');
	let searchResults = $state<Author[]>([]);
	let externalSearchResults = $state<ExternalDirectoryPerson[]>([]);
	let selectedExternalSearchResult = $state<ExternalDirectoryPerson | null>(null);
	let searching = $state(false);
	let comparingAuthorId = $state<number | null>(null);
	let pendingCandidate = $state<ValidationCandidate | null>(null);
	let confirmGroupOpen = $state(false);
	let confirmExternalOpen = $state(false);
	let externalReason = $state('');
	let createAlias = $state(false);
	let lastDecision = $state<ValidationGroupDecision | null>(null);
	let occurrencesOpen = $state(false);
	let occurrenceItems = $state<ValidationRelatedOccurrence[]>([]);
	let occurrenceTotal = $state(0);
	let occurrencesLoading = $state(false);
	let occurrenceLoadSequence = 0;
	let caseHeading = $state<HTMLElement>();
	let cancelDialogButton = $state<HTMLButtonElement>();
	let loadSequence = 0;
	let searchSequence = 0;
	let undoTimer: ReturnType<typeof setTimeout> | undefined;
	let preparationTimer: ReturnType<typeof setTimeout> | undefined;

	const externalReasons = [
		{ value: 'no_directory_match', label: m.validation_reason_no_match() },
		{ value: 'external_affiliation', label: m.validation_reason_external_affiliation() },
		{ value: 'name_incompatible', label: m.validation_reason_name_incompatible() },
		{ value: 'verified_external_identifier', label: m.validation_reason_external_id() },
		{ value: 'other_verified_evidence', label: m.validation_reason_other() }
	];

	const riskLabels: Record<string, string> = {
		canonical_name_match: m.validation_risk_name(),
		confirmed_alias_match: m.validation_risk_alias(),
		resolved_internal_elsewhere: m.validation_risk_internal_elsewhere(),
		strict_directory_candidate: m.validation_risk_candidate(),
		institutional_affiliation: m.validation_risk_affiliation(),
		known_institutional_openalex_author: m.validation_risk_openalex(),
		multiple_compatible_candidates: m.validation_risk_multiple(),
		possible_duplicate_profile: m.validation_risk_duplicate(),
		automatic_control_sample: m.validation_risk_auto_confirmation(),
		automatic_identity_control_sample: m.validation_risk_auto_identity(),
		source_bound_openalex_control_sample: m.validation_risk_source_control(),
		source_external_identity_conflict: m.validation_risk_external_conflict(),
		temporal_identity_conflict: m.validation_risk_temporal(),
		primary_source_conflict: m.validation_risk_primary(),
		technical_evidence_conflict: m.validation_risk_provider(),
		provider_candidate_disagreement: m.validation_risk_candidates_disagree(),
		missing_byline: m.validation_risk_missing_byline(),
		non_person_punctuation: m.validation_risk_punctuation(),
		truncated_byline_marker: m.validation_risk_truncated()
	};

	let entry = $derived(group?.representative_entry ?? null);
	let selectedPhase = $derived(
		workflow?.phases.find((phase) => phase.phase === viewedPhase) ?? null
	);
	let isFuturePreview = $derived(Boolean(selectedPhase && !selectedPhase.can_decide));
	let question = $derived.by(() => {
		if (!group) return '';
		if (group.phase === 'quick_confirmation') {
			const proposed = entry?.candidates.find((candidate) => candidate.id === group?.proposed_author_id);
			if (group.decision_scope === 'occurrence') {
				return m.validation_question_quick_occurrence({ signature: group.display_signature, name: proposed?.canonical_name ?? m.validation_suggested_person() });
			}
			return m.validation_question_quick({ signature: group.display_signature, name: proposed?.canonical_name ?? m.validation_suggested_person(), count: group.occurrence_count });
		}
		if (group.phase === 'identity_resolution') {
			if (group.review_stratum === 'candidate_unique_direct') {
				return m.validation_question_direct({ signature: group.display_signature });
			}
			if (group.review_stratum === 'candidate_unique_weak') {
				return m.validation_question_weak({ signature: group.display_signature });
			}
			if (group.review_stratum === 'identity_evidence_conflict') {
				return m.validation_question_conflict({ signature: group.display_signature });
			}
			return m.validation_question_person({ signature: group.display_signature });
		}
		if (group.review_stratum === 'external_high_risk_conflict') {
			return m.validation_question_external_conflict({ signature: group.display_signature });
		}
		if (group.review_stratum === 'external_temporal_conflict') {
			return m.validation_question_temporal({ signature: group.display_signature });
		}
		return m.validation_question_institutional({ signature: group.display_signature });
	});

	onMount(() => {
		if (!$auth) {
			goto('/login');
			return;
		}
		const requestedPhase = new URLSearchParams(window.location.search).get('phase');
		const explicitPhase = requestedPhase && [
			'quick_confirmation', 'identity_resolution', 'external_audit'
		].includes(requestedPhase)
			? requestedPhase as GuidedPhase
			: null;
		void loadWorkflow(explicitPhase);
		return () => {
			loadSequence += 1;
			searchSequence += 1;
			if (undoTimer) clearTimeout(undoTimer);
			if (preparationTimer) clearTimeout(preparationTimer);
		};
	});

	async function loadPreparationState() {
		try {
			const [nextPreparation, pending, deferred] = await Promise.all([
				getValidationPreparation(),
				listDuplicateReviews('pending'),
				listDuplicateReviews('deferred')
			]);
			preparation = nextPreparation;
			unresolvedDuplicateCount = pending.total + deferred.total;
			if (preparationTimer) clearTimeout(preparationTimer);
			if (nextPreparation.status === 'queued' || nextPreparation.status === 'running') {
				preparationTimer = setTimeout(() => void pollPreparation(), 3000);
			}
		} catch (value) {
			error = apiMessage(value, m.validation_prepare_load_error());
		}
	}

	async function pollPreparation() {
		await loadPreparationState();
		if (preparation?.status === 'success') await loadWorkflow();
	}

	async function startWorkflowPreparation() {
		if (preparingWorkflow || unresolvedDuplicateCount > 0) return;
		preparingWorkflow = true;
		error = '';
		try {
			preparation = await prepareValidationWorkflow();
			await loadPreparationState();
		} catch (value) {
			error = apiMessage(value, m.validation_prepare_start_error());
		} finally {
			preparingWorkflow = false;
		}
	}

	async function loadWorkflow(preferredPhase?: GuidedPhase | null) {
		const sequence = ++loadSequence;
		loading = true;
		error = '';
		try {
			const nextWorkflow = await getValidationWorkflow();
			if (sequence !== loadSequence) return;
			workflow = nextWorkflow;
			const availablePhase =
				preferredPhase ??
				nextWorkflow.current_phase ??
				nextWorkflow.phases.find((phase) => phase.deferred_groups > 0)?.phase ??
				nextWorkflow.phases[0]?.phase ??
				null;
			viewedPhase = availablePhase;
			await loadGroup(availablePhase, queueStatus, sequence);
		} catch (value) {
			if (sequence === loadSequence) {
				if (value instanceof Error && value.message === 'There is no active expert-review run.') {
					workflow = null;
					group = null;
					error = '';
					await loadPreparationState();
				} else {
					error = apiMessage(value, m.validation_load_error());
					group = null;
				}
			}
		} finally {
			if (sequence === loadSequence) loading = false;
		}
	}

	async function loadGroup(
		phase: GuidedPhase | null = viewedPhase,
		status: 'pending' | 'deferred' = queueStatus,
		sequence = ++loadSequence
	) {
		if (!phase) {
			group = null;
			return;
		}
		loading = true;
		error = '';
		try {
			const nextGroup = await getNextValidationGroup({ phase, status });
			if (sequence !== loadSequence || phase !== viewedPhase || status !== queueStatus) return;
			group = nextGroup;
			resetCaseState();
			await tick();
			caseHeading?.focus();
		} catch (value) {
			if (sequence === loadSequence) {
				error = apiMessage(value, 'No fue posible cargar el siguiente grupo.');
			}
		} finally {
			if (sequence === loadSequence) loading = false;
		}
	}

	function resetCaseState() {
		note = '';
		showNote = false;
		authorQuery = '';
		searchedQuery = '';
		searchResults = [];
		externalSearchResults = [];
		selectedExternalSearchResult = null;
		searchSequence += 1;
		pendingCandidate = null;
		confirmGroupOpen = false;
		confirmExternalOpen = false;
		externalReason = '';
		createAlias = false;
		occurrencesOpen = false;
		occurrenceItems = [];
		occurrenceTotal = 0;
		occurrencesLoading = false;
		occurrenceLoadSequence += 1;
	}

	async function choosePhase(phase: GuidedPhase) {
		viewedPhase = phase;
		queueStatus = 'pending';
		await loadGroup(phase, 'pending');
	}

	async function chooseQueueStatus(status: 'pending' | 'deferred') {
		queueStatus = status;
		await loadGroup(viewedPhase, status);
	}

	function requestCandidateDecision(candidate: ValidationCandidate) {
		if (!group?.can_decide || deciding) return;
		pendingCandidate = candidate;
		createAlias = false;
		if (group.decision_scope === 'group' && group.occurrence_count > 1) {
			confirmGroupOpen = true;
			void focusDialog();
		} else {
			void confirmCandidate();
		}
	}

	async function confirmCandidate() {
		if (!group || !pendingCandidate || deciding) return;
		const activeGroup = group;
		const candidate = pendingCandidate;
		confirmGroupOpen = false;
		deciding = true;
		error = '';
		try {
			const result = await acceptValidationGroup(activeGroup.id, candidate.id, {
				note,
				create_alias: createAlias
			});
			notice = m.validation_confirmed_notice({ signature: result.display_signature, name: candidate.canonical_name, count: result.occurrence_count });
			rememberDecision(result);
			await loadWorkflow();
		} catch (value) {
			error = apiMessage(value, m.validation_save_error());
		} finally {
			deciding = false;
		}
	}

	async function confirmExternal() {
		if (!group || deciding || !externalReason) return;
		const activeGroup = group;
		confirmExternalOpen = false;
		deciding = true;
		error = '';
		try {
			const result = await markValidationGroupExternal(
				activeGroup.id,
				externalReason,
				note,
				selectedExternalSearchResult?.id ?? null
			);
			notice = m.validation_external_notice({ signature: result.display_signature, count: result.occurrence_count });
			if (result.expanded_external_sample) {
				notice += ` ${m.validation_sample_expanded({ count: result.expanded_external_sample })}`;
			}
			rememberDecision(result);
			await loadWorkflow();
		} catch (value) {
			error = apiMessage(value, m.validation_save_error());
		} finally {
			deciding = false;
		}
	}

	async function deferCurrentGroup() {
		if (!group || deciding || !group.can_decide) return;
		const activeGroup = group;
		deciding = true;
		error = '';
		try {
			const result = await deferValidationGroup(activeGroup.id, note);
			notice = m.validation_deferred_notice({ signature: result.display_signature });
			await loadWorkflow();
		} catch (value) {
			error = apiMessage(value, m.validation_defer_error());
		} finally {
			deciding = false;
		}
	}

	function rememberDecision(result: ValidationGroupDecision) {
		lastDecision = result;
		if (undoTimer) clearTimeout(undoTimer);
		if (!result.undo_expires_at) return;
		const remaining = Math.max(0, apiDate(result.undo_expires_at).getTime() - Date.now());
		undoTimer = setTimeout(() => {
			if (lastDecision?.id === result.id) lastDecision = null;
		}, remaining);
	}

	async function undoLastDecision() {
		if (!lastDecision || undoing) return;
		undoing = true;
		error = '';
		try {
			const restored = await undoValidationGroupDecision(lastDecision.id);
			notice = m.validation_restored_notice({ signature: restored.display_signature, queue: restored.status === 'deferred' ? m.validation_queue_deferred() : m.validation_queue_pending() });
			lastDecision = null;
			if (undoTimer) clearTimeout(undoTimer);
			await loadWorkflow(viewedPhase);
		} catch (value) {
			error = apiMessage(value, m.validation_undo_error());
			lastDecision = null;
			await loadWorkflow(viewedPhase);
		} finally {
			undoing = false;
		}
	}

	function clearSearch() {
		searchSequence += 1;
		searchResults = [];
		externalSearchResults = [];
		searchedQuery = '';
		error = '';
	}

	async function searchAuthors() {
		const query = authorQuery.trim();
		if (query.length < 2) return;
		const sequence = ++searchSequence;
		searching = true;
		error = '';
		try {
			const [result, externalPeople] = await Promise.all([
				listAuthors({ search: query, active_only: true, limit: 10 }),
				searchValidationExternalDirectory(query)
			]);
			if (sequence !== searchSequence || query !== authorQuery.trim()) return;
			searchResults = result.items;
			externalSearchResults = externalPeople;
			searchedQuery = query;
		} catch (value) {
			if (sequence === searchSequence) {
				error = apiMessage(value, m.validation_directory_error());
			}
		} finally {
			if (sequence === searchSequence) searching = false;
		}
	}

	async function chooseExternalSearchResult(person: ExternalDirectoryPerson) {
		selectedExternalSearchResult = person;
		externalReason = 'verified_external_identifier';
		confirmExternalOpen = true;
		await focusDialog();
	}

	async function compareAuthor(author: Author) {
		if (!group || comparingAuthorId !== null || !group.can_decide) return;
		comparingAuthorId = author.id;
		error = '';
		try {
			group = await compareValidationGroupCandidate(group.id, author.id);
			searchResults = searchResults.filter((item) => item.id !== author.id);
			notice = m.validation_compared_notice({ name: author.canonical_name });
		} catch (value) {
			error = apiMessage(value, m.validation_compare_error());
		} finally {
			comparingAuthorId = null;
		}
	}

	async function toggleOccurrences() {
		if (!group) return;
		occurrencesOpen = !occurrencesOpen;
		if (!occurrencesOpen || occurrenceItems.length) return;
		await loadMoreOccurrences();
	}

	async function loadMoreOccurrences() {
		if (!group || occurrencesLoading || occurrenceItems.length >= occurrenceTotal && occurrenceTotal > 0) return;
		const activeGroupId = group.id;
		const sequence = ++occurrenceLoadSequence;
		occurrencesLoading = true;
		try {
			if (group.decision_scope === 'occurrence') {
				const result = await getValidationRelatedOccurrences(activeGroupId);
				if (sequence !== occurrenceLoadSequence || group?.id !== activeGroupId) return;
				occurrenceItems = result.items;
				occurrenceTotal = result.total;
				return;
			}
			const result = await getValidationGroupOccurrences(activeGroupId, { limit: 100, offset: 0 });
			if (sequence !== occurrenceLoadSequence || group?.id !== activeGroupId) return;
			occurrenceItems = result.items.map((item) => ({
				group_id: activeGroupId,
				status: group?.status ?? 'pending',
				phase: group?.phase ?? 'identity_resolution',
				is_current: true,
				entry: item
			}));
			occurrenceTotal = result.total;
		} catch (value) {
			if (sequence === occurrenceLoadSequence) {
				error = apiMessage(value, m.validation_occurrences_error());
			}
		} finally {
			if (sequence === occurrenceLoadSequence) occurrencesLoading = false;
		}
	}

	async function openRelatedOccurrence(item: ValidationRelatedOccurrence) {
		if (item.is_current || loading) return;
		loading = true;
		error = '';
		try {
			const next = await getValidationGroup(item.group_id);
			viewedPhase = next.phase as GuidedPhase;
			if (next.status === 'pending' || next.status === 'deferred') queueStatus = next.status;
			group = next;
			resetCaseState();
			await tick();
			caseHeading?.focus();
		} catch (value) {
			error = apiMessage(value, m.validation_occurrences_error());
		} finally {
			loading = false;
		}
	}

	async function refreshDerivedData() {
		if (refreshing) return;
		refreshing = true;
		error = '';
		try {
			const result = await refreshValidationDerivedData();
			notice =
				result.status === 'success'
					? m.validation_derived_updated()
					: m.validation_derived_queued();
		} catch (value) {
			error = apiMessage(value, m.validation_derived_error());
		} finally {
			refreshing = false;
		}
	}

	async function openExternalDialog() {
		if (!group?.can_decide) return;
		selectedExternalSearchResult = null;
		if (group.proposed_external_person) externalReason = 'verified_external_identifier';
		confirmExternalOpen = true;
		await focusDialog();
	}

	async function focusDialog() {
		await tick();
		cancelDialogButton?.focus();
	}

	function onKeydown(event: KeyboardEvent) {
		if ((confirmExternalOpen || confirmGroupOpen) && event.key === 'Escape') {
			event.preventDefault();
			confirmExternalOpen = false;
			confirmGroupOpen = false;
			return;
		}
		if (
			deciding ||
			!group?.can_decide ||
			!entry ||
			confirmExternalOpen ||
			confirmGroupOpen ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			event.shiftKey ||
			isInteractiveTarget(event.target)
		) return;
		const index = Number.parseInt(event.key, 10) - 1;
		if (index >= 0 && index < entry.candidates.length && index < 9) {
			event.preventDefault();
			requestCandidateDecision(entry.candidates[index]);
		} else if (event.key.toLowerCase() === 'e') {
			event.preventDefault();
			void openExternalDialog();
		}
	}

	function isInteractiveTarget(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false;
		return (
			target.isContentEditable ||
			['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
		);
	}

	function sourceCoauthors(candidate: ValidationCandidate) {
		return (candidate.evidence.coauthors ?? []).filter(
			(coauthor) => coauthor.on_source_publication
		);
	}

	function candidateCoverage(authorId: number): ValidationCandidateCoverage | null {
		return group?.candidate_summaries?.find((item) => item.author_id === authorId) ?? null;
	}

	function scoreRange(summary: ValidationCandidateCoverage | null) {
		if (!summary || summary.min_overall_score === null || summary.max_overall_score === null) {
			return m.validation_pending();
		}
		if (summary.min_overall_score === summary.max_overall_score) {
			return signal(summary.min_overall_score);
		}
		return `${signal(summary.min_overall_score)}–${signal(summary.max_overall_score)}`;
	}

	function signal(value: number | null | undefined) {
		return typeof value === 'number' && Number.isFinite(value)
			? value.toFixed(2)
			: m.validation_no_data();
	}

	function fmtDate(date: string) {
		return formatDate(apiDate(date), {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function apiDate(value: string) {
		const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
		return new Date(hasTimezone ? value : `${value}Z`);
	}

	function apiMessage(value: unknown, fallback: string) {
		if (!(value instanceof Error) || !value.message) return fallback;
		const translations: Record<string, string> = {
			'This validation group has already been reviewed.': m.validation_already_reviewed(),
			'Author not found or inactive.': m.validation_author_inactive(),
			'The undo window has expired.': m.validation_undo_expired(),
			'Only the reviewer who made this decision can undo it.': m.validation_undo_owner(),
			'Finish or defer the current review phase before deciding this group.': m.validation_finish_phase()
		};
		return translations[value.message] ?? userError(value, fallback);
	}
</script>

<svelte:window onkeydown={onKeydown} />


<div class="app-page max-w-[1500px]">
	<header class="page-header">
		<div class="flex w-full flex-wrap items-start justify-between gap-4">
			<div>
				<h1 class="page-heading">{m.validation_title()}</h1>
				<p class="page-description">{m.validation_help()}</p>
			</div>
			<div class="flex flex-wrap gap-3 text-sm">
				<a href="/validation/gold" class="font-medium text-amber-700 hover:underline">{m.validation_gold()}</a>
				<a href="/validation/abstentions" class="font-medium text-amber-700 hover:underline">
					{m.validation_data_audit({ count: workflow ? workflow.abstention_groups + workflow.data_gap_groups : 0 })}
				</a>
				<a href="/validation/duplicates" class="font-medium text-indigo-700 hover:underline">{m.validation_duplicates()}</a>
			</div>
		</div>
		{#if workflow}<p class="mt-2 text-xs text-gray-500">{workflow.algorithm_version} · evidencia {workflow.evidence_version}</p>{/if}
	</header>

	{#if workflow}
		{#if workflow.algorithm_version.startsWith('expert-shadow-') && !workflow.decision_safe}
			<div role="status" class="notice-warning">
				<p class="font-semibold">{m.validation_maintenance()}</p>
				<p class="mt-1">{m.validation_maintenance_help()}</p>
			</div>
		{/if}
		{#if workflow.auto_source_bound_eligible_occurrences > 0 || workflow.auto_scholar_eligible_occurrences > 0}
			<div class="mb-3 space-y-1 text-sm text-gray-600">
				{#if workflow.auto_source_bound_eligible_occurrences > 0}
					<p>{m.validation_automatic_summary({ accepted: workflow.auto_source_bound_accepted_occurrences, audit: workflow.auto_source_bound_audit_occurrences })}</p>
				{/if}
				{#if workflow.auto_scholar_eligible_occurrences > 0}
					<p>{m.validation_scholar_automatic_summary({ accepted: workflow.auto_scholar_accepted_occurrences })}</p>
				{/if}
			</div>
		{/if}
		<nav class="grid overflow-hidden rounded-lg border border-gray-200 bg-white md:grid-cols-3 md:divide-x md:divide-gray-200" aria-label={m.validation_progress()}>
			{#each workflow.phases as phase}
				<button
					onclick={() => void choosePhase(phase.phase)}
					aria-current={phase.is_current ? 'step' : undefined}
					class="relative border-l-2 p-4 text-left {viewedPhase === phase.phase ? 'border-indigo-600 bg-indigo-50/60' : 'border-transparent hover:bg-gray-50'}"
				>
					<div class="flex items-start gap-3">
						<span class="flex h-7 w-7 shrink-0 items-center justify-center text-sm font-semibold {phase.pending_groups === 0 ? 'text-emerald-700' : phase.is_current ? 'text-indigo-700' : 'text-gray-500'}">
							{phase.pending_groups === 0 ? '✓' : phase.order}
						</span>
						<div class="min-w-0">
							<div class="font-semibold text-gray-900">{phase.label}</div>
							<div
								class="mt-1 text-xs text-gray-600"
								title={workflow.counter_definitions.occurrence}
							>
								{#if workflow.algorithm_version === 'expert-shadow-v13'}
									{m.validation_pending_decisions({ count: phase.pending_occurrences })}
								{:else}
									{m.validation_pending_groups({ groups: phase.pending_groups, occurrences: phase.pending_occurrences })}
								{/if}
							</div>
							<div class="mt-1 hidden text-[11px] text-gray-400 sm:block" title={workflow.counter_definitions.technical_row}>
								{m.validation_technical_rows({ rows: phase.pending_technical_rows, processed: phase.accepted_occurrences + phase.system_external_occurrences })}
							</div>
							{#if workflow.algorithm_version.startsWith('expert-shadow-') && !workflow.decision_safe && phase.pending_groups}
								<div class="mt-1 text-xs font-medium text-amber-700">{m.validation_read_only()}</div>
							{:else if !phase.can_decide && phase.pending_groups}
								<div class="mt-1 hidden text-xs font-medium text-gray-500 sm:block">{m.validation_preview()}</div>
							{:else if phase.deferred_groups}
								<div class="mt-1 text-xs font-medium text-violet-700">{phase.deferred_groups} pospuestos</div>
							{/if}
						</div>
					</div>
				</button>
			{/each}
		</nav>

		<div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200">
			<div class="flex gap-5" role="group" aria-label={m.validation_group_status()}>
				<button onclick={() => void chooseQueueStatus('pending')} class="tab {queueStatus === 'pending' ? 'tab-active' : ''}">
					Pendientes ({selectedPhase?.pending_groups ?? 0})
				</button>
				<button onclick={() => void chooseQueueStatus('deferred')} class="tab {queueStatus === 'deferred' ? 'tab-active' : ''}">
					Pospuestos ({selectedPhase?.deferred_groups ?? 0})
				</button>
			</div>
			{#if viewedPhase === 'external_audit' && workflow.external_sample_reviewed}
				<p class="text-xs text-gray-600">Muestra revisada: {workflow.external_sample_reviewed} · falsos externos: {workflow.external_sample_false_negatives} ({Math.round(workflow.external_sample_error_rate * 100)}%)</p>
			{/if}
		</div>
	{/if}

	{#if error}
		<div role="alert" class="notice-error">{error}</div>
	{/if}
	{#if notice}
		<div role="status" aria-live="polite" class="notice-success flex flex-wrap items-center justify-between gap-3">
			<span>{notice}</span>
			{#if lastDecision}
				<button onclick={undoLastDecision} disabled={undoing} class="rounded-md border border-emerald-300 px-3 py-1.5 font-medium hover:bg-emerald-100 disabled:opacity-50">
					{undoing ? 'Deshaciendo…' : `Deshacer las ${lastDecision.occurrence_count} apariciones`}
				</button>
			{/if}
		</div>
	{/if}

	{#if isFuturePreview}
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
			<div>
				<p class="font-semibold">{m.validation_preview_title()}</p>
				<p class="mt-1">{m.validation_preview_help()}</p>
			</div>
			{#if workflow?.current_phase}
				<button onclick={() => void choosePhase(workflow!.current_phase!)} class="rounded-lg bg-sky-700 px-4 py-2 font-semibold text-white hover:bg-sky-800">{m.validation_back_current()}</button>
			{/if}
		</div>
	{/if}

	{#if loading}
		<div class="surface animate-pulse p-8">
			<div class="h-7 w-2/5 rounded bg-gray-200"></div>
			<div class="mt-6 h-28 rounded bg-gray-100"></div>
			<div class="mt-5 grid gap-4 md:grid-cols-2"><div class="h-64 rounded bg-gray-100"></div><div class="h-64 rounded bg-gray-100"></div></div>
		</div>
	{:else if group && entry}
		<section class="surface" aria-labelledby="case-heading" aria-busy={deciding}>
			<div class="border-b border-gray-200 px-6 py-5">
				<div class="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p class="text-xs font-semibold uppercase tracking-wide text-indigo-700">
							{selectedPhase?.label} · {group.decision_scope === 'occurrence' ? m.validation_occurrence_scope() : m.validation_occurrences({ count: group.occurrence_count })}
						</p>
						<h2 bind:this={caseHeading} tabindex="-1" id="case-heading" class="mt-2 max-w-4xl text-xl font-bold leading-snug text-gray-950 focus:outline-none">{question}</h2>
					</div>
					<div class="text-right text-xs text-gray-500">
						<div>{m.validation_first_occurrence({ date: fmtDate(entry.created_at) })}</div>
						<div class="mt-1">{m.validation_evidence_status({ status: entry.evidence_status === 'complete' ? m.validation_evidence_complete() : entry.evidence_status === 'partial' ? m.validation_evidence_partial() : m.validation_evidence_pending() })}</div>
					</div>
				</div>
				{#if group.phase === 'external_audit' || group.risk_flags.length}
					<div class="mt-4 flex flex-wrap gap-2">
						{#if group.is_external_sample}<span class="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">{m.validation_low_risk()}</span>{/if}
						{#each group.risk_flags as flag}<span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{riskLabels[flag] ?? flag}</span>{/each}
					</div>
				{/if}
			</div>

			<div class="space-y-8 p-6">
				{#if group.is_automatic_audit}
					<div class="border-l-4 border-sky-500 bg-sky-50 px-4 py-3 text-sm text-sky-950" role="note">
						<p class="font-semibold">{m.validation_control_sample_title()}</p>
						<p class="mt-1">{m.validation_control_sample_help()}</p>
					</div>
				{/if}
				{#if group.risk_flags.includes('possible_duplicate_profile')}
					<div class="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
						<p class="font-semibold">{m.validation_duplicates_first()}</p>
						<p class="mt-1">{m.validation_duplicates_first_help()}</p>
						<p class="mt-1">{m.validation_merge_warning()}</p>
						<a href={group.duplicate_review_id ? `/validation/duplicates?duplicate_id=${group.duplicate_review_id}` : '/validation/duplicates'} class="mt-3 inline-flex font-semibold text-amber-900 underline hover:text-amber-700">{m.validation_go_duplicate()}</a>
					</div>
				{/if}
				{#if group.proposed_external_person}
					<section class="border-y border-emerald-200 bg-emerald-50/50 px-4 py-4" aria-labelledby="validation-external-person-title">
						<p class="text-xs font-semibold uppercase tracking-wide text-emerald-800">{m.validation_identified_external_label()}</p>
						<div class="mt-1 flex flex-wrap items-start justify-between gap-4">
							<div><h3 id="validation-external-person-title" class="text-lg font-semibold text-gray-950">{group.proposed_external_person.display_name}</h3><p class="mt-1 text-sm text-gray-700">{m.validation_identified_external_help()}</p>{#if group.proposed_external_person.affiliations_at_publication.length}<p class="mt-2 text-sm text-gray-700">{m.validation_identified_external_affiliation({ affiliation: group.proposed_external_person.affiliations_at_publication.join(' · ') })}</p>{/if}<a href={group.proposed_external_person.profile_url} target="_blank" rel="noreferrer" class="mt-2 inline-block text-sm font-medium text-indigo-700 hover:underline">{m.validation_open_openalex_profile()}</a></div>
							<button onclick={openExternalDialog} disabled={deciding || !group.can_decide} class="rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-40">{m.validation_confirm_identified_external()}</button>
						</div>
					</section>
				{/if}
				<div>
					<div class="flex flex-wrap items-end justify-between gap-3">
						<div>
							<h3 class="text-base font-semibold text-gray-900">{group.decision_scope === 'occurrence' ? m.validation_publication_evaluated() : m.validation_representative_publications()}</h3>
							<p class="mt-1 text-sm text-gray-600">{group.decision_scope === 'occurrence' ? m.validation_publication_evaluated_help() : m.validation_representative_help()}</p>
						</div>
						{#if group.decision_scope === 'group' || group.related_occurrence_count > 0}
							<button onclick={toggleOccurrences} class="text-sm font-medium text-indigo-700 hover:underline">{occurrencesOpen ? m.validation_hide_occurrences() : group.decision_scope === 'occurrence' ? m.validation_related_occurrences({ count: group.related_occurrence_count }) : m.validation_view_occurrences({ count: group.occurrence_count })}</button>
						{/if}
					</div>
					<div class="mt-3 divide-y border-y border-gray-200">
						{#each group.representative_occurrences as occurrence}
							{#if occurrence.source_context?.publication}
								<article class="py-3">
									<a href={`/publications/${occurrence.source_context.publication.id}`} target="_blank" rel="noreferrer" class="font-semibold text-gray-900 hover:text-indigo-700 hover:underline">{occurrence.source_context.publication.title}</a>
									<p class="mt-1 text-xs text-gray-500">{occurrence.source_context.publication.publication_year ?? m.validation_unknown_year()}{#if occurrence.source_context.publication.venue} · {occurrence.source_context.publication.venue}{/if}</p>
									{#if occurrence.source_context.authorships.length}
										<div class="mt-2 flex flex-wrap items-center gap-1 text-xs text-gray-600">
										<span class="font-semibold">{m.validation_signers()}</span>
											{#each occurrence.source_context.authorships as item, authorIndex}
											<span class={item.is_target_signature ? 'rounded bg-amber-100 px-1 font-bold text-amber-900' : ''}>{item.name ?? m.validation_name_unavailable()}</span>{#if authorIndex < occurrence.source_context.authorships.length - 1}<span aria-hidden="true">,</span>{/if}
											{/each}
										</div>
									{/if}
									{#each occurrence.primary_source_evidence ?? [] as primary}
										<div class="mt-2 border-l-2 {primary.status === 'confirmed' ? 'border-emerald-500 text-emerald-900' : primary.status === 'conflict' ? 'border-amber-500 text-amber-900' : 'border-gray-300 text-gray-600'} pl-2 text-xs">
										<span class="font-semibold">{primary.status === 'confirmed' ? m.validation_primary_confirmed() : primary.status === 'conflict' ? m.validation_primary_conflict() : m.validation_primary_found()}</span>
											<span> · {primary.source.replaceAll('_', ' ')}</span>
										{#if primary.endpoint}<a href={primary.endpoint} target="_blank" rel="noreferrer" class="ml-2 font-semibold underline">{m.validation_open_source()}</a>{/if}
										</div>
									{/each}
								</article>
							{:else}
								<article class="py-3 text-sm text-amber-800">{m.validation_no_source_publication()}</article>
							{/if}
						{/each}
					</div>

					{#if occurrencesOpen}
						<div class="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
							{#if occurrencesLoading && !occurrenceItems.length}
								<p class="text-sm text-gray-500">{m.validation_loading_occurrences()}</p>
							{:else}
								<p class="mb-3 text-xs text-gray-500">{group.decision_scope === 'occurrence' ? m.validation_related_help() : m.validation_showing_occurrences({ shown: occurrenceItems.length, total: occurrenceTotal })}</p>
								<ul class="max-h-80 space-y-2 overflow-y-auto">
									{#each occurrenceItems as occurrence}
										<li class="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm">
											<div class="min-w-0">
											{#if occurrence.entry.source_context?.publication}
												<a href={`/publications/${occurrence.entry.source_context.publication.id}`} target="_blank" rel="noreferrer" class="font-medium text-indigo-800 hover:underline">{occurrence.entry.source_context.publication.title}</a>
												<span class="ml-2 text-xs text-gray-500">{occurrence.entry.source_context.publication.publication_year ?? 's. f.'}</span>
											{:else}
												<span class="text-amber-700">{m.validation_no_source_case({ id: occurrence.entry.id })}</span>
											{/if}
											</div>
											{#if occurrence.is_current}<span class="shrink-0 text-xs font-medium text-gray-500">{m.validation_current_occurrence()}</span>{:else}<button onclick={() => void openRelatedOccurrence(occurrence)} class="shrink-0 text-xs font-semibold text-indigo-700 hover:underline">{m.validation_open_occurrence()}</button>{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				</div>

				<div>
					<h3 class="text-base font-semibold text-gray-900">{m.validation_comparison()}</h3>
					<p class="mt-1 text-sm text-gray-600">{m.validation_comparison_help()}</p>
					{#if entry.candidates.length}
						<div class="mt-4 grid gap-4 {entry.candidates.length === 1 ? 'lg:grid-cols-1' : 'lg:grid-cols-2'}">
							{#each entry.candidates as candidate, index}
								{@const coverage = candidateCoverage(candidate.id)}
								<article class="flex flex-col rounded-xl border {candidate.id === group.proposed_author_id ? 'border-indigo-300 ring-2 ring-indigo-50' : 'border-gray-200'} p-5">
									<div class="flex items-start gap-3">
										{#if candidate.image_url}<img src={candidate.image_url} alt="" class="h-12 w-12 rounded-full bg-gray-100 object-cover" />{:else}<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-700">{candidate.canonical_name.charAt(0)}</div>{/if}
										<div class="min-w-0">
											<div class="flex flex-wrap items-center gap-2">
												<h4 class="font-bold text-gray-950">{candidate.canonical_name}</h4>
										{#if candidate.id === group.proposed_author_id}<span class="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">{m.validation_suggested()}</span>{/if}
											</div>
											{#if candidate.affiliation}<p class="mt-1 text-sm text-gray-600">{candidate.affiliation}</p>{/if}
									<div class="mt-2 flex gap-3 text-xs"><a href={`/authors/${candidate.id}`} target="_blank" rel="noreferrer" class="font-semibold text-indigo-700 hover:underline">{m.validation_profile()}</a>{#if candidate.profile_url}<a href={candidate.profile_url} target="_blank" rel="noreferrer" class="text-gray-600 hover:underline">Scholar</a>{/if}</div>
										</div>
									</div>

									<div class="mt-4 flex flex-wrap gap-2" aria-label={m.validation_evidence_coverage()}>
										{#if coverage}
											<span class="rounded-full bg-teal-100 px-2 py-1 text-xs font-semibold text-teal-800">{m.validation_primary_source({ confirmed: coverage.primary_source_confirmed_count, total: coverage.occurrence_count })}</span>
											<span class="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">Scholar {coverage.scholar_confirmed_count}/{coverage.occurrence_count}</span>
											<span class="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800">OpenAlex {coverage.openalex_confirmed_count}/{coverage.occurrence_count}</span>
											<span class="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">{m.validation_visible_signature({ confirmed: coverage.target_signature_count, total: coverage.occurrence_count })}</span>
											{#if coverage.primary_source_conflict_count}<span class="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">{m.validation_primary_conflicts({ count: coverage.primary_source_conflict_count })}</span>{/if}
										{/if}
									</div>

									<div class="mt-4 rounded-lg bg-gray-50 p-3">
									<div class="flex items-center justify-between"><span class="text-xs text-gray-500">{group.decision_scope === 'occurrence' ? m.validation_occurrence_signals() : m.validation_range()}</span><span class="text-sm font-bold text-gray-900">{scoreRange(coverage)}</span></div>
									<p class="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{m.validation_representative_detail()}</p>
										<dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
										<dt class="text-gray-500">{m.validation_name_match()}</dt><dd class="text-right font-medium">{signal(candidate.name_score)}</dd>
										<dt class="text-gray-500">{m.validation_topic_similarity()}</dt><dd class="text-right font-medium">{signal(candidate.topic_similarity)}</dd>
										<dt class="text-gray-500">{m.validation_coauthor_connection()}</dt><dd class="text-right font-medium">{signal(candidate.coauthor_score)}</dd>
										<dt class="text-gray-500">{m.validation_temporal()}</dt><dd class="text-right font-medium">{signal(candidate.temporal_score)}</dd>
										</dl>
									</div>

									<div class="mt-4">
										<h5 class="text-xs font-semibold uppercase tracking-wide text-gray-500">{m.validation_topics_career()}</h5>
										<p class="mt-1 text-sm text-gray-700">{candidate.evidence.profile_summary_es ?? m.validation_summary_pending()}</p>
										<div class="mt-2 flex flex-wrap gap-1">{#each (candidate.evidence.topics ?? []).slice(0, 5) as topic}<span class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{topic.name}</span>{/each}</div>
										<p class="mt-2 text-xs text-gray-500">{m.validation_profile_stats({ publications: candidate.publications_count, citations: candidate.base_citations, firstYear: candidate.evidence.activity?.first_year ?? '—', lastYear: candidate.evidence.activity?.last_year ?? '—' })}</p>
									</div>

									<div class="mt-4 grid gap-4 sm:grid-cols-2">
										<div>
											<h5 class="text-xs font-semibold uppercase tracking-wide text-gray-500">{m.validation_related_publications()}</h5>
											{#if candidate.evidence.related_publications?.length}
												<ul class="mt-2 space-y-2">{#each candidate.evidence.related_publications.slice(0, 3) as publication}<li><a href={`/publications/${publication.id}`} target="_blank" rel="noreferrer" class="text-sm font-medium text-indigo-800 hover:underline">{publication.title}</a><div class="text-xs text-gray-500">{publication.publication_year ?? '—'} · {m.validation_topic_signal({ value: signal(publication.similarity) })}</div></li>{/each}</ul>
											{:else}<p class="mt-2 text-sm text-gray-500">{m.validation_no_comparable()}</p>{/if}
										</div>
										<div>
											<h5 class="text-xs font-semibold uppercase tracking-wide text-gray-500">{m.validation_source_coauthors()}</h5>
											{#if sourceCoauthors(candidate).length}
												<ul class="mt-2 space-y-2">{#each sourceCoauthors(candidate).slice(0, 4) as coauthor}<li class="text-sm text-gray-700"><span class="font-medium">{coauthor.name}</span><div class="text-xs text-gray-500">{m.validation_shared_publications({ count: coauthor.shared_publications_count })}</div></li>{/each}</ul>
											{:else}<p class="mt-2 text-sm text-gray-500">{m.validation_no_coauthor_connection()}</p>{/if}
										</div>
									</div>

									{#each candidate.evidence.warnings ?? [] as warning}<p class="mt-4 rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-800">{warning.message}</p>{/each}

									<div class="mt-auto pt-5">
										<button onclick={() => requestCandidateDecision(candidate)} disabled={deciding || !group.can_decide || candidate.evidence_status !== 'complete'} aria-keyshortcuts={index < 9 ? `${index + 1}` : undefined} class="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">
											{group.decision_scope === 'occurrence' ? m.validation_confirm_candidate_occurrence({ name: candidate.canonical_name }) : m.validation_confirm_candidate({ name: candidate.canonical_name, count: group.occurrence_count })}
										</button>
										{#if group.alias_eligibility[candidate.id]?.eligible}
											<p class="mt-2 text-center text-xs text-gray-500">{group.decision_scope === 'occurrence' ? m.validation_occurrence_no_alias() : m.validation_alias_option()}</p>
										{:else if group.alias_eligibility[candidate.id]?.reason}
											<p class="mt-2 text-center text-xs text-gray-500">{m.validation_no_alias({ reason: group.alias_eligibility[candidate.id].reason ?? '' })}</p>
										{/if}
									</div>
								</article>
							{/each}
						</div>
					{:else}
						<div class="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
							{m.validation_no_preselected()}
						</div>
					{/if}
				</div>

				<div class="grid gap-6 border-t border-gray-100 pt-6 lg:grid-cols-[1fr_420px]">
					<div>
						<h3 class="text-sm font-semibold text-gray-900">{m.validation_search_other()}</h3>
						<p class="mt-1 text-xs text-gray-500">{group.decision_scope === 'occurrence' ? m.validation_search_other_help_occurrence() : m.validation_search_other_help()}</p>
						<div class="mt-3 flex gap-2">
							<input bind:value={authorQuery} oninput={clearSearch} onkeydown={(event) => event.key === 'Enter' && void searchAuthors()} disabled={!group.can_decide} placeholder={m.validation_search_placeholder()} class="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100" />
							<button onclick={() => void searchAuthors()} disabled={searching || authorQuery.trim().length < 2 || !group.can_decide} class="rounded-lg border border-indigo-200 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">{searching ? m.common_searching() : m.common_search()}</button>
						</div>
						{#if searchResults.length || externalSearchResults.length}
							<div class="mt-3 max-h-72 overflow-y-auto rounded-lg border border-gray-200">
								{#each searchResults as author}
									<div class="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-3 last:border-0">
										<div class="min-w-0 text-sm"><div class="font-semibold text-gray-900">{author.canonical_name}</div>{#if author.affiliation}<div class="text-xs text-gray-500">{author.affiliation}</div>{/if}</div>
										<button onclick={() => void compareAuthor(author)} disabled={comparingAuthorId !== null} class="shrink-0 rounded-md px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">{comparingAuthorId === author.id ? m.validation_comparing() : m.validation_compare_group()}</button>
									</div>
								{/each}
								{#if externalSearchResults.length}<p class="border-y border-gray-200 bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">{m.validation_external_search_results()}</p>{/if}
								{#each externalSearchResults as person}
									<div class="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-3 last:border-0">
										<div class="min-w-0 text-sm"><div class="font-semibold text-gray-900">{person.display_name}</div>{#if person.last_known_institutions.length}<div class="text-xs text-gray-500">{person.last_known_institutions.join(' · ')}</div>{/if}</div>
										<button onclick={() => void chooseExternalSearchResult(person)} disabled={deciding} class="shrink-0 rounded-md px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40">{m.validation_use_external_identity()}</button>
									</div>
								{/each}
							</div>
						{:else if searchedQuery}
							<p class="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{m.validation_no_active_authors({ query: searchedQuery })}</p>
						{/if}
					</div>

					<aside class="space-y-4">
						<button onclick={() => (showNote = !showNote)} class="text-sm font-medium text-indigo-700 hover:underline">{showNote ? m.validation_hide_note() : m.validation_add_note()}</button>
						{#if showNote}<textarea bind:value={note} maxlength="1000" rows="3" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder={m.validation_note_placeholder()}></textarea>{/if}
						<button onclick={deferCurrentGroup} disabled={deciding || !group.can_decide} class="w-full rounded-lg border border-violet-300 px-4 py-3 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-40">{queueStatus === 'deferred' ? m.validation_keep_deferred() : group.decision_scope === 'occurrence' ? m.validation_defer_occurrence() : m.validation_defer_group()}</button>
						<button onclick={openExternalDialog} disabled={deciding || !group.can_decide} aria-keyshortcuts="e" class="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">{m.validation_external()} <span class="text-xs text-slate-400">(E)</span></button>
					</aside>
				</div>
			</div>
		</section>
	{:else}
		{#if !workflow}
			<section class="empty-state px-6">
				{#if unresolvedDuplicateCount > 0}
					<h2 class="text-center text-xl font-bold text-gray-900">{m.validation_prepare_duplicates()}</h2>
					<p class="mx-auto mt-2 max-w-2xl text-center text-sm text-gray-600">{m.validation_prepare_duplicates_help({ count: unresolvedDuplicateCount })}</p>
					<div class="mt-5 text-center"><a href="/validation/duplicates" class="inline-flex rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700">{m.validation_review_duplicates()}</a></div>
				{:else if preparation?.status === 'queued' || preparation?.status === 'running'}
					<h2 class="text-center text-xl font-bold text-gray-900">{m.validation_preparing()}</h2>
					<p class="mx-auto mt-2 max-w-2xl text-center text-sm text-gray-600">{m.validation_preparing_help()}</p>
					{#if preparation.progress.total && preparation.progress.processed !== undefined}<div class="mx-auto mt-5 max-w-xl"><div class="h-2 overflow-hidden rounded-full bg-gray-100"><div class="h-full rounded-full bg-indigo-600" style={`width: ${Math.min(100, Math.round((preparation.progress.processed! / preparation.progress.total) * 100))}%`}></div></div><p class="mt-2 text-center text-xs text-gray-500">{m.validation_progress_count({ processed: preparation.progress.processed, total: preparation.progress.total, unit: preparation.progress.unit ?? m.validation_cases_unit() })}</p></div>{/if}
				{:else}
					<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-2xl text-indigo-700">2</div>
					<h2 class="mt-4 text-center text-xl font-bold text-gray-900">{m.validation_ready_new()}</h2>
					<p class="mx-auto mt-2 max-w-2xl text-center text-sm text-gray-600">{m.validation_ready_new_help()}</p>
					{#if preparation?.status === 'error' && preparation.error_message}<p class="mx-auto mt-4 max-w-2xl rounded-lg bg-red-50 p-3 text-sm text-red-700">{preparation.error_message}</p>{/if}
					<div class="mt-5 text-center"><button onclick={() => void startWorkflowPreparation()} disabled={preparingWorkflow} class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{preparingWorkflow ? m.project_starting() : m.validation_prepare_new()}</button></div>
				{/if}
			</section>
		{:else}
		<section class="empty-state px-6">
			<h2 class="text-xl font-bold text-gray-900">{queueStatus === 'deferred' ? m.validation_no_deferred() : m.validation_up_to_date()}</h2>
			<p class="mx-auto mt-2 max-w-lg text-sm text-gray-600">
				{#if workflow?.complete}
					{m.validation_complete_help()}
				{:else if workflow?.current_phase && workflow.current_phase !== viewedPhase}
					{m.validation_continue_current()}
				{:else}
					{m.validation_continue_next()}
				{/if}
			</p>
			{#if workflow?.current_phase && workflow.current_phase !== viewedPhase}
				<button onclick={() => void choosePhase(workflow!.current_phase!)} class="mt-5 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">{m.validation_go_current()}</button>
			{:else if workflow?.complete}
				<button onclick={refreshDerivedData} disabled={refreshing || !!lastDecision} class="mt-5 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">{refreshing ? m.validation_updating() : m.validation_update_derived()}</button>
			{/if}
		</section>
		{/if}
	{/if}
</div>

{#if confirmGroupOpen && pendingCandidate && group}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onclick={(event) => event.target === event.currentTarget && (confirmGroupOpen = false)}>
		<div role="dialog" aria-modal="true" aria-labelledby="group-confirm-title" class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
			<h2 id="group-confirm-title" class="text-lg font-bold text-gray-950">{m.validation_confirm_occurrences({ count: group.occurrence_count })}</h2>
			<p class="mt-2 text-sm text-gray-600">{m.validation_confirm_occurrences_help({ signature: group.display_signature, name: pendingCandidate.canonical_name })}</p>
			<ul class="mt-4 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
				{#each group.representative_occurrences as occurrence}<li>• {occurrence.source_context?.publication?.title ?? m.validation_case_without_source({ id: occurrence.id })}</li>{/each}
			</ul>
			{#if group.alias_eligibility[pendingCandidate.id]?.eligible}
				<label class="mt-4 flex items-start gap-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">
					<input type="checkbox" bind:checked={createAlias} class="mt-0.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500" />
					<span><strong>{m.validation_save_alias()}</strong> {m.validation_save_alias_help()}</span>
				</label>
			{/if}
			<div class="mt-6 flex justify-end gap-3">
				<button bind:this={cancelDialogButton} onclick={() => (confirmGroupOpen = false)} class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">{m.validation_cancel()}</button>
				<button onclick={confirmCandidate} class="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">{m.validation_confirm_occurrences({ count: group.occurrence_count })}</button>
			</div>
		</div>
	</div>
{/if}

{#if confirmExternalOpen && group}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onclick={(event) => event.target === event.currentTarget && (confirmExternalOpen = false)}>
		<div role="dialog" aria-modal="true" aria-labelledby="external-title" class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
			<h2 id="external-title" class="text-lg font-bold text-gray-950">{m.validation_verify_external_title({ count: group.occurrence_count })}</h2>
			<p class="mt-2 text-sm text-gray-600">{m.validation_verify_external_help({ signature: group.display_signature })}</p>
			{#if selectedExternalSearchResult}<div class="mt-4 border-y border-emerald-200 bg-emerald-50 px-3 py-3"><p class="text-xs font-semibold uppercase tracking-wide text-emerald-800">{m.validation_selected_external_identity()}</p><p class="mt-1 font-semibold text-gray-950">{selectedExternalSearchResult.display_name}</p>{#if selectedExternalSearchResult.last_known_institutions.length}<p class="mt-1 text-sm text-gray-600">{selectedExternalSearchResult.last_known_institutions.join(' · ')}</p>{/if}</div>{/if}
			<label class="mt-5 block text-sm font-semibold text-gray-800">
				{m.validation_main_evidence()}
				<select bind:value={externalReason} class="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 font-normal focus:outline-none focus:ring-2 focus:ring-indigo-500">
					<option value="">{m.validation_external_reason()}</option>
					{#each externalReasons as reason}<option value={reason.value}>{reason.label}</option>{/each}
				</select>
			</label>
			<div class="mt-6 flex justify-end gap-3">
				<button bind:this={cancelDialogButton} onclick={() => (confirmExternalOpen = false)} class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">{m.validation_cancel()}</button>
				<button onclick={confirmExternal} disabled={!externalReason} class="rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-40">{m.validation_confirm_external()}</button>
			</div>
		</div>
	</div>
{/if}

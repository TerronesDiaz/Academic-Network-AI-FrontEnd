<script lang="ts">
	import { goto } from '$app/navigation';
	import { onDestroy, onMount } from 'svelte';
	import { auth } from '$lib/auth';
	import {
		createBenchmarkPilot,
		deleteBenchmarkPilot,
		downloadBenchmarkArtifact,
		downloadBenchmarkPilot,
		exportBenchmarkPilot,
		finalizeBenchmarkPilot,
		getAdjacentBenchmarkPilotCase,
		getBenchmarkPredictions,
		getBenchmarkRun,
		getBenchmarkRunOptions,
		getBenchmarkPilotCaseByPosition,
		getNextBenchmarkPilotCase,
		listBenchmarkPilots,
		reopenBenchmarkPilot,
		rebaseBenchmarkPilotCatalog,
		saveBenchmarkPilotLabel,
		searchBenchmarkPilotDirectory,
		searchBenchmarkPilotExternalDirectory,
		startBenchmarkRun
	} from '$lib/api/client';
	import type {
		BenchmarkPilotCase,
		BenchmarkPilotExternalPerson,
		BenchmarkPilotExport,
		BenchmarkPilotLabel,
		BenchmarkPilotStudy,
		BenchmarkRunOptions,
		BenchmarkRunStatus,
		BenchmarkPredictionPage,
		GoldDirectoryAuthor
	} from '$lib/api/types';
	import { userError } from '$lib/i18n/errors';
	import * as m from '$lib/paraglide/messages.js';

	let pilots = $state<BenchmarkPilotStudy[]>([]);
	let pilot = $state<BenchmarkPilotStudy | null>(null);
	let current = $state<BenchmarkPilotCase | null>(null);
	let loading = $state(true);
	let working = $state(false);
	let error = $state('');
	let notice = $state('');
	let newName = $state('Piloto individual de modelos');
	let samplingSeed = $state(20260824);
	let targetSize = $state(100);
	let exportResult = $state<BenchmarkPilotExport | null>(null);
	let directoryOpen = $state(false);
	let createOpen = $state(false);
	let directoryQuery = $state('');
	let directoryResults = $state<GoldDirectoryAuthor[]>([]);
	let externalDirectoryResults = $state<BenchmarkPilotExternalPerson[]>([]);
	let directorySelection = $state<GoldDirectoryAuthor | null>(null);
	let externalDirectorySelection = $state<BenchmarkPilotExternalPerson | null>(null);
	let directorySearched = $state(false);
	let deleteTarget = $state<BenchmarkPilotStudy | null>(null);
	type AffiliationChoice = BenchmarkPilotLabel['affiliation_at_publication'];
	let affiliationChoice = $state<AffiliationChoice>('unknown');
	let suggestedAffiliation = $state<AffiliationChoice>('unknown');
	let selectedAuthorId = $state<number | null>(null);
	let selectedAuthorName = $state('');
	let selectedAuthorCurrentAffiliation = $state<string | null>(null);
	let selectedExternalPerson = $state<BenchmarkPilotExternalPerson | null>(null);
	let positionTarget = $state(1);
	let benchmarkOptions = $state<BenchmarkRunOptions | null>(null);
	let benchmarkRun = $state<BenchmarkRunStatus | null>(null);
	let benchmarkTrack = $state<'frozen' | 'native-search'>('frozen');
	let benchmarkScope = $state<'smoke' | 'full'>('smoke');
	let selectedModelIds = $state<string[]>([]);
	let benchmarkConfirmOpen = $state(false);
	let showBenchmarkConfig = $state(true);
	let benchmarkLoading = $state(false);
	let benchmarkPollTimer: ReturnType<typeof setTimeout> | null = null;
	let readonlySampleOpen = $state(false);
	let editConfirmOpen = $state(false);
	let catalogRebaseConfirmOpen = $state(false);
	let predictionInspectorOpen = $state(false);
	let predictionModelId = $state('');
	let predictionPage = $state<BenchmarkPredictionPage | null>(null);
	let predictionLoading = $state(false);
	let bylineExpanded = $state(false);
	const bylinePreviewLimit = 12;

	function useCase(value: BenchmarkPilotCase | null) {
		current = value;
		bylineExpanded = false;
		positionTarget = value?.position ?? 1;
		suggestedAffiliation = value?.evidence.affiliation_at_publication ?? 'unknown';
		affiliationChoice =
			value?.label?.affiliation_at_publication ??
			suggestedAffiliation;
		const savedAuthorId = value?.label?.label === 'author' ? value.label.canonical_author_id : null;
		const savedCandidate = value?.evidence.candidates.find(
			(candidate) => candidate.id === savedAuthorId
		);
		selectedAuthorId = savedAuthorId;
		selectedAuthorName = savedCandidate?.canonical_name ?? '';
		selectedAuthorCurrentAffiliation = savedCandidate?.affiliation ?? null;
		selectedExternalPerson =
			value?.evidence.external_identity_candidates?.find(
				(person) => person.id === value?.label?.external_person_id
			) ?? null;
	}

	function publicationBylineNames() {
		return (current?.evidence.publication?.byline ?? [])
			.map((author) => author.name.trim())
			.filter(Boolean);
	}

	function affiliationLabel(value: AffiliationChoice) {
		if (value === 'institutional') return m.pilot_affiliation_institutional();
		if (value === 'external') return m.pilot_affiliation_external();
		if (value === 'mixed') return m.pilot_affiliation_mixed();
		return m.pilot_affiliation_unknown();
	}

	function savedDecisionLabel(label: BenchmarkPilotLabel) {
		if (label.label === 'not_in_directory') {
			return label.external_person_name ?? selectedExternalPerson?.display_name ??
				m.pilot_not_in_directory_short();
		}
		if (label.label === 'insufficient_evidence') return m.pilot_insufficient_short();
		if (label.label === 'external') return m.gold_external_short();
		if (label.label === 'unresolved') return m.gold_unresolved_short();
		const candidate = current?.evidence.candidates.find(
			(item) => item.id === label.canonical_author_id
		);
		return label.canonical_author_name ?? candidate?.canonical_name ??
			m.pilot_directory_author_id({ id: label.canonical_author_id ?? 0 });
	}

	function selectAuthor(author: {
		id: number;
		canonical_name?: string;
		affiliation: string | null;
	}) {
		selectedAuthorId = author.id;
		selectedAuthorName = author.canonical_name ?? '';
		selectedAuthorCurrentAffiliation = author.affiliation;
		notice = '';
	}

	async function confirmSelectedAuthor() {
		if (selectedAuthorId === null) return;
		await saveOutcome('author', selectedAuthorId);
	}

	function sourceName(value: string) {
		if (value === 'openalex') return 'OpenAlex';
		if (value === 'crossref') return 'Crossref';
		if (value === 'datacite') return 'DataCite';
		if (value === 'google_scholar_profile') return 'Google Scholar';
		if (value.startsWith('web_')) return m.pilot_web_document();
		return value.replaceAll('_', ' ');
	}

	function textValues(value: unknown): string[] {
		if (typeof value === 'string') {
			const text = value.trim();
			return text ? [text] : [];
		}
		if (Array.isArray(value)) return value.flatMap(textValues);
		if (value && typeof value === 'object') {
			const record = value as Record<string, unknown>;
			for (const key of ['display_name', 'name', 'institution_name', 'raw_affiliation_string']) {
				const texts = textValues(record[key]);
				if (texts.length) return texts;
			}
		}
		return [];
	}

	function uniqueText(values: unknown[]) {
		return [...new Set(values.flatMap(textValues))];
	}

	onMount(() => {
		if (!$auth) {
			goto('/login');
			return;
		}
		void loadPilots();
	});

	onDestroy(() => {
		if (benchmarkPollTimer) clearTimeout(benchmarkPollTimer);
	});

	function message(value: unknown, fallback: string) {
		return userError(value, fallback);
	}

	async function loadPilots(preferredId?: string) {
		loading = true;
		error = '';
		try {
			pilots = await listBenchmarkPilots();
			pilot = pilots.find((item) => item.id === preferredId) ?? pilots[0] ?? null;
			readonlySampleOpen = false;
			exportResult = pilot?.state === 'exported' && pilot.export_manifest?.snapshot_hash
				? (pilot.export_manifest as BenchmarkPilotExport)
				: null;
			useCase(pilot?.state === 'labeling' ? await getNextBenchmarkPilotCase(pilot.id) : null);
			if (pilot?.state === 'exported') await loadBenchmarkOptions(pilot.id);
		} catch (value) {
			error = message(value, m.pilot_load_error());
		} finally {
			loading = false;
		}
	}

	async function choosePilot(value: BenchmarkPilotStudy) {
		if (working) return;
		working = true;
		error = '';
		try {
			pilot = value;
			readonlySampleOpen = false;
			exportResult = value.state === 'exported' && value.export_manifest?.snapshot_hash
				? (value.export_manifest as BenchmarkPilotExport)
				: null;
			useCase(value.state === 'labeling' ? await getNextBenchmarkPilotCase(value.id) : null);
			benchmarkOptions = null;
			benchmarkRun = null;
			if (value.state === 'exported') await loadBenchmarkOptions(value.id);
			createOpen = false;
		} catch (value) {
			error = message(value, m.pilot_open_error());
		} finally {
			working = false;
		}
	}

	async function createPilot() {
		working = true;
		error = '';
		notice = '';
		try {
			const created = await createBenchmarkPilot({
				name: newName.trim(),
				sampling_seed: samplingSeed,
				target_case_count: targetSize,
				evidence_protocol: 'evidence-v2'
			});
			createOpen = false;
			notice = m.pilot_created();
			await loadPilots(created.id);
		} catch (value) {
			error = message(value, m.pilot_create_error());
		} finally {
			working = false;
		}
	}

	async function deleteSelectedPilot() {
		if (!deleteTarget || working) return;
		const target = deleteTarget;
		working = true;
		error = '';
		notice = '';
		try {
			await deleteBenchmarkPilot(target.id);
			deleteTarget = null;
			notice = m.pilot_deleted_notice({ name: target.name });
			await loadPilots();
		} catch (value) {
			error = message(value, m.pilot_delete_error());
		} finally {
			working = false;
		}
	}

	async function saveOutcome(
		label: BenchmarkPilotLabel['label'],
		canonicalAuthorId: number | null = null,
		flagged = false,
		externalPersonId: number | null = null
	) {
		if (!pilot || !current || working) return;
		working = true;
		error = '';
		try {
			const result = await saveBenchmarkPilotLabel(pilot.id, current.id, {
				label,
				canonical_author_id: label === 'author' ? canonicalAuthorId : null,
				external_person_id: label === 'not_in_directory' ? externalPersonId : null,
				rationale: current.label?.rationale ?? null,
				flagged,
				affiliation_at_publication: affiliationChoice,
				selected_source_ids: current.label?.selected_source_ids ?? []
			});
			pilot = result.study;
			pilots = pilots.map((item) => (item.id === pilot?.id ? result.study : item));
			notice = flagged ? m.pilot_flagged_notice() : m.pilot_saved_notice();
			try {
				const next = await getAdjacentBenchmarkPilotCase(pilot.id, current.id, 'next');
				useCase(next ?? (await getNextBenchmarkPilotCase(pilot.id)));
			} catch (navigationError) {
				error = message(
					navigationError,
					m.pilot_advance_error()
				);
			}
		} catch (value) {
			error = message(value, m.pilot_save_error());
		} finally {
			working = false;
		}
	}

	async function navigate(direction: 'previous' | 'next') {
		if (!pilot || !current || working) return;
		working = true;
		error = '';
		try {
			const adjacent = await getAdjacentBenchmarkPilotCase(pilot.id, current.id, direction);
			if (adjacent) useCase(adjacent);
		} catch (value) {
			error = message(value, m.pilot_navigation_error());
		} finally {
			working = false;
		}
	}

	async function jumpToNextWork() {
		if (!pilot || working) return;
		working = true;
		error = '';
		try {
			useCase(await getNextBenchmarkPilotCase(pilot.id));
		} catch (value) {
			error = message(value, m.pilot_navigation_error());
		} finally {
			working = false;
		}
	}

	async function jumpToPosition() {
		if (!pilot || working) return;
		const requestedPosition = Math.trunc(Number(positionTarget));
		if (
			!Number.isFinite(requestedPosition) ||
			requestedPosition < 1 ||
			requestedPosition > pilot.target_case_count
		) return;
		working = true;
		error = '';
		try {
			useCase(await getBenchmarkPilotCaseByPosition(pilot.id, requestedPosition));
		} catch (value) {
			error = message(value, m.pilot_navigation_error());
		} finally {
			working = false;
		}
	}

	async function openReadonlySample() {
		if (!pilot || working) return;
		working = true;
		error = '';
		try {
			useCase(await getBenchmarkPilotCaseByPosition(pilot.id, 1));
			readonlySampleOpen = true;
		} catch (value) {
			error = message(value, m.pilot_navigation_error());
		} finally {
			working = false;
		}
	}

	function closeReadonlySample() {
		readonlySampleOpen = false;
		useCase(null);
	}

	async function reopenForEditing() {
		if (!pilot || working) return;
		working = true;
		error = '';
		notice = '';
		try {
			const result = await reopenBenchmarkPilot(pilot.id);
			pilot = result.study;
			pilots = pilots.map((item) => item.id === result.study.id ? result.study : item);
			exportResult = null;
			benchmarkOptions = null;
			benchmarkRun = null;
			showBenchmarkConfig = true;
			editConfirmOpen = false;
			readonlySampleOpen = false;
			if (!current) useCase(await getBenchmarkPilotCaseByPosition(result.study.id, 1));
			notice = m.pilot_reopened_notice({ count: result.preserved_benchmark_run_count });
		} catch (value) {
			error = message(value, m.pilot_reopen_error());
		} finally {
			working = false;
		}
	}

	async function rebaseToCurrentCatalog() {
		if (!pilot || working) return;
		working = true;
		error = '';
		notice = '';
		try {
			const previousId = pilot.id;
			const result = await rebaseBenchmarkPilotCatalog(previousId);
			pilots = [
				result.study,
				...pilots.map((item) => item.id === previousId
					? { ...item, state: 'archived' as const }
					: item)
			];
			pilot = result.study;
			catalogRebaseConfirmOpen = false;
			readonlySampleOpen = false;
			exportResult = null;
			benchmarkOptions = null;
			benchmarkRun = null;
			useCase(await getNextBenchmarkPilotCase(result.study.id));
			notice = m.pilot_catalog_rebase_notice({
				carried: result.rebase.labels_carried,
				review: result.rebase.review_required,
				benchmarks: result.preserved_benchmark_run_count
			});
		} catch (value) {
			error = message(value, m.pilot_catalog_rebase_error());
		} finally {
			working = false;
		}
	}

	function showCompletionSummary() {
		useCase(null);
	}

	async function searchDirectory() {
		if (!pilot || directoryQuery.trim().length < 2) return;
		working = true;
		directorySelection = null;
		externalDirectorySelection = null;
		directorySearched = false;
		try {
			[directoryResults, externalDirectoryResults] = await Promise.all([
				searchBenchmarkPilotDirectory(pilot.id, directoryQuery.trim()),
				searchBenchmarkPilotExternalDirectory(pilot.id, directoryQuery.trim())
			]);
			directorySearched = true;
		} catch (value) {
			error = message(value, m.pilot_directory_error());
		} finally {
			working = false;
		}
	}

	async function selectDirectoryAuthor(author: GoldDirectoryAuthor) {
		directorySelection = author;
	}

	async function confirmDirectoryAuthor() {
		if (!directorySelection) return;
		selectAuthor(directorySelection);
		directoryOpen = false;
		directorySelection = null;
	}

	async function confirmExternalPerson(person = externalDirectorySelection) {
		if (!person) return;
		directoryOpen = false;
		externalDirectorySelection = null;
		selectedExternalPerson = person;
		affiliationChoice = 'external';
		await saveOutcome('not_in_directory', null, false, person.id);
	}

	async function finalize() {
		if (!pilot) return;
		working = true;
		error = '';
		try {
			pilot = await finalizeBenchmarkPilot(pilot.id);
			pilots = pilots.map((item) => (item.id === pilot?.id ? pilot : item));
			current = null;
			notice = m.pilot_finalized_notice();
		} catch (value) {
			error = message(value, m.pilot_finalize_error());
		} finally {
			working = false;
		}
	}

	async function exportSnapshot() {
		if (!pilot) return;
		working = true;
		error = '';
		try {
			exportResult = await exportBenchmarkPilot(pilot.id);
			notice = m.pilot_exported_notice();
			await loadPilots(pilot.id);
		} catch (value) {
			error = message(value, m.pilot_export_error());
		} finally {
			working = false;
		}
	}

	function benchmarkConnection(value: 'coding_plan' | 'standard_api' | 'local') {
		if (value === 'coding_plan') return m.pilot_benchmark_connection_coding();
		if (value === 'standard_api') return m.pilot_benchmark_connection_api();
		return m.pilot_benchmark_connection_local();
	}

	function benchmarkStateLabel(value: BenchmarkRunStatus['state']) {
		if (value === 'queued') return m.pilot_benchmark_status_queued();
		if (value === 'running') return m.pilot_benchmark_status_running();
		if (value === 'reporting') return m.pilot_benchmark_status_reporting();
		if (value === 'completed') return m.pilot_benchmark_status_completed();
		return m.pilot_benchmark_status_failed();
	}

	function benchmarkRunLabel(value: BenchmarkRunStatus) {
		const date = new Date(value.created_at).toLocaleString([], {
			dateStyle: 'short',
			timeStyle: 'short'
		});
		const scope = value.scope === 'smoke' ? m.pilot_benchmark_smoke() : m.pilot_benchmark_full();
		return `${date} · ${scope} · ${value.models.join(', ')}`;
	}

	function benchmarkDuration(value: BenchmarkRunStatus) {
		if (!value.started_at || !value.completed_at) return '';
		const seconds = Math.max(0, (Date.parse(value.completed_at) - Date.parse(value.started_at)) / 1000);
		if (!Number.isFinite(seconds)) return '';
		return seconds < 60 ? `${Math.round(seconds)} s` : `${(seconds / 60).toFixed(1)} min`;
	}

	function benchmarkTotalCost(value: BenchmarkRunStatus) {
		if (!value.results) return null;
		return value.results.total_cost_usd ?? Object.values(value.results.models).reduce(
			(total, model) => total + model.cost_usd,
			0
		);
	}

	function resetPredictionInspector() {
		predictionInspectorOpen = false;
		predictionModelId = '';
		predictionPage = null;
	}

	async function chooseBenchmarkRun(runId: string) {
		const selected = benchmarkOptions?.runs.find((value) => value.run_id === runId);
		if (!selected || !pilot) return;
		benchmarkRun = selected;
		resetPredictionInspector();
		showBenchmarkConfig = false;
		try {
			const refreshed = await getBenchmarkRun(pilot.id, selected.run_id);
			if (benchmarkRun?.run_id !== refreshed.run_id) return;
			benchmarkRun = refreshed;
			if (benchmarkOptions) {
				benchmarkOptions = {
					...benchmarkOptions,
					runs: benchmarkOptions.runs.map((row) => row.run_id === refreshed.run_id ? refreshed : row)
				};
			}
			if (['queued', 'running', 'reporting'].includes(refreshed.state)) {
				scheduleBenchmarkPoll(pilot.id, refreshed.run_id);
			}
		} catch (value) {
			error = message(value, m.pilot_benchmark_load_error());
		}
	}

	async function loadPredictions(modelId: string, offset = 0) {
		if (!pilot || !benchmarkRun || !modelId) return;
		predictionLoading = true;
		error = '';
		try {
			predictionModelId = modelId;
			predictionPage = await getBenchmarkPredictions(
				pilot.id,
				benchmarkRun.run_id,
				modelId,
				offset,
				10
			);
			predictionInspectorOpen = true;
		} catch (value) {
			error = message(value, m.pilot_benchmark_responses_error());
		} finally {
			predictionLoading = false;
		}
	}

	function openPredictionInspector() {
		if (!benchmarkRun) return;
		void loadPredictions(predictionModelId || benchmarkRun.models[0]);
	}

	function prettyJson(value: Record<string, unknown> | null) {
		return value ? JSON.stringify(value, null, 2) : '';
	}

	function predictionApiStatus(value: 'success' | 'error') {
		return value === 'success'
			? m.pilot_benchmark_api_success()
			: m.pilot_benchmark_api_failed();
	}

	function predictionEvaluationLabel(value: BenchmarkPredictionPage['items'][number]) {
		if (value.evaluation?.status === 'correct') return m.pilot_benchmark_answer_correct();
		if (value.evaluation?.status === 'incorrect') return m.pilot_benchmark_answer_incorrect();
		if (value.evaluation?.status === 'invalid') return m.pilot_benchmark_answer_invalid();
		return m.pilot_benchmark_answer_unavailable();
	}

	function predictionMismatchLabel(value: BenchmarkPredictionPage['items'][number]) {
		const fields = value.evaluation?.mismatch_fields ?? [];
		if (fields.length === 1 && fields[0] === 'affiliation_at_publication') {
			return m.pilot_benchmark_mismatch_affiliation();
		}
		if (fields.includes('author_id') || fields.includes('decision')) {
			return m.pilot_benchmark_mismatch_identity();
		}
		return m.pilot_benchmark_mismatch_other();
	}

	function benchmarkAnswerLabel(
		answer: Record<string, unknown> | null,
		item: BenchmarkPredictionPage['items'][number]
	) {
		if (!answer) return m.pilot_benchmark_no_valid_decision();
		const decision = String(answer.decision ?? '');
		let label = decision;
		if (decision === 'author' || decision === 'match') {
			const authorId = String(answer.author_id ?? '');
			label = item.candidate_names?.[authorId] ?? m.pilot_directory_author_id({ id: Number(authorId || 0) });
		} else if (decision === 'not_in_directory') label = m.pilot_not_in_directory_short();
		else if (decision === 'insufficient_evidence' || decision === 'ambiguous') label = m.pilot_insufficient_short();
		else if (decision === 'confirmed_external' || decision === 'external') label = m.gold_external_short();
		else if (decision === 'internal') label = m.pilot_affiliation_institutional();
		const affiliation = answer.affiliation_at_publication;
		return typeof affiliation === 'string'
			? `${label} · ${affiliationLabel(affiliation as AffiliationChoice)}`
			: label;
	}

	function benchmarkRequestsPerModel() {
		if (!benchmarkOptions) return 0;
		return benchmarkScope === 'smoke'
			? benchmarkOptions.smoke_requests_per_model
			: benchmarkOptions.full_requests_per_model;
	}

	function benchmarkRequestCount() {
		return benchmarkRequestsPerModel() * selectedModelIds.length;
	}

	function benchmarkModelAvailable(model: BenchmarkRunOptions['models'][number]) {
		return model.configured && (benchmarkTrack !== 'native-search' || model.native_search_configured);
	}

	function selectedModelsCanRun() {
		if (!benchmarkOptions) return false;
		return selectedModelIds.every((id) => {
			const model = benchmarkOptions?.models.find((value) => value.id === id);
			return !!model && benchmarkModelAvailable(model);
		});
	}

	function toggleBenchmarkModel(modelId: string) {
		selectedModelIds = selectedModelIds.includes(modelId)
			? selectedModelIds.filter((value) => value !== modelId)
			: [...selectedModelIds, modelId];
	}

	async function loadBenchmarkOptions(studyId: string) {
		benchmarkLoading = true;
		try {
			resetPredictionInspector();
			benchmarkOptions = await getBenchmarkRunOptions(studyId);
			const configured = benchmarkOptions.models.filter((model) => model.configured);
			const preferred = configured.filter((model) => ['glm-5.3-flash', 'glm-5.3'].includes(model.id));
			selectedModelIds = (preferred.length ? preferred : configured.slice(0, 2)).map((model) => model.id);
			benchmarkRun = benchmarkOptions.runs[0] ?? null;
			showBenchmarkConfig = benchmarkRun === null;
			if (benchmarkRun && ['queued', 'running', 'reporting'].includes(benchmarkRun.state)) {
				scheduleBenchmarkPoll(studyId, benchmarkRun.run_id);
			}
		} catch (value) {
			error = message(value, m.pilot_benchmark_load_error());
		} finally {
			benchmarkLoading = false;
		}
	}

	function scheduleBenchmarkPoll(studyId: string, runId: string) {
		if (benchmarkPollTimer) clearTimeout(benchmarkPollTimer);
		benchmarkPollTimer = setTimeout(() => void pollBenchmark(studyId, runId), 1500);
	}

	async function pollBenchmark(studyId: string, runId: string) {
		try {
			const value = await getBenchmarkRun(studyId, runId);
			if (pilot?.id !== studyId) return;
			benchmarkRun = value;
			if (benchmarkOptions) {
				benchmarkOptions = {
					...benchmarkOptions,
					runs: benchmarkOptions.runs.map((row) => row.run_id === value.run_id ? value : row)
				};
			}
			if (['queued', 'running', 'reporting'].includes(value.state)) {
				scheduleBenchmarkPoll(studyId, runId);
			}
		} catch (value) {
			if (pilot?.id === studyId) error = message(value, m.pilot_benchmark_poll_error());
		}
	}

	async function confirmBenchmarkRun() {
		if (!pilot || selectedModelIds.length === 0 || working) return;
		working = true;
		error = '';
		try {
			resetPredictionInspector();
			benchmarkRun = await startBenchmarkRun(pilot.id, {
				models: selectedModelIds,
				track: benchmarkTrack,
				scope: benchmarkScope
			});
			if (benchmarkOptions) {
				benchmarkOptions = {
					...benchmarkOptions,
					runs: [benchmarkRun, ...benchmarkOptions.runs.filter((value) => value.run_id !== benchmarkRun?.run_id)]
				};
			}
			benchmarkConfirmOpen = false;
			showBenchmarkConfig = false;
			notice = m.pilot_benchmark_run_notice();
			scheduleBenchmarkPoll(pilot.id, benchmarkRun.run_id);
		} catch (value) {
			error = message(value, m.pilot_benchmark_start_error());
		} finally {
			working = false;
		}
	}

	async function downloadResult(artifact: 'report' | 'comparison' | 'summary') {
		if (!pilot || !benchmarkRun) return;
		try {
			await downloadBenchmarkArtifact(pilot.id, benchmarkRun.run_id, artifact);
		} catch (value) {
			error = message(value, m.pilot_benchmark_load_error());
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (deleteTarget || benchmarkConfirmOpen || editConfirmOpen || catalogRebaseConfirmOpen) {
			if (benchmarkConfirmOpen && event.key === 'Escape' && !working) benchmarkConfirmOpen = false;
			if (editConfirmOpen && event.key === 'Escape' && !working) editConfirmOpen = false;
			if (catalogRebaseConfirmOpen && event.key === 'Escape' && !working) catalogRebaseConfirmOpen = false;
			if (event.key === 'Escape' && !working) deleteTarget = null;
			return;
		}
		if (!current || !pilot || working || directoryOpen) return;
		const target = event.target as HTMLElement | null;
		if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
		if (readonlySampleOpen) {
			if (event.key === 'ArrowLeft') {
				event.preventDefault();
				void navigate('previous');
			} else if (event.key === 'ArrowRight') {
				event.preventDefault();
				void navigate('next');
			}
			return;
		}
		if (pilot.state !== 'labeling') return;
		const number = Number(event.key);
		if (number >= 1 && number <= current.evidence.candidates.length) {
			event.preventDefault();
			selectAuthor(current.evidence.candidates[number - 1]);
		} else if (event.key.toLowerCase() === 'n') {
			event.preventDefault();
			void saveOutcome('not_in_directory');
		} else if (event.key.toLowerCase() === 'i') {
			event.preventDefault();
			void saveOutcome('insufficient_evidence');
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			void navigate('previous');
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			void navigate('next');
		}
	}
</script>

<svelte:head><title>{m.gold_quick_sample()} | Academic Network</title></svelte:head>
<svelte:window onkeydown={handleKeydown} />

<div class="app-page">
	<a href="/validation" class="text-sm text-gray-600 hover:text-indigo-700 hover:underline">{m.gold_back_review()}</a>
	<header class="page-header">
		<div>
			<h1 class="page-heading">{m.pilot_benchmark()}</h1>
			<p class="page-description">{m.pilot_intro()}</p>
		</div>
		<nav class="flex gap-5 text-sm" aria-label={m.gold_modes_label()}>
			<a href="/validation/gold" class="tab">{m.gold_formal()}</a>
			<a href="/validation/gold/pilot" aria-current="page" class="tab tab-active">{m.gold_quick_sample()}</a>
		</nav>
	</header>

	{#if error}<div role="alert" class="notice-error">{error}</div>{/if}
	{#if notice}<div role="status" class="notice-success">{notice}</div>{/if}

	{#if loading}
		<div class="empty-state">{m.pilot_loading()}</div>
	{:else if pilots.length === 0}
		<section class="grid gap-6 border-t pt-6 lg:grid-cols-[1.1fr_0.9fr]">
			<div class="surface p-6">
				<h2 class="text-xl font-semibold">{m.pilot_three_steps()}</h2>
				<ol class="mt-5 space-y-4 text-sm text-gray-700">
					<li><strong>1.</strong> {m.pilot_step_freeze()}</li>
					<li><strong>2.</strong> {m.pilot_step_label()}</li>
					<li><strong>3.</strong> {m.pilot_step_export()}</li>
				</ol>
				<p class="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{m.pilot_not_formal()}</p>
			</div>
			<form class="surface p-6" onsubmit={(event) => { event.preventDefault(); void createPilot(); }}>
				<h2 class="text-lg font-semibold">{m.pilot_generate()}</h2>
				<label for="pilot-name" class="mt-4 block text-sm font-medium">{m.pilot_name()}</label>
				<input id="pilot-name" bind:value={newName} class="mt-1 w-full rounded-lg border px-3 py-2" />
				<label for="pilot-size" class="mt-4 block text-sm font-medium">{m.pilot_occurrences()}</label>
				<input id="pilot-size" type="number" min="10" max="500" bind:value={targetSize} class="mt-1 w-full rounded-lg border px-3 py-2" />
				<p class="mt-1 text-xs text-gray-500">{m.pilot_distribution()}</p>
				<label for="pilot-seed" class="mt-4 block text-sm font-medium">{m.pilot_seed()}</label>
				<input id="pilot-seed" type="number" bind:value={samplingSeed} class="mt-1 w-full rounded-lg border px-3 py-2" />
				<button disabled={working} class="mt-5 w-full rounded-lg bg-indigo-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{working ? m.pilot_freezing() : m.pilot_generate_start()}</button>
			</form>
		</section>
	{:else if pilot}
		<section class="border-y border-gray-200 py-3">
			<div class="flex flex-wrap items-center gap-x-4 gap-y-3">
				<label for="pilot-selector" class="text-sm font-medium text-gray-700">{m.pilot_sample_label()}</label>
				<select id="pilot-selector" value={pilot.id} disabled={working} onchange={(event) => { const selected = pilots.find((item) => item.id === event.currentTarget.value); if (selected) void choosePilot(selected); }} class="min-w-0 max-w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm sm:min-w-72">
					{#each pilots as item}<option value={item.id}>{item.name}</option>{/each}
				</select>
				<button onclick={() => (createOpen = !createOpen)} disabled={working} class="text-sm font-medium text-indigo-700 hover:underline disabled:opacity-50">{createOpen ? m.pilot_cancel_new() : m.pilot_new()}</button>
				<div class="ml-auto flex items-center gap-4">
					{#if pilot.state !== 'labeling'}<span class="text-sm text-gray-600">{pilot.state === 'preparing' ? m.pilot_state_preparing() : pilot.state === 'completed' ? m.pilot_state_completed() : pilot.state === 'archived' ? m.pilot_state_archived() : pilot.state === 'failed' ? m.pilot_state_failed() : m.pilot_state_exported()}</span>{/if}
					<button onclick={() => (deleteTarget = pilot)} disabled={working} class="text-sm font-medium text-red-700 hover:underline disabled:opacity-40">{m.pilot_delete()}</button>
				</div>
			</div>
		</section>

		{#if createOpen}
			<form class="border-b border-gray-200 bg-gray-50 p-5" onsubmit={(event) => { event.preventDefault(); void createPilot(); }}>
				<h2 class="text-lg font-semibold">{m.pilot_generate_another()}</h2>
				<div class="mt-4 grid gap-4 md:grid-cols-3">
					<div class="md:col-span-3"><label for="pilot-name-existing" class="block text-sm font-medium">{m.pilot_name()}</label><input id="pilot-name-existing" bind:value={newName} minlength="3" maxlength="160" required class="mt-1 w-full rounded-lg border bg-white px-3 py-2" /></div>
					<div><label for="pilot-size-existing" class="block text-sm font-medium">{m.pilot_occurrences()}</label><input id="pilot-size-existing" type="number" min="10" max="500" bind:value={targetSize} class="mt-1 w-full rounded-lg border bg-white px-3 py-2" /></div>
					<div><label for="pilot-seed-existing" class="block text-sm font-medium">{m.pilot_seed_short()}</label><input id="pilot-seed-existing" type="number" min="0" max="2147483647" bind:value={samplingSeed} class="mt-1 w-full rounded-lg border bg-white px-3 py-2" /></div>
					<div class="flex items-end"><button disabled={working || newName.trim().length < 3} class="w-full rounded-lg bg-indigo-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{working ? m.pilot_freezing() : m.pilot_generate_start()}</button></div>
				</div>
			</form>
		{/if}

		{#if readonlySampleOpen && current}
			<section class="overflow-hidden rounded-lg border border-gray-200 bg-white">
				<header class="border-b border-gray-200 px-5 py-4 sm:px-6">
					<div class="flex flex-wrap items-start justify-between gap-4">
						<div>
							<p class="text-sm font-medium text-indigo-700">{m.pilot_readonly_title()}</p>
							<p class="mt-1 text-sm text-gray-500">{m.pilot_occurrence_progress({ position: current.position, total: pilot.target_case_count })}</p>
							<h2 class="mt-1 text-2xl font-semibold text-gray-950">{current.evidence.observed_signature}</h2>
							<p class="mt-2 max-w-2xl text-sm text-gray-600">{m.pilot_readonly_help()}</p>
						</div>
						<div class="flex flex-col items-end gap-3">
							<div class="flex flex-wrap justify-end gap-4"><button onclick={closeReadonlySample} class="text-sm font-semibold text-indigo-700 hover:underline">← {m.pilot_back_summary()}</button><button onclick={() => (editConfirmOpen = true)} class="text-sm font-semibold text-red-700 hover:underline">{m.pilot_edit_sample()}</button></div>
							<form class="flex items-center gap-2" onsubmit={(event) => { event.preventDefault(); void jumpToPosition(); }}>
								<label for="pilot-position-readonly" class="text-xs font-medium text-gray-700">{m.pilot_go_to_occurrence()}</label>
								<input id="pilot-position-readonly" type="number" min="1" max={pilot.target_case_count} bind:value={positionTarget} class="w-20 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-950" />
								<button disabled={working || positionTarget < 1 || positionTarget > pilot.target_case_count} class="text-sm font-semibold text-indigo-700 hover:underline disabled:opacity-40">{m.pilot_go()}</button>
							</form>
						</div>
					</div>
				</header>

				<div class="lg:grid lg:grid-cols-[minmax(19rem,0.9fr)_minmax(0,1.35fr)]">
					<aside class="border-b border-gray-200 p-5 sm:p-6 lg:border-b-0 lg:border-r">
						<h3 class="text-sm font-semibold uppercase tracking-wide text-gray-500">{m.pilot_publication_context_label()}</h3>
						{#if current.evidence.publication}
							<p class="mt-3 text-lg font-semibold leading-snug text-gray-950">{current.evidence.publication.title}</p>
							<p class="mt-2 text-sm text-gray-600">{current.evidence.publication.year ?? m.gold_unknown_year()} · {current.evidence.publication.venue ?? m.gold_source_unavailable()}</p>
							{@const bylineNames = publicationBylineNames()}
							<div class="mt-5">
								<p class="text-sm font-medium text-gray-900">{m.pilot_publication_byline()}</p>
								<p class="mt-1 text-sm leading-relaxed text-gray-700">{(bylineExpanded ? bylineNames : bylineNames.slice(0, bylinePreviewLimit)).join(', ') || m.gold_not_available_plural()}</p>
								{#if bylineNames.length > bylinePreviewLimit}<button type="button" aria-expanded={bylineExpanded} onclick={() => (bylineExpanded = !bylineExpanded)} class="mt-2 text-sm font-medium text-indigo-700 hover:underline">{bylineExpanded ? m.pilot_show_less_byline() : m.pilot_show_all_byline({ count: bylineNames.length })}</button>{/if}
							</div>
							{#if current.evidence.publication.abstract || current.evidence.publication.links.length}
								<details class="mt-5 border-t border-gray-200 pt-4"><summary class="cursor-pointer text-sm font-medium text-indigo-700">{m.pilot_reference_details()}</summary><div class="mt-3 space-y-3 text-sm text-gray-700">{#if current.evidence.publication.abstract}<p class="leading-relaxed">{current.evidence.publication.abstract}</p>{/if}{#if current.evidence.publication.links.length}<div class="flex flex-wrap gap-3">{#each current.evidence.publication.links as link}<a href={link.url} target="_blank" rel="noreferrer" class="text-indigo-700 hover:underline">{m.pilot_open_publication_record({ source: link.label })}</a>{/each}</div>{/if}</div></details>
							{/if}
						{:else}<p class="mt-3 text-sm text-gray-600">{m.pilot_evidence_insufficient()}</p>{/if}
					</aside>

					<main class="p-5 sm:p-6">
						{#if current.label}
							<section class="border-l-2 border-emerald-600 pl-4">
								<p class="text-xs font-semibold uppercase tracking-wide text-emerald-700">{m.pilot_label_saved()}</p>
								<h3 class="mt-1 text-xl font-semibold text-gray-950">{savedDecisionLabel(current.label)}</h3>
								<p class="mt-2 text-sm text-gray-700">{m.pilot_saved_affiliation({ affiliation: affiliationLabel(current.label.affiliation_at_publication ?? 'unknown') })}</p>
								{#if current.label.rationale}<p class="mt-2 text-sm leading-relaxed text-gray-600">{current.label.rationale}</p>{/if}
							</section>
						{:else}
							<p class="border-l-2 border-amber-500 pl-3 text-sm text-amber-900">{m.pilot_no_saved_decision()}</p>
						{/if}

						<h3 class="mt-7 text-sm font-semibold uppercase tracking-wide text-gray-500">{m.pilot_candidates_shown()}</h3>
						{#if current.evidence.candidates.length}
							<div class="mt-3 divide-y divide-gray-200 border-y border-gray-200">
								{#each current.evidence.candidates as candidate}
									<div class={current.label?.canonical_author_id === candidate.id ? 'bg-indigo-50 px-3 py-3' : 'px-3 py-3'}>
										<div class="flex flex-wrap items-start justify-between gap-2"><div><strong class="text-gray-950">{candidate.canonical_name}</strong><p class="mt-0.5 text-sm text-gray-600">{m.pilot_current_directory_affiliation({ affiliation: candidate.affiliation ?? m.gold_no_affiliation() })}</p><p class="mt-1 text-xs text-gray-500">{m.pilot_candidate_activity({ count: candidate.publication_count, start: candidate.publication_year_min ?? '—', end: candidate.publication_year_max ?? '—' })}</p></div>{#if current.label?.canonical_author_id === candidate.id}<span class="text-xs font-semibold text-indigo-700">{m.pilot_selected_candidate()}</span>{/if}</div>
										{#if candidate.topics.length || candidate.frequent_coauthors.length || candidate.representative_publications.length}<details class="mt-2"><summary class="cursor-pointer text-xs font-medium text-indigo-700">{m.pilot_candidate_details()}</summary><div class="mt-2 space-y-2 text-xs text-gray-700">{#if candidate.topics.length}<p><strong>{m.pilot_topics()}:</strong> {candidate.topics.slice(0, 5).map((topic) => topic.name).join(' · ')}</p>{/if}{#if candidate.frequent_coauthors.length}<p><strong>{m.pilot_coauthors()}:</strong> {candidate.frequent_coauthors.slice(0, 6).map((item) => item.name).join(' · ')}</p>{/if}{#if candidate.representative_publications.length}<ul class="space-y-1">{#each candidate.representative_publications.slice(0, 3) as publication}<li>• {String(publication.title ?? publication.name ?? '')}</li>{/each}</ul>{/if}</div></details>{/if}
									</div>
								{/each}
							</div>
						{:else}<p class="mt-3 text-sm text-gray-600">{m.pilot_no_candidates_explainer()}</p>{/if}
					</main>
				</div>

				<footer class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3 text-sm sm:px-6">
					<div class="flex gap-4"><button onclick={() => void navigate('previous')} disabled={working || current.position === 1} class="text-gray-700 hover:text-gray-950 hover:underline disabled:opacity-40">← {m.common_previous()}</button><button onclick={() => void navigate('next')} disabled={working || current.position === pilot.target_case_count} class="text-gray-700 hover:text-gray-950 hover:underline disabled:opacity-40">{m.common_next()} →</button></div>
					<button onclick={closeReadonlySample} class="font-medium text-indigo-700 hover:underline">{m.pilot_back_summary()}</button>
				</footer>
			</section>
		{:else if pilot.state === 'labeling' && current}
			<section class="overflow-hidden rounded-lg border border-gray-200 bg-white">
				<header class="border-b border-gray-200 px-5 py-4 sm:px-6">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div>
							<p class="text-sm text-gray-500">{m.pilot_occurrence_progress({ position: current.position, total: pilot.target_case_count })} · {m.pilot_pending_progress({ flagged: pilot.flagged_count, remaining: pilot.remaining_count })}</p>
							<h2 class="mt-1 text-2xl font-semibold text-gray-950">{current.evidence.observed_signature}</h2>
						</div>
						<div class="max-w-sm sm:text-right">
							<p class="text-xs text-gray-500">{m.pilot_candidates_blind()}</p>
							<form class="mt-2 flex items-center gap-2 sm:justify-end" onsubmit={(event) => { event.preventDefault(); void jumpToPosition(); }}>
								<label for="pilot-position-current" class="text-xs font-medium text-gray-700">{m.pilot_go_to_occurrence()}</label>
								<input id="pilot-position-current" type="number" min="1" max={pilot.target_case_count} bind:value={positionTarget} class="w-20 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-950" />
								<button disabled={working || positionTarget < 1 || positionTarget > pilot.target_case_count} class="text-sm font-semibold text-indigo-700 hover:underline disabled:opacity-40">{m.pilot_go()}</button>
							</form>
						</div>
					</div>
					{#if current.label}
						<div class="mt-3 border-l-2 {current.label.flagged ? 'border-amber-500 text-amber-900' : 'border-emerald-600 text-emerald-900'} pl-3 text-sm">
							<p><strong>{current.label.flagged ? m.pilot_flagged_saved() : m.pilot_label_saved()}</strong></p>
							<p class="mt-0.5">{m.pilot_saved_decision({ decision: savedDecisionLabel(current.label) })} {m.pilot_replace_warning()}</p>
							{#if (!current.label.flagged || pilot.remaining_count > 0) && (pilot.remaining_count > 0 || pilot.flagged_count > 0)}
								<button onclick={() => void jumpToNextWork()} disabled={working} class="mt-1.5 font-semibold text-indigo-700 hover:underline disabled:opacity-40">{pilot.remaining_count > 0 ? m.pilot_go_next_pending() : m.pilot_go_next_flagged()} →</button>
							{:else if pilot.remaining_count === 0 && pilot.flagged_count === 0}
								<button onclick={showCompletionSummary} disabled={working} class="mt-1.5 font-semibold text-indigo-700 hover:underline disabled:opacity-40">← {m.pilot_back_to_completion()}</button>
							{/if}
						</div>
					{/if}
				</header>

				<div class="lg:grid lg:grid-cols-[minmax(19rem,0.9fr)_minmax(0,1.35fr)]">
					<aside class="border-b border-gray-200 p-5 sm:p-6 lg:border-b-0 lg:border-r">
						<div class="lg:sticky lg:top-20">
						<h3 class="text-sm font-semibold uppercase tracking-wide text-gray-500">{m.pilot_publication_context_label()}</h3>
						{#if current.evidence.publication}
							<p class="mt-3 text-lg font-semibold leading-snug text-gray-950">{current.evidence.publication.title}</p>
							<p class="mt-2 text-sm text-gray-600">{current.evidence.publication.year ?? m.gold_unknown_year()} · {current.evidence.publication.venue ?? m.gold_source_unavailable()}</p>
							{@const bylineNames = publicationBylineNames()}
							<div class="mt-5">
								<p class="text-sm font-medium text-gray-900">{m.pilot_publication_byline()}</p>
								<p class="mt-1 text-sm leading-relaxed text-gray-700">{(bylineExpanded ? bylineNames : bylineNames.slice(0, bylinePreviewLimit)).join(', ') || m.gold_not_available_plural()}</p>
								{#if bylineNames.length > bylinePreviewLimit}<button type="button" aria-expanded={bylineExpanded} onclick={() => (bylineExpanded = !bylineExpanded)} class="mt-2 text-sm font-medium text-indigo-700 hover:underline">{bylineExpanded ? m.pilot_show_less_byline() : m.pilot_show_all_byline({ count: bylineNames.length })}</button>{/if}
							</div>

							{#if current.evidence.publication.abstract || current.evidence.publication.links.length || current.evidence.verified_sources?.length}
								<details class="mt-5 border-t border-gray-200 pt-4">
									<summary class="cursor-pointer text-sm font-medium text-indigo-700">{m.pilot_reference_details()}</summary>
									<div class="mt-4 space-y-5 text-sm">
										{#if current.evidence.publication.abstract}<div><p class="font-medium text-gray-900">{m.pilot_abstract_label()}</p><p class="mt-1 leading-relaxed text-gray-700">{current.evidence.publication.abstract}</p></div>{/if}
										{#if current.evidence.verified_sources?.length}
											<div>
												<p class="font-medium text-gray-900">{current.evidence.verified_sources.length === 1 ? m.pilot_supporting_record_one() : m.pilot_supporting_record_many({ count: current.evidence.verified_sources.length })}</p>
												<div class="mt-2 overflow-x-auto">
													<table class="w-full border-collapse text-left text-xs">
														<thead><tr class="border-b text-gray-500"><th class="py-2 pr-3 font-medium">{m.pilot_source_column()}</th><th class="py-2 pr-3 font-medium">{m.pilot_affiliations_column()}</th><th class="py-2 font-medium"><span class="sr-only">{m.pilot_open_source()}</span></th></tr></thead>
												<tbody>{#each current.evidence.verified_sources as source}<tr class="border-b border-gray-100 align-top"><td class="py-2 pr-3 font-medium text-gray-900">{sourceName(source.source)}</td><td class="py-2 pr-3 text-gray-600">{uniqueText(current.evidence.affiliation_claims ?? []).join(' · ') || m.gold_not_available_plural()}</td><td class="py-2 text-right">{#if source.url}<a class="whitespace-nowrap text-indigo-700 hover:underline" href={source.url} target="_blank" rel="noreferrer">{m.pilot_open_record_short()}</a>{/if}</td></tr>{/each}</tbody>
													</table>
												</div>
											</div>
										{/if}
										{#if current.evidence.publication.links.length}<div class="flex flex-wrap gap-x-4 gap-y-2">{#each current.evidence.publication.links as link}<a href={link.url} target="_blank" rel="noreferrer" class="text-indigo-700 hover:underline">{m.pilot_open_publication_record({ source: link.label })}</a>{/each}</div>{/if}
									</div>
								</details>
							{/if}
						{:else}
							<p class="mt-3 text-sm text-gray-600">{m.pilot_evidence_insufficient()}</p>
						{/if}
						</div>
					</aside>

					<main class="p-5 sm:p-6">
						<div>
							<p class="text-sm font-semibold text-indigo-700">{m.pilot_identity_step_number()}</p>
							<h3 class="mt-1 text-xl font-semibold text-gray-950">{m.pilot_identity_step_title()}</h3>
							<p class="mt-1 text-sm text-gray-600">{m.pilot_identity_help_short()}</p>
						</div>

						{#if current.evidence.external_identity_candidates?.length}
							<section class="mt-5 border-y border-gray-200 bg-emerald-50/40 px-4 py-4" aria-labelledby="pilot-external-identity-title">
								<p class="text-xs font-semibold uppercase tracking-wide text-emerald-800">{m.pilot_external_source_match()}</p>
								<h4 id="pilot-external-identity-title" class="mt-1 text-lg font-semibold text-gray-950">{m.pilot_external_source_title()}</h4>
								<p class="mt-1 text-sm leading-relaxed text-gray-700">{m.pilot_external_source_help()}</p>
								<div class="mt-4 divide-y divide-emerald-200 border-y border-emerald-200">
									{#each current.evidence.external_identity_candidates as person}
										<div class="py-3">
											<div class="flex flex-wrap items-start justify-between gap-3">
												<div><strong class="text-gray-950">{person.display_name}</strong>{#if person.affiliations_at_publication.length}<p class="mt-1 text-sm text-gray-700">{m.pilot_external_affiliation_reported({ affiliation: person.affiliations_at_publication.join(' · ') })}</p>{/if}<a href={person.profile_url} target="_blank" rel="noreferrer" class="mt-1 inline-block text-xs font-medium text-indigo-700 hover:underline">{m.pilot_open_external_profile()}</a></div>
												<button onclick={() => void confirmExternalPerson(person)} disabled={working} class="rounded-md bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-40">{working ? m.pilot_saving() : m.pilot_confirm_external_person()}</button>
											</div>
										</div>
									{/each}
								</div>
							</section>
						{/if}

						{#if current.evidence.candidates.length}
							<div class="mt-5 divide-y divide-gray-200 rounded-lg border border-gray-200">
								{#each current.evidence.candidates as candidate, index}
									<div class={selectedAuthorId === candidate.id ? 'bg-indigo-50/70' : 'bg-white'}>
										<label class="flex cursor-pointer items-start gap-3 p-4 hover:bg-gray-50">
											<input type="radio" name="pilot-author" value={candidate.id} checked={selectedAuthorId === candidate.id} disabled={working} onchange={() => selectAuthor(candidate)} class="mt-1 h-4 w-4 shrink-0 accent-indigo-700" />
											<span class="min-w-0 flex-1">
												<span class="flex flex-wrap items-baseline justify-between gap-2"><strong class="text-gray-950">{candidate.canonical_name}</strong><span class="font-mono text-xs text-gray-400">{index + 1}</span></span>
												<span class="mt-0.5 block text-sm text-gray-600">{m.pilot_current_directory_affiliation({ affiliation: candidate.affiliation ?? m.gold_no_affiliation() })}</span>
												<span class="mt-2 block text-sm text-gray-700">{m.pilot_candidate_activity({ count: candidate.publication_count, start: candidate.publication_year_min ?? '—', end: candidate.publication_year_max ?? '—' })}</span>
												{#if candidate.topics.length}<span class="mt-1 block text-sm text-gray-600">{m.pilot_topics()}: {candidate.topics.slice(0, 2).map((topic) => topic.name).join(' · ')}</span>{/if}
											</span>
										</label>
										{#if candidate.topics.length || candidate.frequent_coauthors.length || candidate.frequent_venues.length || candidate.representative_publications.length}
											<details class="border-t border-gray-100 px-4 py-3 pl-11">
												<summary class="cursor-pointer text-xs font-medium text-indigo-700">{m.pilot_candidate_details()}</summary>
												<div class="mt-3 space-y-3 text-xs text-gray-700">
													{#if candidate.topics.length}<div><p class="font-semibold text-gray-500">{m.pilot_topics()}</p><p class="mt-1">{candidate.topics.slice(0, 5).map((topic) => `${topic.name} (${topic.publication_count})`).join(' · ')}</p></div>{/if}
													{#if candidate.frequent_coauthors.length}<div><p class="font-semibold text-gray-500">{m.pilot_coauthors()}</p><p class="mt-1">{candidate.frequent_coauthors.slice(0, 6).map((item) => `${item.name} (${item.shared_publications_count})`).join(' · ')}</p></div>{/if}
													{#if candidate.frequent_venues.length}<div><p class="font-semibold text-gray-500">{m.pilot_venues()}</p><p class="mt-1">{candidate.frequent_venues.slice(0, 3).map((item) => item.name).join(' · ')}</p></div>{/if}
													{#if candidate.representative_publications.length}<div><p class="font-semibold text-gray-500">{m.pilot_representative_publications()}</p><ul class="mt-1 space-y-1">{#each candidate.representative_publications.slice(0, 3) as publication}<li>• {String(publication.title ?? publication.name ?? '')}{publication.publication_year ? ` (${publication.publication_year})` : ''}</li>{/each}</ul></div>{/if}
												</div>
											</details>
										{:else}<p class="border-t border-gray-100 px-4 py-3 pl-11 text-xs text-gray-500">{m.pilot_insufficient_profile()}</p>{/if}
										{#if selectedAuthorId === candidate.id}
											<section class="border-t-2 border-indigo-700 bg-white px-4 py-5 pl-11" aria-live="polite">
												<p class="text-sm font-semibold text-indigo-700">{m.pilot_affiliation_step_number()}</p>
												<h4 class="mt-1 text-lg font-semibold text-gray-950">{m.pilot_affiliation_step_title()}</h4>
												<div class="mt-4 grid gap-4 sm:grid-cols-[minmax(0,15rem)_1fr] sm:items-start">
													<div><label for={`pilot-affiliation-${candidate.id}`} class="block text-sm font-medium text-gray-900">{m.pilot_affiliation_question()}</label><select id={`pilot-affiliation-${candidate.id}`} bind:value={affiliationChoice} class="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2"><option value="institutional">{m.pilot_affiliation_institutional()}</option><option value="external">{m.pilot_affiliation_external()}</option><option value="mixed">{m.pilot_affiliation_mixed()}</option><option value="unknown">{m.pilot_affiliation_unknown()}</option></select></div>
													<div class="text-sm text-gray-600"><p>{m.pilot_affiliation_source_suggestion({ affiliation: affiliationLabel(suggestedAffiliation) })}</p>{#if selectedAuthorCurrentAffiliation}<p class="mt-2">{m.pilot_identity_affiliation_separate({ current: selectedAuthorCurrentAffiliation })}</p>{/if}</div>
												</div>
												<button onclick={() => void confirmSelectedAuthor()} disabled={working} class="mt-5 rounded-md bg-indigo-700 px-5 py-2.5 font-semibold text-white hover:bg-indigo-800 disabled:opacity-40">{working ? m.pilot_saving() : m.pilot_save_and_continue()}</button>
											</section>
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<p class="mt-5 border-l-2 border-amber-500 pl-3 text-sm text-gray-700">{m.pilot_no_candidates_explainer()}</p>
						{/if}

						{#if selectedAuthorId !== null && !current.evidence.candidates.some((candidate) => candidate.id === selectedAuthorId)}
							<section class="mt-5 border-t-2 border-indigo-700 pt-5" aria-live="polite">
								<p class="text-sm font-semibold text-indigo-700">{m.pilot_affiliation_step_number()}</p>
								<h3 class="mt-1 text-lg font-semibold text-gray-950">{m.pilot_affiliation_step_title()}</h3>
								<p class="mt-1 text-sm text-gray-600">{m.pilot_selected_person({ name: selectedAuthorName || m.pilot_other_person_selected() })}</p>
								<div class="mt-4 grid gap-4 sm:grid-cols-[minmax(0,15rem)_1fr] sm:items-start">
									<div><label for="pilot-affiliation-directory" class="block text-sm font-medium text-gray-900">{m.pilot_affiliation_question()}</label><select id="pilot-affiliation-directory" bind:value={affiliationChoice} class="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2"><option value="institutional">{m.pilot_affiliation_institutional()}</option><option value="external">{m.pilot_affiliation_external()}</option><option value="mixed">{m.pilot_affiliation_mixed()}</option><option value="unknown">{m.pilot_affiliation_unknown()}</option></select></div>
									<div class="text-sm text-gray-600"><p>{m.pilot_affiliation_source_suggestion({ affiliation: affiliationLabel(suggestedAffiliation) })}</p>{#if selectedAuthorCurrentAffiliation}<p class="mt-2">{m.pilot_identity_affiliation_separate({ current: selectedAuthorCurrentAffiliation })}</p>{/if}</div>
								</div>
								<button onclick={() => void confirmSelectedAuthor()} disabled={working} class="mt-5 rounded-md bg-indigo-700 px-5 py-2.5 font-semibold text-white hover:bg-indigo-800 disabled:opacity-40">{working ? m.pilot_saving() : m.pilot_save_and_continue()}</button>
							</section>
						{/if}

						<div class="mt-5 border-t border-gray-200 pt-4">
							<p class="text-sm font-medium text-gray-900">{m.pilot_alternative_title()}</p>
							<div class="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
								<button onclick={() => { directoryOpen = true; directorySelection = null; externalDirectorySelection = null; directorySearched = false; directoryQuery = ''; directoryResults = []; externalDirectoryResults = []; }} class="font-medium text-indigo-700 hover:underline">{m.pilot_search_other()}</button>
								<button onclick={() => void saveOutcome('not_in_directory')} disabled={working} aria-pressed={current.label?.label === 'not_in_directory'} class={current.label?.label === 'not_in_directory' ? 'font-semibold text-indigo-800 underline decoration-2 underline-offset-4' : 'text-gray-700 hover:text-gray-950 hover:underline disabled:opacity-50'}>{m.pilot_not_in_directory_short()}</button>
								<button onclick={() => void saveOutcome('insufficient_evidence')} disabled={working} aria-pressed={current.label?.label === 'insufficient_evidence'} class={current.label?.label === 'insufficient_evidence' ? 'font-semibold text-indigo-800 underline decoration-2 underline-offset-4' : 'text-gray-700 hover:text-gray-950 hover:underline disabled:opacity-50'}>{m.pilot_insufficient_short()}</button>
							</div>
						</div>

					</main>
				</div>

				<footer class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3 text-sm sm:px-6">
					<div class="flex gap-4"><button onclick={() => void navigate('previous')} disabled={working || current.position === 1} class="text-gray-700 hover:text-gray-950 hover:underline disabled:opacity-40">← {m.common_previous()}</button><button onclick={() => void navigate('next')} disabled={working || current.position === pilot.target_case_count} class="text-gray-700 hover:text-gray-950 hover:underline disabled:opacity-40">{m.common_next()} →</button></div>
					<div class="ml-auto flex items-center justify-end">
						<button onclick={() => void saveOutcome(current?.label?.label ?? (selectedAuthorId !== null ? 'author' : 'insufficient_evidence'), current?.label?.canonical_author_id ?? selectedAuthorId, true, current?.label?.external_person_id ?? null)} disabled={working} class="font-medium text-gray-600 hover:text-gray-950 hover:underline disabled:opacity-40">{m.pilot_review_later()}</button>
					</div>
				</footer>
			</section>
		{:else if pilot.state === 'labeling'}
			<section class="rounded-lg border border-gray-200 bg-white p-6 text-center sm:p-8">
				<h2 class="text-xl font-semibold">{m.pilot_capture_complete()}</h2>
				<p class="mx-auto mt-2 max-w-2xl text-gray-600">{m.pilot_capture_complete_help()}</p>
				<form class="mx-auto mt-6 flex max-w-sm flex-wrap items-end justify-center gap-2" onsubmit={(event) => { event.preventDefault(); void jumpToPosition(); }}>
					<div class="text-left"><label for="pilot-position-complete" class="block text-sm font-medium text-gray-800">{m.pilot_go_to_occurrence()}</label><input id="pilot-position-complete" type="number" min="1" max={pilot.target_case_count} bind:value={positionTarget} class="mt-1 w-28 rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-950" /></div>
					<button disabled={working || positionTarget < 1 || positionTarget > pilot.target_case_count} class="rounded-md border border-indigo-600 px-4 py-2 font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">{m.pilot_review_occurrence()}</button>
				</form>
				<div class="mt-6 border-t border-gray-200 pt-5"><button onclick={() => void finalize()} disabled={working || pilot.remaining_count > 0 || pilot.flagged_count > 0} class="rounded-md bg-indigo-700 px-5 py-2.5 font-semibold text-white hover:bg-indigo-800 disabled:opacity-40">{m.pilot_finalize()}</button></div>
			</section>
		{:else}
			<section class="overflow-hidden rounded-lg border border-gray-200 bg-white">
				<header class="border-b border-gray-200 px-5 py-5 sm:px-6">
					<div class="flex flex-wrap items-start justify-between gap-4">
						<div><p class="text-sm font-medium text-emerald-700">{m.pilot_immutable()}</p><h2 class="mt-1 text-xl font-semibold text-gray-950">{m.pilot_benchmark_title()}</h2><p class="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600">{m.pilot_benchmark_help()}</p></div>
						{#if !['preparing', 'failed'].includes(pilot.state)}<div class="flex flex-wrap gap-3"><button onclick={() => void openReadonlySample()} disabled={working} class="rounded-md border border-indigo-600 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">{m.pilot_view_sample()}</button><button onclick={() => (catalogRebaseConfirmOpen = true)} disabled={working} class="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-40">{m.pilot_catalog_rebase_action()}</button><button onclick={() => (editConfirmOpen = true)} disabled={working} class="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">{m.pilot_edit_sample()}</button></div>{/if}
					</div>
				</header>

				{#if !exportResult}
					<div class="px-5 py-6 sm:px-6">
						<p class="text-sm text-gray-600">{m.pilot_immutable_help({ count: pilot.target_case_count })}</p>
						<button onclick={() => void exportSnapshot()} disabled={working} class="mt-5 rounded-md bg-indigo-700 px-5 py-2.5 font-semibold text-white hover:bg-indigo-800 disabled:opacity-40">{m.pilot_export()}</button>
					</div>
				{:else if benchmarkLoading && !benchmarkOptions}
					<p class="px-5 py-8 text-sm text-gray-600 sm:px-6">{m.common_loading()}</p>
				{:else if benchmarkOptions}
					{#if benchmarkRun}
						<section class="border-b border-gray-200 px-5 py-6 sm:px-6" aria-live="polite">
							<div class="flex flex-wrap items-start justify-between gap-4">
								<div>
									<h3 class="text-lg font-semibold text-gray-950">{benchmarkStateLabel(benchmarkRun.state)}</h3>
									<p class="mt-1 text-sm text-gray-600">{benchmarkRun.models.join(' · ')} · {benchmarkRun.track === 'frozen' ? m.pilot_benchmark_frozen() : m.pilot_benchmark_search()}</p>
									{#if benchmarkRun.results?.rescored_after_label_change}<p class="mt-1 text-xs font-medium text-indigo-700">{m.pilot_benchmark_rescored_notice()}</p>{/if}
								</div>
								<div class="flex flex-wrap items-end gap-4">
									{#if benchmarkOptions.runs.length > 1}
										<label class="text-xs font-medium text-gray-600">{m.pilot_benchmark_run_label()}<select value={benchmarkRun.run_id} onchange={(event) => void chooseBenchmarkRun(event.currentTarget.value)} class="mt-1 block max-w-xs rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900">{#each benchmarkOptions.runs as run}<option value={run.run_id}>{benchmarkRunLabel(run)}</option>{/each}</select></label>
									{/if}
									{#if ['completed', 'failed'].includes(benchmarkRun.state)}
										<button onclick={() => (showBenchmarkConfig = !showBenchmarkConfig)} class="pb-1.5 text-sm font-semibold text-indigo-700 hover:underline">{m.pilot_benchmark_new_run()}</button>
									{/if}
								</div>
							</div>

							{#if ['queued', 'running', 'reporting'].includes(benchmarkRun.state)}
								<div class="mt-5 h-2 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuemin="0" aria-valuemax={benchmarkRun.total_requests} aria-valuenow={benchmarkRun.completed_requests}>
									<div class="h-full bg-indigo-700 transition-[width]" style={`width: ${benchmarkRun.total_requests ? Math.min(100, (benchmarkRun.completed_requests / benchmarkRun.total_requests) * 100) : 0}%`}></div>
								</div>
								<p class="mt-2 text-sm text-gray-700">{m.pilot_benchmark_progress({ completed: benchmarkRun.completed_requests, total: benchmarkRun.total_requests })}</p>
								{#if benchmarkRun.active_models?.length}
									<p class="mt-1 text-sm text-gray-500">{m.pilot_benchmark_active_models({ models: benchmarkRun.active_models.join(' · ') })}</p>
									{#each benchmarkRun.active_models as activeModel}
										{@const modelProgress = benchmarkRun.model_progress?.[activeModel]}
										{#if modelProgress}<p class="mt-1 text-xs text-gray-500">{activeModel}: {m.pilot_benchmark_model_progress({ completed: modelProgress.completed, total: modelProgress.total })}</p>{/if}
									{/each}
									<p class="mt-2 max-w-2xl text-xs leading-relaxed text-gray-500">{m.pilot_benchmark_waiting_provider()}</p>
								{:else if benchmarkRun.current_model}
									<p class="mt-1 text-sm text-gray-500">{m.pilot_benchmark_current_model({ model: benchmarkRun.current_model })}</p>
									{#if benchmarkRun.current_model_total_requests !== undefined}<p class="mt-1 text-xs text-gray-500">{m.pilot_benchmark_model_progress({ completed: benchmarkRun.current_model_completed_requests ?? 0, total: benchmarkRun.current_model_total_requests })}</p>{/if}
									<p class="mt-2 max-w-2xl text-xs leading-relaxed text-gray-500">{m.pilot_benchmark_waiting_provider()}</p>
								{/if}
							{:else if benchmarkRun.state === 'failed'}
								<p class="mt-4 border-l-2 border-red-600 pl-3 text-sm text-red-800">{benchmarkRun.error}</p>
							{:else if benchmarkRun.results}
								<div class="mt-5 flex flex-wrap gap-x-10 gap-y-3 border-y border-gray-200 py-4">
									<div><p class="text-xs font-medium uppercase tracking-wide text-gray-500">{m.pilot_benchmark_total_cost()}</p><p class="mt-1 text-xl font-semibold tabular-nums text-gray-950">${(benchmarkTotalCost(benchmarkRun) ?? 0).toFixed(6)} USD</p><p class="mt-1 text-xs text-gray-500">{m.pilot_benchmark_total_cost_help()}</p></div>
									{#if benchmarkDuration(benchmarkRun)}<div><p class="text-xs font-medium uppercase tracking-wide text-gray-500">{m.pilot_benchmark_duration_label()}</p><p class="mt-1 text-xl font-semibold tabular-nums text-gray-950">{benchmarkDuration(benchmarkRun)}</p></div>{/if}
								</div>
								<h4 class="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">{m.pilot_benchmark_results()}</h4>
								<div class="mt-3 overflow-x-auto border-y border-gray-200">
									<table class="min-w-full text-left text-sm">
										<thead class="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600"><tr><th class="px-3 py-2.5">{m.pilot_benchmark_model()}</th><th class="px-3 py-2.5 text-right">{m.pilot_benchmark_accuracy()}</th><th class="px-3 py-2.5 text-right">{m.pilot_benchmark_correct()}</th><th class="px-3 py-2.5 text-right">{m.pilot_benchmark_invalid()}</th><th class="px-3 py-2.5 text-right">{m.pilot_benchmark_latency()}</th><th class="px-3 py-2.5 text-right">{m.pilot_benchmark_reference_cost()}</th></tr></thead>
										<tbody class="divide-y divide-gray-200">
											{#each Object.entries(benchmarkRun.results.models) as [modelId, result]}
											<tr><th class="whitespace-nowrap px-3 py-3 font-semibold text-gray-950">{modelId}</th><td class="px-3 py-3 text-right font-semibold">{(result.exact_accuracy * 100).toFixed(1)}%</td><td class="px-3 py-3 text-right">{result.correct}/{result.cases}</td><td class="px-3 py-3 text-right">{result.invalid_or_error}</td><td class="px-3 py-3 text-right">{Math.round(result.latency_ms.p50)} ms</td><td class="px-3 py-3 text-right">${result.cost_usd.toFixed(4)}</td></tr>
											{/each}
										</tbody>
									</table>
								</div>
								<details class="mt-4 border-y border-gray-200 py-3">
									<summary class="cursor-pointer text-sm font-semibold text-indigo-700">{m.pilot_benchmark_technical_metrics()}</summary>
									<div class="mt-3 overflow-x-auto">
										<table class="min-w-full text-left text-xs">
											<thead class="bg-gray-50 font-semibold uppercase tracking-wide text-gray-600"><tr><th class="px-3 py-2">{m.pilot_benchmark_model()}</th><th class="px-3 py-2 text-right">{m.pilot_benchmark_requests_ok()}</th><th class="px-3 py-2 text-right">{m.pilot_benchmark_latency_p50_p95()}</th><th class="px-3 py-2 text-right">{m.pilot_benchmark_elapsed()}</th><th class="px-3 py-2 text-right">{m.pilot_benchmark_token_usage()}</th><th class="px-3 py-2 text-right">{m.pilot_benchmark_throughput()}</th><th class="px-3 py-2 text-right">{m.pilot_benchmark_projected_cost()}</th></tr></thead>
											<tbody class="divide-y divide-gray-200">{#each Object.entries(benchmarkRun.results.models) as [modelId, result]}<tr><th class="whitespace-nowrap px-3 py-2.5 font-semibold text-gray-950">{modelId}</th><td class="px-3 py-2.5 text-right">{result.successful_requests}/{result.requests}</td><td class="px-3 py-2.5 text-right">{Math.round(result.latency_ms.p50)} / {Math.round(result.latency_ms.p95)} ms</td><td class="px-3 py-2.5 text-right">{result.elapsed_seconds === undefined ? '—' : `${result.elapsed_seconds.toFixed(1)} s`}</td><td class="px-3 py-2.5 text-right">{result.usage.input_tokens} / {result.usage.output_tokens} / {result.usage.cache_read_tokens + result.usage.cache_write_tokens}</td><td class="px-3 py-2.5 text-right">{result.throughput_requests_per_second === null ? '—' : result.throughput_requests_per_second.toFixed(2)}</td><td class="px-3 py-2.5 text-right">{result.projected_cost_per_1000_usd === null ? '—' : `$${result.projected_cost_per_1000_usd.toFixed(2)}`}</td></tr>{/each}</tbody>
										</table>
									</div>
								</details>
								<div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium"><button onclick={() => void downloadResult('report')} class="text-indigo-700 hover:underline">{m.pilot_benchmark_download_report()}</button><button onclick={() => void downloadResult('comparison')} class="text-indigo-700 hover:underline">{m.pilot_benchmark_download_csv()}</button><button onclick={() => void downloadResult('summary')} class="text-indigo-700 hover:underline">{m.pilot_benchmark_download_json()}</button></div>
							{/if}

							{#if benchmarkRun.completed_requests > 0}
								<div class="mt-5 border-t border-gray-200 pt-4">
									<button onclick={predictionInspectorOpen ? () => (predictionInspectorOpen = false) : openPredictionInspector} disabled={predictionLoading} class="text-sm font-semibold text-indigo-700 hover:underline disabled:opacity-40">
										{predictionLoading ? m.common_loading() : predictionInspectorOpen ? m.pilot_benchmark_hide_responses() : m.pilot_benchmark_inspect_responses({ count: benchmarkRun.completed_requests })}
									</button>
									{#if predictionInspectorOpen}
										<div class="mt-4">
											<div class="flex flex-wrap items-end justify-between gap-4">
												<div><h4 class="text-base font-semibold text-gray-950">{m.pilot_benchmark_response_inspector()}</h4><p class="mt-1 max-w-3xl text-xs leading-relaxed text-gray-600">{m.pilot_benchmark_reasoning_scope()}</p></div>
												<label class="text-xs font-medium text-gray-600">{m.pilot_benchmark_model()}<select value={predictionModelId} onchange={(event) => void loadPredictions(event.currentTarget.value)} class="mt-1 block rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900">{#each benchmarkRun.models as model}<option value={model}>{model}</option>{/each}</select></label>
											</div>

											{#if predictionPage?.items.length}
												<div class="mt-4 divide-y divide-gray-200 border-y border-gray-200">
													{#each predictionPage.items as item}
														<details class="py-3">
																<summary class="cursor-pointer pr-3 text-sm text-gray-900"><strong>{item.observed_signature ?? item.case_id}</strong><span class="ml-2 text-gray-500">{item.publication_title ?? item.stratum} · {item.latency_ms} ms</span><span class={item.evaluation?.status === 'correct' ? 'ml-2 font-semibold text-emerald-700' : item.evaluation?.status === 'incorrect' ? 'ml-2 font-semibold text-red-700' : 'ml-2 font-semibold text-amber-700'}>{predictionEvaluationLabel(item)}</span></summary>
																	{#if item.evaluation}<div class="mt-3 border-y border-gray-200 py-3 pl-4">{#if item.evaluation.status === 'incorrect'}<p class="mb-3 text-sm font-medium text-red-800">{predictionMismatchLabel(item)}</p>{/if}<div class="grid gap-3 sm:grid-cols-2"><div><p class="text-xs font-semibold uppercase tracking-wide text-gray-500">{m.pilot_benchmark_model_answer()}</p><p class={item.evaluation.status === 'correct' ? 'mt-1 text-sm font-semibold text-emerald-800' : 'mt-1 text-sm font-semibold text-red-800'}>{benchmarkAnswerLabel(item.evaluation.model_answer, item)}</p></div><div><p class="text-xs font-semibold uppercase tracking-wide text-gray-500">{m.pilot_benchmark_correct_answer()}</p><p class="mt-1 text-sm font-semibold text-gray-950">{benchmarkAnswerLabel(item.evaluation.correct_answer, item)}</p></div></div></div>{/if}
																<div class="mt-3 grid gap-4 pl-4 text-xs text-gray-700 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
																<div class="space-y-1"><p><strong>{m.pilot_benchmark_api_status()}:</strong> {predictionApiStatus(item.status)}</p><p><strong>{m.pilot_benchmark_attempts()}:</strong> {item.attempts}</p><p><strong>finish_reason:</strong> {item.finish_reason ?? '—'}</p><p><strong>{m.pilot_benchmark_request_latency()}:</strong> {item.latency_ms} ms</p><p><strong>{m.pilot_benchmark_tokens()}:</strong> {item.usage.input_tokens ?? 0} / {item.usage.output_tokens ?? 0}</p><p><strong>{m.pilot_benchmark_reference_cost()}:</strong> ${item.cost_usd.toFixed(6)}</p>{#if item.error}<p class="mt-2 break-words text-red-800"><strong>{m.pilot_benchmark_api_error()}:</strong> {item.error}</p>{/if}{#if item.parse_error}<p class="mt-2 break-words text-red-800"><strong>{m.pilot_benchmark_parse_error()}:</strong> {item.parse_error}</p>{/if}</div>
																<div class="min-w-0 space-y-4">{#if item.returned_reasoning}<section><h5 class="font-semibold uppercase tracking-wide text-gray-500">{m.pilot_benchmark_returned_reasoning()}</h5><p class="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{item.returned_reasoning}</p></section>{/if}{#if item.parsed_response}<section><h5 class="font-semibold uppercase tracking-wide text-gray-500">{m.pilot_benchmark_parsed_response()}</h5><pre class="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 font-mono text-xs text-gray-800">{prettyJson(item.parsed_response)}</pre></section>{/if}<section><h5 class="font-semibold uppercase tracking-wide text-gray-500">{m.pilot_benchmark_raw_response()}</h5><pre class="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-gray-950 p-3 font-mono text-xs text-gray-100">{item.raw_response || m.pilot_benchmark_empty_response()}</pre></section></div>
															</div>
														</details>
													{/each}
												</div>
												<div class="mt-3 flex items-center justify-between gap-4 text-sm"><button disabled={predictionPage.offset === 0 || predictionLoading} onclick={() => void loadPredictions(predictionModelId, Math.max(0, predictionPage!.offset - predictionPage!.limit))} class="font-semibold text-indigo-700 disabled:text-gray-400">← {m.common_previous()}</button><span class="text-xs text-gray-500">{m.pilot_benchmark_response_range({ from: predictionPage.offset + 1, to: Math.min(predictionPage.total, predictionPage.offset + predictionPage.items.length), total: predictionPage.total })}</span><button disabled={predictionPage.offset + predictionPage.limit >= predictionPage.total || predictionLoading} onclick={() => void loadPredictions(predictionModelId, predictionPage!.offset + predictionPage!.limit)} class="font-semibold text-indigo-700 disabled:text-gray-400">{m.common_next()} →</button></div>
											{:else if !predictionLoading}<p class="mt-4 text-sm text-gray-600">{m.pilot_benchmark_no_responses()}</p>{/if}
										</div>
									{/if}
								</div>
							{/if}
						</section>
					{/if}

					{#if benchmarkOptions.runs.length > 1}
						<details class="border-b border-gray-200 px-5 py-4 sm:px-6">
							<summary class="cursor-pointer text-sm font-semibold text-gray-800">{m.pilot_benchmark_history({ count: benchmarkOptions.runs.length })}</summary>
							<div class="mt-3 overflow-x-auto border-y border-gray-200">
								<table class="min-w-full text-left text-sm"><thead class="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600"><tr><th class="px-3 py-2">{m.pilot_benchmark_run_date()}</th><th class="px-3 py-2">{m.pilot_benchmark_scope()}</th><th class="px-3 py-2">{m.pilot_benchmark_models()}</th><th class="px-3 py-2">{m.pilot_benchmark_status()}</th><th class="px-3 py-2"><span class="sr-only">{m.pilot_benchmark_history_action()}</span></th></tr></thead><tbody class="divide-y divide-gray-200">{#each benchmarkOptions.runs as run}<tr class={run.run_id === benchmarkRun?.run_id ? 'bg-indigo-50/60' : ''}><td class="whitespace-nowrap px-3 py-2.5">{new Date(run.created_at).toLocaleString()}</td><td class="px-3 py-2.5">{run.scope === 'smoke' ? m.pilot_benchmark_smoke() : m.pilot_benchmark_full()}</td><td class="max-w-md px-3 py-2.5">{run.models.join(' · ')}</td><td class="px-3 py-2.5">{benchmarkStateLabel(run.state)}</td><td class="px-3 py-2.5 text-right"><button disabled={run.run_id === benchmarkRun?.run_id} onclick={() => void chooseBenchmarkRun(run.run_id)} class="font-semibold text-indigo-700 hover:underline disabled:text-gray-400">{run.run_id === benchmarkRun?.run_id ? m.pilot_benchmark_selected_run() : m.pilot_benchmark_view_run()}</button></td></tr>{/each}</tbody></table>
							</div>
						</details>
					{/if}

					{#if showBenchmarkConfig}
						<div class="px-5 py-6 sm:px-6">
							<div class="grid gap-8 lg:grid-cols-2">
								<fieldset>
									<legend class="text-base font-semibold text-gray-950">1. {m.pilot_benchmark_track()}</legend>
									<label class="mt-4 flex cursor-pointer gap-3"><input type="radio" name="benchmark-track" value="frozen" bind:group={benchmarkTrack} class="mt-1 h-4 w-4 accent-indigo-700" /><span><strong class="block text-sm text-gray-950">{m.pilot_benchmark_frozen()}</strong><span class="mt-1 block text-sm leading-relaxed text-gray-600">{m.pilot_benchmark_frozen_help()}</span></span></label>
									<label class="mt-4 flex cursor-pointer gap-3"><input type="radio" name="benchmark-track" value="native-search" bind:group={benchmarkTrack} class="mt-1 h-4 w-4 accent-indigo-700" /><span><strong class="block text-sm text-gray-950">{m.pilot_benchmark_search()}</strong><span class="mt-1 block text-sm leading-relaxed text-gray-600">{m.pilot_benchmark_search_help()}</span></span></label>
								</fieldset>

								<fieldset>
									<legend class="text-base font-semibold text-gray-950">2. {m.pilot_benchmark_scope()}</legend>
									<label class="mt-4 flex cursor-pointer gap-3"><input type="radio" name="benchmark-scope" value="smoke" bind:group={benchmarkScope} class="mt-1 h-4 w-4 accent-indigo-700" /><span><strong class="block text-sm text-gray-950">{m.pilot_benchmark_smoke()}</strong><span class="mt-1 block text-sm leading-relaxed text-gray-600">{m.pilot_benchmark_smoke_help({ count: benchmarkOptions.smoke_case_count })}</span></span></label>
									<label class="mt-4 flex cursor-pointer gap-3"><input type="radio" name="benchmark-scope" value="full" bind:group={benchmarkScope} class="mt-1 h-4 w-4 accent-indigo-700" /><span><strong class="block text-sm text-gray-950">{m.pilot_benchmark_full()}</strong><span class="mt-1 block text-sm leading-relaxed text-gray-600">{m.pilot_benchmark_full_help({ count: benchmarkOptions.case_count })}</span></span></label>
								</fieldset>
							</div>

							<fieldset class="mt-8 border-t border-gray-200 pt-6">
								<legend class="text-base font-semibold text-gray-950">3. {m.pilot_benchmark_models()}</legend>
								<div class="mt-3 divide-y divide-gray-200 border-y border-gray-200">
									{#each benchmarkOptions.models as model}
										<label class={benchmarkModelAvailable(model) ? 'flex cursor-pointer items-start gap-3 py-3' : 'flex cursor-not-allowed items-start gap-3 py-3 opacity-50'}>
											<input type="checkbox" checked={selectedModelIds.includes(model.id)} disabled={!benchmarkModelAvailable(model)} onchange={() => toggleBenchmarkModel(model.id)} class="mt-1 h-4 w-4 accent-indigo-700" />
							<span class="min-w-0 flex-1"><strong class="block text-sm text-gray-950">{model.id}</strong><span class="mt-0.5 block text-xs text-gray-500">{model.provider} · {benchmarkConnection(model.connection)} · {m.pilot_benchmark_concurrency({ count: model.workers })}</span></span>
											{#if !model.configured}<span class="text-xs font-medium text-red-700">{m.pilot_benchmark_not_configured()}</span>{/if}
											{#if model.configured && benchmarkTrack === 'native-search' && !model.native_search_configured}<span class="text-xs font-medium text-red-700">{m.pilot_benchmark_search_not_configured({ requirement: model.native_search_requirement ?? 'API key' })}</span>{/if}
										</label>
									{/each}
								</div>
							</fieldset>

							<div class="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 pt-5">
								<div class="max-w-2xl"><p class="text-sm text-gray-700">{m.pilot_benchmark_request_summary({ requests: benchmarkRequestCount(), models: selectedModelIds.length, perModel: benchmarkRequestsPerModel() })}</p><p class="mt-1 text-xs leading-relaxed text-gray-500">{m.pilot_benchmark_parallel_help()}</p></div>
								<div>{#if selectedModelIds.length > 0 && !selectedModelsCanRun()}<p class="mb-2 max-w-md text-sm text-red-700">{m.pilot_benchmark_search_unavailable_help()}</p>{/if}<button onclick={() => (benchmarkConfirmOpen = true)} disabled={selectedModelIds.length === 0 || !selectedModelsCanRun() || working} class="rounded-md bg-indigo-700 px-5 py-2.5 font-semibold text-white hover:bg-indigo-800 disabled:opacity-40">{m.pilot_benchmark_review_start()}</button></div>
							</div>
						</div>
					{/if}

					<footer class="border-t border-gray-200 bg-gray-50 px-5 py-3 text-sm sm:px-6">
						<details><summary class="cursor-pointer font-medium text-gray-700">{m.pilot_benchmark_snapshot_details()}</summary><div class="mt-3 space-y-2 text-xs text-gray-600"><p><strong>{m.pilot_snapshot()}</strong> <code class="break-all">{exportResult.snapshot_hash}</code></p><p><strong>{m.pilot_path()}</strong> <code class="break-all">{exportResult.directory}</code></p><button onclick={() => pilot && void downloadBenchmarkPilot(pilot.id)} class="font-semibold text-indigo-700 hover:underline">{m.pilot_download()}</button></div></details>
					</footer>
				{/if}
			</section>
		{/if}
	{/if}
</div>

{#if directoryOpen}
	<div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="pilot-directory-title">
		<div class="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl sm:p-6">
			<div class="flex justify-between gap-4"><div><h2 id="pilot-directory-title" class="text-xl font-semibold">{m.pilot_frozen_directory()}</h2><p class="mt-1 text-sm text-gray-600">{m.pilot_directory_help()}</p></div><button onclick={() => (directoryOpen = false)} aria-label={m.common_close()} class="h-8 w-8 text-2xl leading-none text-gray-500 hover:text-gray-900">×</button></div>
			<form class="mt-5 flex gap-2" onsubmit={(event) => { event.preventDefault(); void searchDirectory(); }}><input bind:value={directoryQuery} class="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2" placeholder={m.pilot_directory_placeholder()} /><button disabled={working || directoryQuery.trim().length < 2} class="rounded-md bg-indigo-700 px-4 py-2 font-medium text-white disabled:opacity-40">{m.common_search()}</button></form>
			{#if directorySelection}
				<div class="mt-5 border-y border-gray-200 py-4"><strong>{directorySelection.canonical_name}</strong><p class="mt-1 text-sm text-gray-600">{directorySelection.affiliation ?? m.gold_no_affiliation()}</p><div class="mt-4 flex flex-wrap gap-3"><button onclick={() => (directorySelection = null)} class="text-sm text-gray-700 hover:underline">{m.pilot_back_results()}</button><button onclick={() => void confirmDirectoryAuthor()} class="rounded-md bg-indigo-700 px-4 py-2 font-semibold text-white">{m.pilot_confirm_author()}</button></div></div>
			{:else if externalDirectorySelection}
				<div class="mt-5 border-y border-gray-200 py-4"><p class="text-xs font-semibold uppercase tracking-wide text-emerald-800">{m.pilot_external_catalog_label()}</p><strong class="mt-1 block">{externalDirectorySelection.display_name}</strong><p class="mt-1 text-sm text-gray-600">{externalDirectorySelection.last_known_institutions.join(' · ') || m.gold_no_affiliation()}</p><a href={externalDirectorySelection.profile_url} target="_blank" rel="noreferrer" class="mt-2 inline-block text-sm text-indigo-700 hover:underline">{m.pilot_open_external_profile()}</a><div class="mt-4 flex flex-wrap gap-3"><button onclick={() => (externalDirectorySelection = null)} class="text-sm text-gray-700 hover:underline">{m.pilot_back_results()}</button><button onclick={() => void confirmExternalPerson()} class="rounded-md bg-indigo-700 px-4 py-2 font-semibold text-white">{m.pilot_confirm_external_person()}</button></div></div>
			{:else}
				{#if directoryResults.length || externalDirectoryResults.length}
					<div class="mt-5 space-y-5">
						{#if directoryResults.length}<section><h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">{m.pilot_directory_results_label()}</h3><div class="mt-2 divide-y divide-gray-200 border-y border-gray-200">{#each directoryResults as author}<button onclick={() => void selectDirectoryAuthor(author)} class="block w-full px-1 py-3 text-left hover:bg-gray-50"><strong>{author.canonical_name}</strong><span class="block text-sm text-gray-600">{author.affiliation ?? m.gold_no_affiliation()}</span><span class="mt-1 block text-xs font-medium text-indigo-700">{m.pilot_compare_author()}</span></button>{/each}</div></section>{/if}
						{#if externalDirectoryResults.length}<section><h3 class="text-xs font-semibold uppercase tracking-wide text-emerald-800">{m.pilot_external_results_label()}</h3><div class="mt-2 divide-y divide-gray-200 border-y border-gray-200">{#each externalDirectoryResults as person}<button onclick={() => (externalDirectorySelection = person)} class="block w-full px-1 py-3 text-left hover:bg-gray-50"><strong>{person.display_name}</strong><span class="block text-sm text-gray-600">{person.last_known_institutions.join(' · ') || m.gold_no_affiliation()}</span><span class="mt-1 block text-xs font-medium text-indigo-700">{m.pilot_compare_external_person()}</span></button>{/each}</div></section>{/if}
					</div>
				{:else if directorySearched}<p class="mt-5 border-l-2 border-gray-300 pl-3 text-sm text-gray-600">{m.pilot_directory_empty()}</p>{/if}
			{/if}
		</div>
	</div>
{/if}

{#if editConfirmOpen && pilot}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onclick={(event) => event.target === event.currentTarget && !working && (editConfirmOpen = false)}>
		<div role="dialog" aria-modal="true" aria-labelledby="pilot-edit-confirm-title" aria-describedby="pilot-edit-confirm-description" class="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl sm:p-6">
			<h2 id="pilot-edit-confirm-title" class="text-xl font-semibold text-gray-950">{m.pilot_edit_confirm_title()}</h2>
			<p id="pilot-edit-confirm-description" class="mt-2 text-sm leading-relaxed text-gray-700">{m.pilot_edit_confirm_help({ name: pilot.name })}</p>
			<p class="mt-4 border-l-2 border-indigo-500 pl-3 text-sm leading-relaxed text-gray-700">{m.pilot_edit_confirm_warning()}</p>
			<p class="mt-3 text-sm text-gray-600">{m.pilot_edit_operational_safe()}</p>
			<div class="mt-6 flex flex-wrap justify-end gap-3">
				<button onclick={() => (editConfirmOpen = false)} disabled={working} class="rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">{m.common_cancel()}</button>
				<button onclick={() => void reopenForEditing()} disabled={working} class="rounded-md bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-40">{working ? m.pilot_reopening() : m.pilot_edit_confirm()}</button>
			</div>
		</div>
	</div>
{/if}

{#if catalogRebaseConfirmOpen && pilot}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onclick={(event) => event.target === event.currentTarget && !working && (catalogRebaseConfirmOpen = false)}>
		<div role="dialog" aria-modal="true" aria-labelledby="pilot-catalog-rebase-title" class="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl sm:p-6">
			<h2 id="pilot-catalog-rebase-title" class="text-xl font-semibold text-gray-950">{m.pilot_catalog_rebase_title()}</h2>
			<p class="mt-2 text-sm leading-relaxed text-gray-700">{m.pilot_catalog_rebase_help()}</p>
			<p class="mt-4 border-l-2 border-indigo-500 pl-3 text-sm leading-relaxed text-gray-700">{m.pilot_catalog_rebase_history()}</p>
			<div class="mt-6 flex flex-wrap justify-end gap-3">
				<button onclick={() => (catalogRebaseConfirmOpen = false)} disabled={working} class="rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">{m.common_cancel()}</button>
				<button onclick={() => void rebaseToCurrentCatalog()} disabled={working} class="rounded-md bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-40">{working ? m.common_loading() : m.pilot_catalog_rebase_confirm()}</button>
			</div>
		</div>
	</div>
{/if}

{#if benchmarkConfirmOpen && benchmarkOptions}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onclick={(event) => event.target === event.currentTarget && !working && (benchmarkConfirmOpen = false)}>
		<div role="dialog" aria-modal="true" aria-labelledby="pilot-benchmark-confirm-title" class="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl sm:p-6">
			<h2 id="pilot-benchmark-confirm-title" class="text-xl font-semibold text-gray-950">{m.pilot_benchmark_confirm_title()}</h2>
			<p class="mt-2 text-sm leading-relaxed text-gray-600">{m.pilot_benchmark_confirm_help()}</p>
			<dl class="mt-5 divide-y divide-gray-200 border-y border-gray-200 text-sm">
				<div class="grid grid-cols-[9rem_1fr] gap-3 py-3"><dt class="text-gray-500">{m.pilot_benchmark_confirm_track()}</dt><dd class="font-medium text-gray-950">{benchmarkTrack === 'frozen' ? m.pilot_benchmark_frozen() : m.pilot_benchmark_search()}</dd></div>
				<div class="grid grid-cols-[9rem_1fr] gap-3 py-3"><dt class="text-gray-500">{m.pilot_benchmark_confirm_scope()}</dt><dd class="font-medium text-gray-950">{benchmarkScope === 'smoke' ? m.pilot_benchmark_smoke() : m.pilot_benchmark_full()}</dd></div>
				<div class="grid grid-cols-[9rem_1fr] gap-3 py-3"><dt class="text-gray-500">{m.pilot_benchmark_confirm_models()}</dt><dd class="font-medium text-gray-950">{selectedModelIds.join(', ')}</dd></div>
				<div class="grid grid-cols-[9rem_1fr] gap-3 py-3"><dt class="text-gray-500">{m.pilot_benchmark_confirm_requests()}</dt><dd class="font-medium text-gray-950">{benchmarkRequestCount()}</dd></div>
			</dl>
			{#if selectedModelIds.some((id) => benchmarkOptions?.models.find((model) => model.id === id)?.connection === 'coding_plan')}
				<p class="mt-4 border-l-2 border-amber-500 pl-3 text-sm leading-relaxed text-amber-900">{m.pilot_benchmark_confirm_coding()}</p>
			{/if}
			<div class="mt-6 flex flex-wrap justify-end gap-3">
				<button onclick={() => (benchmarkConfirmOpen = false)} disabled={working} class="rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">{m.common_cancel()}</button>
				<button onclick={() => void confirmBenchmarkRun()} disabled={working} class="rounded-md bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-40">{working ? m.pilot_benchmark_starting() : m.pilot_benchmark_start()}</button>
			</div>
		</div>
	</div>
{/if}

{#if deleteTarget}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onclick={(event) => event.target === event.currentTarget && !working && (deleteTarget = null)}>
		<div role="dialog" aria-modal="true" aria-labelledby="pilot-delete-title" aria-describedby="pilot-delete-description" class="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl sm:p-6">
			<h2 id="pilot-delete-title" class="text-xl font-semibold text-gray-950">{m.pilot_delete_title()}</h2>
			<p id="pilot-delete-description" class="mt-2 text-sm leading-relaxed text-gray-700">{m.pilot_delete_help({ name: deleteTarget.name, caseCount: deleteTarget.target_case_count, labelCount: deleteTarget.labeled_count })}</p>
			{#if deleteTarget.exported_at}<p class="mt-3 border-l-2 border-amber-500 pl-3 text-sm text-amber-900">{m.pilot_delete_export_help()}</p>{/if}
			<div class="mt-6 flex flex-wrap justify-end gap-3">
				<button onclick={() => (deleteTarget = null)} disabled={working} class="rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">{m.common_cancel()}</button>
				<button onclick={() => void deleteSelectedPilot()} disabled={working} class="rounded-md bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-40">{working ? m.pilot_deleting() : m.pilot_delete_confirm()}</button>
			</div>
		</div>
	</div>
{/if}

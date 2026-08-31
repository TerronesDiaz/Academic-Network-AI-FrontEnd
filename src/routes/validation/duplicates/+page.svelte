<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { auth } from '$lib/auth';
	import { getDuplicateGoldMetrics, labelAuthorMergeGold, listAuthorMerges, listAuthors, listDuplicateReviews, mergeAuthorGroup, prepareValidationWorkflow, reviewDuplicate, undoAuthorMerge, undoAuthorMergeBatch } from '$lib/api/client';
	import type { Author, AuthorMergeAudit, DuplicateReviewAuthor, DuplicateReviewEntry, DuplicateScorerMetrics } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages.js';
	import { userError } from '$lib/i18n/errors';

	let items = $state<DuplicateReviewEntry[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let note = $state('');
	let status = $state<'pending' | 'deferred'>('pending');
	let merges = $state<AuthorMergeAudit[]>([]);
	let goldMetrics = $state<DuplicateScorerMetrics | null>(null);
	let requestedDuplicateId = $state<number | null>(null);
	let mergeAuthors = $state<DuplicateReviewAuthor[]>([]);
	let initialPairIds = $state<number[]>([]);
	let canonicalAuthorId = $state<number | null>(null);
	let authorQuery = $state('');
	let searchResults = $state<Author[]>([]);
	let searching = $state(false);
	let notice = $state('');
	let pendingTotal = $state(0);
	let deferredTotal = $state(0);
	let busyTitle = $state('');
	let busyDetail = $state('');

	onMount(() => {
		if (!$auth) {
			goto('/login');
			return;
		}
		const rawDuplicateId = new URLSearchParams(window.location.search).get('duplicate_id');
		requestedDuplicateId = rawDuplicateId && /^\d+$/.test(rawDuplicateId)
			? Number(rawDuplicateId)
			: null;
		void load(true);
	});

	async function load(advanceWhenComplete = false) {
		loading = true;
		error = '';
		try {
			const [result, pending, deferred, audit, metrics] = await Promise.all([
				listDuplicateReviews(status, requestedDuplicateId),
				listDuplicateReviews('pending'),
				listDuplicateReviews('deferred'),
				listAuthorMerges(),
				getDuplicateGoldMetrics()
			]);
			pendingTotal = pending.total;
			deferredTotal = deferred.total;
			if (advanceWhenComplete && pendingTotal === 0 && deferredTotal === 0) {
				busyTitle = m.duplicates_preparing();
				busyDetail = m.duplicates_preparing_help();
				await prepareValidationWorkflow();
				await goto('/validation');
				return;
			}
			if (status === 'pending' && pendingTotal === 0 && deferredTotal > 0) {
				status = 'deferred';
				requestedDuplicateId = null;
				items = deferred.items;
				total = deferred.total;
			} else {
			items = result.items;
			total = result.total;
			}
			merges = audit;
			goldMetrics = metrics;
			note = '';
			if (items[0]) {
				mergeAuthors = [items[0].author_a, items[0].author_b];
				initialPairIds = mergeAuthors.map((author) => author.id);
				canonicalAuthorId = null;
				authorQuery = '';
				searchResults = [];
			}
		} catch (value) {
			error = userError(value, m.duplicates_load_error());
		} finally {
			loading = false;
			if (!saving) {
				busyTitle = '';
				busyDetail = '';
			}
		}
	}

	async function searchAuthors() {
		const query = authorQuery.trim();
		if (query.length < 2 || searching) return;
		searching = true;
		error = '';
		try {
			const result = await listAuthors({ search: query, active_only: true, limit: 20 });
			const selected = new Set(mergeAuthors.map((author) => author.id));
			searchResults = result.items.filter((author) => !selected.has(author.id));
		} catch (value) {
			error = userError(value, m.duplicates_search_error());
		} finally {
			searching = false;
		}
	}

	function addMergeAuthor(author: Author) {
		if (mergeAuthors.some((item) => item.id === author.id)) return;
		mergeAuthors = [...mergeAuthors, {
			id: author.id,
			canonical_name: author.canonical_name,
			affiliation: author.affiliation || null,
			scholar_user_id: author.scholar_user_id,
			profile_url: author.profile_url || null,
			publications_count: 0
		}];
		searchResults = searchResults.filter((item) => item.id !== author.id);
	}

	function removeMergeAuthor(authorId: number) {
		if (initialPairIds.includes(authorId)) return;
		mergeAuthors = mergeAuthors.filter((author) => author.id !== authorId);
		if (canonicalAuthorId === authorId) canonicalAuthorId = null;
	}

	async function mergeSelectedAuthors() {
		if (saving || mergeAuthors.length < 2 || canonicalAuthorId === null) return;
		const canonical = mergeAuthors.find((author) => author.id === canonicalAuthorId);
		if (!canonical) return;
		const message = m.duplicates_confirm_merge({ count: mergeAuthors.length, name: canonical.canonical_name });
		if (!confirm(message)) return;
		saving = true;
		busyTitle = m.duplicates_merging();
		busyDetail = m.duplicates_merging_help();
		error = '';
		try {
			const result = await mergeAuthorGroup({
				author_ids: mergeAuthors.map((author) => author.id),
				canonical_author_id: canonicalAuthorId,
				note
			});
			notice = `${m.duplicates_merge({ count: result.merged_author_ids.length })}: ${canonical.canonical_name} · ${m.duplicates_batch({ id: result.merge_batch_id })}`;
			requestedDuplicateId = null;
			await load(true);
		} catch (value) {
			error = userError(value, m.duplicates_merge_error());
		} finally {
			saving = false;
			busyTitle = '';
			busyDetail = '';
		}
	}

	async function labelGold(id: number, label: 'same' | 'different' | 'uncertain') {
		if (saving) return;
		saving = true;
		try {
			goldMetrics = await labelAuthorMergeGold(id, label);
		} catch (value) {
			error = userError(value, m.duplicates_gold_error());
		} finally {
			saving = false;
		}
	}

	async function undoMerge(id: number) {
		if (saving || !confirm(m.duplicates_confirm_undo())) return;
		saving = true;
		error = '';
		try {
			await undoAuthorMerge(id);
			await load();
		} catch (value) {
			error = userError(value, m.duplicates_undo_error());
		} finally {
			saving = false;
		}
	}

	async function undoMergeBatch(batchId: string) {
		if (saving || !confirm(m.duplicates_confirm_undo_batch())) return;
		saving = true;
		error = '';
		try {
			const undone = await undoAuthorMergeBatch(batchId);
			notice = `${m.duplicates_undo_batch()}: ${undone.length}`;
			await load();
		} catch (value) {
			error = userError(value, m.duplicates_undo_batch_error());
		} finally {
			saving = false;
		}
	}

	async function decide(decision: 'same' | 'different' | 'deferred') {
		const current = items[0];
		if (!current || saving) return;
		saving = true;
		busyTitle = decision === 'different' ? m.duplicates_saving_different() : m.duplicates_deferring();
		busyDetail = m.duplicates_saving_help();
		error = '';
		try {
			await reviewDuplicate(current.id, decision, note);
			await load(true);
		} catch (value) {
			error = userError(value, m.duplicates_review_error());
		} finally {
			saving = false;
			busyTitle = '';
			busyDetail = '';
		}
	}

	function percent(value?: number) {
		return typeof value === 'number' && Number.isFinite(value)
			? `${Math.round(value * 100)}%`
			: m.duplicates_no_data();
	}
</script>

<div class="app-page max-w-6xl">
	<a href="/validation" class="text-sm text-indigo-700 hover:underline">{m.validation_back()}</a>
	<header class="page-header">
		<div>
			<h1 class="page-heading">{m.duplicates_title()}</h1>
			<p class="page-description">{m.duplicates_help()}</p>
		</div>
	</header>
	<nav class="tabs" aria-label={m.duplicates_title()}>
		<button onclick={() => { requestedDuplicateId = null; status = 'pending'; void load(); }} class="tab {status === 'pending' ? 'tab-active' : ''}">{m.duplicates_pending({ count: pendingTotal })}</button>
		<button onclick={() => { requestedDuplicateId = null; status = 'deferred'; void load(); }} class="tab {status === 'deferred' ? 'tab-active' : ''}">{m.duplicates_deferred({ count: deferredTotal })}</button>
	</nav>

	{#if notice}<div class="notice-success" role="status">{notice}</div>{/if}
	{#if error}<div class="notice-error" role="alert">{error}</div>{/if}
	{#if loading}
		<div class="surface animate-pulse p-8"><div class="h-48 rounded bg-gray-100"></div></div>
	{:else if items[0]}
		{@const item = items[0]}
		<section class="surface">
			<div class="surface-header text-sm font-medium text-gray-700">{m.duplicates_case({ id: item.id, total })}</div>
			<div class="grid gap-0 md:grid-cols-2">
				{#each [item.author_a, item.author_b] as author}
					<div class="border-b p-6 md:border-b-0 md:border-r last:border-r-0">
						<h2 class="text-xl font-semibold text-gray-900">{author.canonical_name}</h2>
						<p class="mt-1 text-sm text-gray-600">{author.affiliation ?? m.duplicates_no_affiliation()}</p>
						<p class="mt-3 text-sm text-gray-600">{m.duplicates_publications({ count: author.publications_count, id: author.scholar_user_id ?? '—' })}</p>
						<div class="mt-3 flex gap-3 text-sm"><a href={`/authors/${author.id}`} target="_blank" rel="noreferrer" class="font-medium text-indigo-700 hover:underline">{m.duplicates_view_profile()}</a>{#if author.profile_url}<a href={author.profile_url} target="_blank" rel="noreferrer" class="text-gray-600 hover:underline">Scholar</a>{/if}</div>
					</div>
				{/each}
			</div>
			<div class="border-t p-6">
				<h3 class="font-semibold text-gray-900">{m.duplicates_evidence()}</h3>
				<dl class="metric-strip mt-3 lg:grid-cols-4">
					<div class="metric-cell"><dt class="metric-label">{m.duplicates_combined_confidence()}</dt><dd class="metric-value text-lg">{percent(item.evidence.score)}</dd></div>
					<div class="metric-cell"><dt class="metric-label">{m.duplicates_shared_publications()}</dt><dd class="metric-value text-lg">{item.evidence.shared_publications_count ?? 0}</dd></div>
					<div class="metric-cell"><dt class="metric-label">{m.duplicates_smaller_overlap()}</dt><dd class="metric-value text-lg">{percent(item.evidence.publication_overlap)}</dd></div>
					<div class="metric-cell"><dt class="metric-label">{m.duplicates_shared_coauthors()}</dt><dd class="metric-value text-lg">{item.evidence.shared_coauthors_count ?? 0}</dd></div>
				</dl>
				{#if item.evidence.independent_evidence_families?.length}<p class="mt-3 text-sm text-gray-600">{m.duplicates_independent_signals({ signals: item.evidence.independent_evidence_families.join(', ') })}</p>{/if}
				{#if item.evidence.hard_vetoes?.length}<p class="mt-2 text-sm font-medium text-red-700">{m.duplicates_contradictions({ items: item.evidence.hard_vetoes.join(', ') })}</p>{/if}
				{#if item.evidence.shared_publication_titles?.length}<ul class="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-700">{#each item.evidence.shared_publication_titles as title}<li>{title}</li>{/each}</ul>{/if}

				<div class="mt-6 border-t border-gray-200 pt-5">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div><h4 class="font-semibold text-gray-950">{m.duplicates_merge_set()}</h4><p class="mt-1 text-sm text-gray-600">{m.duplicates_merge_set_help()}</p></div>
						<span class="text-xs font-medium text-gray-500">{m.duplicates_profiles({ count: mergeAuthors.length })}</span>
					</div>
					<div class="mt-4 divide-y rounded-lg border border-gray-200 bg-white">
						{#each mergeAuthors as author}
							<label class="flex cursor-pointer items-start gap-3 border-l-2 p-3 {canonicalAuthorId === author.id ? 'border-indigo-600 bg-indigo-50/50' : 'border-transparent hover:bg-gray-50'}">
								<input type="radio" name="canonical-author" value={author.id} checked={canonicalAuthorId === author.id} onchange={() => (canonicalAuthorId = author.id)} class="mt-1 border-indigo-300 text-indigo-600 focus:ring-indigo-500" />
								<span class="min-w-0 flex-1"><span class="font-semibold text-gray-900">{author.canonical_name}</span><span class="block text-xs text-gray-500">ID {author.id} · Scholar {author.scholar_user_id ?? m.duplicates_no_id()}{#if author.affiliation} · {author.affiliation}{/if}</span></span>
								{#if !initialPairIds.includes(author.id)}<button type="button" onclick={(event) => { event.preventDefault(); removeMergeAuthor(author.id); }} class="rounded px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">{m.duplicates_remove()}</button>{/if}
							</label>
						{/each}
					</div>

					<div class="mt-4">
						<label for="additional-profile" class="text-sm font-semibold text-gray-900">{m.duplicates_add_profile()}</label>
						<div class="mt-2 flex gap-2"><input id="additional-profile" bind:value={authorQuery} onkeydown={(event) => event.key === 'Enter' && void searchAuthors()} placeholder={m.duplicates_search_placeholder()} class="min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm" /><button onclick={() => void searchAuthors()} disabled={searching || authorQuery.trim().length < 2} class="btn-secondary">{searching ? m.common_searching() : m.common_search()}</button></div>
						{#if searchResults.length}<div class="mt-2 max-h-52 divide-y overflow-y-auto rounded-lg border border-indigo-100 bg-white">{#each searchResults as author}<div class="flex items-center justify-between gap-3 p-3 text-sm"><div class="min-w-0"><div class="font-semibold text-gray-900">{author.canonical_name}</div><div class="truncate text-xs text-gray-500">ID {author.id}{#if author.affiliation} · {author.affiliation}{/if}</div></div><button onclick={() => addMergeAuthor(author)} class="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">{m.duplicates_add()}</button></div>{/each}</div>{/if}
					</div>
				</div>

				<label class="mt-5 block text-sm font-medium text-gray-700">{m.duplicates_optional_note()}<textarea bind:value={note} maxlength="1000" rows="2" class="mt-1 w-full rounded-md border border-gray-300 p-2"></textarea></label>
				<div class="mt-4 grid gap-3 sm:grid-cols-3">
					<button onclick={() => void mergeSelectedAuthors()} disabled={saving || canonicalAuthorId === null || mergeAuthors.length < 2} class="btn-primary">{m.duplicates_merge({ count: mergeAuthors.length })}</button>
					<button onclick={() => void decide('different')} disabled={saving} class="btn-secondary">{m.duplicates_different()}</button>
					<button onclick={() => void decide('deferred')} disabled={saving} class="btn-secondary text-violet-700">{m.duplicates_defer()}</button>
				</div>
			</div>
		</section>
	{:else}
		<div class="empty-state">{m.duplicates_empty()}</div>
	{/if}

	<section class="surface p-6">
		<h2 class="text-lg font-semibold text-gray-900">{m.duplicates_history()}</h2>
		<p class="mt-1 text-sm text-gray-600">{m.duplicates_history_help()}</p>
		{#if goldMetrics}<div class="mt-4 rounded-lg border p-3 text-sm {goldMetrics.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}">Scorer {goldMetrics.scorer_version}: {goldMetrics.enabled ? m.duplicates_auto_enabled() : m.duplicates_auto_paused()} · {m.duplicates_gold_precision({ precision: percent(goldMetrics.precision ?? undefined), count: goldMetrics.adjudicated_pairs })}</div>{/if}
		{#if merges.length}
			<div class="mt-4 divide-y">
				{#each merges as merge, mergeIndex}
					<div class="py-4 text-sm">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div><p class="font-medium text-gray-900">{merge.source_name} → {merge.target_name}</p><p class="mt-1 text-gray-500">{merge.automatic ? m.duplicates_automatic() : m.duplicates_manual()} · {merge.scorer_version ?? m.duplicates_no_version()} · {percent(merge.evidence.score)}{#if merge.merge_batch_id} · {m.duplicates_batch({ id: merge.merge_batch_id.slice(0, 8) })}{/if}</p></div>
							{#if !merge.undone_at}
								{#if merge.merge_batch_id && merges.findIndex((item) => item.merge_batch_id === merge.merge_batch_id) === mergeIndex}<button onclick={() => void undoMergeBatch(merge.merge_batch_id!)} disabled={saving} class="rounded border border-red-200 px-3 py-1.5 font-medium text-red-700 disabled:opacity-40">{m.duplicates_undo_batch()}</button>{:else if !merge.merge_batch_id}<button onclick={() => void undoMerge(merge.id)} disabled={saving} class="rounded border border-red-200 px-3 py-1.5 font-medium text-red-700 disabled:opacity-40">{m.duplicates_undo()}</button>{/if}
							{:else}<span class="rounded bg-gray-100 px-2 py-1 text-gray-600">{m.duplicates_undone()}</span>{/if}
						</div>
						{#if merge.automatic}<div class="mt-3 flex flex-wrap gap-2"><span class="mr-1 text-gray-500">{m.duplicates_gold_label()}</span><button onclick={() => void labelGold(merge.id, 'same')} class="rounded border px-2 py-1">{m.duplicates_same()}</button><button onclick={() => void labelGold(merge.id, 'different')} class="rounded border px-2 py-1">{m.duplicates_different()}</button><button onclick={() => void labelGold(merge.id, 'uncertain')} class="rounded border px-2 py-1">{m.duplicates_uncertain()}</button></div>{/if}
					</div>
				{/each}
			</div>
		{:else}<p class="mt-4 text-sm text-gray-500">{m.duplicates_no_history()}</p>{/if}
	</section>
</div>

{#if busyTitle}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="duplicate-operation-title">
		<div class="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-2xl" aria-live="polite">
			<div class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" aria-hidden="true"></div>
			<h2 id="duplicate-operation-title" class="mt-5 text-xl font-bold text-gray-950">{busyTitle}</h2>
			<p class="mt-2 text-sm leading-6 text-gray-600">{busyDetail}</p>
			<div class="mt-5 h-1.5 overflow-hidden rounded-full bg-indigo-100"><div class="h-full w-1/2 animate-pulse rounded-full bg-indigo-600"></div></div>
			<p class="mt-3 text-xs font-medium text-indigo-700">{m.duplicates_busy_help()}</p>
		</div>
	</div>
{/if}

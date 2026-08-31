<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { listPublications } from '$lib/api/client';
	import type { PublicationItem } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages.js';
	import { userError } from '$lib/i18n/errors';

	type PubSortKey = 'title' | 'publication_year' | 'venue' | 'document_type' | 'citations_count' | 'scholar_citations';

	let publications = $state<PublicationItem[]>([]);
	let total = $state(0);
	let search = $state('');
	let year = $state('');
	let type = $state('');
	let limit = $state(50);
	let offset = $state(0);
	let loading = $state(true);
	let error = $state('');
	let sortKey = $state<PubSortKey>('publication_year');
	let sortDir = $state<'asc' | 'desc'>('desc');

	$effect(() => {
		if (browser && !$auth) goto('/login');
	});

	async function fetchPublications() {
		loading = true;
		error = '';
		try {
			const sortParam = sortDir === 'desc' ? `-${sortKey}` : sortKey;
			const data = await listPublications({
				search: search || undefined,
				year: year ? parseInt(year) : undefined,
				type: type || undefined,
				sort: sortParam,
				limit,
				offset
			});
			publications = data.items;
			total = data.total;
		} catch (e) {
			error = userError(e, m.publications_load_error());
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (browser && $auth) fetchPublications();
	});

	async function searchPublications() {
		offset = 0;
		await fetchPublications();
	}

	async function toggleSort(key: PubSortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = 'asc';
		}
		await fetchPublications();
	}

	function sortIndicator(key: PubSortKey) {
		if (sortKey !== key) return '';
		return sortDir === 'asc' ? ' \u2191' : ' \u2193';
	}

	function handleRowKeydown(e: KeyboardEvent, pubId: number) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			goto(`/publications/${pubId}`);
		}
	}

	const sortableCols: { key: PubSortKey; label: string }[] = [
		{ key: 'title',              label: m.publications_title_column() },
		{ key: 'publication_year',   label: m.publications_year() },
		{ key: 'venue',              label: m.publications_venue() },
		{ key: 'document_type',      label: m.publications_type() },
		{ key: 'citations_count',    label: 'OpenAlex' },
		{ key: 'scholar_citations',  label: 'Scholar' },
	];

	const documentTypeLabels: Record<string, string> = {
		article: m.publications_article(), book: m.publications_book(),
		'book-chapter': m.publications_book_chapter(), 'conference-paper': m.publications_conference_paper(),
		proceedings: m.publications_proceedings(), preprint: m.publications_preprint(),
		report: m.publications_report(), thesis: m.publications_thesis(), other: m.publications_other()
	};
</script>

<div class="app-page">
	<header class="page-header"><h1 class="page-heading">{m.publications_title()}</h1></header>
	<form class="toolbar" role="search" aria-label={m.publications_search_label()} onsubmit={(e) => { e.preventDefault(); searchPublications(); }}>
			<label for="pub-search" class="sr-only">{m.publications_search_help()}</label>
			<input
				id="pub-search"
				type="search"
				placeholder={m.publications_search_placeholder()}
				bind:value={search}
				class="min-w-64 rounded-md border px-3 py-2 text-sm"
			/>
			<label for="pub-year" class="sr-only">{m.publications_year()}</label>
			<input
				id="pub-year"
				type="number"
				placeholder={m.publications_year()}
				bind:value={year}
				class="w-24 rounded-md border px-3 py-2 text-sm"
			/>
			<label for="pub-type" class="sr-only">{m.publications_type()}</label>
			<select
				id="pub-type"
				bind:value={type}
				class="rounded-md border px-3 py-2 text-sm"
			>
				<option value="">{m.publications_all_types()}</option>
				<option value="article">{m.publications_article()}</option>
				<option value="book">{m.publications_book()}</option>
				<option value="book-chapter">{m.publications_book_chapter()}</option>
				<option value="conference-paper">{m.publications_conference_paper()}</option>
				<option value="proceedings">{m.publications_proceedings()}</option>
				<option value="preprint">{m.publications_preprint()}</option>
				<option value="report">{m.publications_report()}</option>
				<option value="thesis">{m.publications_thesis()}</option>
				<option value="other">{m.publications_other()}</option>
			</select>
			<button type="submit" class="btn-primary">{m.common_search()}</button>
	</form>

	{#if error}
		<div role="alert" class="notice-error">{error}</div>
	{/if}

	{#if loading}
		<div class="surface p-8 animate-pulse">
			{#each Array(6) as _}
				<div class="flex gap-4 py-3 border-b border-gray-100">
					<div class="h-4 bg-gray-200 rounded w-2/5"></div>
					<div class="h-4 bg-gray-100 rounded w-12"></div>
					<div class="h-4 bg-gray-100 rounded w-1/4"></div>
					<div class="h-4 bg-gray-100 rounded w-16"></div>
				</div>
			{/each}
		</div>
	{:else if publications.length === 0}
		<div class="empty-state">
			<p class="text-gray-600 text-lg font-medium">{m.publications_empty()}</p>
			<p class="text-gray-500 text-sm mt-1">{m.publications_empty_help()}</p>
		</div>
	{:else}
		<p class="text-sm text-gray-600 mb-3" role="status">{m.publications_showing({ shown: publications.length, total })}</p>
		<div class="data-shell">
			<div class="data-scroll">
				<table class="data-table" aria-label={m.publications_list()}>
					<thead class="bg-gray-50">
						<tr>
							{#each sortableCols as col}
								<th class="px-4 py-3 text-left text-xs font-medium uppercase cursor-pointer select-none hover:bg-gray-100 transition-colors {sortKey === col.key ? 'text-indigo-700' : 'text-gray-500'}" scope="col" onclick={() => toggleSort(col.key)} aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
									{col.label}{sortIndicator(col.key)}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-100">
						{#each publications as pub}
							<tr
								class="hover:bg-gray-50 cursor-pointer focus-within:bg-gray-50"
								role="link"
								tabindex="0"
								onclick={() => goto(`/publications/${pub.id}`)}
								onkeydown={(e) => handleRowKeydown(e, pub.id)}
								aria-label={m.publications_view({ title: pub.title })}
							>
								<td class="px-4 py-3 text-sm text-gray-900 max-w-lg truncate">{pub.title}</td>
								<td class="px-4 py-3 text-sm text-gray-600">{pub.publication_year ?? '—'}</td>
								<td class="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{pub.venue || '—'}</td>
								<td class="px-4 py-3 text-sm text-gray-600">{pub.document_type ? (documentTypeLabels[pub.document_type] ?? pub.document_type) : '—'}</td>
								<td class="px-4 py-3 text-sm text-gray-600">{pub.openalex_citations ?? pub.citations_count}</td>
								<td class="px-4 py-3 text-sm text-gray-600">{pub.scholar_citations ?? '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
		<div class="flex items-center justify-between mt-4">
			<button onclick={() => { offset = Math.max(0, offset - limit); fetchPublications(); }} disabled={offset === 0} class="btn-secondary">{m.common_previous()}</button>
			<span class="text-sm text-gray-600">{m.common_page_of({ page: Math.floor(offset / limit) + 1, total: Math.ceil(total / limit) || 1 })}</span>
			<button onclick={() => { offset = offset + limit; fetchPublications(); }} disabled={offset + limit >= total} class="btn-secondary">{m.common_next()}</button>
		</div>
	{/if}
</div>

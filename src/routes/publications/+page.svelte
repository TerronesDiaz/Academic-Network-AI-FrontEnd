<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { listPublications } from '$lib/api/client';
	import type { PublicationItem } from '$lib/api/types';

	type PubSortKey = 'title' | 'publication_year' | 'venue' | 'document_type' | 'citations_count';

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
			error = e instanceof Error ? e.message : 'Failed to fetch publications';
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
		{ key: 'title',            label: 'Title' },
		{ key: 'publication_year', label: 'Year' },
		{ key: 'venue',            label: 'Venue' },
		{ key: 'document_type',    label: 'Type' },
		{ key: 'citations_count',  label: 'Citations' },
	];
</script>

<div>
	<a href="/" class="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 mb-3 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">
		<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
		Home
	</a>
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
		<h1 class="text-2xl font-bold text-gray-900">Publications</h1>
		<form class="flex gap-2 flex-wrap" role="search" aria-label="Search publications" onsubmit={(e) => { e.preventDefault(); searchPublications(); }}>
			<label for="pub-search" class="sr-only">Search title or venue</label>
			<input
				id="pub-search"
				type="search"
				placeholder="Search title or venue..."
				bind:value={search}
				class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
			/>
			<label for="pub-year" class="sr-only">Publication year</label>
			<input
				id="pub-year"
				type="number"
				placeholder="Year"
				bind:value={year}
				class="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
			/>
			<label for="pub-type" class="sr-only">Document type</label>
			<select
				id="pub-type"
				bind:value={type}
				class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
			>
				<option value="">All types</option>
				<option value="article">Article</option>
				<option value="book">Book</option>
				<option value="book-chapter">Book Chapter</option>
				<option value="conference-paper">Conference Paper</option>
				<option value="proceedings">Proceedings</option>
				<option value="preprint">Preprint</option>
				<option value="report">Report</option>
				<option value="thesis">Thesis</option>
				<option value="other">Other</option>
			</select>
			<button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">Search</button>
		</form>
	</div>

	{#if error}
		<div role="alert" class="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="bg-white rounded-lg shadow p-8 animate-pulse">
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
		<div class="bg-white rounded-lg shadow p-12 text-center">
			<p class="text-gray-600 text-lg font-medium">No publications found</p>
			<p class="text-gray-500 text-sm mt-1">Try adjusting your search criteria</p>
		</div>
	{:else}
		<p class="text-sm text-gray-600 mb-3" role="status">Showing {publications.length} of {total} publications{sortKey ? ' \u00b7 sorted by ' + sortKey.replace(/_/g, ' ') + ' (' + sortDir + ')' : ''}</p>
		<div class="bg-white rounded-lg shadow overflow-hidden">
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200" aria-label="Publications list">
					<thead class="bg-gray-50">
						<tr>
							{#each sortableCols as col}
								<th class="px-4 py-3 text-left text-xs font-medium uppercase cursor-pointer select-none hover:bg-gray-100 transition-colors {sortKey === col.key ? 'text-indigo-700' : 'text-gray-500'}" scope="col" onclick={() => toggleSort(col.key)} aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
									{col.label}{sortIndicator(col.key)}
								</th>
							{/each}
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Sources</th>
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
								aria-label={`Publication: ${pub.title}`}
							>
								<td class="px-4 py-3 text-sm text-gray-900 max-w-lg truncate">{pub.title}</td>
								<td class="px-4 py-3 text-sm text-gray-600">{pub.publication_year ?? '—'}</td>
								<td class="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{pub.venue || '—'}</td>
								<td class="px-4 py-3 text-sm text-gray-600">{pub.document_type || '—'}</td>
								<td class="px-4 py-3 text-sm text-gray-600">{pub.citations_count}</td>
								<td class="px-4 py-3 text-sm">
									{#each pub.sources as src}
										<span class="inline-block bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded mr-1">{src}</span>
									{/each}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
		<div class="flex items-center justify-between mt-4">
			<button onclick={() => { offset = Math.max(0, offset - limit); fetchPublications(); }} disabled={offset === 0} class="px-4 py-2 text-sm border border-gray-300 rounded-md disabled:opacity-40 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">Previous</button>
			<span class="text-sm text-gray-600">Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit) || 1}</span>
			<button onclick={() => { offset = offset + limit; fetchPublications(); }} disabled={offset + limit >= total} class="px-4 py-2 text-sm border border-gray-300 rounded-md disabled:opacity-40 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">Next</button>
		</div>
	{/if}
</div>
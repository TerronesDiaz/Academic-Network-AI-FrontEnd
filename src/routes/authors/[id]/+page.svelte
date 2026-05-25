<script lang="ts">
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { getAuthor, getAuthorPublications, getAuthorCoauthors, getAuthorIndicatorHistory } from '$lib/api/client';
	import type { Author, AuthorPublication, Coauthor } from '$lib/api/types';

	type PubSortKey = 'title' | 'publication_year' | 'venue' | 'citations_count' | 'author_position';

	let authorId = Number($page.params.id);
	let author = $state<Author | null>(null);
	let publications = $state<AuthorPublication[]>([]);
	let pubTotal = $state(0);
	let coauthors = $state<Coauthor[]>([]);
	let indicatorHistory = $state<Record<string, unknown>[]>([]);
	let loading = $state(true);
	let error = $state('');
	let activeTab = $state<'publications' | 'coauthors' | 'indicators'>('publications');
	let pubSortKey = $state<PubSortKey>('publication_year');
	let pubSortDir = $state<'asc' | 'desc'>('desc');

	$effect(() => {
		if (browser && !$auth) goto('/login');
	});

	async function fetchPublications() {
		try {
			const sortParam = pubSortDir === 'desc' ? `-${pubSortKey}` : pubSortKey;
			const pubData = await getAuthorPublications(authorId, { sort: sortParam, limit: 500 });
			publications = pubData.items;
			pubTotal = pubData.total;
		} catch {
			// keep current publications on error
		}
	}

	async function fetchData() {
		loading = true;
		error = '';
		try {
			author = await getAuthor(authorId);
			const [pubData, coData, histData] = await Promise.all([
				getAuthorPublications(authorId, { sort: pubSortDir === 'desc' ? `-${pubSortKey}` : pubSortKey, limit: 500 }),
				getAuthorCoauthors(authorId),
				getAuthorIndicatorHistory(authorId)
			]);
			publications = pubData.items;
			pubTotal = pubData.total;
			coauthors = coData;
			indicatorHistory = histData;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load author';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (browser && $auth) {
			authorId = Number($page.params.id);
			fetchData();
		}
	});

	function togglePubSort(key: PubSortKey) {
		if (pubSortKey === key) {
			pubSortDir = pubSortDir === 'asc' ? 'desc' : 'asc';
		} else {
			pubSortKey = key;
			pubSortDir = 'asc';
		}
		fetchPublications();
	}

	function sortIndicator(key: PubSortKey) {
		if (pubSortKey !== key) return '';
		return pubSortDir === 'asc' ? ' \u2191' : ' \u2193';
	}

	const pubSortCols: { key: PubSortKey; label: string }[] = [
		{ key: 'title',            label: 'Title' },
		{ key: 'publication_year', label: 'Year' },
		{ key: 'venue',            label: 'Venue' },
		{ key: 'citations_count',  label: 'Citations' },
		{ key: 'author_position',  label: 'Position' },
	];

	function fmtNum(v: unknown) {
		if (v == null) return '—';
		const n = Number(v);
		return isNaN(n) ? String(v) : n.toLocaleString();
	}

	function handleRowKeydown(e: KeyboardEvent, href: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			goto(href);
		}
	}

	const tabNames = ['publications', 'coauthors', 'indicators'] as const;
</script>

<div>
	{#if loading}
		<div class="space-y-4 animate-pulse">
			<div class="h-6 bg-gray-200 rounded w-32 mb-6"></div>
			<div class="bg-white rounded-lg shadow p-6">
				<div class="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
				<div class="h-5 bg-gray-100 rounded w-1/4"></div>
			</div>
		</div>
	{:else if error}
		<div role="alert" class="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
	{:else if author}
		<nav class="mb-6">
			<button onclick={() => goto('/authors')} class="text-sm text-indigo-600 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">&larr; Back to Authors</button>
		</nav>

		<div class="bg-white rounded-lg shadow p-6 mb-6">
			<div class="flex flex-col sm:flex-row items-start gap-4">
				<div class="flex-1">
					<h1 class="text-2xl font-bold text-gray-900">{author.canonical_name}</h1>
					<p class="text-gray-600 mt-1">{author.affiliation || 'No affiliation'}</p>
					<p class="text-gray-600 text-sm">
						{#if author.email_domain}{'@'}{author.email_domain} &middot; {/if}
						<span class="inline-flex text-xs font-medium px-2 py-0.5 rounded-full {author.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}">{author.is_active ? 'Active' : 'Inactive'}</span>
					</p>
					{#if author.profile_url}
						<a href={author.profile_url} target="_blank" rel="noopener noreferrer" class="text-sm text-indigo-600 hover:underline mt-1 inline-block focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded" aria-label="Google Scholar profile (opens in new tab)">Scholar Profile</a>
					{/if}
				</div>
				{#if author.latest_indicators}
					<div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
						{#each ['total_publications', 'total_citations', 'h_index'] as key}
							<div class="bg-indigo-50 rounded-lg p-3 min-w-[80px]">
								<div class="text-2xl font-bold text-indigo-700">{fmtNum((author!.latest_indicators as Record<string, unknown>)[key])}</div>
								<div class="text-xs text-gray-500 capitalize">{(key as string).replace(/_/g, ' ')}</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<div class="flex gap-1 mb-4 overflow-x-auto" role="tablist" aria-label="Author detail views">
			<button
				role="tab"
				aria-selected={activeTab === 'publications'}
				class="px-4 py-2 text-sm rounded-md whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500 {activeTab === 'publications' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border hover:bg-gray-50'}"
				onclick={() => (activeTab = 'publications')}
			>Publications ({pubTotal})</button>
			<button
				role="tab"
				aria-selected={activeTab === 'coauthors'}
				class="px-4 py-2 text-sm rounded-md whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500 {activeTab === 'coauthors' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border hover:bg-gray-50'}"
				onclick={() => (activeTab = 'coauthors')}
			>Co-authors ({coauthors.length})</button>
			<button
				role="tab"
				aria-selected={activeTab === 'indicators'}
				class="px-4 py-2 text-sm rounded-md whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500 {activeTab === 'indicators' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border hover:bg-gray-50'}"
				onclick={() => (activeTab = 'indicators')}
			>Indicators</button>
		</div>

		{#if activeTab === 'publications'}
			<div class="bg-white rounded-lg shadow overflow-hidden" role="tabpanel" aria-label="Publications">
				{#if publications.length === 0}
					<p class="p-12 text-center text-gray-500">No publications found</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200" aria-label="Author publications">
							<thead class="bg-gray-50">
								<tr>
									{#each pubSortCols as col}
										<th
											class="px-4 py-3 text-left text-xs font-medium uppercase cursor-pointer select-none hover:bg-gray-100 transition-colors {pubSortKey === col.key ? 'text-indigo-700' : 'text-gray-500'}"
											scope="col"
											onclick={() => togglePubSort(col.key)}
											aria-sort={pubSortKey === col.key ? (pubSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
										>
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
										onkeydown={(e) => handleRowKeydown(e, `/publications/${pub.id}`)}
										aria-label={`Publication: ${pub.title}`}
									>
										<td class="px-4 py-3 text-sm text-gray-900 max-w-md truncate">{pub.title}</td>
										<td class="px-4 py-3 text-sm text-gray-600">{pub.publication_year ?? '—'}</td>
										<td class="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{pub.venue || '—'}</td>
										<td class="px-4 py-3 text-sm text-gray-600">{pub.citations_count}</td>
										<td class="px-4 py-3 text-sm text-gray-600">{pub.author_position ?? '—'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{:else if activeTab === 'coauthors'}
			<div class="bg-white rounded-lg shadow overflow-hidden" role="tabpanel" aria-label="Co-authors">
				{#if coauthors.length === 0}
					<p class="p-12 text-center text-gray-500">No co-authors found</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200" aria-label="Co-authors list">
							<thead class="bg-gray-50">
								<tr>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shared Publications</th>
								</tr>
							</thead>
							<tbody class="bg-white divide-y divide-gray-100">
								{#each coauthors as co}
									<tr
										class="hover:bg-gray-50 cursor-pointer focus-within:bg-gray-50"
										role="link"
										tabindex="0"
										onclick={() => goto(`/authors/${co.author_id}`)}
										onkeydown={(e) => handleRowKeydown(e, `/authors/${co.author_id}`)}
										aria-label={`Co-author: ${co.canonical_name}`}
									>
										<td class="px-4 py-3 text-sm font-medium text-indigo-600">{co.canonical_name}</td>
										<td class="px-4 py-3 text-sm text-gray-700">{co.shared_publications_count}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{:else if activeTab === 'indicators'}
			<div class="bg-white rounded-lg shadow overflow-hidden" role="tabpanel" aria-label="Indicator history">
				{#if indicatorHistory.length === 0}
					<p class="p-12 text-center text-gray-500">No indicator history available</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200" aria-label="Indicator history">
							<thead class="bg-gray-50">
								<tr>
									{#each Object.keys(indicatorHistory[0]) as col}
										<th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{col.replace(/_/g, ' ')}</th>
									{/each}
								</tr>
							</thead>
							<tbody class="bg-white divide-y divide-gray-100">
								{#each indicatorHistory as row}
									<tr>
										{#each Object.values(row) as val}
											<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{val != null ? String(val) : '—'}</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>
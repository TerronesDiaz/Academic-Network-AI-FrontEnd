<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { listIndicators, getIndicatorSummary } from '$lib/api/client';
	import type { IndicatorRow, IndicatorSummary } from '$lib/api/types';

	let indicators = $state<IndicatorRow[]>([]);
	let summary = $state<IndicatorSummary | null>(null);
	let total = $state(0);
	let limit = $state(100);
	let offset = $state(0);
	let loading = $state(true);
	let error = $state('');
	let activeTab = $state<'summary' | 'table'>('summary');

	type IndicatorSortKey = 'canonical_name' | 'total_publications' | 'total_citations' | 'h_index' | 'i10_index' | 'pagerank' | 'betweenness_centrality' | 'clustering_coeff';

	const backendField: Record<IndicatorSortKey, string> = {
		canonical_name: 'canonical_name',
		total_publications: 'total_publications',
		total_citations: 'total_citations',
		h_index: 'h_index',
		i10_index: 'i10_index',
		pagerank: 'pagerank',
		betweenness_centrality: 'betweenness_centrality',
		clustering_coeff: 'clustering_coeff',
	};

	let sortKey = $state<IndicatorSortKey>('h_index');
	let sortDir = $state<'asc' | 'desc'>('desc');

	function toggleSort(key: IndicatorSortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = 'desc';
		}
		offset = 0;
		fetchData();
	}

	function sortIndicator(key: IndicatorSortKey) {
		if (sortKey !== key) return '';
		return sortDir === 'asc' ? ' \u2191' : ' \u2193';
	}

	$effect(() => {
		if (browser && !$auth) goto('/login');
	});

	async function fetchData() {
		loading = true;
		error = '';
		try {
			const sortParam = sortDir === 'desc' ? `-${backendField[sortKey]}` : backendField[sortKey];
			const [indData, sumData] = await Promise.all([
				listIndicators({ limit, offset, sort: sortParam }),
				getIndicatorSummary({ top_n: 10 })
			]);
			indicators = indData.items;
			total = indData.total;
			summary = sumData;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load indicators';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (browser && $auth) fetchData();
	});

	function fmtNum(v: unknown) {
		if (v == null) return '—';
		const n = Number(v);
		return isNaN(n) ? String(v) : n.toLocaleString();
	}

	function fmtCell(value: unknown) {
		if (value == null) return '—';
		if (typeof value === 'number') return value.toLocaleString();
		return String(value);
	}

	const displayColumns = [
		'author_name',
		'total_publications',
		'scholar_citations',
		'openalex_citations',
		'scholar_h_index',
		'openalex_h_index',
		'scholar_i10_index',
		'openalex_i10_index',
		'pagerank',
		'betweenness_centrality',
		'clustering_coeff'
	];

	const columnLabels: Record<string, string> = {
		author_name: 'Name',
		total_publications: 'Publications',
		scholar_citations: 'Scholar Cit.',
		openalex_citations: 'OpenAlex Cit.',
		scholar_h_index: 'Scholar H-Idx',
		openalex_h_index: 'OpenAlex H-Idx',
		scholar_i10_index: 'Scholar I10',
		openalex_i10_index: 'OpenAlex I10',
		pagerank: 'PageRank',
		betweenness_centrality: 'Betweenness',
		clustering_coeff: 'Clustering',
	};

	const columnSortKey: Record<string, IndicatorSortKey | null> = {
		author_name: 'canonical_name',
		total_publications: 'total_publications',
		scholar_citations: null,
		openalex_citations: null,
		scholar_h_index: null,
		openalex_h_index: null,
		scholar_i10_index: null,
		openalex_i10_index: null,
		pagerank: 'pagerank',
		betweenness_centrality: 'betweenness_centrality',
		clustering_coeff: 'clustering_coeff',
	};
</script>

<div>
	<a href="/" class="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 mb-3 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">
		<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
		Home
	</a>
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
		<h1 class="text-2xl font-bold text-gray-900">Indicators</h1>
		<div class="flex gap-1" role="tablist" aria-label="Indicator views">
			<button
				role="tab"
				aria-selected={activeTab === 'summary'}
				class="px-4 py-2 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 {activeTab === 'summary' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border hover:bg-gray-50'}"
				onclick={() => (activeTab = 'summary')}>Summary</button>
			<button
				role="tab"
				aria-selected={activeTab === 'table'}
				class="px-4 py-2 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 {activeTab === 'table' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border hover:bg-gray-50'}"
				onclick={() => (activeTab = 'table')}>All Indicators</button>
		</div>
	</div>

	{#if error}
		<div role="alert" class="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="space-y-4">
			<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
				{#each Array(5) as _}
					<div class="bg-white rounded-lg shadow p-4 animate-pulse">
						<div class="h-8 bg-gray-200 rounded w-16 mx-auto mb-2"></div>
						<div class="h-3 bg-gray-100 rounded w-20 mx-auto"></div>
					</div>
				{/each}
			</div>
		</div>
	{:else}
		{#if activeTab === 'summary' && summary}
			<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
				<div class="bg-white rounded-lg shadow p-4 text-center">
					<div class="text-2xl font-bold text-indigo-700">{fmtNum(summary.authors)}</div>
					<div class="text-xs text-gray-500">Authors</div>
				</div>
				<div class="bg-white rounded-lg shadow p-4 text-center">
					<div class="text-2xl font-bold text-indigo-700">{fmtNum(summary.total_publications)}</div>
					<div class="text-xs text-gray-500">Total Publications</div>
				</div>
				<div class="bg-blue-50 rounded-lg shadow p-4 text-center">
					<div class="text-2xl font-bold text-blue-700">{fmtNum(summary.total_citations_scholar)}</div>
					<div class="text-xs text-gray-500">Citas Google Scholar</div>
				</div>
				<div class="bg-emerald-50 rounded-lg shadow p-4 text-center">
					<div class="text-2xl font-bold text-emerald-700">{fmtNum(summary.total_citations_openalex)}</div>
					<div class="text-xs text-gray-500">Citas OpenAlex</div>
				</div>
				<div class="bg-white rounded-lg shadow p-4 text-center">
					<div class="text-2xl font-bold text-indigo-700">{summary.average_h_index}</div>
					<div class="text-xs text-gray-500">Avg H-Index</div>
				</div>
				<div class="bg-white rounded-lg shadow p-4 text-center">
					<div class="text-2xl font-bold text-indigo-700">{summary.median_h_index}</div>
					<div class="text-xs text-gray-500">Median H-Index</div>
				</div>
			</div>

			<div class="bg-white rounded-lg shadow p-6">
				<h2 class="text-lg font-semibold text-gray-900 mb-4">Top H-Index Researchers</h2>
				{#if summary.top_h_index.length === 0}
					<p class="text-gray-500 py-6 text-center">No indicator data available</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200" aria-label="Top H-index researchers">
							<thead class="bg-gray-50">
								<tr>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
									{#each displayColumns.filter((c) => c !== 'author_name') as col}
										{@const sk = columnSortKey[col]}
										<th class="px-4 py-3 text-left text-xs font-medium uppercase whitespace-nowrap {sk ? 'cursor-pointer select-none hover:bg-gray-100 transition-colors' : 'text-gray-400'} {sk && sortKey === sk ? 'text-indigo-700' : 'text-gray-500'}" scope="col" onclick={() => { if (sk) toggleSort(sk); }}>
											{columnLabels[col] ?? col.replace(/_/g, ' ')}{sk ? sortIndicator(sk) : ''}
										</th>
									{/each}
								</tr>
							</thead>
							<tbody class="bg-white divide-y divide-gray-100">
								{#each summary.top_h_index as row}
									<tr class="hover:bg-gray-50">
										<td class="px-4 py-3 text-sm font-medium text-indigo-600">{fmtCell(row.author_name)}</td>
										{#each displayColumns.filter((c) => c !== 'author_name') as col}
											<td class="px-4 py-3 text-sm text-gray-700">{fmtCell((row as Record<string, unknown>)[col])}</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{:else if activeTab === 'table'}
			{#if indicators.length === 0}
				<div class="bg-white rounded-lg shadow p-12 text-center">
					<p class="text-gray-500">No indicator data available</p>
				</div>
			{:else}
				<p class="text-sm text-gray-600 mb-3">Showing {indicators.length} of {total} indicators</p>
				<div class="bg-white rounded-lg shadow overflow-hidden">
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200" aria-label="All author indicators">
							<thead class="bg-gray-50">
								<tr>
									{#each displayColumns as col}
										{@const sk = columnSortKey[col]}
										<th class="px-3 py-2 text-left text-xs font-medium uppercase whitespace-nowrap {sk ? 'cursor-pointer select-none hover:bg-gray-100 transition-colors' : 'text-gray-400'} {sk && sortKey === sk ? 'text-indigo-700' : 'text-gray-500'}" scope="col" onclick={() => { if (sk) toggleSort(sk); }} aria-sort={sk && sortKey === sk ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
											{columnLabels[col] ?? col.replace(/_/g, ' ')}{sk ? sortIndicator(sk) : ''}
										</th>
									{/each}
								</tr>
							</thead>
							<tbody class="bg-white divide-y divide-gray-100">
								{#each indicators as row}
									<tr class="hover:bg-gray-50">
										{#each displayColumns as col}
											{@const val = (row as Record<string, unknown>)[col]}
											<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
												{#if col === 'author_name'}
													<a href="/authors/{(row as Record<string, unknown>).author_id}" class="text-indigo-600 hover:underline">{fmtCell(val)}</a>
												{:else}
													{fmtCell(val)}
												{/if}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
				<div class="flex items-center justify-between mt-4">
					<button onclick={() => { offset = Math.max(0, offset - limit); fetchData(); }} disabled={offset === 0} class="px-4 py-2 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">Previous</button>
					<span class="text-sm text-gray-600">Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit) || 1}</span>
					<button onclick={() => { offset = offset + limit; fetchData(); }} disabled={offset + limit >= total} class="px-4 py-2 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">Next</button>
				</div>
			{/if}
		{/if}
	{/if}
</div>
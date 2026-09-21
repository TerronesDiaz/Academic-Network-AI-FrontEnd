<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { listIndicators, getIndicatorSummary } from '$lib/api/client';
	import type { IndicatorRow, IndicatorSummary } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages.js';
	import { formatNumber } from '$lib/i18n/format';
	import { userError } from '$lib/i18n/errors';

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
			error = userError(e, m.indicators_load_error());
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
		return isNaN(n) ? String(v) : formatNumber(n);
	}

	function fmtCell(value: unknown) {
		if (value == null) return '—';
		if (typeof value === 'number') return formatNumber(value);
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
		author_name: m.authors_name(),
		total_publications: m.publications_title(),
		scholar_citations: m.indicators_scholar_citations_short(),
		openalex_citations: m.indicators_openalex_citations_short(),
		scholar_h_index: 'Scholar H-Idx',
		openalex_h_index: 'OpenAlex H-Idx',
		scholar_i10_index: 'Scholar I10',
		openalex_i10_index: 'OpenAlex I10',
		pagerank: 'PageRank',
		betweenness_centrality: m.indicators_betweenness(),
		clustering_coeff: m.indicators_clustering(),
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

<div class="app-page">
	<header class="page-header"><h1 class="page-heading">{m.indicators_title()}</h1><a href="/indicators/altmetrics" class="text-blue-600 underline">Altmétricos por publicación</a></header>
		<div class="tabs" role="tablist" aria-label={m.indicators_views()}>
			<button
				role="tab"
				aria-selected={activeTab === 'summary'}
				class="tab {activeTab === 'summary' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'summary')}>{m.indicators_summary()}</button>
			<button
				role="tab"
				aria-selected={activeTab === 'table'}
				class="tab {activeTab === 'table' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'table')}>{m.indicators_all()}</button>
	</div>

	{#if error}
		<div role="alert" class="notice-error">{error}</div>
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
			<div class="metric-strip">
				<div class="metric-cell"><div class="metric-label">{m.authors_title()}</div><div class="metric-value">{fmtNum(summary.authors)}</div></div>
				<div class="metric-cell"><div class="metric-label">{m.indicators_total_publications()}</div><div class="metric-value">{fmtNum(summary.total_publications)}</div></div>
				<div class="metric-cell"><div class="metric-label">{m.publication_scholar_citations()}</div><div class="metric-value">{fmtNum(summary.total_citations_scholar)}</div></div>
				<div class="metric-cell"><div class="metric-label">{m.indicators_average_h({ source: 'Scholar' })}</div><div class="metric-value">{summary.average_scholar_h_index}</div></div>
				<div class="metric-cell"><div class="metric-label">{m.indicators_median_h({ source: 'Scholar' })}</div><div class="metric-value">{summary.median_scholar_h_index}</div></div>
				<div class="metric-cell"><div class="metric-label">{m.publication_openalex_citations()}</div><div class="metric-value">{fmtNum(summary.total_citations_openalex)}</div></div>
				<div class="metric-cell"><div class="metric-label">{m.indicators_average_h({ source: 'OpenAlex' })}</div><div class="metric-value">{summary.average_openalex_h_index}</div></div>
				<div class="metric-cell"><div class="metric-label">{m.indicators_median_h({ source: 'OpenAlex' })}</div><div class="metric-value">{summary.median_openalex_h_index}</div></div>
			</div>

			<div class="surface p-6">
				<h2 class="text-lg font-semibold text-gray-900 mb-4">{m.indicators_top_h()}</h2>
				{#if summary.top_h_index.length === 0}
					<p class="text-gray-500 py-6 text-center">{m.indicators_empty()}</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="data-table" aria-label={m.indicators_top_list()}>
							<thead class="bg-gray-50">
								<tr>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{m.authors_name()}</th>
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
				<div class="empty-state">
					<p class="text-gray-500">{m.indicators_empty()}</p>
				</div>
			{:else}
				<p class="text-sm text-gray-600 mb-3">{m.indicators_showing({ shown: indicators.length, total })}</p>
				<div class="data-shell">
					<div class="overflow-x-auto">
						<table class="data-table" aria-label={m.indicators_all_list()}>
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
													<a href="/authors/{(row as Record<string, unknown>).author_id}?from=/indicators&fromLabel=Indicators" class="text-indigo-600 hover:underline">{fmtCell(val)}</a>
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
					<button onclick={() => { offset = Math.max(0, offset - limit); fetchData(); }} disabled={offset === 0} class="btn-secondary">{m.common_previous()}</button>
					<span class="text-sm text-gray-600">{m.common_page_of({ page: Math.floor(offset / limit) + 1, total: Math.ceil(total / limit) || 1 })}</span>
					<button onclick={() => { offset = offset + limit; fetchData(); }} disabled={offset + limit >= total} class="btn-secondary">{m.common_next()}</button>
				</div>
			{/if}
		{/if}
	{/if}
</div>

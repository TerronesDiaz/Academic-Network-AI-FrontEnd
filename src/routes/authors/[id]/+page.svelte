<script lang="ts">
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { getAuthor, getAuthorPublications, getAuthorCoauthors, getAuthorIndicatorHistory } from '$lib/api/client';
	import type { Author, AuthorPublication, Coauthor } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages.js';
	import { formatNumber } from '$lib/i18n/format';
	import { userError } from '$lib/i18n/errors';

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

	let backUrl = $state('/authors');
	let backLabel = $state(m.common_back_to({ target: m.authors_title() }));

	$effect(() => {
		const from = $page.url.searchParams.get('from');
		const fromLabel = $page.url.searchParams.get('fromLabel');
		if (from) {
			backUrl = from;
			backLabel = fromLabel ? m.common_back_to({ target: fromLabel }) : m.common_back();
		}
	});

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
			error = userError(e, m.author_load_error());
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
		{ key: 'title',            label: m.publications_title_column() },
		{ key: 'publication_year', label: m.publications_year() },
		{ key: 'venue',            label: m.publications_venue() },
		{ key: 'citations_count',  label: 'OpenAlex' },
	];

	function fmtNum(v: unknown) {
		if (v == null) return '—';
		const n = Number(v);
		return isNaN(n) ? String(v) : formatNumber(n);
	}

	function handleRowKeydown(e: KeyboardEvent, href: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			goto(href);
		}
	}

	const tabNames = ['publications', 'coauthors', 'indicators'] as const;
</script>

<div class="app-page">
	{#if loading}
		<div class="space-y-4 animate-pulse">
			<div class="h-6 bg-gray-200 rounded w-32 mb-6"></div>
			<div class="surface p-6">
				<div class="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
				<div class="h-5 bg-gray-100 rounded w-1/4"></div>
			</div>
		</div>
	{:else if error}
		<div role="alert" class="notice-error">{error}</div>
	{:else if author}
		<nav class="mb-6">
			<button onclick={() => goto(backUrl)} class="text-sm text-indigo-600 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">&larr; {backLabel}</button>
		</nav>

		<div class="surface p-6">
			<div class="flex flex-col gap-4">
				<div>
					<h1 class="text-2xl font-bold text-gray-900">{author.canonical_name}</h1>
					<p class="text-gray-600 mt-1">{author.affiliation || m.author_no_affiliation()}</p>
					<p class="text-gray-600 text-sm">
						{#if author.email_domain}{'@'}{author.email_domain} &middot; {/if}
						<span class="inline-flex text-xs font-medium px-2 py-0.5 rounded-full {author.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}">{author.is_active ? m.authors_active() : m.authors_inactive()}</span>
					</p>
					{#if author.profile_url}
						<a href={author.profile_url} target="_blank" rel="noopener noreferrer" class="text-sm text-indigo-600 hover:underline mt-1 inline-block focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded" aria-label={m.author_scholar_profile_new_tab()}>{m.author_scholar_profile()}</a>
					{/if}
				</div>

				<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
					<div class="border-l-2 border-gray-300 pl-4">
						<h3 class="text-sm font-semibold text-gray-900 mb-3">Google Scholar</h3>
						<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
							<div class="text-center">
								<div class="text-2xl font-semibold tabular-nums text-gray-950">{fmtNum(author.base_citations)}</div>
								<div class="text-xs text-gray-600">{m.author_citations()}</div>
							</div>
							{#if author.scholar_metrics}
								<div class="text-center">
									<div class="text-2xl font-semibold tabular-nums text-gray-950">{author.scholar_metrics.h_index_all}</div>
									<div class="text-xs text-gray-600">H-Index</div>
								</div>
								<div class="text-center">
									<div class="text-2xl font-semibold tabular-nums text-gray-950">{author.scholar_metrics.i10_index_all}</div>
									<div class="text-xs text-gray-600">I10-Index</div>
								</div>
								<div class="text-center">
									<div class="text-2xl font-semibold tabular-nums text-gray-950">{author.scholar_metrics.publications_count}</div>
									<div class="text-xs text-gray-600">{m.author_publications_count()}</div>
								</div>
							{/if}
						</div>
						{#if author.scholar_metrics}
							<div class="mt-3 pt-3 border-t border-gray-200 grid grid-cols-2 gap-2 text-xs text-gray-600">
								<div>{m.author_citations_since({ count: formatNumber(author.scholar_metrics.citations_since_2021) })}</div>
								<div>{m.author_h_since({ count: author.scholar_metrics.h_index_since_2021 })}</div>
								<div>{m.author_i10_since({ count: author.scholar_metrics.i10_index_since_2021 })}</div>
							</div>
						{/if}
					</div>

					<div class="border-l-2 border-gray-300 pl-4">
						<h3 class="text-sm font-semibold text-gray-900 mb-3">OpenAlex</h3>
						{#if author.openalex_metrics && author.openalex_metrics.publications_count > 0}
							<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
								<div class="text-center">
									<div class="text-2xl font-semibold tabular-nums text-gray-950">{fmtNum(author.openalex_metrics.total_citations)}</div>
									<div class="text-xs text-gray-600">{m.author_citations()}</div>
								</div>
								<div class="text-center">
									<div class="text-2xl font-semibold tabular-nums text-gray-950">{author.openalex_metrics.h_index}</div>
									<div class="text-xs text-gray-600">H-Index</div>
								</div>
								<div class="text-center">
									<div class="text-2xl font-semibold tabular-nums text-gray-950">{author.openalex_metrics.i10_index}</div>
									<div class="text-xs text-gray-600">I10-Index</div>
								</div>
								<div class="text-center">
									<div class="text-2xl font-semibold tabular-nums text-gray-950">{author.openalex_metrics.publications_count}</div>
									<div class="text-xs text-gray-600">{m.author_publications_count()}</div>
								</div>
							</div>
							<div class="mt-3 pt-3 border-t border-emerald-200 grid grid-cols-2 gap-2 text-xs text-gray-600">
								<div>{m.author_citations_since({ count: formatNumber(author.openalex_metrics.citations_since_2021) })}</div>
								<div>{m.author_h_since({ count: author.openalex_metrics.h_index_since_2021 })}</div>
								<div>{m.author_i10_since({ count: author.openalex_metrics.i10_index_since_2021 })}</div>
								<div>{m.author_publications_since({ count: author.openalex_metrics.publications_since_2021 })}</div>
							</div>
						{:else}
							<div class="text-center py-4 text-gray-500 text-sm">
								{m.author_no_openalex()}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<div class="tabs overflow-x-auto" role="tablist" aria-label={m.author_detail_views()}>
			<button
				role="tab"
				aria-selected={activeTab === 'publications'}
				class="tab whitespace-nowrap {activeTab === 'publications' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'publications')}
			>{m.author_publications_tab({ count: pubTotal })}</button>
			<button
				role="tab"
				aria-selected={activeTab === 'coauthors'}
				class="tab whitespace-nowrap {activeTab === 'coauthors' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'coauthors')}
			>{m.author_coauthors_tab({ count: coauthors.length })}</button>
			<button
				role="tab"
				aria-selected={activeTab === 'indicators'}
				class="tab whitespace-nowrap {activeTab === 'indicators' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'indicators')}
			>{m.author_indicators_tab()}</button>
		</div>

		{#if activeTab === 'publications'}
			<div class="data-shell" role="tabpanel" aria-label={m.publications_title()}>
				{#if publications.length === 0}
					<p class="p-12 text-center text-gray-500">{m.publications_empty()}</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="data-table" aria-label={m.author_publications_list()}>
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
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scholar</th>
								</tr>
							</thead>
							<tbody class="bg-white divide-y divide-gray-100">
								{#each publications as pub}
									<tr
										class="hover:bg-gray-50 cursor-pointer focus-within:bg-gray-50"
										role="link"
										tabindex="0"
										onclick={() => goto(`/publications/${pub.id}?from=/authors/${authorId}&fromLabel=${encodeURIComponent('Author: ' + (author?.canonical_name ?? ''))}`)}
										onkeydown={(e) => handleRowKeydown(e, `/publications/${pub.id}?from=/authors/${authorId}&fromLabel=${encodeURIComponent('Author: ' + (author?.canonical_name ?? ''))}`)}
										aria-label={m.publications_view({ title: pub.title })}
									>
										<td class="px-4 py-3 text-sm text-gray-900 max-w-md truncate">{pub.title}</td>
										<td class="px-4 py-3 text-sm text-gray-600">{pub.publication_year ?? '—'}</td>
										<td class="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{pub.venue || '—'}</td>
										<td class="px-4 py-3 text-sm text-gray-600">{pub.openalex_citations ?? pub.citations_count}</td>
										<td class="px-4 py-3 text-sm text-gray-600">{pub.scholar_citations ?? '—'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{:else if activeTab === 'coauthors'}
			<div class="data-shell" role="tabpanel" aria-label={m.author_coauthors()}>
				{#if coauthors.length === 0}
					<p class="p-12 text-center text-gray-500">{m.author_coauthors_empty()}</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="data-table" aria-label={m.author_coauthors_list()}>
							<thead class="bg-gray-50">
								<tr>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{m.authors_name()}</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{m.author_shared_publications()}</th>
								</tr>
							</thead>
							<tbody class="bg-white divide-y divide-gray-100">
								{#each coauthors as co}
									<tr
										class="hover:bg-gray-50 cursor-pointer focus-within:bg-gray-50"
										role="link"
										tabindex="0"
										onclick={() => goto(`/authors/${co.author_id}?from=/authors/${authorId}&fromLabel=${encodeURIComponent('Author: ' + (author?.canonical_name ?? ''))}`)}
										onkeydown={(e) => handleRowKeydown(e, `/authors/${co.author_id}?from=/authors/${authorId}&fromLabel=${encodeURIComponent('Author: ' + (author?.canonical_name ?? ''))}`)}
										aria-label={m.author_coauthor_view({ name: co.canonical_name })}
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
			<div class="data-shell" role="tabpanel" aria-label={m.author_indicator_history()}>
				{#if indicatorHistory.length === 0}
					<p class="p-12 text-center text-gray-500">{m.author_indicator_history_empty()}</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="data-table" aria-label={m.author_indicator_history()}>
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

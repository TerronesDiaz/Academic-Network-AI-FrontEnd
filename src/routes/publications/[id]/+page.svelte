<script lang="ts">
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { getPublication } from '$lib/api/client';
	import type { PublicationDetail } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages.js';
	import { formatDate } from '$lib/i18n/format';
	import { userError } from '$lib/i18n/errors';

	let publicationId = Number($page.params.id);
	let pub = $state<PublicationDetail | null>(null);
	let loading = $state(true);
	let error = $state('');

	let backUrl = $state('/publications');
	let backLabel = $state(m.common_back_to({ target: m.publications_title() }));

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

	async function fetchData() {
		loading = true;
		error = '';
		try {
			publicationId = Number($page.params.id);
			pub = await getPublication(publicationId);
		} catch (e) {
			error = userError(e, m.publication_load_error());
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (browser && $auth) fetchData();
	});

	function fmtDate(d: string | null) {
		if (!d) return '—';
		return formatDate(d);
	}
</script>

<div class="app-page">
	{#if loading}
		<div class="space-y-4 animate-pulse">
			<div class="h-6 bg-gray-200 rounded w-40 mb-6"></div>
			<div class="surface p-6">
				<div class="h-7 bg-gray-200 rounded w-3/4 mb-4"></div>
				<div class="grid grid-cols-3 gap-4">
					<div class="h-5 bg-gray-100 rounded w-full"></div>
					<div class="h-5 bg-gray-100 rounded w-full"></div>
					<div class="h-5 bg-gray-100 rounded w-full"></div>
				</div>
			</div>
		</div>
	{:else if error}
		<div role="alert" class="notice-error">{error}</div>
	{:else if pub}
		<nav class="mb-6">
			<button onclick={() => goto(backUrl)} class="text-sm text-indigo-600 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">&larr; {backLabel}</button>
		</nav>

		<article class="surface p-6" aria-labelledby="pub-title">
			<h1 id="pub-title" class="page-heading mb-4">{pub.title}</h1>
			<dl class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				<div>
					<dt class="text-sm text-gray-500">{m.publications_year()}</dt>
					<dd class="text-sm font-medium text-gray-900">{pub.publication_year ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-sm text-gray-500">{m.publications_venue()}</dt>
					<dd class="text-sm font-medium text-gray-900">{pub.venue || '—'}</dd>
				</div>
				<div>
					<dt class="text-sm text-gray-500">{m.publication_document_type()}</dt>
					<dd class="text-sm font-medium text-gray-900">{pub.document_type || '—'}</dd>
				</div>
				<div>
					<dt class="text-sm text-gray-500">{m.publication_openalex_citations()}</dt>
					<dd class="text-sm font-medium text-gray-900">{pub.openalex_citations ?? pub.citations_count}</dd>
				</div>
				<div>
					<dt class="text-sm text-gray-500">{m.publication_scholar_citations()}</dt>
					<dd class="text-sm font-medium text-gray-900">{pub.scholar_citations ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-sm text-gray-500">DOI</dt>
					<dd class="text-sm font-medium">
						{#if pub.doi}
							<a href="https://doi.org/{pub.doi}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded" aria-label="DOI {pub.doi} ({m.common_opens_new_tab()})">{pub.doi}</a>
						{:else}
							—
						{/if}
					</dd>
				</div>
				<div>
					<dt class="text-sm text-gray-500">{m.publication_external_id()}</dt>
					<dd class="text-sm font-medium text-gray-900 break-all">{pub.external_id || '—'}</dd>
				</div>
			</dl>
			{#if pub.sources.length > 0}
				<div class="mt-4 pt-3 border-t border-gray-100">
					<span class="text-sm text-gray-500">{m.publication_sources()} </span>
					<span class="text-sm text-gray-800">{pub.sources.join(' · ')}</span>
				</div>
			{/if}
		</article>

		{#if pub.external_metadata.length > 0}
			<section class="surface p-6" aria-labelledby="ext-meta-heading">
				<h2 id="ext-meta-heading" class="text-lg font-semibold text-gray-900 mb-4">{m.publication_external_metadata()}</h2>
				{#each pub.external_metadata as meta}
					<div class="border-t border-gray-100 first:border-t-0 py-3">
						<dl class="grid grid-cols-2 sm:grid-cols-3 gap-3">
							<div>
								<dt class="text-xs text-gray-500">{m.publication_source()}</dt>
								<dd class="text-sm font-medium text-gray-900">{meta.source}</dd>
							</div>
							<div>
								<dt class="text-xs text-gray-500">{m.publication_match_confidence()}</dt>
								<dd class="text-sm font-medium text-gray-900">{meta.match_confidence || '—'}</dd>
							</div>
							<div>
								<dt class="text-xs text-gray-500">{m.publication_document_type()}</dt>
								<dd class="text-sm font-medium text-gray-900">{meta.document_type || '—'}</dd>
							</div>
							<div>
								<dt class="text-xs text-gray-500">DOI</dt>
								<dd class="text-sm font-medium text-gray-900 break-all">{meta.doi || '—'}</dd>
							</div>
							<div>
								<dt class="text-xs text-gray-500">{m.publication_citations()}</dt>
								<dd class="text-sm font-medium text-gray-900">{meta.citations_count ?? '—'}</dd>
							</div>
							<div>
								<dt class="text-xs text-gray-500">{m.publication_enriched_at()}</dt>
								<dd class="text-sm font-medium text-gray-900">{fmtDate(meta.enriched_at)}</dd>
							</div>
						</dl>
					</div>
				{/each}
			</section>
		{/if}

		<section class="surface" aria-labelledby="pub-authors-heading">
			<h2 id="pub-authors-heading" class="surface-header text-lg font-semibold text-gray-900">{m.publication_authors_count({ count: pub.authors.length })}</h2>
			<div class="overflow-x-auto">
				<table class="data-table" aria-label={m.publication_authors_list()}>
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.publication_position()}</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.authors_name()}</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.publication_signature()}</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">{m.publication_resolution()}</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-100">
						{#each pub.authors as a, i}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3 text-sm text-gray-500">{a.author_position ?? i + 1}</td>
								<th class="px-4 py-3 text-sm font-normal" scope="row">
									{#if a.author_id}
										{@const pubLabel = pub.title.length > 60 ? pub.title.substring(0, 57) + '...' : pub.title}
										<a href="/authors/{a.author_id}?from=/publications/{pub.id}&fromLabel={encodeURIComponent('Publication: ' + pubLabel)}" class="text-indigo-600 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">{a.canonical_name || '—'}</a>
									{:else}
										{a.canonical_name || '—'}
									{/if}
								</th>
								<td class="px-4 py-3 text-sm text-gray-600 max-w-md">
									{a.observed_signatures.join(' · ') || '—'}
								</td>
								<td class="px-4 py-3 text-xs">
									{#if a.resolution_method && a.resolution_method !== 'unresolved'}
										<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded {a.resolution_status === 'heuristic_match' ? 'bg-green-100 text-green-700' : a.resolution_status === 'ambiguous' ? 'bg-amber-100 text-amber-700' : a.resolution_status === 'external' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}" title={m.publication_resolution_title({ method: a.resolution_method, model: a.resolution_model || '—', confidence: a.resolution_confidence || '—' })}>
											{a.resolution_method.replace('_', ' ')}
											{#if a.resolution_model}
												<span class="text-[10px] opacity-75 ml-0.5">({a.resolution_model})</span>
											{/if}
										</span>
									{:else}
										<span class="text-gray-400">—</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</div>

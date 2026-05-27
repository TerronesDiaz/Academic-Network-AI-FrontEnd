<script lang="ts">
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { getPublication } from '$lib/api/client';
	import type { PublicationDetail } from '$lib/api/types';

	let publicationId = Number($page.params.id);
	let pub = $state<PublicationDetail | null>(null);
	let loading = $state(true);
	let error = $state('');

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
			error = e instanceof Error ? e.message : 'Failed to load publication';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (browser && $auth) fetchData();
	});

	function fmtDate(d: string | null) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}
</script>

<div>
	{#if loading}
		<div class="space-y-4 animate-pulse">
			<div class="h-6 bg-gray-200 rounded w-40 mb-6"></div>
			<div class="bg-white rounded-lg shadow p-6">
				<div class="h-7 bg-gray-200 rounded w-3/4 mb-4"></div>
				<div class="grid grid-cols-3 gap-4">
					<div class="h-5 bg-gray-100 rounded w-full"></div>
					<div class="h-5 bg-gray-100 rounded w-full"></div>
					<div class="h-5 bg-gray-100 rounded w-full"></div>
				</div>
			</div>
		</div>
	{:else if error}
		<div role="alert" class="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
	{:else if pub}
		<nav class="mb-6">
			<button onclick={() => goto('/publications')} class="text-sm text-indigo-600 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">&larr; Back to Publications</button>
		</nav>

		<article class="bg-white rounded-lg shadow p-6 mb-6" aria-labelledby="pub-title">
			<h1 id="pub-title" class="text-xl font-bold text-gray-900 mb-4">{pub.title}</h1>
			<dl class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				<div>
					<dt class="text-sm text-gray-500">Year</dt>
					<dd class="text-sm font-medium text-gray-900">{pub.publication_year ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-sm text-gray-500">Venue</dt>
					<dd class="text-sm font-medium text-gray-900">{pub.venue || '—'}</dd>
				</div>
				<div>
					<dt class="text-sm text-gray-500">Document Type</dt>
					<dd class="text-sm font-medium text-gray-900">{pub.document_type || '—'}</dd>
				</div>
				<div>
					<dt class="text-sm text-gray-500">Citas OpenAlex</dt>
					<dd class="text-sm font-medium text-gray-900">{pub.openalex_citations ?? pub.citations_count}</dd>
				</div>
				<div>
					<dt class="text-sm text-gray-500">Citas Google Scholar</dt>
					<dd class="text-sm font-medium text-gray-900">{pub.scholar_citations ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-sm text-gray-500">DOI</dt>
					<dd class="text-sm font-medium">
						{#if pub.doi}
							<a href="https://doi.org/{pub.doi}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded" aria-label="DOI {pub.doi} (opens in new tab)">{pub.doi}</a>
						{:else}
							—
						{/if}
					</dd>
				</div>
				<div>
					<dt class="text-sm text-gray-500">External ID</dt>
					<dd class="text-sm font-medium text-gray-900 break-all">{pub.external_id || '—'}</dd>
				</div>
			</dl>
			{#if pub.sources.length > 0}
				<div class="mt-4 pt-3 border-t border-gray-100">
					<span class="text-sm text-gray-500">Sources: </span>
					{#each pub.sources as src}
						<span class="inline-block bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded mr-1">{src}</span>
					{/each}
				</div>
			{/if}
		</article>

		{#if pub.external_metadata.length > 0}
			<section class="bg-white rounded-lg shadow p-6 mb-6" aria-labelledby="ext-meta-heading">
				<h2 id="ext-meta-heading" class="text-lg font-semibold text-gray-900 mb-4">External Metadata</h2>
				{#each pub.external_metadata as meta}
					<div class="border-t border-gray-100 first:border-t-0 py-3">
						<dl class="grid grid-cols-2 sm:grid-cols-3 gap-3">
							<div>
								<dt class="text-xs text-gray-500">Source</dt>
								<dd class="text-sm font-medium text-gray-900">{meta.source}</dd>
							</div>
							<div>
								<dt class="text-xs text-gray-500">Match Confidence</dt>
								<dd class="text-sm font-medium text-gray-900">{meta.match_confidence || '—'}</dd>
							</div>
							<div>
								<dt class="text-xs text-gray-500">Document Type</dt>
								<dd class="text-sm font-medium text-gray-900">{meta.document_type || '—'}</dd>
							</div>
							<div>
								<dt class="text-xs text-gray-500">DOI</dt>
								<dd class="text-sm font-medium text-gray-900 break-all">{meta.doi || '—'}</dd>
							</div>
							<div>
								<dt class="text-xs text-gray-500">Citations</dt>
								<dd class="text-sm font-medium text-gray-900">{meta.citations_count ?? '—'}</dd>
							</div>
							<div>
								<dt class="text-xs text-gray-500">Enriched At</dt>
								<dd class="text-sm font-medium text-gray-900">{fmtDate(meta.enriched_at)}</dd>
							</div>
						</dl>
					</div>
				{/each}
			</section>
		{/if}

		<section class="bg-white rounded-lg shadow p-6" aria-labelledby="pub-authors-heading">
			<h2 id="pub-authors-heading" class="text-lg font-semibold text-gray-900 mb-4">Authors ({pub.authors.length})</h2>
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200" aria-label="Publication authors">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">#</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Name</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Position</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Profile Owner</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Signature</th>
							<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" scope="col">Resolution</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-100">
						{#each pub.authors as a, i}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-3 text-sm text-gray-500">{a.author_position ?? i + 1}</td>
								<th class="px-4 py-3 text-sm font-normal" scope="row">
									{#if a.author_id}
										<a href="/authors/{a.author_id}" class="text-indigo-600 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">{a.canonical_name || '—'}</a>
									{:else}
										{a.canonical_name || '—'}
									{/if}
								</th>
								<td class="px-4 py-3 text-sm text-gray-600">{a.author_position ?? '—'}</td>
								<td class="px-4 py-3 text-sm text-gray-700">{a.is_profile_owner ? 'Yes' : 'No'}</td>
								<td class="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{a.observed_signature || '—'}</td>
								<td class="px-4 py-3 text-xs">
									{#if a.resolution_method && a.resolution_method !== 'unresolved'}
										<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded {a.resolution_status === 'heuristic_match' ? 'bg-green-100 text-green-700' : a.resolution_status === 'ambiguous' ? 'bg-amber-100 text-amber-700' : a.resolution_status === 'external' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}" title="Method: {a.resolution_method}  Model: {a.resolution_model || 'n/a'}  Confidence: {a.resolution_confidence || 'n/a'}">
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
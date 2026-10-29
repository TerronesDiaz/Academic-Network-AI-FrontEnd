<script lang="ts">
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { getPublication, getDimensionsEvidence, acquireDimensionsEvidence, type DimensionsEvidenceResponse } from '$lib/api/client';
	import type { PublicationAuthor, PublicationDetail } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages.js';
	import { formatDate, formatNumber } from '$lib/i18n/format';
	import { userError } from '$lib/i18n/errors';

	let publicationId = Number($page.params.id);
	let pub = $state<PublicationDetail | null>(null);
	let loading = $state(true);
	let error = $state('');
	let dimensions = $state<DimensionsEvidenceResponse | null>(null);
	let dimensionsBusy = $state(false);
	let dimensionsError = $state('');

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
			dimensions = null;
			dimensionsError = '';
			try { dimensions = await getDimensionsEvidence(publicationId); }
			catch (e) { dimensionsError = userError(e, m.dimensions_error()); }
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

	function fmtCount(v: number | null | undefined) {
		return v == null ? '—' : formatNumber(v);
	}

	// Positions are stored zero-based by both the local byline and Dimensions.
	function displayPosition(position: number | null, index: number) {
		return (position ?? index) + 1;
	}

	function normalizeDoi(doi: string | null | undefined) {
		return (doi ?? '').trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
	}

	function dimensionsStatus(status: string) {
		if (status === 'matched') return m.dimensions_status_matched();
		if (status === 'conflict') return m.dimensions_status_conflict();
		if (status === 'transient') return m.dimensions_status_transient();
		return m.dimensions_status_unmatched();
	}

	function dimensionsBadge(status: string) {
		if (status === 'matched') return 'badge-success';
		if (status === 'conflict') return 'badge-danger';
		if (status === 'transient') return 'badge-warning';
		return 'badge-neutral';
	}

	function matchMethod(method: string | null) {
		if (!method) return '—';
		if (method === 'exact_doi') return m.dimensions_method_exact_doi();
		if (method.startsWith('title')) return m.dimensions_method_title_year();
		return method.replaceAll('_', ' ');
	}

	function resolutionBadge(status: string | null | undefined) {
		if (status === 'confirmed' || status === 'heuristic_match') return 'badge-success';
		if (status === 'ambiguous') return 'badge-warning';
		if (status === 'external') return 'badge-info';
		return 'badge-neutral';
	}

	function authorHref(author: PublicationAuthor, p: PublicationDetail) {
		const label = p.title.length > 60 ? p.title.substring(0, 57) + '…' : p.title;
		return `/authors/${author.author_id}?from=/publications/${p.id}&fromLabel=${encodeURIComponent(m.publication_back_label({ title: label }))}`;
	}

	async function acquireDimensions() {
		dimensionsBusy = true;
		dimensionsError = '';
		try { dimensions = await acquireDimensionsEvidence(publicationId, Boolean(dimensions?.evidence)); }
		catch (e) { dimensionsError = userError(e, m.dimensions_error()); }
		finally { dimensionsBusy = false; }
	}

	let evidence = $derived(dimensions?.evidence ?? null);
	let localByPosition = $derived(
		new Map((pub?.authors ?? []).map((a, i) => [a.author_position ?? i, a]))
	);
	let dimensionsSummary = $derived.by(() => {
		const authors = evidence?.authors ?? [];
		return {
			total: authors.length,
			orcid: authors.filter((a) => a.orcid).length,
			affiliated: authors.filter((a) => a.affiliations.length > 0).length,
			inDirectory: authors.filter((a) => localByPosition.get(a.position)?.author_id != null).length
		};
	});
	let doiMismatch = $derived(
		Boolean(evidence?.doi && pub?.doi && normalizeDoi(evidence.doi) !== normalizeDoi(pub.doi))
	);
	let yearMismatch = $derived(
		Boolean(evidence?.year && pub?.publication_year && evidence.year !== pub.publication_year)
	);
	let bylineMismatch = $derived(
		Boolean(evidence && evidence.authors.length > 0 && pub && evidence.authors.length !== pub.authors.length)
	);
</script>

<div class="app-page">
	{#if loading}
		<div class="space-y-4 animate-pulse" aria-hidden="true">
			<div class="h-4 w-40 rounded bg-gray-200"></div>
			<div class="surface p-6">
				<div class="mb-4 h-7 w-3/4 rounded bg-gray-200"></div>
				<div class="grid grid-cols-3 gap-4">
					<div class="h-5 w-full rounded bg-gray-100"></div>
					<div class="h-5 w-full rounded bg-gray-100"></div>
					<div class="h-5 w-full rounded bg-gray-100"></div>
				</div>
			</div>
		</div>
	{:else if error}
		<div role="alert" class="notice-error">{error}</div>
	{:else if pub}
		<nav>
			<button onclick={() => goto(backUrl)} class="btn-link">&larr; {backLabel}</button>
		</nav>

		<article class="surface" aria-labelledby="pub-title">
			<div class="surface-body space-y-5">
				<div>
					<p class="page-kicker">{pub.publication_year ?? '—'}{#if pub.document_type} · {pub.document_type}{/if}</p>
					<h1 id="pub-title" class="page-heading">{pub.title}</h1>
					{#if pub.venue}<p class="mt-1 text-sm text-gray-600">{pub.venue}</p>{/if}
				</div>

				<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
					<dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
						<div>
							<dt class="text-gray-500">DOI</dt>
							<dd class="font-medium break-all">
								{#if pub.doi}
									<a href="https://doi.org/{pub.doi}" target="_blank" rel="noopener noreferrer" class="text-indigo-700 hover:underline" aria-label="DOI {pub.doi} ({m.common_opens_new_tab()})">{pub.doi}</a>
								{:else}—{/if}
							</dd>
						</div>
						<div>
							<dt class="text-gray-500">{m.publication_external_id()}</dt>
							<dd class="font-medium text-gray-900 break-all">{pub.external_id || '—'}</dd>
						</div>
						<div>
							<dt class="text-gray-500">Google Scholar</dt>
							<dd class="font-medium">
								{#if pub.scholar_url}
									<a href={pub.scholar_url} target="_blank" rel="noopener noreferrer" class="text-indigo-700 hover:underline" aria-label="{m.publication_view_scholar()} ({m.common_opens_new_tab()})">{m.publication_view_scholar()}</a>
								{:else}—{/if}
							</dd>
						</div>
						<div>
							<dt class="text-gray-500">{m.publication_sources()}</dt>
							<dd class="mt-0.5 flex flex-wrap gap-1.5">
								{#each pub.sources as source}<span class="badge badge-neutral">{source}</span>{/each}
								{#if evidence?.status === 'matched'}<span class="badge badge-info">dimensions</span>{/if}
								{#if pub.sources.length === 0 && evidence?.status !== 'matched'}—{/if}
							</dd>
						</div>
					</dl>

					<div class="rounded-lg border border-gray-200">
						<p class="border-b border-gray-200 px-4 py-2 text-xs font-medium text-gray-500">{m.publication_citations_by_source()}</p>
						<dl class="grid grid-cols-2 divide-x divide-gray-200">
							<div class="px-4 py-3">
								<dt class="metric-label">OpenAlex</dt>
								<dd class="metric-value">{fmtCount(pub.openalex_citations ?? pub.citations_count)}</dd>
							</div>
							<div class="px-4 py-3">
								<dt class="metric-label">Google Scholar</dt>
								<dd class="metric-value">{fmtCount(pub.scholar_citations)}</dd>
							</div>
						</dl>
					</div>
				</div>
			</div>
		</article>

		<section class="surface" aria-labelledby="pub-authors-heading">
			<div class="surface-header">
				<h2 id="pub-authors-heading" class="section-title">{m.publication_authors_count({ count: pub.authors.length })}</h2>
			</div>
			<div class="data-scroll">
				<table class="data-table" aria-label={m.publication_authors_list()}>
					<thead>
						<tr>
							<th class="w-12" scope="col">#</th>
							<th scope="col">{m.authors_name()}</th>
							<th scope="col">{m.publication_signature()}</th>
							<th scope="col">{m.publication_resolution()}</th>
						</tr>
					</thead>
					<tbody>
						{#each pub.authors as a, i}
							<tr>
								<td class="tabular-nums text-gray-500">{displayPosition(a.author_position, i)}</td>
								<th class="font-normal" scope="row">
									{#if a.author_id}
										<a href={authorHref(a, pub)} class="font-medium text-indigo-700 hover:underline">{a.canonical_name || '—'}</a>
									{:else}
										<span class="text-gray-900">{a.canonical_name || '—'}</span>
									{/if}
								</th>
								<td class="max-w-md text-gray-600">{a.observed_signatures.join(' · ') || '—'}</td>
								<td>
									{#if a.resolution_method && a.resolution_method !== 'unresolved'}
										<span class="badge {resolutionBadge(a.resolution_status)}" title={m.publication_resolution_title({ method: a.resolution_method, model: a.resolution_model || '—', confidence: a.resolution_confidence || '—' })}>
											{a.resolution_method.replaceAll('_', ' ')}
											{#if a.resolution_model}<span class="opacity-70">({a.resolution_model})</span>{/if}
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

		<section class="surface" aria-labelledby="dimensions-heading">
			<div class="surface-header flex flex-wrap items-start justify-between gap-4">
				<div class="max-w-3xl">
					<div class="flex flex-wrap items-center gap-2">
						<h2 id="dimensions-heading" class="section-title">{m.dimensions_title()}</h2>
						{#if evidence}
							<span class="badge {dimensionsBadge(evidence.status)}">{dimensionsStatus(evidence.status)}</span>
							<span class="text-xs text-gray-500">{m.dimensions_captured({ date: fmtDate(evidence.captured_at) })}</span>
						{:else}
							<span class="badge badge-neutral">{m.dimensions_badge_not_queried()}</span>
						{/if}
					</div>
					<p class="section-description">{m.dimensions_explanation()}</p>
				</div>
				<button class="btn-secondary" onclick={acquireDimensions} disabled={!dimensions?.configured || dimensionsBusy}>
					{dimensionsBusy ? m.dimensions_working() : evidence ? m.dimensions_refresh() : m.dimensions_acquire()}
				</button>
			</div>

			<div class="surface-body space-y-4">
				{#if dimensionsError}<p role="alert" class="notice-error">{dimensionsError}</p>{/if}

				{#if evidence}
					<dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
						<div>
							<dt class="text-gray-500">{m.dimensions_record()}</dt>
							<dd class="font-medium break-all">
								{#if evidence.source_id}
									<a class="text-indigo-700 hover:underline" href={`https://app.dimensions.ai/details/publication/${encodeURIComponent(evidence.source_id)}`} target="_blank" rel="noopener noreferrer" aria-label="{evidence.source_id} ({m.common_opens_new_tab()})">{evidence.source_id}</a>
								{:else}—{/if}
							</dd>
						</div>
						<div>
							<dt class="text-gray-500">{m.dimensions_match_method()}</dt>
							<dd class="font-medium text-gray-900">{matchMethod(evidence.match_method)}</dd>
						</div>
						<div>
							<dt class="text-gray-500">DOI</dt>
							<dd class="font-medium text-gray-900 break-all">{evidence.doi ?? '—'}</dd>
						</div>
						<div>
							<dt class="text-gray-500">{m.publications_year()}</dt>
							<dd class="font-medium text-gray-900">{evidence.year ?? '—'}</dd>
						</div>
					</dl>

					{#if doiMismatch}<p class="notice-warning">{m.dimensions_doi_mismatch({ doi: evidence.doi ?? '' })}</p>{/if}
					{#if yearMismatch}<p class="notice-warning">{m.dimensions_year_mismatch({ year: String(evidence.year) })}</p>{/if}
					{#if bylineMismatch}<p class="notice-warning">{m.dimensions_byline_mismatch({ dimensions: evidence.authors.length, local: pub.authors.length })}</p>{/if}

					{#if evidence.authors.length}
						<dl class="metric-strip">
							<div class="metric-cell"><dt class="metric-label">{m.dimensions_declared_authors()}</dt><dd class="metric-value">{dimensionsSummary.total}</dd></div>
							<div class="metric-cell"><dt class="metric-label">{m.dimensions_with_affiliation()}</dt><dd class="metric-value">{dimensionsSummary.affiliated}<span class="text-base font-normal text-gray-400"> / {dimensionsSummary.total}</span></dd></div>
							<div class="metric-cell"><dt class="metric-label">{m.dimensions_with_orcid()}</dt><dd class="metric-value">{dimensionsSummary.orcid}<span class="text-base font-normal text-gray-400"> / {dimensionsSummary.total}</span></dd></div>
							<div class="metric-cell"><dt class="metric-label">{m.dimensions_in_directory()}</dt><dd class="metric-value">{dimensionsSummary.inDirectory}<span class="text-base font-normal text-gray-400"> / {dimensionsSummary.total}</span></dd></div>
						</dl>

						<div class="data-shell">
							<div class="data-scroll">
								<table class="data-table" aria-label={m.dimensions_table_label()}>
									<thead>
										<tr>
											<th class="w-12" scope="col">#</th>
											<th scope="col">{m.dimensions_col_author()}</th>
											<th scope="col">{m.dimensions_col_affiliations()}</th>
											<th scope="col">{m.dimensions_col_local()}</th>
										</tr>
									</thead>
									<tbody>
										{#each evidence.authors as author, i}
											{@const local = localByPosition.get(author.position)}
											<tr>
												<td class="tabular-nums text-gray-500">{displayPosition(author.position, i)}</td>
												<th class="font-normal" scope="row">
													<span class="font-medium text-gray-900">{author.name}</span>
													{#if author.orcid}
														<a class="mt-0.5 block text-xs text-indigo-700 hover:underline" href="https://orcid.org/{author.orcid}" target="_blank" rel="noopener noreferrer" aria-label="ORCID {author.orcid} ({m.common_opens_new_tab()})">ORCID {author.orcid}</a>
													{/if}
												</th>
												<td class="max-w-lg">
													{#if author.affiliations.length}
														<ul class="space-y-1 text-gray-700">
															{#each author.affiliations as affiliation}<li>{affiliation}</li>{/each}
														</ul>
													{:else}
														<span class="text-gray-400">{m.dimensions_no_affiliation()}</span>
													{/if}
												</td>
												<td>
													{#if local}
														{#if local.author_id}
															<a href={authorHref(local, pub)} class="font-medium text-indigo-700 hover:underline">{local.canonical_name || '—'}</a>
														{:else}
															<span class="text-gray-900">{local.canonical_name || '—'}</span>
														{/if}
														{#if local.resolution_status}
															<span class="badge {resolutionBadge(local.resolution_status)} ml-1">{local.resolution_status.replaceAll('_', ' ')}</span>
														{/if}
														<p class="mt-0.5 text-xs text-gray-500">{local.observed_signatures.join(' · ')}</p>
													{:else}
														<span class="text-gray-400">{m.dimensions_local_missing()}</span>
													{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{:else}
						<p class="empty-state">{m.dimensions_no_authors()}</p>
					{/if}
				{:else if !dimensionsError}
					<p class="text-sm text-gray-600">{dimensions?.configured ? m.dimensions_empty() : m.dimensions_missing_key()}</p>
				{/if}
			</div>
		</section>

		{#if pub.external_metadata.length > 0}
			<section class="surface" aria-labelledby="ext-meta-heading">
				<div class="surface-header">
					<h2 id="ext-meta-heading" class="section-title">{m.publication_external_metadata()}</h2>
				</div>
				<div class="data-scroll">
					<table class="data-table">
						<thead>
							<tr>
								<th scope="col">{m.publication_source()}</th>
								<th scope="col">{m.publication_match_confidence()}</th>
								<th scope="col">{m.publication_document_type()}</th>
								<th scope="col">DOI</th>
								<th class="num" scope="col">{m.publication_citations()}</th>
								<th scope="col">{m.publication_enriched_at()}</th>
							</tr>
						</thead>
						<tbody>
							{#each pub.external_metadata as meta}
								<tr>
									<th class="font-medium text-gray-900" scope="row">{meta.source}</th>
									<td class="text-gray-700">{meta.match_confidence?.replaceAll('_', ' ') || '—'}</td>
									<td class="text-gray-700">{meta.document_type || '—'}</td>
									<td class="break-all text-gray-700">{meta.doi || '—'}</td>
									<td class="num text-gray-900">{fmtCount(meta.citations_count)}</td>
									<td class="whitespace-nowrap text-gray-700">{fmtDate(meta.enriched_at)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}
	{/if}
</div>

<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { listAuthors } from '$lib/api/client';
	import type { Author } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages.js';
	import { userError } from '$lib/i18n/errors';

	type AuthorSortKey = 'canonical_name' | 'affiliation' | 'email_domain' | 'base_citations' | 'openalex_citations' | 'is_active';

	const backendField: Record<AuthorSortKey, string> = {
		canonical_name: 'canonical_name',
		affiliation: 'affiliation',
		email_domain: 'email_domain',
		base_citations: 'base_citations',
		openalex_citations: 'openalex_citations',
		is_active: 'base_citations',
	};

	let authors = $state<Author[]>([]);
	let total = $state(0);
	let search = $state('');
	let limit = $state(50);
	let offset = $state(0);
	let loading = $state(true);
	let error = $state('');
	let sortKey = $state<AuthorSortKey>('base_citations');
	let sortDir = $state<'asc' | 'desc'>('desc');

	$effect(() => {
		if (browser && !$auth) goto('/login');
	});

	async function fetchAuthors() {
		loading = true;
		error = '';
		try {
			const field = backendField[sortKey];
			const sortParam = sortDir === 'desc' ? `-${field}` : field;
			const data = await listAuthors({ search: search || undefined, sort: sortParam, limit, offset });
			authors = data.items;
			total = data.total;
		} catch (e) {
			error = userError(e, m.authors_load_error());
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (browser && $auth) fetchAuthors();
	});

	async function searchAuthors() {
		offset = 0;
		await fetchAuthors();
	}

	async function toggleSort(key: AuthorSortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = 'asc';
		}
		await fetchAuthors();
	}

	function sortIndicator(key: AuthorSortKey) {
		if (sortKey !== key) return '';
		return sortDir === 'asc' ? ' \u2191' : ' \u2193';
	}

	function handleRowKeydown(e: KeyboardEvent, authorId: number) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			goto(`/authors/${authorId}`);
		}
	}

	const sortableCols: { key: AuthorSortKey; label: string }[] = [
		{ key: 'canonical_name',     label: m.authors_name() },
		{ key: 'affiliation',        label: m.authors_affiliation() },
		{ key: 'email_domain',       label: m.authors_email() },
		{ key: 'base_citations',     label: 'Scholar' },
		{ key: 'openalex_citations', label: 'OpenAlex' },
		{ key: 'is_active',          label: m.authors_status() },
	];
</script>

<div class="app-page">
	<header class="page-header"><h1 class="page-heading">{m.authors_title()}</h1></header>
	<form class="toolbar" role="search" aria-label={m.authors_search_label()} onsubmit={(e) => { e.preventDefault(); searchAuthors(); }}>
			<label for="author-search" class="sr-only">{m.authors_search_help()}</label>
			<input
				id="author-search"
				type="search"
				placeholder={m.authors_search_placeholder()}
				bind:value={search}
				class="min-w-64 rounded-md border px-3 py-2 text-sm"
			/>
			<button
				type="submit"
				class="btn-primary"
			>{m.common_search()}</button>
	</form>

	{#if error}
		<div role="alert" class="notice-error">{error}</div>
	{/if}

	{#if loading}
		<div class="surface p-8 animate-pulse">
			{#each Array(6) as _}
				<div class="flex gap-4 py-3 border-b border-gray-100">
					<div class="h-4 bg-gray-200 rounded w-1/4"></div>
					<div class="h-4 bg-gray-100 rounded w-1/4"></div>
					<div class="h-4 bg-gray-100 rounded w-1/6"></div>
					<div class="h-4 bg-gray-100 rounded w-16"></div>
					<div class="h-4 bg-gray-100 rounded w-20"></div>
				</div>
			{/each}
		</div>
	{:else if authors.length === 0}
		<div class="empty-state">
			<p class="text-gray-600 text-lg font-medium">{m.authors_empty()}</p>
			<p class="text-gray-500 text-sm mt-1">{m.authors_empty_help()}</p>
		</div>
	{:else}
		<p class="text-sm text-gray-600 mb-3" role="status">{m.authors_showing({ shown: authors.length, total })}</p>
		<div class="data-shell">
			<div class="data-scroll">
				<table class="data-table" aria-label={m.authors_list()}>
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
						{#each authors as author}
							<tr
								class="hover:bg-gray-50 cursor-pointer focus-within:bg-gray-50"
								role="link"
								tabindex="0"
								onclick={() => goto(`/authors/${author.id}`)}
								onkeydown={(e) => handleRowKeydown(e, author.id)}
								aria-label={m.authors_view({ name: author.canonical_name })}
							>
								<td class="px-4 py-3 text-sm font-medium text-indigo-600">{author.canonical_name}</td>
								<td class="px-4 py-3 text-sm text-gray-700">{author.affiliation || '—'}</td>
								<td class="px-4 py-3 text-sm text-gray-700">{author.email_domain || '—'}</td>
								<td class="px-4 py-3 text-sm text-gray-700">{author.base_citations}</td>
								<td class="px-4 py-3 text-sm text-gray-700">{author.openalex_citations ?? '—'}</td>
								<td class="px-4 py-3">
									<span class="inline-flex text-xs font-medium px-2 py-0.5 rounded-full {author.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}">
										{author.is_active ? m.authors_active() : m.authors_inactive()}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
		<div class="flex items-center justify-between mt-4">
			<button
				onclick={() => { offset = Math.max(0, offset - limit); fetchAuthors(); }}
				disabled={offset === 0}
				class="btn-secondary"
			>{m.common_previous()}</button>
			<span class="text-sm text-gray-600">{m.common_page_of({ page: Math.floor(offset / limit) + 1, total: Math.ceil(total / limit) || 1 })}</span>
			<button
				onclick={() => { offset = offset + limit; fetchAuthors(); }}
				disabled={offset + limit >= total}
				class="btn-secondary"
			>{m.common_next()}</button>
		</div>
	{/if}
</div>

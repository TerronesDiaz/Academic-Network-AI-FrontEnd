<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { listAuthors } from '$lib/api/client';
	import type { Author } from '$lib/api/types';

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
			error = e instanceof Error ? e.message : 'Failed to fetch authors';
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
		{ key: 'canonical_name',     label: 'Name' },
		{ key: 'affiliation',        label: 'Affiliation' },
		{ key: 'email_domain',       label: 'Email' },
		{ key: 'base_citations',     label: 'Scholar' },
		{ key: 'openalex_citations', label: 'OpenAlex' },
		{ key: 'is_active',          label: 'Status' },
	];
</script>

<div>
	<a href="/" class="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 mb-3 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">
		<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
		Home
	</a>
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
		<h1 class="text-2xl font-bold text-gray-900">Authors</h1>
		<form class="flex gap-2" role="search" aria-label="Search authors" onsubmit={(e) => { e.preventDefault(); searchAuthors(); }}>
			<label for="author-search" class="sr-only">Search name or affiliation</label>
			<input
				id="author-search"
				type="search"
				placeholder="Search name, affiliation..."
				bind:value={search}
				class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
			/>
			<button
				type="submit"
				class="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
			>Search</button>
		</form>
	</div>

	{#if error}
		<div role="alert" class="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
	{/if}

	{#if loading}
		<div class="bg-white rounded-lg shadow p-8 animate-pulse">
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
		<div class="bg-white rounded-lg shadow p-12 text-center">
			<p class="text-gray-600 text-lg font-medium">No authors found</p>
			<p class="text-gray-500 text-sm mt-1">Try adjusting your search criteria</p>
		</div>
	{:else}
		<p class="text-sm text-gray-600 mb-3" role="status">Showing {authors.length} of {total} authors{sortKey ? ' \u00b7 sorted by ' + sortKey.replace(/_/g, ' ') + ' (' + sortDir + ')' : ''}</p>
		<div class="bg-white rounded-lg shadow overflow-hidden">
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200" aria-label="Authors list">
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
								aria-label={`View author ${author.canonical_name}`}
							>
								<td class="px-4 py-3 text-sm font-medium text-indigo-600">{author.canonical_name}</td>
								<td class="px-4 py-3 text-sm text-gray-700">{author.affiliation || '—'}</td>
								<td class="px-4 py-3 text-sm text-gray-700">{author.email_domain || '—'}</td>
								<td class="px-4 py-3 text-sm text-gray-700">{author.base_citations}</td>
								<td class="px-4 py-3 text-sm text-gray-700">{author.openalex_citations ?? '—'}</td>
								<td class="px-4 py-3">
									<span class="inline-flex text-xs font-medium px-2 py-0.5 rounded-full {author.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}">
										{author.is_active ? 'Active' : 'Inactive'}
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
				class="px-4 py-2 text-sm border border-gray-300 rounded-md disabled:opacity-40 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
			>Previous</button>
			<span class="text-sm text-gray-600">Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit) || 1}</span>
			<button
				onclick={() => { offset = offset + limit; fetchAuthors(); }}
				disabled={offset + limit >= total}
				class="px-4 py-2 text-sm border border-gray-300 rounded-md disabled:opacity-40 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
			>Next</button>
		</div>
	{/if}
</div>
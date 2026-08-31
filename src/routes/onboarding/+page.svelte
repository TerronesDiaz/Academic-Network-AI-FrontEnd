<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		createProductAccount,
		createProductProject,
		listProductAccounts,
		searchInstitutions,
		setActiveProject,
		startInstitutionBootstrap
	} from '$lib/api/client';
	import type { InstitutionCandidate, ProductAccount } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages.js';
	import { formatNumber } from '$lib/i18n/format';
	import { userError } from '$lib/i18n/errors';

	let accounts = $state<ProductAccount[]>([]);
	let accountId = $state('');
	let accountName = $state('');
	let query = $state('');
	let country = $state('MX');
	let candidates = $state<InstitutionCandidate[]>([]);
	let selected = $state<InstitutionCandidate | null>(null);
	let institutionName = $state('');
	let projectName = $state('');
	let scholarValue = $state('');
	let searching = $state(false);
	let saving = $state(false);
	let error = $state('');
	let warning = $state('');

	onMount(async () => {
		try {
			accounts = await listProductAccounts();
			accountId = accounts[0]?.id ?? '';
		} catch (value) {
			error = message(value);
		}
	});

	let scholarOrgId = $derived.by(() => {
		const match = scholarValue.match(/(?:[?&]org=|^)(\d{5,30})(?:&|$)/);
		return match?.[1] ?? '';
	});
	let scholarSearchUrl = $derived(
		`https://scholar.google.com/citations?view_op=search_authors&mauthors=${encodeURIComponent(institutionName || query)}`
	);

	function slug(value: string) {
		return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
			.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
	}

	async function findInstitution() {
		if (query.trim().length < 2) return;
		searching = true;
		error = '';
		warning = '';
		selected = null;
		try {
			const result = await searchInstitutions(query.trim(), country || undefined);
			candidates = result.items;
			warning = result.warnings.join(' ');
		if (!candidates.length) warning = m.onboarding_no_matches();
		} catch (value) {
			error = message(value);
		} finally {
			searching = false;
		}
	}

	function choose(candidate: InstitutionCandidate) {
		selected = candidate;
		institutionName = candidate.display_name;
		projectName = candidate.display_name;
		country = candidate.country_code ?? country;
	}

	async function submit() {
		error = '';
		if (!selected?.openalex_id && !scholarOrgId) {
			error = m.onboarding_select_source();
			return;
		}
		saving = true;
		try {
			let selectedAccount = accountId;
			if (!selectedAccount) {
				if (!accountName.trim()) {
					error = m.onboarding_account_required();
					return;
				}
				const account = await createProductAccount({ name: accountName.trim(), slug: slug(accountName) });
				selectedAccount = account.id;
			}
			const project = await createProductProject({
				account_id: selectedAccount,
				name: projectName.trim() || institutionName,
				slug: slug(projectName || institutionName),
				institution_name: institutionName,
				scholar_org_id: scholarOrgId || undefined,
				openalex_id: selected?.openalex_id || undefined,
				ror_id: selected?.ror_id || undefined,
				country_code: country || undefined,
				verified_domain: selected?.domains[0] || undefined
			});
			setActiveProject(project.id);
			if (selected?.openalex_id) await startInstitutionBootstrap(project.id);
			await goto(`/projects/${project.id}`);
		} catch (value) {
			error = message(value);
		} finally {
			saving = false;
		}
	}

	function message(value: unknown) {
		return userError(value);
	}
</script>

<svelte:head><title>{m.projects_new()} · AcademicNetwork</title></svelte:head>

<div class="app-page max-w-4xl">
	<header class="page-header"><div><p class="page-kicker">{m.onboarding_step()}</p><h1 class="page-heading">{m.onboarding_title()}</h1><p class="page-description">{m.onboarding_description()}</p></div></header>

	<div class="surface space-y-6 p-6">
		{#if accounts.length}
			<label class="block"><span class="text-sm font-medium">{m.onboarding_account()}</span>
				<select bind:value={accountId} class="mt-1 w-full rounded-lg border border-gray-300 p-2.5">
					{#each accounts as account}<option value={account.id}>{account.name}</option>{/each}
				</select>
			</label>
		{:else}
			<label class="block"><span class="text-sm font-medium">{m.onboarding_account_name()}</span>
				<input bind:value={accountName} class="mt-1 w-full rounded-lg border p-2.5" placeholder={m.onboarding_account_placeholder()} />
			</label>
		{/if}

		<div>
			<label for="institution-search" class="text-sm font-medium">{m.onboarding_institution_name()}</label>
			<div class="mt-1 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
				<input id="institution-search" bind:value={query} onkeydown={(event) => event.key === 'Enter' && findInstitution()} class="min-w-0 flex-1 rounded-lg border p-2.5" placeholder={m.onboarding_institution_placeholder()} />
				<select bind:value={country} aria-label={m.onboarding_country()} class="w-full rounded-lg border p-2.5"><option value="MX">{m.onboarding_mexico()}</option><option value="">{m.onboarding_all_countries()}</option></select>
				<button onclick={findInstitution} disabled={searching || query.trim().length < 2} class="btn-primary">{searching ? m.common_searching() : m.common_search()}</button>
			</div>
		</div>

		{#if candidates.length}
			<div aria-live="polite">
				<p class="text-sm font-medium">{m.onboarding_choose_match()}</p>
				<div class="mt-2 divide-y divide-gray-200 border-y border-gray-200">
				{#each candidates as candidate}
					<button type="button" onclick={() => choose(candidate)} class="w-full border-l-2 p-4 text-left {selected?.key === candidate.key ? 'border-indigo-600 bg-indigo-50/60' : 'border-transparent hover:bg-gray-50'}">
						<div class="flex flex-wrap items-start justify-between gap-2">
							<div><p class="font-semibold text-gray-900">{candidate.display_name}</p><p class="mt-1 text-sm text-gray-600">{[candidate.city, candidate.country_code, candidate.domains[0]].filter(Boolean).join(' · ')}</p></div>
							{#if candidate.works_count !== null}<span class="rounded-full bg-gray-100 px-3 py-1 text-xs">{m.onboarding_openalex_works({ count: formatNumber(candidate.works_count) })}</span>{/if}
						</div>
						<p class="mt-2 text-xs text-gray-500">{m.onboarding_identity({ sources: candidate.sources.map((source) => source === 'ror' ? 'ROR' : 'OpenAlex').join(' + ') })}</p>
					</button>
				{/each}
				</div>
			</div>
		{/if}

		{#if selected}
			<div class="notice-success">
				<p class="font-medium">{m.onboarding_ready({ name: selected.display_name })}</p>
				<p class="mt-1">{m.onboarding_ready_help()}</p>
			</div>
			<label class="block"><span class="text-sm font-medium">{m.onboarding_project_name()}</span><input bind:value={projectName} class="mt-1 w-full rounded-lg border p-2.5" /></label>
		{/if}

		<details class="rounded-lg border p-4">
			<summary class="cursor-pointer font-medium">{m.onboarding_scholar_optional()}</summary>
			<p class="mt-2 text-sm text-gray-600">{m.onboarding_scholar_help()}</p>
			<a href={scholarSearchUrl} target="_blank" rel="noreferrer" class="mt-3 inline-block text-sm font-medium text-indigo-700 underline">{m.onboarding_scholar_search()}</a>
			<label class="mt-3 block"><span class="text-sm font-medium">{m.onboarding_scholar_url()}</span><input bind:value={scholarValue} class="mt-1 w-full rounded-lg border p-2.5" placeholder="https://scholar.google.com/citations?...&org=…" /></label>
			{#if scholarOrgId}<span class="mt-1 block text-sm text-green-700">{m.onboarding_scholar_detected({ id: scholarOrgId })}</span>{/if}
		</details>

		{#if warning}<div class="notice-warning">{warning}</div>{/if}
		{#if error}<div class="notice-error">{error}</div>{/if}
		<div class="flex justify-end"><button onclick={submit} disabled={saving || (!selected?.openalex_id && !scholarOrgId)} class="btn-primary w-full sm:w-auto">{saving ? m.onboarding_submitting() : m.onboarding_submit()}</button></div>
	</div>
</div>

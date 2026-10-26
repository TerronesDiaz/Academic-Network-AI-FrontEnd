<script lang="ts">
	import { onMount } from 'svelte';
	import { getNextValidationGroup, getValidationWorkflow } from '$lib/api/client';
	import type { ValidationGroup, ValidationWorkflow } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages.js';
	import { userError } from '$lib/i18n/errors';

	let workflow = $state<ValidationWorkflow | null>(null);
	let group = $state<ValidationGroup | null>(null);
	let error = $state('');
	let loading = $state(true);
	const projectId = $derived(String((group?.evidence_summary.outcome as { project_id?: string } | undefined)?.project_id ?? ''));
	onMount(() => { void load(); });
	async function load() {
		try {
			[workflow, group] = await Promise.all([
				getValidationWorkflow(),
				getNextValidationGroup({ phase: 'data_gap', status: 'pending_evidence' })
			]);
		} catch (value) {
			error = userError(value, m.abstentions_load_error());
		} finally {
			loading = false;
		}
	}
</script>

<div class="app-page max-w-5xl">
	<a href="/validation" class="mb-4 inline-flex text-sm text-gray-500 hover:text-indigo-700">{m.validation_back()}</a>
	<header class="page-header"><div><h1 class="page-heading">{m.validation_acquisition_title()}</h1><p class="page-description">{m.validation_acquisition_pending_help()}</p></div></header>
	{#if error}<div class="notice-error">{error}</div>{/if}
	{#if loading}<div class="surface h-32 animate-pulse"></div>
	{:else if workflow?.pending_evidence_occurrences}
		<div role="status" class="notice-warning">{m.validation_acquisition_pending({ count: workflow.pending_evidence_occurrences })}</div>
		{#if group}
			<section class="surface mt-4 p-6">
				<h2 class="text-xl font-semibold">{group.display_signature}</h2>
				{#each group.representative_entry.publications as publication}<p class="mt-3 font-medium">{publication.title}</p><p class="text-sm text-gray-500">{publication.publication_year ?? '—'}</p>{#if publication.doi}<a href={`https://doi.org/${publication.doi}`} target="_blank" rel="noreferrer" class="text-sm text-indigo-700 hover:underline">{publication.doi}</a>{/if}{/each}
				<a href={projectId ? `/projects/${projectId}` : '/projects'} class="btn-primary mt-5 inline-block">{m.validation_acquisition_project()}</a>
			</section>
		{/if}
	{:else}<section class="empty-state">{m.validation_acquisition_empty()}</section>{/if}
</div>

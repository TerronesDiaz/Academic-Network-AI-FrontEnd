<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { auth } from '$lib/auth';
	import {
		getNextValidationGroup,
		getRepairStatus,
		getValidationWorkflow,
		refreshRepairs
	} from '$lib/api/client';
	import type { RepairRunStatus, ValidationGroup, ValidationWorkflow } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages.js';
	import { userError } from '$lib/i18n/errors';

	let workflow = $state<ValidationWorkflow | null>(null);
	let repair = $state<RepairRunStatus | null>(null);
	let group = $state<ValidationGroup | null>(null);
	let loading = $state(true);
	let running = $state(false);
	let error = $state('');

	onMount(() => {
		if (!$auth) {
			goto('/login');
			return;
		}
		void load();
	});

	async function load() {
		loading = true;
		error = '';
		try {
			[workflow, repair, group] = await Promise.all([
				getValidationWorkflow(),
				getRepairStatus(),
				getNextValidationGroup({ phase: 'abstention', status: 'abstained' })
			]);
		} catch (value) {
			error = userError(value, m.abstentions_load_error());
		} finally {
			loading = false;
		}
	}

	async function runCascade() {
		if (running) return;
		running = true;
		error = '';
		try {
			repair = await refreshRepairs({ scope: 'residual', apply_decisions: true });
			await load();
		} catch (value) {
			error = userError(value, m.abstentions_run_error());
		} finally {
			running = false;
		}
	}

	function count(key: string) {
		return Number(repair?.stats?.[key] ?? 0);
	}
</script>

<div class="app-page max-w-6xl">
	<a href="/validation" class="mb-4 inline-flex text-sm text-gray-500 hover:text-indigo-700">{m.validation_back()}</a>
	<header class="page-header">
		<div>
			<p class="page-kicker">{m.abstentions_kicker()}</p>
			<h1 class="page-heading">{m.abstentions_title()}</h1>
			<p class="page-description">{m.abstentions_help()}</p>
		</div>
		<button onclick={runCascade} disabled={running} class="btn-primary">{running ? m.abstentions_running() : m.abstentions_run()}</button>
	</header>

	{#if error}<div class="notice-error">{error}</div>{/if}
	{#if loading}
		<div class="surface h-40 animate-pulse"></div>
	{:else}
		<section class="metric-strip">
			<div class="metric-cell"><p class="metric-label">{m.abstentions_repaired()}</p><p class="metric-value">{count('resolved')}</p></div>
			<div class="metric-cell"><p class="metric-label">{m.abstentions_profile_signatures()}</p><p class="metric-value">{count('profile_signatures')}</p></div>
			<div class="metric-cell"><p class="metric-label">{m.abstentions_rejected_sources()}</p><p class="metric-value">{count('source_rejected')}</p></div>
			<div class="metric-cell"><p class="metric-label">{m.abstentions_count()}</p><p class="metric-value">{count('abstained')}</p></div>
		</section>

		<p class="mt-3 text-xs text-gray-500">{repair?.repair_version ?? 'repair-cascade-v1'} · {m.abstentions_summary({ groups: workflow?.abstention_groups ?? 0, occurrences: workflow?.abstention_occurrences ?? 0 })}</p>

		{#if group}
			<section class="surface p-6">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div><p class="text-xs font-semibold uppercase text-amber-700">{m.abstentions_example()}</p><h2 class="mt-1 text-xl font-bold">{group.display_signature}</h2></div>
					<span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{group.repair_status ?? 'abstained'}</span>
				</div>
				{#if group.representative_entry.source_context?.publication}
					<a class="mt-4 block font-semibold text-indigo-800 hover:underline" href={`/publications/${group.representative_entry.source_context.publication.id}`}>{group.representative_entry.source_context.publication.title}</a>
				{/if}
				<div class="mt-5 grid gap-2 md:grid-cols-2">
					{#each group.repair_evidence as evidence}
						<div class="rounded-lg border border-gray-200 p-3 text-xs"><p class="font-semibold text-gray-900">{String(evidence.source ?? '')}</p><p class="mt-1 text-gray-600">{String(evidence.evidence_family ?? '')} · {String(evidence.status ?? '')}</p>{#if evidence.endpoint}<a class="mt-1 block truncate text-indigo-700 hover:underline" href={String(evidence.endpoint)} target="_blank" rel="noreferrer">{m.abstentions_open_source()}</a>{/if}</div>
					{/each}
				</div>
			</section>
		{:else}
			<section class="empty-state"><h2 class="font-semibold">{m.abstentions_empty()}</h2></section>
		{/if}
	{/if}
</div>

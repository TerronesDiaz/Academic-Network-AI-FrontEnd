<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { listProductProjects, setActiveProject } from '$lib/api/client';
	import type { ProductProject } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages.js';
	import { formatDate } from '$lib/i18n/format';
	import { userError } from '$lib/i18n/errors';

	let projects = $state<ProductProject[]>([]);
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		try {
			projects = await listProductProjects();
			if (!projects.length) await goto('/onboarding');
		} catch (value) {
			error = userError(value, m.projects_load_error());
		} finally {
			loading = false;
		}
	});

	function openProject(project: ProductProject) {
		setActiveProject(project.id);
		goto(`/projects/${project.id}`);
	}

	const statusLabel: Record<string, string> = {
		draft: m.project_status_draft(), connecting_scholar: m.project_status_connecting_scholar(),
		institution_confirmed: m.project_status_institution_confirmed(), processing: m.project_status_processing(),
		expert_review: m.project_status_expert_review(), ready_to_publish: m.project_status_ready_to_publish(),
		published: m.project_status_published(), failed: m.project_status_failed()
	};
</script>

<svelte:head><title>{m.nav_projects()} · AcademicNetwork</title></svelte:head>

<div class="app-page">
	<header class="page-header">
		<div><h1 class="page-heading">{m.projects_title()}</h1><p class="page-description">{m.projects_description()}</p></div>
		<a href="/onboarding" class="btn-primary">{m.projects_new()}</a>
	</header>

	{#if error}<div class="notice-error">{error}</div>{/if}
	{#if loading}
		<p class="empty-state">{m.common_loading()}</p>
	{:else}
		<div class="surface divide-y divide-gray-200">
			{#each projects as project}
				<button onclick={() => openProject(project)} class="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50">
					<div><h2 class="font-semibold text-gray-950">{project.name}</h2><p class="mt-1 text-sm text-gray-500">{m.common_created_date({ date: formatDate(project.created_at) })}</p></div>
					<span class="status-dot">{statusLabel[project.status] ?? project.status}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

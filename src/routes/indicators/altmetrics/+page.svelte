<script lang="ts">
	import { onMount } from 'svelte';
	import { listAttentionRuns, startAttentionRun, getAttentionRun } from '$lib/api/client';
	import type { AttentionInput, AttentionJob, AttentionResult } from '$lib/api/client';
	let input = $state<AttentionInput | null>(null);
	let jobs = $state<AttentionJob[]>([]);
	let selected = $state<AttentionResult | null>(null);
	let configured = $state(false);
	let reviewed = $state(false);
	let busy = $state(false);
	let error = $state('');
	const states: Record<string, string> = {OK:'Disponible',NOT_FOUND:'No encontrado',
		NO_IDENTIFIER:'Sin identificador',pending:'Pendiente o en curso',success:'Completado',error:'Error'};
	async function refresh() {
		try { const result = await listAttentionRuns(); jobs = result.runs; configured = result.configured;
			if (selected) selected = await getAttentionRun(selected.run_id);
		} catch { error = 'No se pudo consultar el estado. Revisa la sesión y el proyecto activo.'; }
	}
	onMount(() => { void refresh(); });
	async function load(event: Event) {
		input = null; reviewed = false; error = '';
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		if (file.size > 100000) { error = 'El archivo supera 100 KB.'; return; }
		try {
			const data = JSON.parse(await file.text()) as AttentionInput;
			if (data.version !== 'publication-altmetrics-v1' || !Array.isArray(data.publications) ||
				data.publications.length < 1 || data.publications.length > 20 ||
				data.publications.some(p => typeof p.publication_id !== 'string' || typeof p.review_reference !== 'string'))
				throw new Error();
			input = data;
		} catch { error = 'Archivo inválido. Utiliza el formato indicado y entre 1 y 20 publicaciones.'; }
	}
	async function start() {
		if (!input || !reviewed || busy) return;
		busy = true; error = '';
		try { const job = await startAttentionRun(input); selected = {...job, report:null}; reviewed=false; await refresh(); }
		catch { error = 'No se pudo iniciar. Comprueba los identificadores, las credenciales y el proyecto activo.'; }
		finally { busy=false; }
	}
	async function select(id: string) {
		try { selected = await getAttentionRun(id); } catch { error = 'No se pudo abrir el reporte.'; }
	}
</script>

<svelte:head><title>Altmétricos — AcademicNetwork</title></svelte:head>
<main class="mx-auto max-w-6xl space-y-6 p-6">
	<a href="/indicators" class="text-blue-600 underline">Volver a indicadores</a>
	<h1 class="text-2xl font-semibold">Altmétricos por publicación</h1>
	<p>Consulta atención, menciones y lectores en Altmetric. Dimensions permite buscar por un identificador alternativo cuando sea necesario. Estos datos no determinan autoría ni pertenencia a UdeC.</p>
	{#if error}<p role="alert" class="text-red-600">{error}</p>{/if}
	<section class="space-y-3 rounded border p-4">
		<h2 class="text-lg font-semibold">Cargar publicaciones revisadas</h2>
		<p>Selecciona un JSON con hasta 20 publicaciones del proyecto activo. Los ID corresponden al catálogo; cada registro debe incluir la referencia de su comprobación bibliográfica.</p>
		<details><summary>Formato del archivo</summary><pre class="overflow-auto p-3">{'{"version":"publication-altmetrics-v1","publications":[{"publication_id":"123","doi":"10.1234/example","pmid":null,"review_reference":"Enlace a la publicación comprobada"}]}'}</pre></details>
		<label class="block">Archivo JSON <input type="file" accept=".json,application/json" onchange={load} /></label>
		{#if input}
			<ul>{#each input.publications as p}<li>Publicación {p.publication_id}: {p.doi ?? p.pmid ?? 'Sin identificador'}</li>{/each}</ul>
			<label class="block"><input type="checkbox" bind:checked={reviewed} /> He revisado que estos identificadores corresponden a las publicaciones seleccionadas.</label>
		{/if}
		{#if !configured}<p>Las credenciales del servidor aún no están disponibles.</p>{/if}
		<button class="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" disabled={!input || !reviewed || !configured || busy} onclick={start}>Consultar Altmetric y Dimensions</button>
		<p class="text-sm">Solo este botón inicia consultas externas. Máximo por lote: 60 solicitudes Altmetric y 41 Dimensions. Si una ejecución se interrumpe, puede permanecer pendiente; no reinicies el mismo lote sin revisar su estado.</p>
	</section>
	<section class="space-y-3">
		<h2 class="text-lg font-semibold">Ejecuciones</h2>
		<button class="rounded border px-3 py-1" onclick={refresh}>Actualizar estado</button>
		{#if jobs.length === 0}<p>Todavía no hay ejecuciones.</p>{/if}
		{#each jobs as job}<button class="block text-blue-600 underline" onclick={() => select(job.run_id)}>{job.run_id} — {states[job.status] ?? job.status}</button>{/each}
	</section>
	{#if selected}
		<section class="overflow-auto"><h2 class="text-lg font-semibold">Resultado: {states[selected.status] ?? selected.status}</h2>
		{#if selected.report}
			<table class="w-full text-left"><thead><tr><th>Publicación</th><th>Estado</th><th>Attention Score</th><th>Menciones</th><th>Cuentas</th><th>Lectores y canales</th></tr></thead>
			<tbody>{#each Object.entries(selected.report.publications) as [id, row]}<tr class="border-t"><td><a class="underline" href={`/publications/${id}`}>{id}</a></td><td>{states[row.attention.status] ?? row.attention.status}</td><td>{row.attention.score ?? '—'}</td><td>{row.attention.posts ?? '—'}</td><td>{row.attention.accounts ?? '—'}</td><td>{[...row.attention.readers,...row.attention.channels].map(([key,value]) => `${key}: ${value}`).join('; ') || '—'}</td></tr>{/each}</tbody></table>
			<p>«—» indica ausencia de dato. Los canales conservan sus propias unidades y no se suman.</p>
		{/if}</section>
	{/if}
</main>

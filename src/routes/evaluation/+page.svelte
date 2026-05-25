<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { getEvaluation } from '$lib/api/client';
	import type { EvaluationResult } from '$lib/api/types';

	let evaluation = $state<EvaluationResult | null>(null);
	let loading = $state(true);
	let error = $state('');
	let goldMissing = $state(false);

	$effect(() => {
		if (browser && !$auth) goto('/login');
	});

	async function fetchData() {
		loading = true;
		error = '';
		goldMissing = false;
		try {
			evaluation = await getEvaluation();
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Failed to load evaluation';
			if (msg.includes('Gold standard not found')) {
				goldMissing = true;
			} else {
				error = msg;
			}
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (browser && $auth) fetchData();
	});

	function fmt4(v: number | string) {
		return Number(v).toFixed(4);
	}

	const metricLabels: Record<string, string> = {
		b3_precision: 'B-Cubed Precision',
		b3_recall: 'B-Cubed Recall',
		b3_f1: 'B-Cubed F1',
		k_metric: 'K-Metric',
		macro_f1_fuzzy: 'Macro F1 (fuzzy)',
		macro_precision_fuzzy: 'Macro Precision (fuzzy)',
		macro_recall_fuzzy: 'Macro Recall (fuzzy)'
	};
</script>

<div>
	<a href="/" class="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 mb-3 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">
		<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
		Home
	</a>
	<h1 class="text-2xl font-bold text-gray-900 mb-6">AND Evaluation</h1>

	{#if goldMissing}
		<div class="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
			<svg class="w-12 h-12 mx-auto mb-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
			</svg>
			<h2 class="text-lg font-semibold text-blue-800 mb-2">No evaluation data yet</h2>
			<p class="text-sm text-blue-700 mb-4">
				Launch the evaluation stage from the Pipeline to generate the gold standard and compute AND metrics.
			</p>
			<a href="/pipeline" class="inline-block px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
				Go to Pipeline
			</a>
		</div>
	{:else if error}
		<div role="alert" class="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
	{:else if loading}
		<div class="space-y-6 animate-pulse">
			<div class="grid grid-cols-3 gap-4">
				{#each Array(3) as _}
					<div class="bg-white rounded-lg shadow p-4"><div class="h-8 bg-gray-200 rounded w-16 mx-auto"></div><div class="h-3 bg-gray-100 rounded w-20 mx-auto mt-2"></div></div>
				{/each}
			</div>
			<div class="grid grid-cols-2 gap-6">
				<div class="bg-white rounded-lg shadow p-6"><div class="h-6 bg-gray-200 rounded w-32 mb-4"></div>{#each Array(6) as _}<div class="h-5 bg-gray-100 rounded w-full my-2"></div>{/each}</div>
				<div class="bg-white rounded-lg shadow p-6"><div class="h-6 bg-gray-200 rounded w-32 mb-4"></div>{#each Array(6) as _}<div class="h-5 bg-gray-100 rounded w-full my-2"></div>{/each}</div>
			</div>
		</div>
	{:else if evaluation}
		<div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
			<div class="bg-white rounded-lg shadow p-4 text-center">
				<div class="text-2xl font-bold text-indigo-700">{evaluation.gold_total}</div>
				<div class="text-xs text-gray-500">Gold Standard (Total)</div>
			</div>
			<div class="bg-white rounded-lg shadow p-4 text-center">
				<div class="text-2xl font-bold text-green-700">{evaluation.gold_easy}</div>
				<div class="text-xs text-gray-500">Easy Entries</div>
			</div>
			<div class="bg-white rounded-lg shadow p-4 text-center">
				<div class="text-2xl font-bold text-amber-700">{evaluation.gold_hard}</div>
				<div class="text-xs text-gray-500">Hard (Ambiguous) Entries</div>
			</div>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
			<section class="bg-white rounded-lg shadow p-6" aria-labelledby="and-heading">
				<h2 id="and-heading" class="text-lg font-semibold text-gray-900 mb-4">AND System</h2>
				<dl class="space-y-2">
					{#each Object.entries(evaluation.system) as [key, val]}
						<div class="flex justify-between items-center py-1 border-b border-gray-50">
							<dt class="text-sm text-gray-600">{metricLabels[key] || key.replace(/_/g, ' ')}</dt>
							<dd class="text-sm font-mono font-semibold text-gray-900">{fmt4(val)}</dd>
						</div>
					{/each}
				</dl>
				<div class="mt-3 pt-2 border-t border-gray-200">
					<span class="text-sm text-gray-600">Coverage: <strong>{(evaluation.system_coverage * 100).toFixed(1)}%</strong></span>
				</div>
			</section>

			<section class="bg-white rounded-lg shadow p-6" aria-labelledby="baseline-heading">
				<h2 id="baseline-heading" class="text-lg font-semibold text-gray-900 mb-4">Baseline (Name Only)</h2>
				<dl class="space-y-2">
					{#each Object.entries(evaluation.baseline) as [key, val]}
						<div class="flex justify-between items-center py-1 border-b border-gray-50">
							<dt class="text-sm text-gray-600">{metricLabels[key] || key.replace(/_/g, ' ')}</dt>
							<dd class="text-sm font-mono font-semibold text-gray-900">{fmt4(val)}</dd>
						</div>
					{/each}
				</dl>
			</section>
		</div>

		{#if evaluation.system.b3_f1 != null && evaluation.baseline.b3_f1 != null}
			{@const improvement = Number(evaluation.system.b3_f1) - Number(evaluation.baseline.b3_f1)}
			<div class="bg-white rounded-lg shadow p-6">
				<h2 class="text-lg font-semibold text-gray-900 mb-2">Improvement Over Baseline</h2>
				<p class="text-3xl font-bold {improvement >= 0 ? 'text-green-700' : 'text-red-700'}">
					{improvement >= 0 ? '+' : ''}{improvement.toFixed(4)}
				</p>
				<p class="text-sm text-gray-500 mt-1">B-Cubed F1 improvement</p>
			</div>
		{/if}
	{/if}
</div>
<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { getEvaluation } from '$lib/api/client';
	import type { EvaluationResult } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages.js';
	import { formatPercent } from '$lib/i18n/format';
	import { technicalError, userError } from '$lib/i18n/errors';

	let evaluation = $state<EvaluationResult | null>(null);
	let loading = $state(true);
	let error = $state('');
	let proxyMissing = $state(false);

	$effect(() => {
		if (browser && !$auth) goto('/login');
	});

	async function fetchData() {
		loading = true;
		error = '';
		proxyMissing = false;
		try {
			evaluation = await getEvaluation();
		} catch (e) {
			const msg = technicalError(e) ?? '';
			if (msg.includes('Profile-owner proxy not found')) {
				proxyMissing = true;
			} else {
				error = userError(e, m.evaluation_load_error());
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

<div class="app-page">
	<header class="page-header"><div><p class="page-kicker">{m.evaluation_kicker()}</p><h1 class="page-heading">{m.evaluation_title()}</h1><p class="page-description">{m.evaluation_description()}</p></div><a href="/validation/gold" class="btn-link">{m.evaluation_open_gold()}</a></header>

	{#if proxyMissing}
		<div class="empty-state">
			<h2 class="text-lg font-semibold text-gray-900 mb-2">{m.evaluation_missing_title()}</h2>
			<p class="text-sm text-gray-600 mb-4">
				{m.evaluation_missing_help()}
			</p>
			<a href="/pipeline" class="btn-primary">
				{m.evaluation_go_pipeline()}
			</a>
		</div>
	{:else if error}
		<div role="alert" class="notice-error">{error}</div>
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
		<div class="metric-strip lg:grid-cols-3">
			<div class="metric-cell"><div class="metric-label">{m.evaluation_proxy_total()}</div><div class="metric-value">{evaluation.gold_total}</div></div>
			<div class="metric-cell"><div class="metric-label">{m.evaluation_proxy_easy()}</div><div class="metric-value">{evaluation.gold_easy}</div></div>
			<div class="metric-cell"><div class="metric-label">{m.evaluation_proxy_hard()}</div><div class="metric-value">{evaluation.gold_hard}</div></div>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
			<section class="surface p-6" aria-labelledby="and-heading">
				<h2 id="and-heading" class="text-lg font-semibold text-gray-900 mb-4">{m.evaluation_system()}</h2>
				<dl class="space-y-2">
					{#each Object.entries(evaluation.system) as [key, val]}
						<div class="flex justify-between items-center py-1 border-b border-gray-50">
							<dt class="text-sm text-gray-600">{metricLabels[key] || key.replace(/_/g, ' ')}</dt>
							<dd class="text-sm font-mono font-semibold text-gray-900">{fmt4(val)}</dd>
						</div>
					{/each}
				</dl>
				<div class="mt-3 pt-2 border-t border-gray-200">
					<span class="text-sm text-gray-600">{m.evaluation_coverage()}: <strong>{formatPercent(evaluation.system_coverage)}</strong></span>
				</div>
			</section>

			<section class="surface p-6" aria-labelledby="baseline-heading">
				<h2 id="baseline-heading" class="text-lg font-semibold text-gray-900 mb-4">{m.evaluation_baseline()}</h2>
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
			<div class="surface p-6">
				<h2 class="text-lg font-semibold text-gray-900 mb-2">{m.evaluation_improvement()}</h2>
				<p class="text-3xl font-bold {improvement >= 0 ? 'text-green-700' : 'text-red-700'}">
					{improvement >= 0 ? '+' : ''}{improvement.toFixed(4)}
				</p>
				<p class="text-sm text-gray-500 mt-1">{m.evaluation_f1_improvement()}</p>
			</div>
		{/if}
	{/if}
</div>

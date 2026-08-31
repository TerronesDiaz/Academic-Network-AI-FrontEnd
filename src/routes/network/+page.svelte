<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { getNetwork, getNetworkStats } from '$lib/api/client';
	import type { NetworkNode, NetworkEdge, NetworkStats } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages.js';
	import { compareLocalized, formatNumber } from '$lib/i18n/format';
	import { userError } from '$lib/i18n/errors';

	let nodes = $state<NetworkNode[]>([]);
	let edges = $state<NetworkEdge[]>([]);
	let stats = $state<NetworkStats | null>(null);
	let loading = $state(true);
	let error = $state('');

	$effect(() => {
		if (browser && !$auth) goto('/login');
	});

	async function fetchData() {
		loading = true;
		error = '';
		try {
			const [netData, statsData] = await Promise.all([getNetwork(), getNetworkStats()]);
			nodes = netData.nodes;
			edges = netData.edges;
			stats = statsData;
		} catch (e) {
			error = userError(e, m.network_load_error());
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (browser && $auth) fetchData();
	});

	let canvasEl: HTMLCanvasElement = $state(undefined as unknown as HTMLCanvasElement);
	let hoveredNode: NetworkNode | null = $state(null);
	let selectedNode: NetworkNode | null = $state(null);
	let searchQuery = $state('');

	type NodeSortKey = 'label' | 'publications' | 'h_index' | 'pagerank' | 'scholar_citations' | 'openalex_citations';
	let nodeSortKey = $state<NodeSortKey>('publications');
	let nodeSortDir = $state<'asc' | 'desc'>('desc');

	function toggleNodeSort(key: NodeSortKey) {
		if (nodeSortKey === key) {
			nodeSortDir = nodeSortDir === 'asc' ? 'desc' : 'asc';
		} else {
			nodeSortKey = key;
			nodeSortDir = 'desc';
		}
	}

	function nodeSortIndicator(key: NodeSortKey) {
		if (nodeSortKey !== key) return '';
		return nodeSortDir === 'asc' ? ' \u2191' : ' \u2193';
	}

	let sortedNodes = $derived(
		[...nodes].sort((a, b) => {
			let cmp = 0;
			if (nodeSortKey === 'label') cmp = compareLocalized(a.label, b.label);
			else if (nodeSortKey === 'publications') cmp = a.publications - b.publications;
			else if (nodeSortKey === 'h_index') cmp = a.h_index - b.h_index;
			else if (nodeSortKey === 'pagerank') cmp = a.pagerank - b.pagerank;
			else if (nodeSortKey === 'scholar_citations') cmp = a.scholar_citations - b.scholar_citations;
			else if (nodeSortKey === 'openalex_citations') cmp = a.openalex_citations - b.openalex_citations;
			return nodeSortDir === 'asc' ? cmp : -cmp;
		})
	);

	$effect(() => {
		if (!canvasEl || nodes.length === 0) return;
		renderNetwork();
	});

	function renderNetwork() {
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;
		const W = canvasEl.width;
		const H = canvasEl.height;
		ctx.clearRect(0, 0, W, H);

		const filteredNodes = searchQuery
			? nodes.filter((n) => n.label.toLowerCase().includes(searchQuery.toLowerCase()))
			: nodes;
		const filteredIds = new Set(filteredNodes.map((n) => n.id));

		const cx = W / 2;
		const cy = H / 2;
		const radius = Math.min(W, H) * 0.42;

		const positions = new Map<number, { x: number; y: number }>();
		filteredNodes.forEach((node, i) => {
			const angle = (2 * Math.PI * i) / filteredNodes.length - Math.PI / 2;
			positions.set(node.id, {
				x: cx + radius * Math.cos(angle),
				y: cy + radius * Math.sin(angle)
			});
		});

		const maxPubs = Math.max(...filteredNodes.map((n) => n.publications), 1);

		ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
		ctx.lineWidth = 1;
		for (const edge of edges) {
			if (filteredIds.has(edge.source) && filteredIds.has(edge.target)) {
				const a = positions.get(edge.source);
				const b = positions.get(edge.target);
				if (a && b) {
					ctx.beginPath();
					ctx.moveTo(a.x, a.y);
					ctx.lineTo(b.x, b.y);
					ctx.stroke();
				}
			}
		}

		for (const node of filteredNodes) {
			const pos = positions.get(node.id);
			if (!pos) continue;
			const r = Math.max(4, 4 + 12 * (node.publications / maxPubs));
			const isHovered = hoveredNode?.id === node.id;
			const isSelected = selectedNode?.id === node.id;
			const isActive = isHovered || isSelected;
			ctx.beginPath();
			ctx.arc(pos.x, pos.y, r, 0, 2 * Math.PI);
			ctx.fillStyle = isActive ? '#4f46e5' : '#818cf8';
			ctx.fill();
			if (isActive) {
				ctx.strokeStyle = '#3730a3';
				ctx.lineWidth = 2;
				ctx.stroke();
			}
		}

		if (selectedNode && positions.has(selectedNode.id)) {
			const p = positions.get(selectedNode.id)!;
			ctx.strokeStyle = '#1e40af';
			ctx.lineWidth = 2.5;
			const r = Math.max(4, 4 + 12 * (selectedNode.publications / maxPubs));
			ctx.beginPath();
			ctx.arc(p.x, p.y, r + 3, 0, 2 * Math.PI);
			ctx.stroke();
		}

		const labelNode = selectedNode ?? hoveredNode;
		if (labelNode && positions.has(labelNode.id)) {
			const pos = positions.get(labelNode.id)!;
			ctx.fillStyle = '#1e1b4b';
			ctx.font = 'bold 12px sans-serif';
			ctx.textAlign = 'center';
			const displayName =
				labelNode.label.length > 25 ? labelNode.label.slice(0, 25) + '...' : labelNode.label;
			ctx.fillText(displayName, pos.x, pos.y - 18);
		}
	}

	function handleMouseMove(e: MouseEvent) {
		if (!canvasEl || nodes.length === 0) return;
		const rect = canvasEl.getBoundingClientRect();
		const scaleX = canvasEl.width / rect.width;
		const scaleY = canvasEl.height / rect.height;
		const mx = (e.clientX - rect.left) * scaleX;
		const my = (e.clientY - rect.top) * scaleY;
		const W = canvasEl.width;
		const H = canvasEl.height;
		const cx = W / 2;
		const cy = H / 2;
		const radius = Math.min(W, H) * 0.42;

		const filteredNodes = searchQuery
			? nodes.filter((n) => n.label.toLowerCase().includes(searchQuery.toLowerCase()))
			: nodes;
		const maxPubs = Math.max(...filteredNodes.map((n) => n.publications), 1);

		let found: NetworkNode | null = null;
		for (const node of filteredNodes) {
			const i = filteredNodes.indexOf(node);
			const angle = (2 * Math.PI * i) / filteredNodes.length - Math.PI / 2;
			const px = cx + radius * Math.cos(angle);
			const py = cy + radius * Math.sin(angle);
			const r = Math.max(4, 4 + 12 * (node.publications / maxPubs));
			if (Math.hypot(mx - px, my - py) < r + 4) {
				found = node;
				break;
			}
		}
		hoveredNode = found;
		renderNetwork();
	}

	function handleCanvasClick(e: MouseEvent) {
		if (!canvasEl || nodes.length === 0) return;
		const rect = canvasEl.getBoundingClientRect();
		const scaleX = canvasEl.width / rect.width;
		const scaleY = canvasEl.height / rect.height;
		const mx = (e.clientX - rect.left) * scaleX;
		const my = (e.clientY - rect.top) * scaleY;
		const W = canvasEl.width;
		const H = canvasEl.height;
		const cx = W / 2;
		const cy = H / 2;
		const radius = Math.min(W, H) * 0.42;

		const filteredNodes = searchQuery
			? nodes.filter((n) => n.label.toLowerCase().includes(searchQuery.toLowerCase()))
			: nodes;
		const maxPubs = Math.max(...filteredNodes.map((n) => n.publications), 1);

		let found: NetworkNode | null = null;
		for (const node of filteredNodes) {
			const i = filteredNodes.indexOf(node);
			const angle = (2 * Math.PI * i) / filteredNodes.length - Math.PI / 2;
			const px = cx + radius * Math.cos(angle);
			const py = cy + radius * Math.sin(angle);
			const r = Math.max(4, 4 + 12 * (node.publications / maxPubs));
			if (Math.hypot(mx - px, my - py) < r + 4) {
				found = node;
				break;
			}
		}
		selectedNode = found;
		renderNetwork();
	}

	function handleRowKeydown(e: KeyboardEvent, nodeId: number) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			goto(`/authors/${nodeId}?from=/network&fromLabel=Network`);
		}
	}
</script>

<div class="app-page">
	<header class="page-header">
		<h1 class="page-heading">{m.network_title()}</h1>
		<div>
			<label for="net-filter" class="sr-only">{m.network_filter()}</label>
			<input
				id="net-filter"
				type="search"
				placeholder={m.network_filter_placeholder()}
				bind:value={searchQuery}
				class="min-w-56 rounded-md border px-3 py-2 text-sm"
			/>
		</div>
	</header>

	{#if error}
		<div role="alert" class="notice-error">{error}</div>
	{/if}

	{#if loading}
		<div class="space-y-4 animate-pulse">
			<div class="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
				{#each Array(5) as _}
					<div class="bg-white rounded-lg shadow p-4">
						<div class="h-8 bg-gray-200 rounded w-12 mx-auto"></div>
						<div class="h-3 bg-gray-100 rounded w-16 mx-auto mt-2"></div>
					</div>
				{/each}
			</div>
		</div>
	{:else if stats}
		<div class="metric-strip lg:grid-cols-5">
			<div class="metric-cell group relative cursor-help">
				<div class="metric-label">{m.network_nodes()}</div><div class="metric-value">{stats.nodes}</div>
				<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
					<div class="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 w-56 text-center shadow-lg">
						{m.network_nodes_help()}
						<div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
					</div>
				</div>
			</div>
			<div class="metric-cell group relative cursor-help">
				<div class="metric-label">{m.network_edges()}</div><div class="metric-value">{stats.edges}</div>
				<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
					<div class="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 w-56 text-center shadow-lg">
						{m.network_edges_help()}
						<div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
					</div>
				</div>
			</div>
			<div class="metric-cell group relative cursor-help">
				<div class="metric-label">{m.network_density()}</div><div class="metric-value">{stats.density.toFixed(4)}</div>
				<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
					<div class="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 w-56 text-center shadow-lg">
						{m.network_density_help()}
						<div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
					</div>
				</div>
			</div>
			<div class="metric-cell group relative cursor-help">
				<div class="metric-label">{m.network_average_degree()}</div><div class="metric-value">{stats.average_degree.toFixed(2)}</div>
				<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
					<div class="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 w-56 text-center shadow-lg">
						{m.network_degree_help()}
						<div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
					</div>
				</div>
			</div>
			<div class="metric-cell group relative cursor-help">
				<div class="metric-label">{m.network_components()}</div><div class="metric-value">{stats.connected_components}</div>
				<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
					<div class="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 w-56 text-center shadow-lg">
						{m.network_components_help()}
						<div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
					</div>
				</div>
			</div>
		</div>

		<div class="flex flex-col gap-5">
		<details class="surface order-2" ontoggle={(event) => { if (event.currentTarget.open) setTimeout(renderNetwork); }}>
			<summary class="surface-header cursor-pointer select-none font-semibold text-gray-900">
				{m.network_visualization()}
				<span class="ml-2 font-normal text-gray-500">{m.network_visualization_help()}</span>
			</summary>
			<div class="border-b border-gray-200">
			<canvas
				bind:this={canvasEl}
				width="900"
				height="600"
				aria-label={m.network_canvas_label({ nodes: nodes.length, edges: edges.length })}
				class="w-full"
				onmousemove={handleMouseMove}
				onclick={handleCanvasClick}
			></canvas>
		</div>

		{#if selectedNode ?? hoveredNode}
			{@const node = (selectedNode ?? hoveredNode)!}
			<div class="surface relative p-4" aria-live="polite">
				{#if selectedNode}
					<button
						onclick={() => { selectedNode = null; renderNetwork(); }}
						class="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-lg leading-none p-1 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
						aria-label={m.network_deselect()}
					>&times;</button>
				{/if}
				<h2 class="font-semibold text-gray-900 pr-6">{node.label}</h2>
				<div class="mt-3 grid grid-cols-2 divide-x divide-y border-y border-gray-200 sm:grid-cols-3">
					<div class="p-3">
						<div class="text-lg font-semibold">{formatNumber(node.scholar_citations)}</div>
						<div class="text-xs text-gray-600">{m.network_scholar_citations()}</div>
					</div>
					<div class="p-3">
						<div class="text-lg font-semibold">{formatNumber(node.openalex_citations)}</div>
						<div class="text-xs text-gray-600">{m.network_openalex_citations()}</div>
					</div>
					<div class="p-3">
						<div class="text-lg font-semibold">{node.publications}</div>
						<div class="text-xs text-gray-600">{m.publications_title()}</div>
					</div>
					<div class="p-3">
						<div class="text-lg font-semibold">{node.h_index}</div>
						<div class="text-xs text-gray-600">{m.network_computed_h()}</div>
					</div>
					<div class="p-3">
						<div class="text-lg font-semibold">{node.openalex_h_index}</div>
						<div class="text-xs text-gray-600">{m.network_openalex_h()}</div>
					</div>
					<div class="p-3">
						<div class="text-lg font-semibold">{node.pagerank.toFixed(6)}</div>
						<div class="text-xs text-gray-600">PageRank</div>
					</div>
				</div>
				<a href="/authors/{node.id}?from=/network&fromLabel={encodeURIComponent(m.nav_network())}" class="text-sm text-indigo-600 hover:underline mt-3 inline-block focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">{m.network_view_author()}</a>
			</div>
		{/if}
		</details>

		<section class="surface order-1" aria-labelledby="node-list-heading">
			<h2 id="node-list-heading" class="surface-header text-lg font-semibold text-gray-900">{m.network_node_list()}</h2>
			<div class="overflow-x-auto max-h-96 overflow-y-auto">
				<table class="data-table" aria-label={m.network_node_details()}>
					<thead class="bg-gray-50 sticky top-0">
						<tr>
							{#each [
								{ key: 'label' as NodeSortKey, label: m.authors_name() },
								{ key: 'publications' as NodeSortKey, label: m.publications_title() },
								{ key: 'scholar_citations' as NodeSortKey, label: 'Scholar' },
								{ key: 'openalex_citations' as NodeSortKey, label: 'OpenAlex' },
								{ key: 'h_index' as NodeSortKey, label: 'H-Index' },
								{ key: 'pagerank' as NodeSortKey, label: 'PageRank' }
							] as col}
								<th
									class="px-4 py-2 text-left text-xs font-medium uppercase cursor-pointer select-none hover:bg-gray-100 transition-colors {nodeSortKey === col.key ? 'text-indigo-700' : 'text-gray-500'}"
									scope="col"
									onclick={() => toggleNodeSort(col.key)}
									aria-sort={nodeSortKey === col.key ? (nodeSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
								>
									{col.label}{nodeSortIndicator(col.key)}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-100">
						{#each sortedNodes as node}
							<tr
								class="hover:bg-gray-50 cursor-pointer focus-within:bg-gray-50"
								role="link"
								tabindex="0"
								onclick={() => goto(`/authors/${node.id}?from=/network&fromLabel=Network`)}
								onkeydown={(e) => handleRowKeydown(e, node.id)}
								aria-label={m.authors_view({ name: node.label })}
							>
								<td class="px-4 py-2 text-sm text-indigo-600">{node.label}</td>
								<td class="px-4 py-2 text-sm text-gray-700">{node.publications}</td>
								<td class="px-4 py-2 text-sm text-gray-700">{formatNumber(node.scholar_citations)}</td>
								<td class="px-4 py-2 text-sm text-gray-700">{formatNumber(node.openalex_citations)}</td>
								<td class="px-4 py-2 text-sm text-gray-700">{node.h_index}</td>
								<td class="px-4 py-2 text-sm text-gray-700">{node.pagerank.toFixed(6)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
		</div>
	{/if}
</div>

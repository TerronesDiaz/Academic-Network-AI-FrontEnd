<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import { getNetwork, getNetworkStats } from '$lib/api/client';
	import type { NetworkNode, NetworkEdge, NetworkStats } from '$lib/api/types';

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
			error = e instanceof Error ? e.message : 'Failed to load network';
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
			if (nodeSortKey === 'label') cmp = a.label.localeCompare(b.label);
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

<div>
	<a href="/" class="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 mb-3 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">
		<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
		Home
	</a>
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
		<h1 class="text-2xl font-bold text-gray-900">Co-authorship Network</h1>
		<div class="flex gap-2">
			<label for="net-filter" class="sr-only">Filter nodes by name</label>
			<input
				id="net-filter"
				type="search"
				placeholder="Filter nodes..."
				bind:value={searchQuery}
				class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
			/>
		</div>
	</div>

	{#if error}
		<div role="alert" class="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
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
		<div class="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
			<div class="group relative bg-white rounded-lg shadow p-4 text-center cursor-help">
				<div class="text-2xl font-bold text-indigo-700">{stats.nodes}</div>
				<div class="text-xs text-gray-500">Nodes</div>
				<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
					<div class="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 w-56 text-center shadow-lg">
						Total number of researchers (authors) in the co-authorship network. Each node represents one UdeC researcher.
						<div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
					</div>
				</div>
			</div>
			<div class="group relative bg-white rounded-lg shadow p-4 text-center cursor-help">
				<div class="text-2xl font-bold text-indigo-700">{stats.edges}</div>
				<div class="text-xs text-gray-500">Edges</div>
				<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
					<div class="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 w-56 text-center shadow-lg">
						Total co-authorship links between researchers. An edge exists when two authors have published together at least once.
						<div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
					</div>
				</div>
			</div>
			<div class="group relative bg-white rounded-lg shadow p-4 text-center cursor-help">
				<div class="text-2xl font-bold text-indigo-700">{stats.density.toFixed(4)}</div>
				<div class="text-xs text-gray-500">Density</div>
				<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
					<div class="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 w-56 text-center shadow-lg">
						Ratio of actual edges to all possible edges (0 to 1). Higher values indicate a more interconnected research community.
						<div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
					</div>
				</div>
			</div>
			<div class="group relative bg-white rounded-lg shadow p-4 text-center cursor-help">
				<div class="text-2xl font-bold text-indigo-700">{stats.average_degree.toFixed(2)}</div>
				<div class="text-xs text-gray-500">Avg Degree</div>
				<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
					<div class="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 w-56 text-center shadow-lg">
						Average number of direct co-authors per researcher. Measures typical collaboration breadth within the institution.
						<div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
					</div>
				</div>
			</div>
			<div class="group relative bg-white rounded-lg shadow p-4 text-center cursor-help">
				<div class="text-2xl font-bold text-indigo-700">{stats.connected_components}</div>
				<div class="text-xs text-gray-500">Components</div>
				<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
					<div class="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 w-56 text-center shadow-lg">
						Number of disconnected subgraphs. A value of 1 means all researchers are reachable through co-authorship chains; higher values indicate isolated research groups.
						<div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
					</div>
				</div>
			</div>
		</div>

		<div class="bg-white rounded-lg shadow overflow-hidden">
			<canvas
				bind:this={canvasEl}
				width="900"
				height="600"
				aria-label="Co-authorship network graph with {nodes.length} nodes and {edges.length} edges. Use the node list below for tabular data."
				class="w-full"
				onmousemove={handleMouseMove}
				onclick={handleCanvasClick}
			></canvas>
		</div>

		{#if selectedNode ?? hoveredNode}
			{@const node = (selectedNode ?? hoveredNode)!}
			<div class="mt-4 bg-white rounded-lg shadow p-4 relative" aria-live="polite">
				{#if selectedNode}
					<button
						onclick={() => { selectedNode = null; renderNetwork(); }}
						class="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-lg leading-none p-1 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
						aria-label="Deselect node"
					>&times;</button>
				{/if}
				<h2 class="font-semibold text-gray-900 pr-6">{node.label}</h2>
				<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
					<div class="bg-blue-50 rounded p-2 text-center">
						<div class="text-lg font-bold text-blue-700">{node.scholar_citations.toLocaleString()}</div>
						<div class="text-xs text-gray-600">Scholar Citations</div>
					</div>
					<div class="bg-emerald-50 rounded p-2 text-center">
						<div class="text-lg font-bold text-emerald-700">{node.openalex_citations.toLocaleString()}</div>
						<div class="text-xs text-gray-600">OpenAlex Citations</div>
					</div>
					<div class="bg-indigo-50 rounded p-2 text-center">
						<div class="text-lg font-bold text-indigo-700">{node.publications}</div>
						<div class="text-xs text-gray-600">Publications</div>
					</div>
					<div class="bg-blue-50 rounded p-2 text-center">
						<div class="text-lg font-bold text-blue-700">{node.h_index}</div>
						<div class="text-xs text-gray-600">H-Index (computed)</div>
					</div>
					<div class="bg-emerald-50 rounded p-2 text-center">
						<div class="text-lg font-bold text-emerald-700">{node.openalex_h_index}</div>
						<div class="text-xs text-gray-600">OpenAlex H-Index</div>
					</div>
					<div class="bg-purple-50 rounded p-2 text-center">
						<div class="text-lg font-bold text-purple-700">{node.pagerank.toFixed(6)}</div>
						<div class="text-xs text-gray-600">PageRank</div>
					</div>
				</div>
				<a href="/authors/{node.id}?from=/network&fromLabel=Network" class="text-sm text-indigo-600 hover:underline mt-3 inline-block focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">View author &rarr;</a>
			</div>
		{/if}

		<section class="mt-6 bg-white rounded-lg shadow overflow-hidden" aria-labelledby="node-list-heading">
			<h2 id="node-list-heading" class="text-lg font-semibold text-gray-900 p-4 pb-2">Node List</h2>
			<div class="overflow-x-auto max-h-96 overflow-y-auto">
				<table class="min-w-full divide-y divide-gray-200" aria-label="Network nodes detail">
					<thead class="bg-gray-50 sticky top-0">
						<tr>
							{#each [
								{ key: 'label' as NodeSortKey, label: 'Name' },
								{ key: 'publications' as NodeSortKey, label: 'Publications' },
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
								aria-label={`Author: ${node.label}`}
							>
								<td class="px-4 py-2 text-sm text-indigo-600">{node.label}</td>
								<td class="px-4 py-2 text-sm text-gray-700">{node.publications}</td>
								<td class="px-4 py-2 text-sm text-gray-700">{node.scholar_citations.toLocaleString()}</td>
								<td class="px-4 py-2 text-sm text-gray-700">{node.openalex_citations.toLocaleString()}</td>
								<td class="px-4 py-2 text-sm text-gray-700">{node.h_index}</td>
								<td class="px-4 py-2 text-sm text-gray-700">{node.pagerank.toFixed(6)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</div>
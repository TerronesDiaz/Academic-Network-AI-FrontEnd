<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';

	$effect(() => {
		if (browser && !$auth) {
			goto('/login');
		}
	});

	const sections = [
		{ href: '/authors', icon: '&#128100;', title: 'Authors', desc: 'Browse researcher profiles, publications, and co-authors' },
		{ href: '/publications', icon: '&#128214;', title: 'Publications', desc: 'Search and explore academic publications' },
		{ href: '/network', icon: '&#128279;', title: 'Network', desc: 'Visualize co-authorship network graph and statistics' },
		{ href: '/indicators', icon: '&#128202;', title: 'Indicators', desc: 'Bibliometric and network indicator snapshots' },
		{ href: '/evaluation', icon: '&#9989;', title: 'Evaluation', desc: 'AND evaluation metrics and gold standard results' },
		{ href: '/pipeline', icon: '&#9881;', title: 'Pipeline', desc: 'Monitor and launch data pipeline stages' },
	];
</script>

<div class="text-center py-12">
	<h1 class="text-4xl font-bold text-gray-900 mb-4">Academic Network</h1>
	<p class="text-lg text-gray-600 mb-10">Universidad de Colima — Research Collaboration Analysis</p>
	<nav aria-label="Dashboard sections" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
		{#each sections as section}
			<a href={section.href} class="bg-white rounded-lg shadow p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all block focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
				<div class="text-3xl mb-2" aria-hidden="true">{@html section.icon}</div>
				<h2 class="text-lg font-semibold text-gray-900">{section.title}</h2>
				<p class="text-sm text-gray-600 mt-1">{section.desc}</p>
			</a>
		{/each}
	</nav>
</div>
<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { auth } from '$lib/auth';
	import { goto } from '$app/navigation';
	import { logout as apiLogout } from '$lib/api/client';

	let { children } = $props();
	let loggedIn = $derived($auth);
	let menuOpen = $state(false);
	let menuBtn = $state<HTMLButtonElement | undefined>(undefined);

	function handleLogout() {
		menuOpen = false;
		apiLogout();
		auth.logout();
		goto('/login');
	}

	function closeMenu() {
		menuOpen = false;
		menuBtn?.focus();
	}

	const navItems = [
		{ href: '/authors', label: 'Authors' },
		{ href: '/publications', label: 'Publications' },
		{ href: '/network', label: 'Network' },
		{ href: '/indicators', label: 'Indicators' },
		{ href: '/evaluation', label: 'Evaluation' },
		{ href: '/pipeline', label: 'Pipeline' },
	];

	function isCurrent(href: string) {
		return $page.url.pathname.startsWith(href);
	}
</script>

<svelte:head>
	<title>Academic Network</title>
</svelte:head>

{#if loggedIn}
	<a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-indigo-700 focus:text-white focus:px-4 focus:py-2 focus:rounded">
		Skip to main content
	</a>

	<div class="min-h-screen bg-gray-50">
		<nav class="bg-indigo-700 text-white shadow-lg" aria-label="Main navigation">
			<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div class="flex items-center justify-between h-16">
					<div class="flex items-center gap-2">
						<a href="/" class="font-bold text-lg tracking-tight" aria-label="Academic Network home">AcademicNetwork</a>
						<button
							bind:this={menuBtn}
							class="sm:hidden p-2 rounded focus:outline-none focus:ring-2 focus:ring-white"
							aria-label={menuOpen ? 'Close menu' : 'Open menu'}
							aria-expanded={menuOpen}
							onclick={() => (menuOpen = !menuOpen)}
						>
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}/>
							</svg>
						</button>
					</div>
					<div class="hidden sm:flex items-center gap-1">
						{#each navItems as item}
							<a
								href={item.href}
								class="px-3 py-2 rounded text-sm font-medium transition-colors {isCurrent(item.href) ? 'bg-indigo-600' : 'hover:bg-indigo-600'}"
								aria-current={isCurrent(item.href) ? 'page' : undefined}
							>{item.label}</a>
						{/each}
						<button onclick={handleLogout} class="ml-4 px-3 py-1 bg-indigo-500 rounded text-sm hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-white">Logout</button>
					</div>
				</div>
			</div>
			{#if menuOpen}
				<div class="sm:hidden px-4 pb-4 space-y-1" role="menu">
					{#each navItems as item}
						<a
							href={item.href}
							class="block px-3 py-2 rounded text-sm transition-colors {isCurrent(item.href) ? 'bg-indigo-600' : 'hover:bg-indigo-600'}"
							aria-current={isCurrent(item.href) ? 'page' : undefined}
							role="menuitem"
							onclick={closeMenu}
						>{item.label}</a>
					{/each}
					<button onclick={handleLogout} class="block w-full text-left px-3 py-2 rounded hover:bg-indigo-600 text-sm focus:outline-none focus:ring-2 focus:ring-white" role="menuitem">Logout</button>
				</div>
			{/if}
		</nav>
		<main id="main-content" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6" tabindex="-1">
			{@render children()}
		</main>
	</div>
{:else}
	<div class="min-h-screen bg-gray-50">
		<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
			{@render children()}
		</main>
	</div>
{/if}
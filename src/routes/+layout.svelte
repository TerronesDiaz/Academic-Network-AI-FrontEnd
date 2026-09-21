<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { auth } from '$lib/auth';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { logout as apiLogout } from '$lib/api/client';
	import { onMount } from 'svelte';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();
	let loggedIn = $derived($auth);
	let sessionReady = $state(false);
	let menuOpen = $state(false);
	let menuBtn = $state<HTMLButtonElement | undefined>(undefined);

	onMount(() => {
		sessionReady = true;
	});

	$effect(() => {
		if (!browser || !sessionReady) return;
		const pathname = $page.url.pathname;
		if (!$auth && pathname !== '/login') {
			void goto('/login', { replaceState: true });
		} else if ($auth && pathname === '/login') {
			void goto('/projects', { replaceState: true });
		}
	});

	async function handleLogout() {
		menuOpen = false;
		await apiLogout();
		await goto('/login', { replaceState: true });
	}

	function closeMenu() {
		menuOpen = false;
		menuBtn?.focus();
	}

	const navItems = [
		{ href: '/projects', label: m.nav_projects() },
		{ href: '/validation', label: m.nav_validation() },
		{ href: '/authors', label: m.nav_authors() },
		{ href: '/publications', label: m.nav_publications() },
		{ href: '/network', label: m.nav_network() },
		{ href: '/indicators', label: m.nav_indicators() },
	];

	function isCurrent(href: string) {
		return $page.url.pathname.startsWith(href);
	}
</script>

<svelte:head>
	<title>AcademicNetwork</title>
</svelte:head>

{#if !sessionReady && !loggedIn}
	<div class="min-h-screen grid place-items-center bg-gray-50" role="status" aria-live="polite">
		<p class="text-sm text-gray-500">{m.session_checking()}</p>
	</div>
{:else if loggedIn}
	<a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-indigo-700 focus:text-white focus:px-4 focus:py-2 focus:rounded">
		{m.nav_skip_content()}
	</a>

	<div class="min-h-screen bg-gray-50">
		<nav class="border-b border-gray-200 bg-white text-gray-700" aria-label={m.nav_main()}>
			<div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
				<div class="flex h-14 items-center justify-between">
					<div class="flex items-center gap-2">
						<a href="/" class="text-base font-semibold tracking-tight text-gray-950" aria-label={m.nav_home()}>AcademicNetwork</a>
						<button
							bind:this={menuBtn}
							class="rounded p-2 text-gray-600 sm:hidden"
							aria-label={menuOpen ? m.nav_close_menu() : m.nav_open_menu()}
							aria-expanded={menuOpen}
							onclick={() => (menuOpen = !menuOpen)}
						>
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}/>
							</svg>
						</button>
					</div>
					<div class="hidden h-full items-center gap-1 sm:flex">
						<LanguageSelector compact />
						{#each navItems as item}
							<a
								href={item.href}
							class="flex h-full items-center border-b-2 px-3 text-sm transition-colors {isCurrent(item.href) ? 'border-indigo-600 font-semibold text-indigo-800' : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-950'}"
								aria-current={isCurrent(item.href) ? 'page' : undefined}
							>{item.label}</a>
						{/each}
						<button onclick={handleLogout} class="ml-3 text-sm text-gray-600 hover:text-gray-950 hover:underline">{m.nav_logout()}</button>
					</div>
				</div>
			</div>
			{#if menuOpen}
				<div class="space-y-1 border-t border-gray-200 px-4 py-3 sm:hidden" role="menu">
					{#each navItems as item}
						<a
							href={item.href}
							class="block border-l-2 px-3 py-2 text-sm {isCurrent(item.href) ? 'border-indigo-600 font-semibold text-indigo-800' : 'border-transparent text-gray-700'}"
							aria-current={isCurrent(item.href) ? 'page' : undefined}
							role="menuitem"
							onclick={closeMenu}
						>{item.label}</a>
					{/each}
					<div class="px-3 py-2"><LanguageSelector /></div>
					<button onclick={handleLogout} class="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:underline" role="menuitem">{m.nav_logout()}</button>
				</div>
			{/if}
		</nav>
		<main id="main-content" class="mx-auto max-w-screen-2xl px-4 py-5 sm:px-6 lg:px-8" tabindex="-1">
			{@render children()}
		</main>
	</div>
{:else}
	<div class="min-h-screen bg-gray-50">
		<div class="absolute right-4 top-4 z-10 text-gray-700"><LanguageSelector /></div>
		<main class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
			{@render children()}
		</main>
	</div>
{/if}

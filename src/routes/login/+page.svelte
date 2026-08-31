<script lang="ts">
	import { goto } from '$app/navigation';
	import { login, oidcLoginUrl } from '$lib/api/client';
	import { auth } from '$lib/auth';
	import * as m from '$lib/paraglide/messages.js';
	import { userError } from '$lib/i18n/errors';

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleLogin() {
		error = '';
		loading = true;
		try {
			const res = await login(username, password);
			auth.login(res.access_token, res.refresh_token);
			goto('/');
		} catch (e) {
			error = userError(e, m.error_invalid_credentials());
		} finally {
			loading = false;
		}
	}
</script>

<div class="flex min-h-[calc(100vh-7rem)] items-center justify-center px-4 py-10">
	<main class="w-full max-w-md">
		<header class="mb-6 border-b border-gray-200 pb-5">
			<p class="page-kicker">Academic Network</p>
			<h1 class="page-heading">{m.login_subtitle()}</h1>
		</header>
		<a href={oidcLoginUrl()} class="btn-primary w-full">{m.login_oidc()}</a>
		<div class="my-5 flex items-center gap-3 text-xs text-gray-400"><span class="h-px flex-1 bg-gray-200"></span>{m.login_local_divider()}<span class="h-px flex-1 bg-gray-200"></span></div>
		<form onsubmit={(e) => { e.preventDefault(); handleLogin(); }} aria-label={m.login_form_label()}>
			{#if error}
				<div role="alert" class="notice-error mb-4">{error}</div>
			{/if}
			<div class="mb-4">
				<label for="username" class="block text-sm font-medium text-gray-700 mb-1">{m.login_username()}</label>
				<input
					id="username"
					type="text"
					bind:value={username}
					required
					autocomplete="username"
					aria-required="true"
					class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
				/>
			</div>
			<div class="mb-6">
				<label for="password" class="block text-sm font-medium text-gray-700 mb-1">{m.login_password()}</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					required
					autocomplete="current-password"
					aria-required="true"
					class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
				/>
			</div>
			<button
				type="submit"
				disabled={loading}
				aria-busy={loading}
				class="btn-secondary w-full"
			>
				{loading ? m.login_submitting() : m.login_submit()}
			</button>
		</form>
	</main>
</div>

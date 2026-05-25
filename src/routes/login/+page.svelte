<script lang="ts">
	import { goto } from '$app/navigation';
	import { login } from '$lib/api/client';
	import { auth } from '$lib/auth';

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
			error = e instanceof Error ? e.message : 'Login failed';
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-100">
	<div class="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
		<h1 class="text-2xl font-bold text-center text-indigo-700 mb-2">Academic Network</h1>
		<p class="text-center text-sm text-gray-500 mb-6">Universidad de Colima</p>
		<form onsubmit={(e) => { e.preventDefault(); handleLogin(); }} aria-label="Login form">
			{#if error}
				<div role="alert" class="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
			{/if}
			<div class="mb-4">
				<label for="username" class="block text-sm font-medium text-gray-700 mb-1">Username</label>
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
				<label for="password" class="block text-sm font-medium text-gray-700 mb-1">Password</label>
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
				class="w-full py-2 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
			>
				{loading ? 'Signing in...' : 'Sign In'}
			</button>
		</form>
	</div>
</div>
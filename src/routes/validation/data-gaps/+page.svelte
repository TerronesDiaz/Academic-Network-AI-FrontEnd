<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';

	onMount(() => void goto('/validation/abstentions', { replaceState: true }));
</script>

<p class="p-8 text-sm text-gray-500">{m.abstentions_redirect()}</p>

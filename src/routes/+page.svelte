<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth';
	import * as m from '$lib/paraglide/messages.js';

	$effect(() => {
		if (!browser) return;
		goto($auth ? '/projects' : '/login');
	});
</script>

<p class="sr-only">{m.redirecting()}</p>

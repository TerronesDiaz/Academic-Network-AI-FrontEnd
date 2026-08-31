<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale, setLocale, type Locale } from '$lib/paraglide/runtime.js';

	let { compact = false }: { compact?: boolean } = $props();

	function changeLanguage(event: Event) {
		const locale = (event.currentTarget as HTMLSelectElement).value as Locale;
		if (locale !== getLocale()) void setLocale(locale);
	}
</script>

<label class="inline-flex items-center gap-2 text-sm">
	<span class={compact ? 'sr-only' : ''}>{m.language_label()}</span>
	<select
		class="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
		aria-label={m.language_label()}
		value={getLocale()}
		onchange={changeLanguage}
	>
		<option class="text-gray-900" value="es">Español</option>
		<option class="text-gray-900" value="en">English</option>
	</select>
</label>

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

function createAuth() {
	const token = browser ? localStorage.getItem('access_token') : null;
	const store = writable(!!token);

	return {
		subscribe: store.subscribe,
		login(token: string, refresh: string) {
			if (browser) {
				localStorage.setItem('access_token', token);
				localStorage.setItem('refresh_token', refresh);
			}
			store.set(true);
		},
		logout() {
			if (browser) {
				localStorage.removeItem('access_token');
				localStorage.removeItem('refresh_token');
			}
			store.set(false);
		}
	};
}

export const auth = createAuth();
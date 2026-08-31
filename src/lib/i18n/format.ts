import { getLocale } from '$lib/paraglide/runtime.js';

export type SupportedLocale = 'es' | 'en';

export function intlLocale(): 'es-MX' | 'en-US' {
	return getLocale() === 'en' ? 'en-US' : 'es-MX';
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
	return new Intl.NumberFormat(intlLocale(), options).format(value);
}

export function formatPercent(value: number, maximumFractionDigits = 1): string {
	return formatNumber(value, { style: 'percent', maximumFractionDigits });
}

export function formatCurrency(value: number, currency = 'USD'): string {
	return formatNumber(value, { style: 'currency', currency });
}

export function formatDate(
	value: string | number | Date,
	options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
): string {
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(intlLocale(), options).format(date);
}

export function formatTime(value: string | number | Date): string {
	return formatDate(value, { hour: '2-digit', minute: '2-digit' });
}

export function compareLocalized(left: string, right: string): number {
	return new Intl.Collator(intlLocale(), { sensitivity: 'base', numeric: true }).compare(left, right);
}

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const locales = ['es', 'en'];
const sources = await Promise.all(
	locales.map((locale) => readFile(resolve(root, 'messages', `${locale}.json`), 'utf8'))
);
const catalogs = sources.map((source) => JSON.parse(source));

for (let index = 0; index < sources.length; index += 1) {
	const sourceKeys = [...sources[index].matchAll(/^\s*"([^"]+)"\s*:/gm)].map((match) => match[1]);
	const duplicates = [...new Set(sourceKeys.filter((key, keyIndex) => sourceKeys.indexOf(key) !== keyIndex))];
	if (duplicates.length) {
		throw new Error(`${locales[index]} catalog has duplicate keys: ${duplicates.join(', ')}.`);
	}
}

const keys = catalogs.map((catalog) => Object.keys(catalog).filter((key) => key !== '$schema').sort());
const reference = JSON.stringify(keys[0]);
for (let index = 1; index < keys.length; index += 1) {
	if (JSON.stringify(keys[index]) !== reference) {
		const missing = keys[0].filter((key) => !keys[index].includes(key));
		const extra = keys[index].filter((key) => !keys[0].includes(key));
		throw new Error(`${locales[index]} catalog mismatch. Missing: ${missing.join(', ') || 'none'}. Extra: ${extra.join(', ') || 'none'}.`);
	}
}

const placeholders = (value) => [...String(value).matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();
for (const key of keys[0]) {
	const expected = JSON.stringify(placeholders(catalogs[0][key]));
	for (let index = 1; index < catalogs.length; index += 1) {
		if (JSON.stringify(placeholders(catalogs[index][key])) !== expected) {
			throw new Error(`Placeholder mismatch for "${key}" in ${locales[index]}.`);
		}
	}
}

console.log(`i18n catalogs are aligned (${keys[0].length} messages).`);

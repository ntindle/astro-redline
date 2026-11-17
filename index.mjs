// astro-redline: an app on Astro's dev toolbar for marking up pages in `astro dev`. Notes, cuts and rewrites are pinned
// to the page and saved to a JSON file in your project, where you or a coding agent can work through them.
import { randomUUID } from 'node:crypto';
import { watch } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ID = 'astro-redline';
const ev = name => `${ID}:${name}`;
const ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);

/** @param {{ file?: string }} [options] */
export default function redline(options = {}) {
	let root = process.cwd();
	return {
		name: ID,
		hooks: {
			'astro:config:setup': ({ command, config, addDevToolbarApp, updateConfig }) => {
				if (command !== 'dev') return;
				root = fileURLToPath(config.root);
				addDevToolbarApp({ id: ID, name: 'Redline', icon: ICON, entrypoint: new URL('./app.js', import.meta.url) });
				// The app talks to the server over Vite's HMR channel, which prebundled dependencies don't get.
				updateConfig({ vite: { optimizeDeps: { exclude: [ID] } } });
			},
			'astro:server:setup': async ({ toolbar, logger }) => {
				const file = path.resolve(root, options.file ?? '.redline/annotations.json');
				const dir = path.dirname(file);
				await mkdir(dir, { recursive: true });

				// The last list that parsed, so a half-written file never blanks the page.
				let last = [];
				const load = async () => {
					try {
						last = JSON.parse(await readFile(file, 'utf8'));
					} catch (err) {
						if (err.code === 'ENOENT') last = [];
					}
					return last;
				};
				const broadcast = () =>
					load()
						.then(list => toolbar.send(ev('all'), list))
						.catch(err => logger.warn(err.message));

				// One write at a time, each against the file as it is now.
				let queue = Promise.resolve();
				const change = apply => payload => {
					queue = queue
						.then(async () => {
							const list = await load();
							const next = apply(list, payload ?? {}) ?? list;
							await writeFile(`${file}.tmp`, `${JSON.stringify(next, null, '\t')}\n`);
							await rename(`${file}.tmp`, file);
							last = next;
							toolbar.send(ev('all'), next);
						})
						.catch(err => logger.warn(err.message));
				};

				toolbar.on(ev('load'), broadcast);
				toolbar.on(
					ev('add'),
					change((list, a) => {
						list.push({
							id: text(a.id, 64) ?? randomUUID(),
							n: list.reduce((max, x) => Math.max(max, x.n ?? 0), 0) + 1,
							page: text(a.page, 300) ?? '/',
							status: 'open',
							text: text(a.text, 2000) ?? '',
							cut: a.cut === true,
							replace: text(a.replace, 2000),
							note: text(a.note, 4000) ?? '',
							reply: null,
							selector: text(a.selector, 1000),
							created: new Date().toISOString(),
						});
					}),
				);
				toolbar.on(
					ev('update'),
					change((list, { id, patch = {} }) => {
						const a = list.find(x => x.id === id);
						if (!a) return;
						if ('replace' in patch) a.replace = text(patch.replace, 2000);
						if ('note' in patch) a.note = text(patch.note, 4000) ?? '';
						if (patch.status === 'open' || patch.status === 'done') a.status = patch.status;
					}),
				);
				toolbar.on(
					ev('remove'),
					change((list, { id }) => list.filter(x => x.id !== id)),
				);

				// Edits to the file from outside the browser (an agent marking marks done) show up on the page.
				let timer;
				watch(dir, (_, name) => {
					if (name !== path.basename(file)) return;
					clearTimeout(timer);
					timer = setTimeout(broadcast, 150);
				});
				logger.info(`marks are saved in ${path.relative(root, file)}`);
			},
		},
	};
}

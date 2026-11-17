// The browser half of astro-redline (see index.mjs). With the app on, click anything on the page to leave a note,
// cut it, or rewrite its text; numbered pins mark what's open, and green ones are done.
import { defineToolbarApp } from 'astro/toolbar';

const ID = 'astro-redline';
const ev = name => `${ID}:${name}`;
const STAYS_ON = `${ID}:on`;
const RED = '#f43f5e';

const norm = s => (s ?? '').replace(/\s+/g, ' ').trim();
const textOf = el => norm(el.innerText);
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const STYLES = `
	.box { position: fixed; display: none; pointer-events: none; box-sizing: border-box; z-index: 2147483000;
		border: 2px solid ${RED}; border-radius: 4px; background: rgba(244, 63, 94, 0.08); }
	.pins { position: fixed; inset: 0; pointer-events: none; z-index: 2147483001; }
	.pin { position: fixed; pointer-events: auto; width: 22px; height: 22px; padding: 0; box-sizing: border-box;
		border: 2px solid #fff; border-radius: 50%; background: ${RED}; color: #fff; cursor: pointer;
		font: 700 11px/18px ui-sans-serif, system-ui, sans-serif; text-align: center; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35); }
	.pin.done { background: #16a34a; }
	.pop, .panel { position: fixed; z-index: 2147483002; box-sizing: border-box; color: #e4e4e7; background: #13151a;
		border: 1px solid #343841; border-radius: 10px; font: 13px/1.4 ui-sans-serif, system-ui, sans-serif;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45); }
	.pop[hidden], .panel[hidden] { display: none; }
	.pop { width: 340px; max-width: calc(100vw - 16px); padding: 10px; }
	textarea { display: block; width: 100%; box-sizing: border-box; margin: 0 0 8px; padding: 6px 8px; color: inherit;
		background: #1f2229; border: 1px solid #343841; border-radius: 6px; font: inherit; resize: vertical;
		field-sizing: content; min-height: 2.6em; max-height: 40vh; }
	textarea:focus { outline: 2px solid #a78bfa; outline-offset: -1px; }
	.quote { margin: 0 0 8px; color: #a1a1aa; overflow-wrap: anywhere; }
	.cut { text-decoration: line-through; }
	.reply { margin: 0 0 8px; padding-left: 8px; border-left: 2px solid #a78bfa; color: #d4d4d8; white-space: pre-wrap; }
	.actions { display: flex; gap: 6px; align-items: center; }
	.spacer { flex: 1; }
	.actions button { padding: 4px 10px; border: 1px solid #343841; border-radius: 6px; background: transparent;
		color: inherit; font: inherit; cursor: pointer; }
	.actions button:hover { background: #262a33; }
	.actions .primary, .actions .primary:hover { background: ${RED}; border-color: ${RED}; color: #fff; }
	.panel { right: 12px; bottom: 76px; width: 290px; max-height: 50vh; overflow: auto; padding: 6px; }
	.head { display: flex; justify-content: space-between; padding: 4px 6px 6px; font-weight: 600; }
	.count { color: #a1a1aa; font-weight: 400; }
	.item { display: flex; gap: 8px; align-items: center; width: 100%; padding: 5px 6px; border: 0; border-radius: 6px;
		background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
	.item:hover { background: #1f2229; }
	.n { flex: none; width: 18px; height: 18px; border-radius: 50%; background: ${RED}; color: #fff;
		font: 700 10.5px/18px ui-sans-serif, system-ui, sans-serif; text-align: center; }
	.done .n { background: #16a34a; }
	.what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.done .what { color: #71717a; }
	.other { display: block; padding: 5px 6px; color: #a1a1aa; text-decoration: none; }
	.other:hover { color: #e4e4e7; }
`;

// Plain text, or text with inline bits like links, is something you can rewrite in place.
const INLINE = new Set(['A', 'ABBR', 'B', 'BR', 'CODE', 'EM', 'I', 'MARK', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'WBR']);
const rewritable = el => {
	const t = textOf(el);
	return t.length > 0 && t.length <= 800 && [...el.children].every(c => INLINE.has(c.tagName) && getComputedStyle(c).display.startsWith('inline'));
};

const cssPath = el => {
	const parts = [];
	for (let node = el; node && node !== document.body; node = node.parentElement) {
		if (node.id) {
			parts.unshift(`#${CSS.escape(node.id)}`);
			return parts.join(' > ');
		}
		let i = 1;
		for (let s = node.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === node.tagName) i++;
		parts.unshift(`${node.localName}:nth-of-type(${i})`);
	}
	return ['body', ...parts].join(' > ');
};

export default defineToolbarApp({
	init(canvas, app, toolbarServer) {
		// Astro's own server helpers come out of Vite's prebundled deps, where `import.meta.hot` doesn't exist, so
		// their messages go nowhere. This module is served from source, so its HMR channel works.
		const server = import.meta.hot
			? { send: (event, payload) => import.meta.hot.send(event, payload), on: (event, cb) => import.meta.hot.on(event, cb) }
			: toolbarServer;
		const make = (tag, cls, content) => {
			const node = document.createElement(tag);
			if (cls) node.className = cls;
			if (content != null) node.textContent = content;
			return node;
		};
		const style = make('style', null, STYLES);
		const box = make('div', 'box');
		const pins = make('div', 'pins');
		const pop = make('div', 'pop');
		const panel = make('div', 'panel');
		pop.hidden = true;
		panel.hidden = true;
		canvas.append(style, box, pins, pop, panel);

		let active = false;
		let list = [];
		let located = new Map();
		let hovered = null;
		let target = null;

		const page = () => location.pathname;
		const here = () => list.filter(a => a.page === page()).sort((a, b) => a.n - b.n);
		const inToolbar = e => e.composedPath().some(n => n instanceof Element && n.localName === 'astro-dev-toolbar');
		const pickable = el => el instanceof Element && el !== document.documentElement && el !== document.body;

		// Finds an annotation's element: where it was, or wherever its text (old or new) is now.
		const resolve = a => {
			const want = [a.text, a.replace].filter(Boolean).map(norm);
			let el = null;
			try {
				el = a.selector ? document.querySelector(a.selector) : null;
			} catch {}
			if (el && want.includes(textOf(el))) return el;
			let found = null;
			for (const node of document.body.querySelectorAll('*')) {
				if (node.localName === 'astro-dev-toolbar' || node.localName === 'script' || node.localName === 'style') continue;
				if (want.includes(textOf(node))) found = node;
			}
			return found;
		};
		const locate = () => {
			located = new Map(here().map(a => [a.id, resolve(a)]));
		};

		const placeBox = () => {
			const el = !pop.hidden && target ? target : hovered;
			if (!active || !el?.isConnected) {
				box.style.display = 'none';
				return;
			}
			const r = el.getBoundingClientRect();
			Object.assign(box.style, { display: 'block', top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` });
		};

		const placePins = () => {
			pins.replaceChildren();
			if (!active) return;
			for (const a of here()) {
				const el = located.get(a.id);
				if (!el?.isConnected) continue;
				const r = el.getBoundingClientRect();
				if (r.bottom < 0 || r.top > innerHeight) continue;
				const pin = make('button', `pin${a.status === 'done' ? ' done' : ''}`, String(a.n));
				pin.style.top = `${Math.max(4, r.top - 9)}px`;
				pin.style.left = `${Math.min(innerWidth - 26, Math.max(4, r.right - 11))}px`;
				pin.title = a.note || a.replace || a.text;
				pin.addEventListener('click', () => openPop(el, a));
				pins.append(pin);
			}
		};

		const renderPanel = () => {
			panel.replaceChildren();
			panel.hidden = !active;
			if (!active) return;
			const mine = here();
			const head = make('div', 'head', 'Redline');
			head.append(make('span', 'count', String(mine.filter(a => a.status !== 'done').length)));
			panel.append(head);
			for (const a of mine) {
				const row = make('button', `item${a.status === 'done' ? ' done' : ''}`);
				const what = make('span', `what${a.cut ? ' cut' : ''}`, a.note || (a.replace != null ? `→ ${a.replace}` : a.text));
				row.append(make('span', 'n', String(a.n)), what);
				row.addEventListener('click', () => {
					const el = located.get(a.id);
					if (el?.isConnected) {
						el.scrollIntoView({ block: 'center' });
						requestAnimationFrame(() => openPop(el, a));
					} else openPop(null, a);
				});
				panel.append(row);
			}
			const elsewhere = new Map();
			for (const a of list) if (a.page !== page() && a.status !== 'done') elsewhere.set(a.page, (elsewhere.get(a.page) ?? 0) + 1);
			for (const [p, n] of elsewhere) {
				const link = make('a', 'other', `${p} · ${n}`);
				link.href = p;
				panel.append(link);
			}
		};

		const render = () => {
			placeBox();
			placePins();
			renderPanel();
		};

		const placePop = () => {
			if (pop.hidden) return;
			const r = target?.isConnected ? target.getBoundingClientRect() : { top: innerHeight / 3, bottom: innerHeight / 3, left: (innerWidth - 340) / 2 };
			const h = pop.offsetHeight;
			const w = pop.offsetWidth;
			let top = r.bottom + 8;
			if (top + h > innerHeight - 8) top = r.top - h - 8;
			if (top < 8) top = Math.max(8, innerHeight - h - 80);
			pop.style.top = `${top}px`;
			pop.style.left = `${Math.min(Math.max(8, r.left), innerWidth - w - 8)}px`;
		};

		const closePop = () => {
			pop.hidden = true;
			target = null;
			placeBox();
		};

		const add = (el, fields) => {
			server.send(ev('add'), {
				id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
				page: page(),
				selector: cssPath(el),
				text: textOf(el),
				cut: false,
				replace: null,
				note: '',
				...fields,
			});
		};

		function openPop(el, ann) {
			target = el;
			pop.replaceChildren();
			const original = ann ? ann.text : textOf(el);
			const canRewrite = !ann?.cut && (ann?.replace != null || (el?.isConnected && rewritable(el)));
			const field = canRewrite ? make('textarea') : null;
			if (field) {
				field.value = ann?.replace ?? original;
				pop.append(field);
			} else pop.append(make('div', `quote${ann?.cut ? ' cut' : ''}`, clip(original, 240)));
			const note = make('textarea');
			note.placeholder = 'Note';
			note.value = ann?.note ?? '';
			pop.append(note);
			if (ann?.reply) pop.append(make('div', 'reply', ann.reply));

			const actions = make('div', 'actions');
			const button = (label, cls, onClick) => {
				const b = make('button', cls, label);
				b.type = 'button';
				b.addEventListener('click', onClick);
				actions.append(b);
				return b;
			};
			if (ann) {
				button('Delete', null, () => {
					server.send(ev('remove'), { id: ann.id });
					closePop();
				});
				if (ann.status === 'done')
					button('Reopen', null, () => {
						server.send(ev('update'), { id: ann.id, patch: { status: 'open' } });
						closePop();
					});
			} else
				button('Cut', null, () => {
					add(el, { cut: true, note: note.value.trim() });
					closePop();
				});
			actions.append(make('span', 'spacer'));
			button('Cancel', null, closePop);
			const save = button('Save', 'primary', () => {
				const replace = field && norm(field.value) !== norm(original) ? field.value.trim() : null;
				const noteText = note.value.trim();
				if (ann) server.send(ev('update'), { id: ann.id, patch: { replace: ann.cut ? null : replace, note: noteText } });
				else if (replace != null || noteText) add(el, { replace, note: noteText });
				closePop();
			});
			pop.append(actions);
			pop.onkeydown = e => {
				if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save.click();
			};

			pop.hidden = false;
			placePop();
			placeBox();
			(field ?? note).focus();
		}

		const onMove = e => {
			if (!pop.hidden || inToolbar(e)) return;
			hovered = pickable(e.target) ? e.target : null;
			placeBox();
		};
		// Alt-click goes through to the page, so links still work with Redline on.
		const onClick = e => {
			if (inToolbar(e) || e.altKey) return;
			e.preventDefault();
			e.stopPropagation();
			if (pickable(e.target)) openPop(e.target, null);
		};
		const onKey = e => {
			if (e.key === 'Escape' && !pop.hidden) closePop();
		};
		let frame = 0;
		const onScroll = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				placeBox();
				placePins();
				placePop();
			});
		};

		const cursor = make('style', null, '* { cursor: crosshair !important; }');
		const setActive = on => {
			active = on;
			try {
				sessionStorage.setItem(STAYS_ON, on ? '1' : '');
			} catch {}
			const method = on ? 'addEventListener' : 'removeEventListener';
			for (const type of ['click', 'auxclick']) document[method](type, onClick, true);
			document[method]('mousemove', onMove, true);
			document[method]('keydown', onKey, true);
			window[method]('scroll', onScroll, true);
			window[method]('resize', onScroll);
			if (on) document.head.append(cursor);
			else {
				cursor.remove();
				closePop();
				hovered = null;
			}
			locate();
			render();
		};

		app.onToggled(({ state }) => setActive(state));
		server.on(ev('all'), data => {
			list = Array.isArray(data) ? data : [];
			locate();
			render();
			const open = list.filter(a => a.status !== 'done').length;
			app.toggleNotification(open ? { state: true, level: 'info' } : { state: false });
		});
		server.send(ev('load'), {});

		// A page reload (after a source edit) keeps Redline on if it was on.
		try {
			if (sessionStorage.getItem(STAYS_ON)) app.toggleState({ state: true });
		} catch {}
	},
});

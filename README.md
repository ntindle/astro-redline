# astro-redline

Mark up a page while it runs in `astro dev`. Click anything to leave a note on it, cut it, or rewrite its text. Each mark is pinned to the page and saved to `.redline/annotations.json`, so you or a coding agent can work through them.

It's an app on Astro's dev toolbar. It only runs in `astro dev`, adds nothing to your build, and nothing leaves your machine.

## Install

```sh
npm install --save-dev github:ntindle/astro-redline
```

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import redline from 'astro-redline';

export default defineConfig({
	integrations: [redline()],
});
```

Add `.redline/` to your `.gitignore`.

## Use

Turn on Redline in the dev toolbar (the speech bubble), then click anything on the page.

- **Note:** type in the Note box and hit Save.
- **Rewrite:** edit the text in the top box and hit Save. The box only appears on plain text.
- **Cut:** hit Cut.

Numbered pins mark open items. They turn green when they're done. Click a pin to change its note, delete it, or read the reply. The list in the bottom-right corner shows this page's marks and links to other pages that have open ones.

Alt-click follows links while Redline is on. Ctrl+Enter (⌘+Enter on a Mac) saves. Redline stays on across reloads and page changes.

## The file

`.redline/annotations.json` is a list of marks:

```json
[
	{
		"id": "f6e8e2d5-0cfa-467b-b13c-26bc952a46f8",
		"n": 4,
		"page": "/contributions/",
		"status": "open",
		"text": "A collaborative book on algorithms. I set up its CI.",
		"cut": false,
		"replace": "A collaborative book on algorithms.",
		"note": "",
		"reply": null,
		"selector": "#co-op > ul:nth-of-type(1) > li:nth-of-type(3) > div:nth-of-type(1) > span:nth-of-type(1)",
		"created": "2026-11-17T04:23:24.234Z"
	}
]
```

- `n` is the number on the pin.
- `text` is the element's text when it was marked.
- `cut` means remove it.
- `replace` is the new text, or `null`.
- `note` is anything else.

To handle a mark, make the change in your source, then set `status` to `"done"`. You can also write a `reply`, and it shows up when someone clicks the pin. The page picks up changes to the file while it's open.

Pins find their element by `selector`, or by `text` (or `replace`, once the rewrite is in) when the page has changed.

## Options

```js
redline({ file: '.redline/annotations.json' });
```

`file` is relative to the project root.

## Notes

- Tested with Astro 6.
- It talks to the dev server over Vite's HMR connection.

## License

MIT

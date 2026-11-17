import type { AstroIntegration } from 'astro';

export interface RedlineOptions {
	/** Where marks are saved, relative to the project root. Default: `.redline/annotations.json`. */
	file?: string;
}

export default function redline(options?: RedlineOptions): AstroIntegration;

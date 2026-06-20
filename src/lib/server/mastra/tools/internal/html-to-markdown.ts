// Verified: no native Mastra HTML-to-markdown utility as of @mastra/core@1.32.1.
// Custom implementation using linkedom for lightweight server-side content extraction.

import { parseHTML } from 'linkedom';

/**
 * Structured search result extracted from DuckDuckGo HTML responses.
 */
export interface WebSearchResult {
	title: string; // max 200 chars
	url: string;
	snippet: string; // max 300 chars
	domain: string;
}

/** Tags whose content should be completely removed before conversion. */
const STRIP_TAGS = new Set(['script', 'style', 'nav', 'header', 'footer', 'aside']);

/**
 * Convert an HTML string to clean, token-efficient markdown.
 *
 * Algorithm:
 * 1. Return empty string for null/empty/unparseable input
 * 2. Strip script, style, nav, header, footer, aside elements and contents
 * 3. Walk DOM converting semantic elements to markdown equivalents
 * 4. Collapse whitespace and blank lines
 * 5. Trim final output
 */
export function htmlToMarkdown(html: string): string {
	if (!html || typeof html !== 'string' || html.trim().length === 0) {
		return '';
	}

	let document: Document;
	try {
		const { document: doc } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
		document = doc as unknown as Document;
	} catch {
		return '';
	}

	// Strip prohibited elements
	for (const tag of STRIP_TAGS) {
		const elements = document.querySelectorAll(tag);
		for (const el of elements) {
			el.parentNode?.removeChild(el);
		}
	}

	const body = document.querySelector('body');
	if (!body) return '';

	const markdown = convertNode(body);

	// Collapse multiple blank lines into single separator
	return collapseWhitespace(markdown).trim();
}

/**
 * Parse DuckDuckGo HTML search results into structured data.
 *
 * Extracts result containers from DuckDuckGo's HTML response format,
 * pulling title, URL (from uddg redirect param or href), and description.
 */
export function parseSearchResults(html: string, maxResults: number): WebSearchResult[] {
	if (!html || typeof html !== 'string' || html.trim().length === 0) {
		return [];
	}

	let document: Document;
	try {
		const { document: doc } = parseHTML(html);
		document = doc as unknown as Document;
	} catch {
		return [];
	}

	const results: WebSearchResult[] = [];

	// DuckDuckGo result containers use class="result" or similar patterns
	// The primary link uses class="result__a"
	const resultLinks = document.querySelectorAll('.result__a');

	for (const link of resultLinks) {
		if (results.length >= maxResults) break;

		const titleText = (link.textContent || '').trim();
		if (!titleText) continue;

		// Extract URL from href — DDG uses uddg redirect param
		let url = extractDDGUrl(link.getAttribute('href') || '');
		if (!url) continue;

		// Find the snippet — typically in a sibling element with class "result__snippet"
		const resultContainer = link.closest('.result') || link.parentElement?.parentElement;
		let snippet = '';
		if (resultContainer) {
			const snippetEl = resultContainer.querySelector('.result__snippet');
			if (snippetEl) {
				snippet = (snippetEl.textContent || '').trim();
			}
		}

		// Extract domain from URL
		let domain = '';
		try {
			domain = new URL(url).hostname;
		} catch {
			// If URL parsing fails, try to extract domain from the URL string
			const match = url.match(/^https?:\/\/([^/]+)/);
			domain = match ? match[1] : '';
		}

		results.push({
			title: titleText.slice(0, 200),
			url,
			snippet: snippet.slice(0, 300),
			domain
		});
	}

	// Fallback: try alternative DDG result patterns if no results found
	if (results.length === 0) {
		const altLinks = document.querySelectorAll('a.result-link, .results_links_deep a, .web-result a');
		for (const link of altLinks) {
			if (results.length >= maxResults) break;

			const titleText = (link.textContent || '').trim();
			if (!titleText) continue;

			let url = extractDDGUrl(link.getAttribute('href') || '');
			if (!url) continue;

			let domain = '';
			try {
				domain = new URL(url).hostname;
			} catch {
				const match = url.match(/^https?:\/\/([^/]+)/);
				domain = match ? match[1] : '';
			}

			results.push({
				title: titleText.slice(0, 200),
				url,
				snippet: '',
				domain
			});
		}
	}

	return results;
}

/**
 * Extract the actual URL from a DuckDuckGo redirect link.
 * DDG links often use: /l/?uddg=<encoded_url>&rut=...
 */
function extractDDGUrl(href: string): string {
	if (!href) return '';

	// Check for uddg parameter in the URL
	try {
		// Handle relative DDG URLs
		const fullUrl = href.startsWith('http') ? href : `https://duckduckgo.com${href}`;
		const parsed = new URL(fullUrl);
		const uddg = parsed.searchParams.get('uddg');
		if (uddg) {
			return decodeURIComponent(uddg);
		}
	} catch {
		// Fall through to direct href
	}

	// If it's already a direct URL (starts with http)
	if (href.startsWith('http://') || href.startsWith('https://')) {
		return href;
	}

	return '';
}

/**
 * Recursively convert a DOM node to markdown.
 */
function convertNode(node: Node): string {
	// Text node
	if (node.nodeType === 3) {
		return node.textContent || '';
	}

	// Not an element node — skip
	if (node.nodeType !== 1) {
		return '';
	}

	const el = node as Element;
	const tag = el.tagName?.toLowerCase() || '';

	// Skip stripped tags (shouldn't be here, but safety check)
	if (STRIP_TAGS.has(tag)) {
		return '';
	}

	switch (tag) {
		case 'h1':
		case 'h2':
		case 'h3':
		case 'h4':
		case 'h5':
		case 'h6': {
			const level = parseInt(tag[1]);
			const prefix = '#'.repeat(level);
			const text = getInlineText(el).trim();
			return text ? `\n\n${prefix} ${text}\n\n` : '';
		}

		case 'p': {
			const text = convertChildren(el).trim();
			return text ? `\n\n${text}\n\n` : '';
		}

		case 'br':
			return '\n';

		case 'hr':
			return '\n\n---\n\n';

		case 'a': {
			const href = el.getAttribute('href') || '';
			const text = getInlineText(el).trim();
			if (!text && !href) return '';
			if (!href) return text;
			return `[${text || href}](${href})`;
		}

		case 'img': {
			const alt = el.getAttribute('alt') || '';
			const src = el.getAttribute('src') || '';
			if (!src) return '';
			return `![${alt}](${src})`;
		}

		case 'strong':
		case 'b': {
			const text = convertChildren(el).trim();
			return text ? `**${text}**` : '';
		}

		case 'em':
		case 'i': {
			const text = convertChildren(el).trim();
			return text ? `*${text}*` : '';
		}

		case 'code': {
			// Check if inside a <pre> — if so, handled by pre
			if (el.parentElement?.tagName?.toLowerCase() === 'pre') {
				return el.textContent || '';
			}
			const text = el.textContent || '';
			return text ? `\`${text}\`` : '';
		}

		case 'pre': {
			const codeEl = el.querySelector('code');
			const text = codeEl ? (codeEl.textContent || '') : (el.textContent || '');
			const lang = codeEl?.getAttribute('class')?.match(/language-(\w+)/)?.[1] || '';
			return text ? `\n\n\`\`\`${lang}\n${text}\n\`\`\`\n\n` : '';
		}

		case 'ul': {
			return convertList(el, 'ul');
		}

		case 'ol': {
			return convertList(el, 'ol');
		}

		case 'li': {
			// Handled by convertList parent
			return convertChildren(el);
		}

		case 'table': {
			return convertTable(el);
		}

		case 'blockquote': {
			const text = convertChildren(el).trim();
			if (!text) return '';
			const lines = text.split('\n').map((line) => `> ${line}`);
			return `\n\n${lines.join('\n')}\n\n`;
		}

		case 'div':
		case 'section':
		case 'article':
		case 'main':
		case 'span':
		case 'figure':
		case 'figcaption':
		default:
			return convertChildren(el);
	}
}

/**
 * Convert all child nodes of an element.
 */
function convertChildren(el: Element): string {
	let result = '';
	for (const child of el.childNodes) {
		result += convertNode(child as Node);
	}
	return result;
}

/**
 * Get inline text content, converting inline elements like links and emphasis.
 */
function getInlineText(el: Element): string {
	let result = '';
	for (const child of el.childNodes) {
		if (child.nodeType === 3) {
			result += child.textContent || '';
		} else if (child.nodeType === 1) {
			const childEl = child as Element;
			const childTag = childEl.tagName?.toLowerCase() || '';
			switch (childTag) {
				case 'a': {
					const href = childEl.getAttribute('href') || '';
					const text = getInlineText(childEl).trim();
					result += href ? `[${text || href}](${href})` : text;
					break;
				}
				case 'strong':
				case 'b':
					result += `**${getInlineText(childEl).trim()}**`;
					break;
				case 'em':
				case 'i':
					result += `*${getInlineText(childEl).trim()}*`;
					break;
				case 'code':
					result += `\`${childEl.textContent || ''}\``;
					break;
				case 'img': {
					const alt = childEl.getAttribute('alt') || '';
					const src = childEl.getAttribute('src') || '';
					result += src ? `![${alt}](${src})` : '';
					break;
				}
				case 'br':
					result += '\n';
					break;
				default:
					result += getInlineText(childEl);
			}
		}
	}
	return result;
}

/**
 * Convert a list element (ul or ol) to markdown.
 */
function convertList(el: Element, type: 'ul' | 'ol'): string {
	const items: string[] = [];
	let index = 1;

	for (const child of el.children) {
		if (child.tagName?.toLowerCase() === 'li') {
			const text = convertChildren(child as Element).trim();
			if (text) {
				const prefix = type === 'ul' ? '-' : `${index}.`;
				// Handle multi-line list items by indenting continuation lines
				const lines = text.split('\n');
				const indented = lines
					.map((line, i) => (i === 0 ? `${prefix} ${line}` : `  ${line}`))
					.join('\n');
				items.push(indented);
				index++;
			}
		}
	}

	return items.length > 0 ? `\n\n${items.join('\n')}\n\n` : '';
}

/**
 * Convert a table element to pipe-delimited markdown table.
 */
function convertTable(el: Element): string {
	const rows: string[][] = [];
	let hasHeader = false;

	// Process thead
	const thead = el.querySelector('thead');
	if (thead) {
		const headerRow = extractTableRow(thead.querySelector('tr'));
		if (headerRow.length > 0) {
			rows.push(headerRow);
			hasHeader = true;
		}
	}

	// Process tbody rows
	const tbody = el.querySelector('tbody') || el;
	const trs = tbody.querySelectorAll('tr');
	for (const tr of trs) {
		// Skip if already processed in thead
		if (thead && tr.parentElement === thead) continue;
		const row = extractTableRow(tr);
		if (row.length > 0) {
			rows.push(row);
		}
	}

	if (rows.length === 0) return '';

	// Determine column count
	const colCount = Math.max(...rows.map((r) => r.length));

	// Normalize rows to same column count
	const normalized = rows.map((row) => {
		while (row.length < colCount) row.push('');
		return row;
	});

	// Build markdown table
	const lines: string[] = [];

	if (hasHeader) {
		lines.push(`| ${normalized[0].join(' | ')} |`);
		lines.push(`| ${normalized[0].map(() => '---').join(' | ')} |`);
		for (let i = 1; i < normalized.length; i++) {
			lines.push(`| ${normalized[i].join(' | ')} |`);
		}
	} else {
		// No explicit header — use first row as header
		lines.push(`| ${normalized[0].join(' | ')} |`);
		lines.push(`| ${normalized[0].map(() => '---').join(' | ')} |`);
		for (let i = 1; i < normalized.length; i++) {
			lines.push(`| ${normalized[i].join(' | ')} |`);
		}
	}

	return `\n\n${lines.join('\n')}\n\n`;
}

/**
 * Extract cell text from a table row.
 */
function extractTableRow(tr: Element | null): string[] {
	if (!tr) return [];
	const cells: string[] = [];
	for (const cell of tr.children) {
		const tag = cell.tagName?.toLowerCase();
		if (tag === 'td' || tag === 'th') {
			cells.push(getInlineText(cell as Element).trim().replace(/\|/g, '\\|'));
		}
	}
	return cells;
}

/**
 * Collapse multiple consecutive blank lines and whitespace into single separators.
 */
function collapseWhitespace(text: string): string {
	// Replace multiple consecutive newlines (with optional whitespace between) with double newline
	return text
		.replace(/[ \t]+/g, ' ') // collapse horizontal whitespace
		.replace(/\n[ \t]*\n([ \t]*\n)*/g, '\n\n') // collapse multiple blank lines
		.replace(/\n{3,}/g, '\n\n'); // final safety: max 2 consecutive newlines
}

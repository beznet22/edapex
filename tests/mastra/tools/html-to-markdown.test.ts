import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, parseSearchResults } from '$lib/server/mastra/tools/html-to-markdown';

describe('htmlToMarkdown', () => {
	describe('empty/null/invalid input', () => {
		it('returns empty string for null input', () => {
			expect(htmlToMarkdown(null as any)).toBe('');
		});

		it('returns empty string for undefined input', () => {
			expect(htmlToMarkdown(undefined as any)).toBe('');
		});

		it('returns empty string for empty string', () => {
			expect(htmlToMarkdown('')).toBe('');
		});

		it('returns empty string for whitespace-only string', () => {
			expect(htmlToMarkdown('   \n\t  ')).toBe('');
		});
	});

	describe('stripping prohibited elements', () => {
		it('strips script tags and content', () => {
			const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
			const result = htmlToMarkdown(html);
			expect(result).not.toContain('alert');
			expect(result).not.toContain('script');
			expect(result).toContain('Hello');
			expect(result).toContain('World');
		});

		it('strips style tags and content', () => {
			const html = '<style>.foo { color: red; }</style><p>Content</p>';
			const result = htmlToMarkdown(html);
			expect(result).not.toContain('color');
			expect(result).not.toContain('style');
			expect(result).toContain('Content');
		});

		it('strips nav elements', () => {
			const html = '<nav><a href="/home">Home</a></nav><p>Main content</p>';
			const result = htmlToMarkdown(html);
			expect(result).not.toContain('Home');
			expect(result).toContain('Main content');
		});

		it('strips header elements', () => {
			const html = '<header><h1>Site Title</h1></header><p>Body</p>';
			const result = htmlToMarkdown(html);
			expect(result).not.toContain('Site Title');
			expect(result).toContain('Body');
		});

		it('strips footer elements', () => {
			const html = '<footer>Copyright 2024</footer><p>Content</p>';
			const result = htmlToMarkdown(html);
			expect(result).not.toContain('Copyright');
			expect(result).toContain('Content');
		});

		it('strips aside elements', () => {
			const html = '<aside>Sidebar</aside><p>Main</p>';
			const result = htmlToMarkdown(html);
			expect(result).not.toContain('Sidebar');
			expect(result).toContain('Main');
		});
	});

	describe('heading conversion', () => {
		it('converts h1 to # prefix', () => {
			expect(htmlToMarkdown('<h1>Title</h1>')).toContain('# Title');
		});

		it('converts h2 to ## prefix', () => {
			expect(htmlToMarkdown('<h2>Subtitle</h2>')).toContain('## Subtitle');
		});

		it('converts h3 to ### prefix', () => {
			expect(htmlToMarkdown('<h3>Section</h3>')).toContain('### Section');
		});

		it('converts h6 to ###### prefix', () => {
			expect(htmlToMarkdown('<h6>Deep</h6>')).toContain('###### Deep');
		});
	});

	describe('paragraph conversion', () => {
		it('converts paragraphs with double newline separation', () => {
			const result = htmlToMarkdown('<p>First</p><p>Second</p>');
			expect(result).toContain('First');
			expect(result).toContain('Second');
			// Should have separation between paragraphs
			expect(result).toMatch(/First\n\nSecond/);
		});
	});

	describe('link conversion', () => {
		it('converts links to markdown format', () => {
			const html = '<a href="https://example.com">Example</a>';
			const result = htmlToMarkdown(html);
			expect(result).toContain('[Example](https://example.com)');
		});

		it('uses URL as text when link text is empty', () => {
			const html = '<a href="https://example.com"></a>';
			const result = htmlToMarkdown(html);
			expect(result).toContain('[https://example.com](https://example.com)');
		});
	});

	describe('image conversion', () => {
		it('converts images to markdown format', () => {
			const html = '<img alt="Logo" src="https://example.com/logo.png">';
			const result = htmlToMarkdown(html);
			expect(result).toContain('![Logo](https://example.com/logo.png)');
		});

		it('handles images without alt text', () => {
			const html = '<img src="https://example.com/img.jpg">';
			const result = htmlToMarkdown(html);
			expect(result).toContain('![](https://example.com/img.jpg)');
		});
	});

	describe('list conversion', () => {
		it('converts unordered lists with dash prefix', () => {
			const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
			const result = htmlToMarkdown(html);
			expect(result).toContain('- Item 1');
			expect(result).toContain('- Item 2');
		});

		it('converts ordered lists with number prefix', () => {
			const html = '<ol><li>First</li><li>Second</li><li>Third</li></ol>';
			const result = htmlToMarkdown(html);
			expect(result).toContain('1. First');
			expect(result).toContain('2. Second');
			expect(result).toContain('3. Third');
		});
	});

	describe('table conversion', () => {
		it('converts tables to pipe-delimited markdown', () => {
			const html = `
				<table>
					<thead><tr><th>Name</th><th>Age</th></tr></thead>
					<tbody><tr><td>Alice</td><td>30</td></tr></tbody>
				</table>
			`;
			const result = htmlToMarkdown(html);
			expect(result).toContain('| Name | Age |');
			expect(result).toContain('| --- | --- |');
			expect(result).toContain('| Alice | 30 |');
		});

		it('escapes pipe characters in cell content', () => {
			const html = '<table><tr><td>A | B</td><td>C</td></tr></table>';
			const result = htmlToMarkdown(html);
			expect(result).toContain('A \\| B');
		});
	});

	describe('code conversion', () => {
		it('converts inline code to backticks', () => {
			const html = '<p>Use <code>const x = 1</code> here</p>';
			const result = htmlToMarkdown(html);
			expect(result).toContain('`const x = 1`');
		});

		it('converts pre/code blocks to fenced code blocks', () => {
			const html = '<pre><code>function hello() {\n  return "world";\n}</code></pre>';
			const result = htmlToMarkdown(html);
			expect(result).toContain('```');
			expect(result).toContain('function hello()');
		});

		it('detects language class on code element', () => {
			const html = '<pre><code class="language-typescript">const x: number = 1;</code></pre>';
			const result = htmlToMarkdown(html);
			expect(result).toContain('```typescript');
		});
	});

	describe('whitespace collapsing', () => {
		it('collapses multiple blank lines to single separator', () => {
			const html = '<p>First</p>\n\n\n\n<p>Second</p>';
			const result = htmlToMarkdown(html);
			// Should not have more than 2 consecutive newlines
			expect(result).not.toMatch(/\n{3,}/);
		});

		it('trims leading and trailing whitespace', () => {
			const html = '<p>Content</p>';
			const result = htmlToMarkdown(html);
			expect(result).toBe(result.trim());
		});
	});

	describe('emphasis conversion', () => {
		it('converts strong/b to bold markdown', () => {
			const html = '<p><strong>Bold text</strong></p>';
			const result = htmlToMarkdown(html);
			expect(result).toContain('**Bold text**');
		});

		it('converts em/i to italic markdown', () => {
			const html = '<p><em>Italic text</em></p>';
			const result = htmlToMarkdown(html);
			expect(result).toContain('*Italic text*');
		});
	});

	describe('blockquote conversion', () => {
		it('converts blockquotes with > prefix', () => {
			const html = '<blockquote>A wise quote</blockquote>';
			const result = htmlToMarkdown(html);
			expect(result).toContain('> A wise quote');
		});
	});

	describe('complex documents', () => {
		it('handles a realistic page with mixed content', () => {
			const html = `
				<html>
				<head><style>body { font: sans-serif; }</style></head>
				<body>
					<nav><a href="/">Home</a></nav>
					<main>
						<h1>Welcome</h1>
						<p>This is a <strong>test</strong> page with <a href="https://example.com">a link</a>.</p>
						<ul>
							<li>Item one</li>
							<li>Item two</li>
						</ul>
					</main>
					<footer>Footer content</footer>
					<script>console.log('hi')</script>
				</body>
				</html>
			`;
			const result = htmlToMarkdown(html);
			expect(result).toContain('# Welcome');
			expect(result).toContain('**test**');
			expect(result).toContain('[a link](https://example.com)');
			expect(result).toContain('- Item one');
			expect(result).toContain('- Item two');
			expect(result).not.toContain('Home'); // nav stripped
			expect(result).not.toContain('Footer content'); // footer stripped
			expect(result).not.toContain('console.log'); // script stripped
			expect(result).not.toContain('font'); // style stripped
		});
	});
});

describe('parseSearchResults', () => {
	describe('empty/invalid input', () => {
		it('returns empty array for null input', () => {
			expect(parseSearchResults(null as any, 5)).toEqual([]);
		});

		it('returns empty array for empty string', () => {
			expect(parseSearchResults('', 5)).toEqual([]);
		});

		it('returns empty array for non-DDG HTML', () => {
			expect(parseSearchResults('<p>Not search results</p>', 5)).toEqual([]);
		});
	});

	describe('DuckDuckGo result extraction', () => {
		it('extracts results from DDG HTML format', () => {
			const html = `
				<div class="result">
					<a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&rut=abc">
						Example Page Title
					</a>
					<a class="result__snippet">This is the description of the page.</a>
				</div>
				<div class="result">
					<a class="result__a" href="/l/?uddg=https%3A%2F%2Fother.org%2Farticle&rut=def">
						Another Result
					</a>
					<a class="result__snippet">Another description here.</a>
				</div>
			`;
			const results = parseSearchResults(html, 5);
			expect(results.length).toBe(2);
			expect(results[0].title).toBe('Example Page Title');
			expect(results[0].url).toBe('https://example.com/page');
			expect(results[0].domain).toBe('example.com');
			expect(results[1].title).toBe('Another Result');
			expect(results[1].url).toBe('https://other.org/article');
		});

		it('respects maxResults limit', () => {
			const html = `
				<div class="result">
					<a class="result__a" href="/l/?uddg=https%3A%2F%2Fa.com">A</a>
					<a class="result__snippet">Desc A</a>
				</div>
				<div class="result">
					<a class="result__a" href="/l/?uddg=https%3A%2F%2Fb.com">B</a>
					<a class="result__snippet">Desc B</a>
				</div>
				<div class="result">
					<a class="result__a" href="/l/?uddg=https%3A%2F%2Fc.com">C</a>
					<a class="result__snippet">Desc C</a>
				</div>
			`;
			const results = parseSearchResults(html, 2);
			expect(results.length).toBe(2);
		});

		it('truncates title to 200 chars', () => {
			const longTitle = 'A'.repeat(250);
			const html = `
				<div class="result">
					<a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com">${longTitle}</a>
					<a class="result__snippet">Desc</a>
				</div>
			`;
			const results = parseSearchResults(html, 5);
			expect(results[0].title.length).toBe(200);
		});

		it('truncates snippet to 300 chars', () => {
			const longSnippet = 'B'.repeat(400);
			const html = `
				<div class="result">
					<a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com">Title</a>
					<a class="result__snippet">${longSnippet}</a>
				</div>
			`;
			const results = parseSearchResults(html, 5);
			expect(results[0].snippet.length).toBe(300);
		});

		it('extracts domain from URL', () => {
			const html = `
				<div class="result">
					<a class="result__a" href="/l/?uddg=https%3A%2F%2Fwww.example.com%2Fpath%2Fpage">Title</a>
					<a class="result__snippet">Desc</a>
				</div>
			`;
			const results = parseSearchResults(html, 5);
			expect(results[0].domain).toBe('www.example.com');
		});
	});
});

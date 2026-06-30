/**
 * Readability / layman-terms scorer.
 *
 * Measures how well the assistant translates technical jargon into
 * teacher-friendly language. Two signals:
 *
 *   1. Jargon density — penalize dense technical terms (HTTP, JSON, DDL, FK,
 *      schema, migration, ORM, SQL, etc.). The teacher audience should see
 *      very few of these in a typical chat response.
 *
 *   2. Explanation markers — reward phrases that signal simplification
 *      ("think of it as", "in simple terms", "for example", "in other words",
 *      "basically", "essentially", "imagine", "let's say").
 *
 * Score formula:
 *   - 70% jargon density (lower is better; 0 jargon/100 words = score 1,
 *     >= 5 jargon/100 words = score 0)
 *   - 30% explanation marker density (>= 2 markers/100 words = score 1)
 *
 * Tests assert score >= 0.7.
 */
const JARGON_TERMS: readonly string[] = [
	'http', 'https', 'json', 'xml', 'sql', 'ddl', 'dml', 'orm',
	'api', 'rest', 'graphql', 'crud', 'fk', 'pk', 'uuid', 'schema',
	'migration', 'migrate', 'migration', 'query', 'table', 'column',
	'index', 'indexed', 'cache', 'cached', 'redis', 'queue', 'worker',
	'thread', 'threading', 'mutex', 'semaphore', 'promise', 'async',
	'await', 'fetch', 'endpoint', 'route', 'router', 'middleware',
	'pino', 'bunyan', 'logger', 'log4j', 'debug', 'debugger', 'stack trace',
	'node_modules', 'package.json', 'tsconfig', 'eslint', 'prettier',
	'drizzle', 'drizzle-orm', 'sveltekit', 'mastr', 'libsql', 'sqlite',
	'mysql', 'postgres', 'tcp', 'udp', 'ssl', 'tls'
];

const EXPLANATION_MARKERS: readonly string[] = [
	'think of it as',
	'in simple terms',
	'simply put',
	'in other words',
	'for example',
	'for instance',
	"let's say",
	'let us say',
	'imagine',
	'basically',
	'essentially',
	'put differently',
	'to put it',
	'means that',
	'which means',
	'or in other words'
];

function countOccurrences(haystack: string, needle: string): number {
	if (!needle) return 0;
	let count = 0;
	let pos = 0;
	while (true) {
		const found = haystack.indexOf(needle, pos);
		if (found === -1) break;
		count += 1;
		pos = found + needle.length;
	}
	return count;
}

export interface ReadabilityScore {
	readonly score: number;
	readonly jargonDensity: number;
	readonly markerDensity: number;
	readonly jargonTermsFound: string[];
	readonly markersFound: string[];
}

export function scoreReadability(text: string): ReadabilityScore {
	const trimmed = text.trim();
	if (!trimmed) {
		return {
			score: 0,
			jargonDensity: 0,
			markerDensity: 0,
			jargonTermsFound: [],
			markersFound: []
		};
	}
	const lower = trimmed.toLowerCase();
	const words = lower.split(/\s+/).filter(Boolean);
	const wordCount = Math.max(1, words.length);

	const jargonFound: string[] = [];
	let jargonHits = 0;
	for (const term of JARGON_TERMS) {
		const n = countOccurrences(lower, term);
		if (n > 0) {
			jargonFound.push(term);
			jargonHits += n;
		}
	}
	const jargonDensity = (jargonHits * 100) / wordCount;

	const markersFound: string[] = [];
	let markerHits = 0;
	for (const marker of EXPLANATION_MARKERS) {
		const n = countOccurrences(lower, marker);
		if (n > 0) {
			markersFound.push(marker);
			markerHits += n;
		}
	}
	const markerDensity = (markerHits * 100) / wordCount;

	const jargonComponent = Math.max(0, 1 - jargonDensity / 5);
	const markerComponent = Math.min(1, markerDensity / 2);
	const score = 0.7 * jargonComponent + 0.3 * markerComponent;

	return {
		score,
		jargonDensity,
		markerDensity,
		jargonTermsFound: jargonFound,
		markersFound
	};
}

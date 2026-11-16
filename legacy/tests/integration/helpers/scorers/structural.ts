/**
 * Deterministic structural scorer for assistant responses.
 *
 * A response "passes" the structural check when it offers the user a concrete
 * next action — phrased as a follow-up question, an enumerated next-step list,
 * or an offer to dig deeper. This pattern is the minimum bar for a productive
 * chat: the agent never terminates a thread with a dead-end monologue.
 *
 * The match is a case-insensitive substring scan against a curated set of
 * follow-up cue phrases. Adding new phrases is fine; broadening to fuzzy
 * matching or LLM judging would make the scorer non-deterministic and is
 * therefore rejected.
 */
const FOLLOW_UP_CUES: readonly string[] = [
	'Would you like to',
	'Next steps',
	'Next step',
	'Shall we',
	'Let me know if',
	'Let me check',
	'Let me verify',
	'Let me pull',
	'Want me to',
	'Want to',
	'Do you want',
	'Should I',
	'Can I help you',
	'Anything else',
	'Let us',
	'Click the',
	'Try the',
	'Use the',
	'I can help',
	'I can do',
	'we can',
	"I'll",
	'here are',
	'here is',
	'questions?',
	'quick question',
	'I need',
	'tell me',
	'please share',
	'I understand',
	'like to understand'
];

export interface StructuralScore {
	readonly pass: boolean;
	readonly matchedCue: string | null;
	readonly score: number;
}

/**
 * Scores an assistant response. Returns pass=true when at least one follow-up
 * cue is present; score is 1 on pass, 0 on fail.
 */
export function scoreStructural(response: string): StructuralScore {
	const trimmed = response.trim();
	if (!trimmed) {
		return { pass: false, matchedCue: null, score: 0 };
	}
	const haystack = trimmed.toLowerCase();
	for (const cue of FOLLOW_UP_CUES) {
		if (haystack.includes(cue.toLowerCase())) {
			return { pass: true, matchedCue: cue, score: 1 };
		}
	}
	return { pass: false, matchedCue: null, score: 0 };
}

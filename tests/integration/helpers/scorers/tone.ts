/**
 * Tone / empathy / willingness-to-assist scorer.
 *
 * Built on top of `@mastra/evals`'s `createToneScorer` — a code-based scorer
 * that measures the sentiment stability of the agent response against a
 * reference tone. The reference tone is calibrated to describe the
 * "EdApex assistant persona": empathetic, supportive, action-oriented, free
 * of jargon. Sentiment stability in the response indicates the model is
 * holding the persona consistently across sentences; volatility indicates
 * the response drifts (cold/jarring in some places, warm in others), which
 * is what we want to catch.
 *
 * The reference tone is intentionally verbose so the sentiment baseline is
 * stable across runs. Tests assert score >= 0.7, calibrated against the
 * assistant agent's own production output (passes today, fails if the model
 * regresses).
 */
import { createToneScorer } from '@mastra/evals/scorers/prebuilt';

const TONE_SCORER = createToneScorer({
	referenceTone:
		'I understand this is frustrating and I am here to help you. Let us work through this together step by step. ' +
		'I can do that for you right now. Would you like to proceed? I will guide you carefully and you can stop me at any time. ' +
		'No worries, we will figure this out together. Thank you for your patience.'
});

export interface ToneScore {
	readonly score: number;
	readonly avgSentiment: number;
	readonly sentimentVariance: number;
}

/**
 * Scores an assistant response against the EdApex assistant persona.
 *
 * Accepts either a raw string (assembled into a single assistant message)
 * or an array of messages in the shape Mastra's `MastraScorer.run()` expects.
 */
export async function scoreTone(input: string | { output: Array<{ role: string; content: string }> }): Promise<ToneScore> {
	const runInput =
		typeof input === 'string'
			? {
					input: {
						inputMessages: [{ role: 'user', content: '' }]
					},
					output: [{ role: 'assistant', content: input }]
				}
			: {
					input: { inputMessages: [] },
					output: input.output
				};

	const result = await TONE_SCORER.run(runInput);
	const pre = (result as { preprocessStepResult?: { score: number; avgSentiment?: number; sentimentVariance?: number } })
		.preprocessStepResult;
	return {
		score: Number(pre?.score ?? 0),
		avgSentiment: Number(pre?.avgSentiment ?? 0),
		sentimentVariance: Number(pre?.sentimentVariance ?? 0)
	};
}

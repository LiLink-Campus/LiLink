import {
  MatchingEngine,
  prepareQuestions,
  type MatchingInput,
} from './matching.engine';
import { runMatching } from './matching.executor';

function fixture(): MatchingInput {
  return {
    participants: Array.from({ length: 8 }, (_, i) => ({
      id: `worker-user-${i}`,
      displayName: null,
      questionnaireVersionId: null,
      answers: {},
      intent: 'BOTH',
      hardMatchAnswers: {
        birthDate: '2000-01-01',
        gender: '女',
        partnerGenders: ['女'],
        partnerAgeMin: 18,
        partnerAgeMax: 40,
        looks: '5',
        partnerLooks: ['5'],
        heightCm: 165,
        partnerHeightMin: 120,
        partnerHeightMax: 230,
        oneLinerIntro: 'Synthetic',
        school: 'worker-school',
        excludedPartnerSchools: [],
      },
    })) as MatchingInput['participants'],
    questions: [],
    revealAt: new Date('2026-09-20T00:00:00Z'),
    questionnairesByVersionId: new Map(),
    blockedPairKeys: new Set(['worker-user-0::worker-user-1']),
    historicalPairKeys: new Set(['worker-user-2::worker-user-3']),
    unmatchedStreaks: new Map([['worker-user-0', 4]]),
    firstCycleParticipantIds: new Set(['worker-user-4']),
  };
}

it('runs the exact solver off-thread and preserves dates, exclusions and priority sets', async () => {
  const input = fixture();
  const expected = new MatchingEngine().calculate(input);
  let eventLoopAdvanced = false;
  const timer = setTimeout(() => {
    eventLoopAdvanced = true;
  }, 0);
  try {
    expect(await runMatching(input)).toEqual(expected);
    expect(eventLoopAdvanced).toBe(true);
    expect(expected.selectedPairs).toHaveLength(4);
    expect(expected.candidateCount).toBe(26);
    expect(expected.candidates).toHaveLength(20);
  } finally {
    clearTimeout(timer);
  }
}, 15_000);

it('reports a worker failure and lets the next queued calculation complete', async () => {
  const invalid = fixture();
  invalid.questions = null as never;
  const failed = runMatching(invalid);
  const next = runMatching(fixture());
  await expect(failed).rejects.toThrow();
  await expect(next).resolves.toMatchObject({ candidateCount: 26 });
}, 15_000);

it('keeps cached answer normalization specific to each questionnaire version and calculation', () => {
  const input = fixture();
  const question = {
    key: 'values',
    prompt: 'Values',
    type: 'SINGLE_SELECT' as const,
    weight: 1,
    options: [
      { value: 'a', label: 'Shared' },
      { value: 'b', label: 'Different' },
    ],
  };
  input.participants = [input.participants[0], input.participants[2]];
  input.questions = [question];
  input.questionnairesByVersionId.set('old', prepareQuestions([question]));
  input.questionnairesByVersionId.set(
    'new',
    prepareQuestions([
      {
        ...question,
        weight: 3,
        options: [
          { value: 'a', label: 'Different' },
          { value: 'b', label: 'Shared' },
        ],
      },
    ]),
  );
  for (const participant of input.participants) {
    participant.questionnaireVersionId = 'old';
    participant.answers = { values: 'Shared' };
  }
  input.participants[1].questionnaireVersionId = 'new';
  const engine = new MatchingEngine();
  const score = () =>
    engine
      .calculate(input)
      .candidates.find(
        (pair) =>
          pair.left.id === 'worker-user-0' && pair.right.id === 'worker-user-2',
      )!.rawScore;
  expect(score()).toBe(57);
  input.participants[1].answers.values = 'Different';
  expect(score()).toBe(69);
  input.participants[1].questionnaireVersionId = 'old';
  expect(score()).toBe(57);
});

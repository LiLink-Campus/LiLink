import {
  MatchingEngine,
  type CandidatePair,
  type EligibleParticipant,
  type MatchingInput,
} from './matching.engine';

function participant(id: string, vipActive = false): EligibleParticipant {
  return {
    id,
    displayName: id,
    questionnaireVersionId: null,
    vipActive,
    answers: { interest: id },
    intent: 'BOTH',
    hardMatchAnswers: {
      birthDate: '2000-01-01',
      partnerAgeMin: 18,
      partnerAgeMax: 40,
      gender: '女',
      partnerGenders: ['女'],
      looks: '5',
      partnerLooks: ['5'],
      heightCm: 165,
      partnerHeightMin: 120,
      partnerHeightMax: 230,
      oneLinerIntro: 'Synthetic',
      school: 'test-school',
      excludedPartnerSchools: [],
    },
  };
}

function fixture(
  participants: EligibleParticipant[],
  allowedPairs: string[],
): MatchingInput {
  const allowed = new Set(allowedPairs);
  const blockedPairKeys = new Set<string>();
  for (const left of participants) {
    for (const right of participants) {
      if (left.id < right.id && !allowed.has(`${left.id}::${right.id}`)) {
        blockedPairKeys.add(`${left.id}::${right.id}`);
      }
    }
  }
  return {
    participants,
    questions: [
      {
        key: 'interest',
        prompt: 'Interest',
        type: 'SINGLE_SELECT',
        weight: 10,
        options: null,
      },
    ],
    revealAt: new Date('2026-09-23T00:00:00Z'),
    questionnairesByVersionId: new Map(),
    blockedPairKeys,
    historicalPairKeys: new Set(),
    unmatchedStreaks: new Map(),
    firstCycleParticipantIds: new Set(),
  };
}

function pairKeys(pairs: CandidatePair[]) {
  return pairs
    .map(({ left, right }) => [left.id, right.id].sort().join('::'))
    .sort();
}

describe('matching priorities', () => {
  it.each([0, 1, 2, 3, 10])(
    'applies unmatched priority before VIP starting at two misses (streak %i)',
    (streak) => {
      const input = fixture(
        [participant('a'), participant('b'), participant('vip', true)],
        ['a::b', 'a::vip'],
      );
      input.unmatchedStreaks.set('b', streak);
      input.participants[0].answers = input.participants[2].answers;
      const result = new MatchingEngine().calculate(input);
      expect(pairKeys(result.selectedPairs)).toEqual([
        streak >= 2 ? 'a::b' : 'a::vip',
      ]);
    },
  );

  it('prefers a VIP over a higher-scoring first-cycle free participant', () => {
    const input = fixture(
      [participant('a'), participant('b'), participant('vip', true)],
      ['a::b', 'a::vip'],
    );
    input.participants[0].answers = input.participants[1].answers;
    input.firstCycleParticipantIds.add('b');
    expect(
      pairKeys(new MatchingEngine().calculate(input).selectedPairs),
    ).toEqual(['a::vip']);
  });

  it('does not let a longer streak displace VIP when priority-user counts tie', () => {
    const input = fixture(
      [participant('a'), participant('b'), participant('vip', true)],
      ['a::b', 'a::vip'],
    );
    input.unmatchedStreaks.set('b', 10);
    input.unmatchedStreaks.set('vip', 2);
    expect(
      pairKeys(new MatchingEngine().calculate(input).selectedPairs),
    ).toEqual(['a::vip']);
  });

  it('matches both VIP users with free users when pairing VIPs together strands the free users', () => {
    const input = fixture(
      [
        participant('a', true),
        participant('b', true),
        participant('c'),
        participant('d'),
      ],
      ['a::b', 'a::c', 'b::d'],
    );
    input.participants[0].answers = input.participants[1].answers;
    expect(
      pairKeys(new MatchingEngine().calculate(input).selectedPairs),
    ).toEqual(['a::c', 'b::d']);
  });

  it('maximizes the remaining free-user matches before compatibility', () => {
    const input = fixture(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => participant(id, id === 'a')),
      ['a::b', 'c::d', 'c::e', 'd::f'],
    );
    input.participants[2].answers = input.participants[3].answers;
    expect(
      pairKeys(new MatchingEngine().calculate(input).selectedPairs),
    ).toEqual(['a::b', 'c::e', 'd::f']);
  });

  it.each(['gender', 'intent', 'height', 'blocked', 'historical'])(
    'never overrides %s constraints for a VIP with unmatched priority',
    (constraint) => {
      const input = fixture(
        [participant('a', true), participant('b')],
        ['a::b'],
      );
      input.unmatchedStreaks.set('a', 2);
      if (constraint === 'gender')
        input.participants[1].hardMatchAnswers.partnerGenders = ['男'];
      if (constraint === 'height')
        input.participants[0].hardMatchAnswers.partnerHeightMin = 180;
      if (constraint === 'intent') {
        input.participants[0].intent = 'FRIEND';
        input.participants[1].intent = 'DATE';
      }
      if (constraint === 'blocked') input.blockedPairKeys.add('a::b');
      if (constraint === 'historical') input.historicalPairKeys.add('a::b');
      expect(new MatchingEngine().calculate(input).selectedPairs).toEqual([]);
    },
  );

  it('keeps VIP and unmatched priority out of the displayed compatibility score', () => {
    const input = fixture([participant('a'), participant('b')], ['a::b']);
    const before = new MatchingEngine().calculate(input).selectedPairs[0];
    input.participants[0].vipActive = true;
    input.unmatchedStreaks.set('a', 2);
    const after = new MatchingEngine().calculate(input).selectedPairs[0];
    expect(after.rawScore).toBe(before.rawScore);
    expect(after.score).toBe(before.score);
    expect(after.matchingWeight).toBeGreaterThan(before.matchingWeight);
  });

  it('agrees with exhaustive matching on the ordered business objectives', () => {
    let seed = 923;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let run = 0; run < 60; run++) {
      const people = Array.from({ length: 6 }, (_, i) =>
        participant(String(i), random() < 0.5),
      );
      const allowed: string[] = [];
      for (const left of people) {
        left.answers.interest = Math.floor(random() * 3).toString();
        for (const right of people) {
          if (left.id < right.id && random() < 0.6)
            allowed.push(`${left.id}::${right.id}`);
        }
      }
      const input = fixture(people, allowed);
      for (const person of people) {
        input.unmatchedStreaks.set(person.id, Math.floor(random() * 4));
        if (random() < 0.3) input.firstCycleParticipantIds.add(person.id);
      }
      const result = new MatchingEngine().calculate(input);
      const objective = (pairs: CandidatePair[]) => {
        const matched = pairs.flatMap((pair) => [pair.left, pair.right]);
        const bonuses = matched.reduce((sum, person) => {
          const streak = input.unmatchedStreaks.get(person.id)!;
          return (
            sum +
            (streak < 2 ? streak * 2 : 0) +
            (input.firstCycleParticipantIds.has(person.id) ? 6 : 0)
          );
        }, 0);
        return [
          matched.filter(
            (person) => input.unmatchedStreaks.get(person.id)! >= 2,
          ).length,
          matched.filter((person) => person.vipActive).length,
          matched.length,
          pairs.reduce((sum, pair) => sum + pair.rawScore, bonuses),
        ];
      };
      const actual = objective(result.selectedPairs);
      const compare = (left: number[], right: number[]) => {
        for (let i = 0; i < left.length; i++) {
          if (left[i] !== right[i]) return left[i] - right[i];
        }
        return 0;
      };
      const visit = (
        remaining: EligibleParticipant[],
        selected: CandidatePair[],
      ) => {
        if (!remaining.length) {
          expect(compare(actual, objective(selected))).toBeGreaterThanOrEqual(
            0,
          );
          return;
        }
        const [first, ...rest] = remaining;
        visit(rest, selected);
        for (const pair of result.candidates) {
          const other =
            pair.left.id === first.id
              ? pair.right
              : pair.right.id === first.id
                ? pair.left
                : null;
          if (other && rest.some((person) => person.id === other.id)) {
            visit(
              rest.filter((person) => person.id !== other.id),
              [...selected, pair],
            );
          }
        }
      };
      visit(people, []);
      input.participants = [...people].reverse();
      expect(
        objective(new MatchingEngine().calculate(input).selectedPairs),
      ).toEqual(actual);
    }
  });
});

import type { MeetupLocationCandidate } from '@lilink/shared';

export type { MeetupLocationCandidate } from '@lilink/shared';

export const locationCandidates = [
  {
    id: 'social-suoshe',
    name: 'social索社',
    latitude: 18.39608,
    longitude: 110.022687,
  },
  {
    id: 'vibes-restaurant-bar',
    name: 'vibes餐吧',
    latitude: 18.392448,
    longitude: 110.020263,
  },
  {
    id: 'living-area-2-canteen',
    name: '生活二区食堂',
    latitude: 18.395834,
    longitude: 110.023802,
  },
  {
    id: 'living-area-1-kfc',
    name: '生活一区KFC',
    latitude: 18.394713,
    longitude: 110.020833,
  },
  {
    id: 'experimental-area-library',
    name: '试验区图书馆',
    latitude: 18.401096,
    longitude: 110.01899,
  },
] as const satisfies readonly MeetupLocationCandidate[];

export function findLocationCandidate(locationCandidateId: string) {
  return (
    locationCandidates.find(
      (candidate) => candidate.id === locationCandidateId,
    ) ?? null
  );
}

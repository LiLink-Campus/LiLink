import type { MeetupLocationCandidate } from '@lilink/shared';

export type { MeetupLocationCandidate } from '@lilink/shared';

export const locationCandidates = [
  {
    id: 'nyush-qiantan-lobby',
    name: 'NYU Shanghai Qiantan Lobby',
    latitude: 31.163322,
    longitude: 121.471441,
  },
  {
    id: 'nyush-qiantan-cafe',
    name: 'NYU Shanghai Qiantan Cafe',
    latitude: 31.162996,
    longitude: 121.471015,
  },
  {
    id: 'qiantan-taikoo-li-central-plaza',
    name: 'Qiantan Taikoo Li Central Plaza',
    latitude: 31.158448,
    longitude: 121.480532,
  },
  {
    id: 'oriental-sports-center-gate',
    name: 'Oriental Sports Center Gate',
    latitude: 31.159246,
    longitude: 121.487585,
  },
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

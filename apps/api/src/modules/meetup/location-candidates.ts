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
] as const satisfies readonly MeetupLocationCandidate[];

export function findLocationCandidate(locationCandidateId: string) {
  return (
    locationCandidates.find(
      (candidate) => candidate.id === locationCandidateId,
    ) ?? null
  );
}

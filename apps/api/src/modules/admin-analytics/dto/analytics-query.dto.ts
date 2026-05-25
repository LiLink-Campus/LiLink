import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const toBool = ({ value }: { value: unknown }) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};

export const LEADERBOARD_SORT_KEYS = [
  'unmatchedStreak',
  'matchStreak',
  'matchRate',
  'matchedRounds',
  'optInRounds',
] as const;
export type LeaderboardSortKey = (typeof LEADERBOARD_SORT_KEYS)[number];

export class AnalyticsBaseQueryDto {
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeTest?: boolean;
}

export class WeeklyOptinQueryDto extends AnalyticsBaseQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(52)
  limit?: number;
}

export class MatchLeaderboardQueryDto extends AnalyticsBaseQueryDto {
  @IsOptional()
  @IsIn(LEADERBOARD_SORT_KEYS)
  sort?: LeaderboardSortKey;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

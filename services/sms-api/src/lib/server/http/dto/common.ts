export interface ListDto<T> {
  readonly rows: readonly T[];
  readonly nextCursor: string | null;
}

export const listDto = <T>(rows: readonly T[]): ListDto<T> => ({
  rows,
  nextCursor: null
});

export interface StudentRosterEntry {
  readonly id: number;
  readonly name: string;
  readonly admissionNo: number | null;
}

export interface RosterQuery {
  readonly classId: number;
  readonly sectionId: number;
  readonly academicId: number;
}

export interface StudentDirectory {
  listRoster(query: RosterQuery): Promise<readonly StudentRosterEntry[]>;
}

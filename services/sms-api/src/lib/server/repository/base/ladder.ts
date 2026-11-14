/** Repository-local copy of the class ladder (`05 §6.1`); scripts keep their own copy. */
export const CLASS_LADDER = [
  { name: "CRECHE", stage: "EARLY_YEARS", sortOrder: 12 },
  { name: "NURSERY 1", stage: "EARLY_YEARS", sortOrder: 13 },
  { name: "NURSERY 2", stage: "EARLY_YEARS", sortOrder: 14 },
  { name: "GRADE K", stage: "EARLY_YEARS", sortOrder: 15 },
  { name: "DAYCARE", stage: "EARLY_YEARS", sortOrder: 16 },
  { name: "LOWER BASIC 1", stage: "LOWER_BASIC", sortOrder: 17 },
  { name: "LOWER BASIC 2", stage: "LOWER_BASIC", sortOrder: 18 },
  { name: "LOWER BASIC 3", stage: "LOWER_BASIC", sortOrder: 19 },
  { name: "MIDDLE BASIC 4", stage: "MIDDLE_BASIC", sortOrder: 20 },
  { name: "MIDDLE BASIC 5", stage: "MIDDLE_BASIC", sortOrder: 21 },
  { name: "MIDDLE BASIC 6", stage: "MIDDLE_BASIC", sortOrder: 22 }
] as const;

export const UPPER_BASIC_CLASSES = [
  { name: "UPPER BASIC 1", stage: "UPPER_BASIC", sortOrder: 23 },
  { name: "UPPER BASIC 2", stage: "UPPER_BASIC", sortOrder: 24 },
  { name: "UPPER BASIC 3", stage: "UPPER_BASIC", sortOrder: 25 }
] as const;

export const normalizeClassName = (value: string): string =>
  value.replace(/\s+/g, " ").trim().toUpperCase();

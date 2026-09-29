import { describe, expect, it } from 'vitest';
import {
  anySameStudents,
  classesLabel,
  classRefs,
  cohortOf,
  formOf,
  sameStudents,
  schoolYearEnd,
  schoolYearLabel,
} from './cohort';

describe('formOf', () => {
  it('reads the secondary form a class name starts with', () => {
    expect(formOf('5A')).toBe(5);
    expect(formOf(' 5 A ')).toBe(5);
    expect(formOf('S5A')).toBe(5);
    expect(formOf('s.4 b')).toBe(4);
    expect(formOf('F.6')).toBe(6);
    expect(formOf('6')).toBe(6);
    expect(formOf('1C')).toBe(1);
    expect(formOf('中五甲')).toBe(5);
    expect(formOf('中四')).toBe(4);
  });

  it('finds none where the name does not start with a form', () => {
    expect(formOf('Econ elective')).toBeUndefined();
    expect(formOf('10A')).toBeUndefined();
    expect(formOf('7A')).toBeUndefined();
    expect(formOf('2025-26')).toBeUndefined();
    expect(formOf('A5')).toBeUndefined();
    expect(formOf('')).toBeUndefined();
  });
});

describe('schoolYearEnd', () => {
  it('runs September to August', () => {
    expect(schoolYearEnd('2025-09-01')).toBe(2026);
    expect(schoolYearEnd('2025-11-03')).toBe(2026);
    expect(schoolYearEnd('2026-08-31')).toBe(2026);
    expect(schoolYearEnd('2026-09-01')).toBe(2027);
    expect(schoolYearEnd('2026-01-15T03:00:00.000Z')).toBe(2026);
  });

  it('has none for a date it cannot read', () => {
    expect(schoolYearEnd('')).toBeUndefined();
    expect(schoolYearEnd('soon')).toBeUndefined();
    expect(schoolYearEnd('2026-13-01')).toBeUndefined();
  });

  it('labels the year compactly', () => {
    expect(schoolYearLabel(2026)).toBe('25-26');
    expect(schoolYearLabel(2000)).toBe('99-00');
  });
});

describe('cohortOf', () => {
  it('is the DSE year: school year end + (6 − form)', () => {
    expect(cohortOf('5A', '2025-11-03')).toBe(2027);
    expect(cohortOf('6A', '2026-10-01')).toBe(2027);
    expect(cohortOf('4A', '2024-10-01')).toBe(2027);
    expect(cohortOf('5A', '2026-10-01')).toBe(2028);
    expect(cohortOf('6D', '2026-04-20')).toBe(2026);
  });

  it('is undefined without a form or a date', () => {
    expect(cohortOf('Econ X', '2025-11-03')).toBeUndefined();
    expect(cohortOf('5A', 'garbage')).toBeUndefined();
  });
});

describe('classRefs and matching', () => {
  it('cleans the list and derives each cohort', () => {
    expect(classRefs([' 5A', '5a', '', '5B', 'Econ X'], '2025-11-03')).toEqual([
      { name: '5A', key: '5a', cohort: 2027 },
      { name: '5B', key: '5b', cohort: 2027 },
      { name: 'Econ X', key: 'econx' },
    ]);
    expect(classRefs(undefined, '2025-11-03')).toEqual([]);
  });

  it('matches by cohort when both sides have one, across years and classes', () => {
    const [fiveA] = classRefs(['5A'], '2025-11-03');
    expect(sameStudents(fiveA, classRefs(['6A'], '2026-10-01')[0])).toBe(true);
    expect(sameStudents(fiveA, classRefs(['4C'], '2025-03-01')[0])).toBe(true);
    // Same name, a year later: different students.
    expect(sameStudents(fiveA, classRefs(['5A'], '2026-11-03')[0])).toBe(false);
    expect(sameStudents(fiveA, { cohort: 2027 })).toBe(true);
    expect(sameStudents(fiveA, { cohort: 2028, key: '5a' })).toBe(false);
  });

  it('falls back to the class name, case- and space-insensitive', () => {
    const [econ] = classRefs(['Econ X'], '2025-11-03');
    expect(sameStudents(econ, { key: 'econx' })).toBe(true);
    expect(sameStudents(econ, classRefs(['econ  x'], '2027-01-01')[0])).toBe(true);
    expect(sameStudents(econ, { cohort: 2027 })).toBe(false);
    // A date nobody can read leaves only the name to go on.
    const [undated] = classRefs(['5A'], 'unknown');
    expect(sameStudents(undated, classRefs(['5a'], '2025-11-03')[0])).toBe(true);
    expect(sameStudents(undated, {})).toBe(false);
  });

  it('matches any class of a paper sat by several', () => {
    const uniform = classRefs(['5A', '5B', '5C', '5D', '5E'], '2025-12-01');
    expect(anySameStudents(uniform, [{ key: '5d' }])).toBe(true);
    expect(anySameStudents(uniform, classRefs(['6E'], '2026-09-10'))).toBe(true);
    expect(anySameStudents([], [{ key: '5a' }])).toBe(false);
    expect(anySameStudents(uniform, [])).toBe(false);
  });

  it('names a paper\'s classes with their cohort', () => {
    expect(classesLabel(classRefs(['5A', '5B'], '2025-11-03'))).toBe('5A, 5B (DSE 2027)');
    expect(classesLabel(classRefs(['Econ X'], '2025-11-03'))).toBe('Econ X');
  });
});

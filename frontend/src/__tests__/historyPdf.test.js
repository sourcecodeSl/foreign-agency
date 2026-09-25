import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildHistoryPdf, historyContent, assignmentStatus } from '../lib/historyPdf';

const REPORT = {
  candidate: {
    id: 7,
    name: 'Nimal Silva',
    fatherName: 'Sunil Silva',
    passportNo: 'N1122334',
    nicNo: '901234567V',
    jobRoles: [{ name: 'Tiler' }, { name: 'Mason' }],
    poolStatus: 'passed',
    profession: 'Mason',
    status: 'draft',
    policeReport: { status: 'received', referenceNo: 'PR/1' },
    registeredBy: { label: 'Agency', name: 'Nadia Perera' },
  },
  agency: { id: 'AG-9001', name: 'Solidrow' },
  generatedAt: '2026-09-25T10:00:00Z',
  assignments: [
    {
      id: 3,
      company: { name: 'Herzl Construction', country: 'Israel' },
      assignedAt: '2026-09-02',
      assignedBy: 'Kasun Coordinator',
      state: 'ended',
      ended: { at: '2026-09-10', by: 'Kasun Coordinator', reason: 'new_test', label: 'Sent for a new test' },
      tests: [{ jobRole: 'Tiler', testIndexNo: 'TL00001', result: 'fail', resultAt: '2026-09-08', recordedBy: 'Avi Cohen', note: 'Uneven joints' }],
    },
    {
      id: 4,
      company: { name: 'Negev Builders', country: 'Israel' },
      assignedAt: '2026-09-10',
      state: 'passed',
      ended: null,
      tests: [{ jobRole: 'Mason', testIndexNo: 'MS00001', result: 'pass', resultAt: '2026-09-20', recordedBy: 'Dana Levi', note: null }],
    },
  ],
};

describe('the candidate history PDF', () => {
  it('says who the candidate is and everything they went through, company by company', () => {
    const content = historyContent(REPORT);

    expect(content.name).toBe('Nimal Silva');
    const details = Object.fromEntries(content.details);
    expect(details["Father's name"]).toBe('Sunil Silva');
    expect(details['Job categories']).toBe('Tiler, Mason');
    expect(details['Local agency']).toBe('Solidrow (AG-9001)');
    expect(details['Police report']).toBe('Received · PR/1');
    // Nothing known is written as a dash, never left blank.
    expect(details['Date of birth']).toBe('-');

    expect(content.summary).toBe('2 companies · 2 tests · 1 passed · 1 did not pass');
    expect(content.assignments.map((a) => a.heading)).toEqual(['1. Herzl Construction (Israel)', '2. Negev Builders (Israel)']);
    expect(content.assignments[0].status).toMatch(/^Sent for a new test on .+ by Kasun Coordinator$/);
    expect(content.assignments[0].tests[0].slice(0, 3)).toEqual(['TL00001', 'Tiler', 'Did not pass']);
    expect(content.assignments[0].tests[0][5]).toBe('Uneven joints');
    expect(content.assignments[1].tests[0].slice(0, 3)).toEqual(['MS00001', 'Mason', 'Passed']);
  });

  it('names where each assignment stands', () => {
    expect(assignmentStatus({ state: 'passed' })).toBe('Passed - current company');
    expect(assignmentStatus({ state: 'open', approval: 'approved' })).toBe('Current company');
    expect(assignmentStatus({ state: 'void' })).toBe('No longer valid - passed elsewhere');
  });

  it('comes out as a real PDF, onto more pages when it runs long', async () => {
    const one = await PDFDocument.load(await buildHistoryPdf(REPORT));
    expect(one.getPageCount()).toBe(1);
    expect(one.getTitle()).toBe('Candidate History Report - Nimal Silva');

    // Many tests run on to further pages rather than off the bottom.
    const long = {
      ...REPORT,
      assignments: Array.from({ length: 12 }, (_, i) => ({ ...REPORT.assignments[0], id: i, tests: Array(6).fill(REPORT.assignments[0].tests[0]) })),
    };
    const many = await PDFDocument.load(await buildHistoryPdf(long));
    expect(many.getPageCount()).toBeGreaterThan(1);
  });

  it('writes a name the standard fonts cannot draw without failing', async () => {
    const report = { ...REPORT, candidate: { ...REPORT.candidate, name: 'නිමල් Silva' } };
    await expect(buildHistoryPdf(report)).resolves.toBeInstanceOf(Uint8Array);
  });
});

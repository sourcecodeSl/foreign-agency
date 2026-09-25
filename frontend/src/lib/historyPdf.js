import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * The candidate history report as a PDF: A4, the candidate's details, a
 * summary, then every company they were assigned to - in order, when and by
 * whom, how it ended - each with its tests under their index numbers, the
 * results and their dates. Built in the browser from what GET
 * /candidates/{id}/history returns, to show, download or print.
 */

const POLICE = { not_applied: 'Not applied', applied: 'Applied', received: 'Received' };
const RESULT = { pass: 'Passed', fail: 'Did not pass' };

/** A date as the rest of the app writes it (formatDate): Sep 25, 2026 here. */
export function pdfDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** How one assignment ended up, in words. */
export function assignmentStatus(assignment) {
  if (assignment.ended) {
    return assignment.ended.label + ' on ' + pdfDate(assignment.ended.at) + (assignment.ended.by ? ' by ' + assignment.ended.by : '');
  }
  if (assignment.state === 'passed') return 'Passed - current company';
  if (assignment.state === 'void') return 'No longer valid - passed elsewhere';
  if (assignment.approval === 'pending') return 'Asked for, not approved';
  if (assignment.approval === 'rejected') return 'Sent back';
  return 'Current company';
}

/**
 * What the report says, before it is laid out: the details as label and
 * value, the summary line, and each company with its tests. Kept apart from
 * the drawing so it can be checked on its own.
 */
export function historyContent(report) {
  const c = report.candidate;
  const police = c.policeReport || {};
  const tests = report.assignments.flatMap((a) => a.tests);
  const passes = tests.filter((t) => t.result === 'pass').length;
  const fails = tests.filter((t) => t.result === 'fail').length;
  const n = report.assignments.length;

  const standing =
    c.poolStatus === 'passed'
      ? 'Passed' + (c.passedAt ? ' on ' + pdfDate(c.passedAt) : '')
      : c.blocked
        ? 'Blocked - passed with another agency'
        : 'In the pool';

  return {
    title: 'Candidate History Report',
    name: c.name,
    made: 'Made ' + pdfDate(report.generatedAt) + (report.agency ? ' · ' + report.agency.name : ''),
    details: [
      ['Full name', c.name],
      ["Father's name", c.fatherName],
      ['Date of birth', c.dateOfBirth ? pdfDate(c.dateOfBirth) + (c.age != null ? ' (' + c.age + ' years)' : '') : ''],
      ['NIC', c.nicNo],
      ['Passport', c.passportNo],
      ['Passport validity', pdfDate(c.passportExpiry)],
      ['Local agency', report.agency ? report.agency.name + ' (' + report.agency.id + ')' : ''],
      ['Added by', [c.registeredBy?.label, c.registeredBy?.name].filter(Boolean).join(' - ')],
      ['Registered', pdfDate(c.createdAt)],
      ['Job categories', (c.jobRoles || []).map((r) => r.name).join(', ')],
      ['Profession', c.profession],
      ['Where they stand', standing],
      [
        'Police report',
        [
          POLICE[police.status || 'not_applied'],
          police.referenceNo,
          police.issuedDate && 'issued ' + pdfDate(police.issuedDate),
          police.expiresOn && 'valid until ' + pdfDate(police.expiresOn),
        ]
          .filter(Boolean)
          .join(' · '),
      ],
      ['Profile', (c.status || '') + (c.submittedAt ? ' · submitted ' + pdfDate(c.submittedAt) : '')],
      ['Address', c.address],
    ].map(([label, value]) => [label, value ? String(value) : '-']),
    summary:
      n + ' compan' + (n === 1 ? 'y' : 'ies') + ' · ' + tests.length + ' test' + (tests.length === 1 ? '' : 's') +
      ' · ' + passes + ' passed · ' + fails + ' did not pass',
    assignments: report.assignments.map((a, i) => ({
      heading: i + 1 + '. ' + a.company.name + (a.company.country ? ' (' + a.company.country + ')' : ''),
      assigned: 'Assigned ' + pdfDate(a.assignedAt) + (a.assignedBy ? ' by ' + a.assignedBy : ''),
      status: assignmentStatus(a),
      tests: a.tests.map((t) => [
        t.testIndexNo || '-',
        t.jobRole,
        RESULT[t.result] || 'No result',
        t.resultAt ? pdfDate(t.resultAt) : '-',
        t.recordedBy || '-',
        t.note || '-',
      ]),
    })),
  };
}

/** The standard PDF fonts write Latin text only; anything else becomes '?'. */
const printable = (text) => String(text ?? '').replace(/[^\x20-\x7E\xA0-\xFF·–—‘’“”]/g, '?').replace(/[·]/g, '-');

const A4 = [595.28, 841.89];
const MARGIN = 48;
const INK = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.85, 0.87, 0.9);
const COLUMNS = [
  ['Test index', 70],
  ['Job category', 105],
  ['Result', 70],
  ['Result date', 70],
  ['Recorded by', 90],
  ['Note', 94],
];

/** Words onto lines no wider than `width` at `size`. */
function wrap(text, font, size, width) {
  const lines = [];
  for (const paragraph of printable(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const tried = line ? line + ' ' + word : word;
      if (line && font.widthOfTextAtSize(tried, size) > width) {
        lines.push(line);
        line = word;
      } else {
        line = tried;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** The report's bytes, ready to show, download or print. */
export async function buildHistoryPdf(report) {
  const content = historyContent(report);
  const pdf = await PDFDocument.create();
  pdf.setTitle(content.title + ' - ' + printable(content.name));
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = A4[0] - MARGIN * 2;

  let page;
  let y;
  const newPage = () => {
    page = pdf.addPage(A4);
    y = A4[1] - MARGIN;
  };
  // Room for `height` more points, or a new page.
  const need = (height) => {
    if (y - height < MARGIN + 20) newPage();
  };
  const text = (value, x, size = 9, font = regular, color = INK) => {
    page.drawText(printable(value), { x, y, size, font, color });
  };
  const rule = () => {
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + width, y }, thickness: 0.6, color: RULE });
  };

  newPage();

  // The heading.
  text(content.title, MARGIN, 18, bold);
  y -= 22;
  text(content.name, MARGIN, 13, bold);
  y -= 15;
  text(content.made, MARGIN, 9, regular, MUTED);
  y -= 14;
  rule();
  y -= 18;

  // The details, two to a row.
  text('Candidate details', MARGIN, 11, bold);
  y -= 16;
  const half = width / 2 - 8;
  for (let i = 0; i < content.details.length; i += 2) {
    const pair = content.details.slice(i, i + 2).map(([label, value]) => ({ label, lines: wrap(value, regular, 9, half) }));
    const height = 12 + Math.max(...pair.map((p) => p.lines.length)) * 11 + 6;
    need(height);
    pair.forEach((p, j) => {
      const x = MARGIN + j * (half + 16);
      const top = y;
      text(p.label.toUpperCase(), x, 7, bold, MUTED);
      y -= 11;
      p.lines.forEach((line) => {
        text(line, x, 9);
        y -= 11;
      });
      y = top;
    });
    y -= height;
  }

  // The summary.
  need(40);
  rule();
  y -= 18;
  text('Companies, tests and results', MARGIN, 11, bold);
  y -= 14;
  text(content.summary, MARGIN, 9, regular, MUTED);
  y -= 20;

  if (content.assignments.length === 0) {
    text('Never assigned to a foreign company.', MARGIN, 9, regular, MUTED);
  }

  for (const assignment of content.assignments) {
    need(70);
    text(assignment.heading, MARGIN, 10.5, bold);
    y -= 13;
    text(assignment.assigned + '  |  ' + assignment.status, MARGIN, 8.5, regular, MUTED);
    y -= 15;

    // The table heading, then a row per test.
    let x = MARGIN;
    COLUMNS.forEach(([label, w]) => {
      text(label.toUpperCase(), x, 7, bold, MUTED);
      x += w;
    });
    y -= 5;
    rule();
    y -= 11;

    for (const row of assignment.tests) {
      const cells = row.map((value, i) => wrap(value, regular, 8.5, COLUMNS[i][1] - 6));
      const height = Math.max(...cells.map((c) => c.length)) * 10.5 + 4;
      need(height);
      x = MARGIN;
      const top = y;
      cells.forEach((lines, i) => {
        y = top;
        lines.forEach((line) => {
          text(line, x, 8.5, i === 2 ? bold : regular, i === 2 && row[2] === 'Did not pass' ? rgb(0.7, 0.1, 0.1) : INK);
          y -= 10.5;
        });
        x += COLUMNS[i][1];
      });
      y = top - height;
    }
    y -= 12;
  }

  // Page numbers at the foot.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = printable(content.name) + '  -  page ' + (i + 1) + ' of ' + pages.length;
    p.drawText(label, { x: MARGIN, y: MARGIN - 18, size: 7.5, font: regular, color: MUTED });
  });

  return pdf.save();
}

import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { IconPlus, IconCheck } from '../../components/ui/Icons';
import { companyApi, jobRoleApi, testApi } from '../../lib/api';
import { alertError, confirmAction, escapeHtml } from '../../lib/alert';
import { formatDate } from './shared';

const TEST_STATE = {
  scheduled: { label: 'Open', tone: 'amber' },
  passed: { label: 'Passed', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  closed: { label: 'Closed', tone: 'gray' },
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * A candidate's skill tests: every attempt on one file, each under its own
 * test number.
 *
 * A candidate who fails as a Tiler can be booked as a Shuttering Carpenter
 * the same day. That is a new test with a new number; the Tiler attempt
 * keeps its result, and anything still open is closed. The candidate is
 * never registered twice.
 *
 * `canRun` is the Main Admin or a coordinator with the companies page, who
 * book tests and record results. Everyone else reads the history.
 */
export default function SkillTests({ candidate, canRun, onChanged }) {
  const { toast } = useToast();
  const [companies, setCompanies] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ companyId: '', jobRoleId: '', scheduledFor: today() });
  const [errors, setErrors] = useState({});
  const [booking, setBooking] = useState(false);
  const [deciding, setDeciding] = useState(null);

  useEffect(() => {
    if (!canRun) return;
    Promise.all([companyApi.list({ status: 'active' }), jobRoleApi.list()])
      .then(([c, r]) => {
        setCompanies(Array.isArray(c.data) ? c.data : []);
        setRoles(Array.isArray(r.data) ? r.data : []);
      })
      .catch((err) => toast(err.message || 'Could not load the foreign companies.', 'error'));
  }, [canRun, toast]);

  const tests = candidate.tests || [];
  const open = tests.find((t) => t.status === 'scheduled');
  const onFile = candidate.jobRoles || [];

  // The trades on the file first: those are what the candidate said they can do.
  const [fileRoles, otherRoles] = useMemo(() => {
    const ids = new Set(onFile.map((r) => r.id));
    return [roles.filter((r) => ids.has(r.id)), roles.filter((r) => !ids.has(r.id))];
  }, [roles, onFile]);

  // Tried and failed trades are marked, so a retry is a conscious choice.
  const failedRoleIds = new Set(tests.filter((t) => t.status === 'failed').map((t) => t.jobRoleId));

  let closedReason = null;
  if (candidate.poolStatus === 'passed') {
    closedReason = candidate.lockedCompany
      ? 'Passed with ' + candidate.lockedCompany.name + '. No further tests can be booked.'
      : 'Marked as passed by the agency. No further tests can be booked.';
  } else if (candidate.blocked) {
    closedReason = 'This person has already passed with another agency.';
  }

  const change = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const book = async (e) => {
    e.preventDefault();
    const found = {};
    if (!form.companyId) found.companyId = 'Choose a foreign company.';
    if (!form.jobRoleId) found.jobRoleId = 'Choose the job category being tested.';
    setErrors(found);
    if (Object.keys(found).length) return;

    const role = roles.find((r) => String(r.id) === form.jobRoleId);

    // Booking replaces whatever is still open, so say which test that is.
    if (open) {
      const sure = await confirmAction({
        title: 'Close ' + open.testNo + '?',
        html:
          '<code>' + escapeHtml(open.testNo) + '</code> (' + escapeHtml(open.jobRole) + ') is still open. ' +
          'Booking ' + escapeHtml(role?.name || 'this test') + ' closes it and issues a new test number. ' +
          'Both stay on this candidate’s history.',
        confirmText: 'Close and book',
      });
      if (!sure) return;
    }

    setBooking(true);
    try {
      const res = await testApi.book({
        candidateId: candidate.id,
        companyId: Number(form.companyId),
        jobRoleId: Number(form.jobRoleId),
        scheduledFor: form.scheduledFor || undefined,
      });
      toast(res.message || 'Test booked.');
      setForm((prev) => ({ ...prev, jobRoleId: '' }));
      onChanged?.();
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      alertError(err.message || 'Could not book the test.', 'Test not booked');
    } finally {
      setBooking(false);
    }
  };

  const decide = async (test, result) => {
    const passing = result === 'pass';
    const sure = await confirmAction({
      title: (passing ? 'Pass ' : 'Fail ') + test.testNo + '?',
      html: passing
        ? escapeHtml(candidate.name) + ' passes as ' + escapeHtml(test.jobRole) + ' and is locked to ' +
          escapeHtml(test.companyName) + '. No other foreign company can test them after this.'
        : escapeHtml(candidate.name) + ' goes back to the pool. They can be booked again straight away, ' +
          'for another job category, under a new test number.',
      confirmText: passing ? 'Record pass' : 'Record fail',
      danger: !passing,
    });
    if (!sure) return;

    setDeciding(test.id + result);
    try {
      const res = await testApi.result(test.id, result);
      toast(res.message || 'Result recorded.');
      onChanged?.();
    } catch (err) {
      alertError(err.message || 'Could not record the result.', 'Result not recorded');
    } finally {
      setDeciding(null);
    }
  };

  const roleOption = (role) => (
    <option key={role.id} value={role.id}>
      {role.name}
      {failedRoleIds.has(role.id) ? ' (failed before)' : ''}
    </option>
  );

  return (
    <Card>
      <CardHeader
        title="Skill tests"
        subtitle={
          'Every attempt gets its own test number, on this one candidate file.' +
          (onFile.length ? ' Job categories: ' + onFile.map((r) => r.name).join(', ') + '.' : '')
        }
      />

      {canRun && (
        <div className="border-b border-gray-100 px-5 py-4">
          {closedReason ? (
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <IconCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              {closedReason}
            </p>
          ) : (
            <form onSubmit={book} noValidate className="grid items-start gap-3 sm:grid-cols-[1fr_1fr_10rem_auto]">
              <div>
                <label htmlFor="test-company" className="field-label">
                  Foreign company
                </label>
                <select
                  id="test-company"
                  name="companyId"
                  value={form.companyId}
                  onChange={change}
                  aria-invalid={errors.companyId ? true : undefined}
                  className={'field-input ' + (errors.companyId ? 'field-input-error' : '')}
                >
                  <option value="">Select...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {errors.companyId && <p className="field-error">{errors.companyId}</p>}
              </div>

              <div>
                <label htmlFor="test-role" className="field-label">
                  Job category
                </label>
                <select
                  id="test-role"
                  name="jobRoleId"
                  value={form.jobRoleId}
                  onChange={change}
                  aria-invalid={errors.jobRoleId ? true : undefined}
                  className={'field-input ' + (errors.jobRoleId ? 'field-input-error' : '')}
                >
                  <option value="">Select...</option>
                  {fileRoles.length > 0 && <optgroup label="On this file">{fileRoles.map(roleOption)}</optgroup>}
                  {otherRoles.length > 0 && (
                    <optgroup label="Other (added to the file when booked)">{otherRoles.map(roleOption)}</optgroup>
                  )}
                </select>
                {errors.jobRoleId && <p className="field-error">{errors.jobRoleId}</p>}
              </div>

              <div>
                <label htmlFor="test-date" className="field-label">
                  Test date
                </label>
                <input
                  id="test-date"
                  type="date"
                  name="scheduledFor"
                  value={form.scheduledFor}
                  onChange={change}
                  className="field-input"
                />
              </div>

              <div className="sm:pt-[1.625rem]">
                <Button type="submit" icon={IconPlus} loading={booking} className="w-full sm:w-auto">
                  Book test
                </Button>
              </div>

              {open && (
                <p className="text-xs text-amber-700 sm:col-span-4">
                  {open.testNo} ({open.jobRole}) is still open. Booking a new test closes it.
                </p>
              )}
            </form>
          )}
        </div>
      )}

      {tests.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-500">No skill tests yet.</p>
      ) : (
        <ul>
          {tests.map((test) => {
            const state = TEST_STATE[test.status] || TEST_STATE.closed;
            const isOpen = test.status === 'scheduled';
            return (
              <li
                key={test.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-100 px-5 py-3.5 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    <span className="font-mono">{test.testNo}</span> · {test.jobRole}
                  </p>
                  <p className="text-xs text-gray-500">
                    {test.companyName} · {formatDate(test.scheduledFor)}
                    {test.resultNote ? ' · ' + test.resultNote : ''}
                  </p>
                </div>
                <Badge tone={state.tone} dot>
                  {state.label}
                </Badge>
                {canRun && isOpen && (
                  <div className="flex gap-2">
                    <Button size="sm" loading={deciding === test.id + 'pass'} onClick={() => decide(test, 'pass')}>
                      Pass
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={deciding === test.id + 'fail'}
                      onClick={() => decide(test, 'fail')}
                    >
                      Fail
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

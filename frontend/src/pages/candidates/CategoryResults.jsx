import { useEffect, useState } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { IconPlus } from '../../components/ui/Icons';
import { agencyApi, candidateApi, jobRoleApi } from '../../lib/api';
import { alertError, confirmAction, escapeHtml } from '../../lib/alert';
import { formatDate, roleWithIndex } from './shared';

/** The result recorded for one job category, or none yet. */
export function CategoryBadge({ result }) {
  if (result?.result === 'pass') {
    return (
      <Badge tone="green" dot>
        Passed
      </Badge>
    );
  }
  if (result?.result === 'fail') {
    return (
      <Badge tone="red" dot>
        Did not pass
      </Badge>
    );
  }
  return <Badge tone="gray">Waiting for result</Badge>;
}

/** Where one company's registration stands. */
function StateBadge({ registration }) {
  // Before anything else: has a coordinator or the Main Admin let it through?
  if (registration.approval === 'pending') {
    return (
      <Badge tone="amber" dot>
        Waiting for approval
      </Badge>
    );
  }
  if (registration.approval === 'rejected') {
    return (
      <Badge tone="red" dot>
        Sent back
      </Badge>
    );
  }
  if (registration.state === 'passed') {
    return (
      <Badge tone="green" dot>
        Passed here
      </Badge>
    );
  }
  if (registration.state === 'void') {
    return (
      <Badge tone="red" dot>
        Not valid
      </Badge>
    );
  }
  return (
    <Badge tone="blue" dot>
      Registered
    </Badge>
  );
}

/** One company's results, keyed by job category. */
function resultsByRole(registration) {
  const map = {};
  for (const row of registration?.results || []) map[row.jobRoleId] = row;
  return map;
}

/**
 * The result for one job category with one company. The category is always
 * named, a pass or a fail, and only from the trades the local agency put the
 * candidate up for with that company: a pass makes it their profession, a
 * fail goes back to the local agency.
 */
export function ResultModal({ candidate, registration, initialRoleId, onClose, onRecorded }) {
  const { toast } = useToast();
  const results = resultsByRole(registration);
  const passedRole = (registration?.results || []).find((r) => r.result === 'pass')?.jobRoleId;
  // Once passed, only the trade they passed in can still be changed.
  const roles = (registration?.jobRoles || []).filter((role) => !passedRole || role.id === passedRole);

  const [jobRoleId, setJobRoleId] = useState(
    initialRoleId ? String(initialRoleId) : roles.length === 1 ? String(roles[0].id) : '',
  );
  const [result, setResult] = useState(results[initialRoleId]?.result || '');
  const [note, setNote] = useState(results[initialRoleId]?.note || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!jobRoleId) {
      alertError('Choose the job category this result is for.', 'Not recorded');
      return;
    }
    if (!result) {
      alertError('Choose whether the candidate passed.', 'Not recorded');
      return;
    }

    setBusy(true);
    try {
      const { message } = await candidateApi.recordTestResult(candidate.id, {
        result,
        jobRoleId: Number(jobRoleId),
        note: note.trim() || undefined,
        companyAgencyId: registration.company.id,
      });
      toast(message || 'Result recorded.');
      onRecorded();
      onClose();
    } catch (err) {
      alertError(err.message || 'Could not record the result.', 'Not recorded');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={'Record the result - ' + candidate.name}
      subtitle={
        (registration.company.name ? registration.company.name + '. ' : '') +
        'Choose the job category first. A pass becomes their profession; a fail is sent to the local agency.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Save result
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="resultRole" className="field-label">
            Job category <span className="text-red-500">*</span>
          </label>
          <select
            id="resultRole"
            value={jobRoleId}
            onChange={(e) => setJobRoleId(e.target.value)}
            className="field-input"
          >
            <option value="">Select...</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {roleWithIndex(role)}
                {results[role.id] ? (results[role.id].result === 'pass' ? ' (passed)' : ' (did not pass)') : ''}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-gray-500">
            {passedRole
              ? 'Already passed in this category, so no other one can be recorded.'
              : 'The categories the local agency registered them for with this company.'}
          </p>
        </div>

        <fieldset>
          <legend className="field-label">Result</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {[
              { id: 'pass', label: 'Passed', hint: 'This category becomes their profession.' },
              { id: 'fail', label: 'Did not pass', hint: 'The local agency is told; other categories stay open.' },
            ].map((option) => (
              <label
                key={option.id}
                htmlFor={'result-' + option.id}
                className={
                  'flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ' +
                  (result === option.id
                    ? 'border-primary-400 bg-primary-50/60 ring-1 ring-primary-200'
                    : 'border-gray-200 hover:bg-gray-50')
                }
              >
                <input
                  id={'result-' + option.id}
                  type="radio"
                  name="result"
                  value={option.id}
                  checked={result === option.id}
                  onChange={() => setResult(option.id)}
                  className="mt-1 h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{option.label}</span>
                  <span className="block text-xs text-gray-500">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="resultNote" className="field-label">
            Note for the local agency
          </label>
          <input
            id="resultNote"
            value={note}
            maxLength={255}
            placeholder="Optional, e.g. cutting not accurate enough"
            onChange={(e) => setNote(e.target.value)}
            className="field-input"
          />
        </div>
      </div>
    </Modal>
  );
}

/** What each way into the assignment window says and does. */
const ASSIGN_MODES = {
  assign: { title: 'Assign a company', button: 'Assign', withCompany: true },
  moved: { title: 'Change company', button: 'Move to this company', withCompany: true },
  new_test: { title: 'Assign for a new test', button: 'Assign new test', withCompany: true },
  edit: { title: 'Job categories', button: 'Save categories', withCompany: false },
};

/**
 * The admin side's window for where a candidate is tested, and in what.
 *
 *   assign    a company for a candidate who has none yet
 *   moved     another company in place of the current one
 *   new_test  after a fail: the same company or another, new test numbers
 *   edit      the categories of the current assignment
 *
 * Every mode but edit issues new test index numbers; moved and new_test keep
 * the assignment they replace in the history. The categories the agency said
 * the candidate can do are marked.
 */
export function AssignModal({ candidate, mode = 'assign', registration, initialCompanyId = '', initialRoleIds, onClose, onSaved }) {
  const { toast } = useToast();
  const setup = ASSIGN_MODES[mode];
  const results = resultsByRole(mode === 'edit' ? registration : null);
  const canDo = new Set((candidate.jobRoles || []).map((role) => role.id));

  const [companies, setCompanies] = useState([]);
  const [roles, setRoles] = useState([]);
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [chosen, setChosen] = useState(
    initialRoleIds || (registration?.jobRoles || []).map((role) => role.id) || []
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    jobRoleApi
      .list()
      .then(({ data }) => setRoles((Array.isArray(data) ? data : []).filter((role) => role.active !== false)))
      .catch((err) => toast(err.message || 'Could not load the job categories.', 'error'));

    if (!setup.withCompany) return;
    agencyApi
      .foreignOptions()
      // Moving means somewhere else; a new test may be with the same company.
      .then(({ data }) =>
        setCompanies(
          (Array.isArray(data) ? data : []).filter((c) => mode !== 'moved' || c.id !== registration?.company.id)
        )
      )
      .catch((err) => toast(err.message || 'Could not load the foreign companies.', 'error'));
  }, [mode, registration, setup.withCompany, toast]);

  const toggle = (id) =>
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    if (setup.withCompany && !companyId) {
      alertError('Choose the foreign company.', 'Not saved');
      return;
    }
    if (chosen.length === 0) {
      alertError('Choose at least one job category.', 'Not saved');
      return;
    }
    setBusy(true);
    try {
      const { message } =
        mode === 'edit'
          ? await candidateApi.updateRegistration(candidate.id, registration.id, { jobRoleIds: chosen })
          : await candidateApi.addRegistration(candidate.id, {
              companyAgencyId: companyId,
              jobRoleIds: chosen,
              ...(registration && mode !== 'assign' ? { replacesRegistrationId: registration.id, reason: mode } : {}),
            });
      toast(message || 'Saved.');
      onSaved();
      onClose();
    } catch (err) {
      alertError(err.message || 'Could not save.', 'Not saved');
    } finally {
      setBusy(false);
    }
  };

  const subtitle = {
    assign: 'The test index numbers are issued for each category chosen, and the company has ' + candidate.name + ' on its list.',
    moved:
      candidate.name + ' leaves ' + (registration?.company.name || 'the current company') +
      ' - kept in the history - and gets new test numbers with the company chosen.',
    new_test:
      'A new test, with the same company or another, under new test numbers. The test before stays in the history.',
    edit: 'The categories ' + (registration?.company.name || 'the company') + ' tests ' + candidate.name + ' in. A category added gets its test number.',
  }[mode];

  return (
    <Modal
      open
      title={setup.title + ' - ' + candidate.name}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {setup.button}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {setup.withCompany && (
          <div>
            <label htmlFor="assignCompany" className="field-label">
              Foreign company <span className="text-red-500">*</span>
            </label>
            <select
              id="assignCompany"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="field-input"
            >
              <option value="">Select...</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <fieldset>
          <legend className="field-label">
            Job categories <span className="text-red-500">*</span>
          </legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {roles.map((role) => {
              const locked = Boolean(results[role.id]);
              return (
                <label
                  key={role.id}
                  className={
                    'flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ' +
                    (chosen.includes(role.id) ? 'border-primary-300 bg-primary-50/50' : 'border-gray-200')
                  }
                >
                  <input
                    type="checkbox"
                    checked={chosen.includes(role.id)}
                    disabled={locked || busy}
                    onChange={() => toggle(role.id)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="flex-1 text-gray-900">{role.name}</span>
                  {locked ? (
                    <span className="text-xs text-gray-500">has a result</span>
                  ) : canDo.has(role.id) ? (
                    <span className="text-xs text-emerald-700">from the agency</span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            Marked "from the agency": what the local agency registered the candidate for.
          </p>
        </fieldset>
      </div>
    </Modal>
  );
}

/**
 * Sends an agency's registration back, with the reason it reads. Shared by
 * the candidate file and the list of registrations waiting for approval.
 */
export function RejectRegistrationModal({ candidateName, companyName, onClose, onReject }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!note.trim()) {
      setError('Say why, so the local agency can correct it.');
      return;
    }
    setBusy(true);
    try {
      await onReject(note.trim());
      onClose();
    } catch (err) {
      alertError(err.message || 'Could not send the registration back.', 'Not saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={'Send back - ' + candidateName}
      subtitle={'The registration with ' + companyName + ' goes back to the local agency with this reason.'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={send} loading={busy}>
            Send back
          </Button>
        </>
      }
    >
      <label htmlFor="rejectNote" className="field-label">
        Reason <span className="text-red-500">*</span>
      </label>
      <textarea
        id="rejectNote"
        rows={3}
        maxLength={255}
        value={note}
        placeholder="e.g. Mason is not tested this month"
        onChange={(e) => {
          setNote(e.target.value);
          setError('');
        }}
        className={'field-input resize-none ' + (error ? 'field-input-error' : '')}
      />
      {error && <p className="field-error">{error}</p>}
    </Modal>
  );
}

/** Why an assignment in the history ended. */
function EndedBadge({ registration }) {
  return (
    <Badge tone="gray" dot>
      {registration.ended?.reason === 'new_test' ? 'Earlier test' : 'Moved on'}
    </Badge>
  );
}

/**
 * The foreign company the candidate is assigned to, the job categories it
 * tests them in under their test index numbers, how each went - and every
 * assignment before it, kept as history.
 *
 * A coordinator or the Main Admin assigns the company and its categories,
 * edits them, moves the candidate to another company, and after a fail
 * sends them for a new test. The company (or the admin side) records the
 * results; the local agency reads them.
 */
export function RegistrationsCard({ candidate, admin, reviewer, onChanged }) {
  const { toast } = useToast();
  const [recording, setRecording] = useState(null);
  // { mode, registration?, initialCompanyId?, initialRoleIds? } while the window is open.
  const [assigning, setAssigning] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [deciding, setDeciding] = useState(null);

  const all = candidate.registrations || [];
  const current = all.filter((r) => r.current !== false);
  // Newest first: what came just before the current one on top.
  const history = all.filter((r) => r.current === false).reverse();
  const passed = candidate.poolStatus === 'passed';
  const shut = candidate.blocked;
  const holder = current.find((r) => r.state === 'passed');
  // The admin side places the candidate; nobody once they have passed.
  const places = reviewer && !shut && !passed;
  const hasCompany = current.some((r) => (r.approval || 'approved') === 'approved');

  // The company itself, for its own assignment, or the admin side - and
  // only once the assignment has been approved.
  const canRecordFor = (registration) =>
    !shut &&
    registration.current !== false &&
    (registration.approval || 'approved') === 'approved' &&
    registration.state !== 'void' &&
    (reviewer || (admin?.agency?.type === 'foreign' && admin?.agency?.id === registration.company.id));

  const remove = async (registration) => {
    const sure = await confirmAction({
      title: 'Remove this company?',
      html:
        escapeHtml(candidate.name) +
        ' is taken off <b>' +
        escapeHtml(registration.company.name) +
        "</b>'s list. Nothing was recorded, so nothing is kept.",
      confirmText: 'Remove',
      danger: true,
    });
    if (!sure) return;

    try {
      const { message } = await candidateApi.removeRegistration(candidate.id, registration.id);
      toast(message || 'Removed.');
      onChanged();
    } catch (err) {
      toast(err.message || 'Could not remove it.', 'error');
    }
  };

  // An agency's request from before companies were the admin side's to set.
  const approve = async (registration) => {
    setDeciding(registration.id);
    try {
      const { message } = await candidateApi.decideRegistration(candidate.id, registration.id, { decision: 'approve' });
      toast(message || 'Approved.');
      onChanged();
    } catch (err) {
      alertError(err.message || 'Could not approve it.', 'Not approved');
    } finally {
      setDeciding(null);
    }
  };

  let subtitle;
  if (passed && holder) subtitle = 'Passed with ' + holder.company.name + '.';
  else if (passed) subtitle = 'Passed, so the company cannot change.';
  else if (!hasCompany)
    subtitle = reviewer
      ? 'No company yet. Assign one, with the job categories it tests - the test index numbers are issued then.'
      : 'A coordinator or the Main Admin assigns the foreign company and issues the test index numbers.';
  else subtitle = 'The company records a result for each job category. Earlier companies and tests stay below.';

  const section = (registration, old = false) => {
    const results = resultsByRole(registration);
    const passedRole = registration.results.find((r) => r.result === 'pass')?.jobRoleId;
    const recordable = !old && canRecordFor(registration);
    const live = !old && places && registration.state === 'open' && (registration.approval || 'approved') === 'approved';
    const removable = live && registration.results.length === 0;

    return (
      <section
        key={registration.id}
        aria-label={registration.company.name + (old ? ' (earlier)' : '')}
        className={'border-t border-gray-100 ' + (old || registration.state === 'void' ? 'bg-gray-50/70' : '')}
      >
        <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-2">
          <div className="min-w-0 flex-1">
            <p className={'text-sm font-semibold ' + (old ? 'text-gray-600' : 'text-gray-900')}>
              {registration.company.name}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Assigned {formatDate(registration.decision?.at || registration.createdAt)}
              {registration.decision?.by ? ' by ' + registration.decision.by : ''}
              {old && registration.ended
                ? ' · ' + registration.ended.label + ' on ' + formatDate(registration.ended.at)
                : ''}
            </p>
            {registration.state === 'void' && (
              <p className="mt-0.5 text-xs text-red-700">
                Passed with {holder?.company.name || 'another company'}, so this one is no longer valid.
              </p>
            )}
            {!old && registration.approval === 'pending' && (
              <p className="mt-0.5 text-xs text-amber-700">
                Asked for by the local agency, not approved yet. No test index numbers until it is.
              </p>
            )}
            {!old && registration.approval === 'rejected' && (
              <p className="mt-0.5 text-xs text-red-700">
                Sent back{registration.decision?.by ? ' by ' + registration.decision.by : ''}:{' '}
                {registration.decision?.note || 'no reason given'}.
              </p>
            )}
          </div>
          {old ? <EndedBadge registration={registration} /> : <StateBadge registration={registration} />}
          {!old && reviewer && !shut && registration.approval === 'pending' && (
            <>
              <Button size="sm" onClick={() => approve(registration)} loading={deciding === registration.id}>
                Approve
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRejecting(registration)} disabled={deciding === registration.id}>
                Send back
              </Button>
            </>
          )}
          {live && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setAssigning({ mode: 'edit', registration })}>
                Edit categories
              </Button>
              {!passedRole && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setAssigning({
                      mode: 'moved',
                      registration,
                      initialRoleIds: registration.jobRoles.map((role) => role.id),
                    })
                  }
                >
                  Change company
                </Button>
              )}
            </>
          )}
          {removable && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => remove(registration)}
            >
              Remove
            </Button>
          )}
        </div>

        <div className="divide-y divide-gray-100 pb-2">
          {registration.jobRoles.map((role) => {
            const row = results[role.id];
            const canRecord = recordable && (!passedRole || passedRole === role.id);
            // After a fail, the admin side sends the candidate for another test.
            const retest = live && row?.result === 'fail';
            return (
              <div key={role.id} className="flex flex-wrap items-center gap-3 py-2.5 pl-8 pr-5">
                <div className="min-w-0 flex-1">
                  <p className={'text-sm ' + (old ? 'text-gray-600' : 'text-gray-900')}>
                    {role.name}
                    {role.testIndexNo && (
                      <span className="ml-2 font-mono text-xs text-gray-500">{role.testIndexNo}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {row
                      ? formatDate(row.recordedAt) + (row.note ? ' · ' + row.note : '')
                      : old
                        ? 'No result was recorded.'
                        : (registration.approval || 'approved') === 'approved'
                          ? 'No result recorded yet.'
                          : 'Test index number given on approval.'}
                  </p>
                </div>
                <CategoryBadge result={row} />
                {retest && (
                  <Button
                    size="sm"
                    onClick={() =>
                      setAssigning({
                        mode: 'new_test',
                        registration,
                        initialCompanyId: registration.company.id,
                        // The failed category, and any not tested yet.
                        initialRoleIds: registration.jobRoles
                          .filter((r) => r.id === role.id || !results[r.id])
                          .map((r) => r.id),
                      })
                    }
                  >
                    Assign for new test
                  </Button>
                )}
                {canRecord && (
                  <Button
                    size="sm"
                    variant={row ? 'secondary' : 'primary'}
                    onClick={() => setRecording({ registration, roleId: role.id })}
                  >
                    {row ? 'Change' : 'Record result'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <Card>
      <CardHeader
        title="Foreign company and test results"
        subtitle={subtitle}
        action={
          places && !hasCompany ? (
            <Button
              size="sm"
              icon={IconPlus}
              onClick={() =>
                setAssigning({
                  mode: 'assign',
                  // What the agency asked for, if it did, to start from.
                  initialCompanyId: current[0]?.company.id || '',
                  initialRoleIds: (candidate.jobRoles || []).map((role) => role.id),
                })
              }
            >
              Assign a company
            </Button>
          ) : null
        }
      />

      {all.length === 0 && (
        <p className="px-5 py-4 text-sm text-gray-500">Not assigned to any foreign company yet.</p>
      )}

      {current.map((registration) => section(registration))}

      {history.length > 0 && (
        <>
          <p className="border-t border-gray-100 bg-gray-50 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Earlier companies and tests
          </p>
          {history.map((registration) => section(registration, true))}
        </>
      )}

      {recording && (
        <ResultModal
          candidate={candidate}
          registration={recording.registration}
          initialRoleId={recording.roleId}
          onClose={() => setRecording(null)}
          onRecorded={onChanged}
        />
      )}
      {rejecting && (
        <RejectRegistrationModal
          candidateName={candidate.name}
          companyName={rejecting.company.name}
          onClose={() => setRejecting(null)}
          onReject={async (note) => {
            const { message } = await candidateApi.decideRegistration(candidate.id, rejecting.id, {
              decision: 'reject',
              note,
            });
            toast(message || 'Sent back to the local agency.');
            onChanged();
          }}
        />
      )}
      {assigning && (
        <AssignModal
          candidate={candidate}
          mode={assigning.mode}
          registration={assigning.registration}
          initialCompanyId={assigning.initialCompanyId}
          initialRoleIds={assigning.initialRoleIds}
          onClose={() => setAssigning(null)}
          onSaved={onChanged}
        />
      )}
    </Card>
  );
}

/**
 * The same person registered at another agency, known by NIC. Shown once
 * they have passed; the company holding the pass, or the admin side, blocks
 * those registrations from here.
 */
export function OtherRegistrations({ candidate, canBlock, onChanged }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(null);
  const rows = candidate.otherRegistrations || [];

  if (candidate.poolStatus !== 'passed' || rows.length === 0) return null;

  const open = rows.filter((row) => !row.blocked).length;

  const toggle = async (row) => {
    const name = row.company?.name || 'the other company';
    const blocking = !row.blocked;
    const sure = await confirmAction({
      title: (blocking ? 'Block ' : 'Unblock ') + 'this registration?',
      html: blocking
        ? escapeHtml(candidate.name) +
          ' passed here, so their registration for <b>' +
          escapeHtml(name) +
          '</b> is blocked: that company can no longer record a result for them.'
        : escapeHtml(name) + ' will be able to test ' + escapeHtml(candidate.name) + ' again.',
      confirmText: blocking ? 'Block' : 'Unblock',
      danger: blocking,
    });
    if (!sure) return;

    setBusy(row.id);
    try {
      const { message } = await candidateApi.blockRegistration(candidate.id, row.id, blocking);
      toast(message || (blocking ? 'Registration blocked.' : 'Registration open again.'));
      onChanged();
    } catch (err) {
      toast(err.message || 'Could not change the registration.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      role="alert"
      className={
        'rounded-xl border px-5 py-4 text-sm ' +
        (open ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-gray-200 bg-surface text-gray-700')
      }
    >
      <p className="font-semibold">
        {open
          ? 'Also registered with ' + open + ' other ' + (open === 1 ? 'company' : 'companies')
          : 'Other registrations are blocked'}
      </p>
      <p className="mt-1">
        NIC {candidate.nicNo} has passed here, but the same person is on file for another foreign company.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface/70 px-3 py-2">
            <span className="min-w-0 flex-1 font-medium text-gray-900">
              {row.company?.name || 'No company chosen'}
              {row.agencyName ? <span className="font-normal text-gray-500"> · via {row.agencyName}</span> : null}
            </span>
            {row.blocked ? (
              <Badge tone="red" dot>
                Blocked
              </Badge>
            ) : (
              <Badge tone="amber" dot>
                Still registered
              </Badge>
            )}
            {canBlock && (
              <Button
                size="sm"
                variant={row.blocked ? 'secondary' : 'danger'}
                loading={busy === row.id}
                onClick={() => toggle(row)}
              >
                {row.blocked ? 'Unblock' : 'Block'}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

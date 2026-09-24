import { useEffect, useState } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { IconPlus } from '../../components/ui/Icons';
import { agencyApi, candidateApi, jobRoleApi } from '../../lib/api';
import { alertError, confirmAction, escapeHtml } from '../../lib/alert';
import { formatDate } from './shared';

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
  const [testResults, setTestResults] = useState(candidate.testResults || '');
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
        testResults: testResults.trim() || undefined,
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
                {role.name}
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
          <label htmlFor="testResults" className="field-label">
            Test results
          </label>
          <input
            id="testResults"
            value={testResults}
            maxLength={255}
            placeholder="NVQ Level 3 - Pass"
            onChange={(e) => setTestResults(e.target.value)}
            className="field-input"
          />
          <p className="mt-1.5 text-xs text-gray-500">What the test sheet says. It shows on the candidate's file.</p>
        </div>

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

/**
 * Registers the candidate with another foreign company, or changes the job
 * categories of a registration already made. A category that company has
 * already given a result for stays ticked.
 */
function RegistrationModal({ candidate, registration, onClose, onSaved }) {
  const { toast } = useToast();
  const editing = Boolean(registration);
  const results = resultsByRole(registration);
  const [companies, setCompanies] = useState([]);
  const [roles, setRoles] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [chosen, setChosen] = useState((registration?.jobRoles || []).map((role) => role.id));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    jobRoleApi
      .list()
      .then(({ data }) => setRoles((Array.isArray(data) ? data : []).filter((role) => role.active !== false)))
      .catch((err) => toast(err.message || 'Could not load the job categories.', 'error'));

    if (editing) return;
    // Companies the candidate is not registered with yet.
    const taken = new Set((candidate.registrations || []).map((r) => r.company.id));
    agencyApi
      .foreignOptions()
      .then(({ data }) => setCompanies((Array.isArray(data) ? data : []).filter((c) => !taken.has(c.id))))
      .catch((err) => toast(err.message || 'Could not load the foreign companies.', 'error'));
  }, [editing, candidate.registrations, toast]);

  const toggle = (id) =>
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    if (!editing && !companyId) {
      alertError('Choose the foreign company.', 'Not saved');
      return;
    }
    if (chosen.length === 0) {
      alertError('Choose at least one job category.', 'Not saved');
      return;
    }
    setBusy(true);
    try {
      const { message } = editing
        ? await candidateApi.updateRegistration(candidate.id, registration.id, { jobRoleIds: chosen })
        : await candidateApi.addRegistration(candidate.id, { companyAgencyId: companyId, jobRoleIds: chosen });
      toast(message || 'Saved.');
      onSaved();
      onClose();
    } catch (err) {
      alertError(err.message || 'Could not save the registration.', 'Not saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={editing ? 'Job categories - ' + registration.company.name : 'Register with another company'}
      subtitle={
        editing
          ? 'The categories ' + candidate.name + ' is tested in by this company.'
          : 'Until ' + candidate.name + ' passes with one company, they can be registered with others too.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {editing ? 'Save categories' : 'Register'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!editing && (
          <div>
            <label htmlFor="registrationCompany" className="field-label">
              Foreign company <span className="text-red-500">*</span>
            </label>
            <select
              id="registrationCompany"
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
                  {locked && <span className="text-xs text-gray-500">has a result</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}

/**
 * Every foreign company the candidate is registered with, the job categories
 * each tests them in, and how each went.
 *
 * The local agency registers them with more companies until they pass with
 * one; a pass leaves every other registration not valid. A company (or the
 * admin side) records results under its own registration.
 */
export function RegistrationsCard({ candidate, admin, canManage, reviewer, onChanged }) {
  const { toast } = useToast();
  const [recording, setRecording] = useState(null);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  const registrations = candidate.registrations || [];
  const passed = candidate.poolStatus === 'passed';
  const shut = candidate.blocked;
  const holder = registrations.find((r) => r.state === 'passed');

  // The company itself, for its own registration, or the admin side.
  const canRecordFor = (registration) =>
    !shut &&
    registration.state !== 'void' &&
    (reviewer || (admin?.agency?.type === 'foreign' && admin?.agency?.id === registration.company.id));

  const remove = async (registration) => {
    const sure = await confirmAction({
      title: 'Remove this registration?',
      html:
        escapeHtml(candidate.name) +
        ' is taken off <b>' +
        escapeHtml(registration.company.name) +
        "</b>'s list. They stay registered with the other companies.",
      confirmText: 'Remove',
      danger: true,
    });
    if (!sure) return;

    try {
      const { message } = await candidateApi.removeRegistration(candidate.id, registration.id);
      toast(message || 'Registration removed.');
      onChanged();
    } catch (err) {
      toast(err.message || 'Could not remove the registration.', 'error');
    }
  };

  let subtitle;
  if (passed && holder) {
    subtitle =
      'Passed with ' + holder.company.name + '. Registrations with other companies are no longer valid.';
  } else if (passed) {
    subtitle = 'Passed, so no other company can be added.';
  } else {
    subtitle = 'Each company records a result for its own job categories. More companies can be added until one passes them.';
  }

  return (
    <Card>
      <CardHeader
        title="Foreign companies and test results"
        subtitle={subtitle}
        action={
          canManage && !shut && !passed ? (
            <Button variant="secondary" size="sm" icon={IconPlus} onClick={() => setAdding(true)}>
              Register with another company
            </Button>
          ) : null
        }
      />

      {registrations.length === 0 && (
        <p className="px-5 py-4 text-sm text-gray-500">Not registered with any foreign company yet.</p>
      )}

      {registrations.map((registration) => {
        const results = resultsByRole(registration);
        const passedRole = registration.results.find((r) => r.result === 'pass')?.jobRoleId;
        const recordable = canRecordFor(registration);
        const editable = canManage && !shut && registration.state !== 'void';
        const removable = editable && registration.results.length === 0 && registration.state === 'open';

        return (
          <section
            key={registration.id}
            aria-label={registration.company.name}
            className={'border-t border-gray-100 ' + (registration.state === 'void' ? 'bg-gray-50/70' : '')}
          >
            <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{registration.company.name}</p>
                {registration.state === 'void' && (
                  <p className="mt-0.5 text-xs text-red-700">
                    Passed with {holder?.company.name || 'another company'}, so this registration is no longer valid.
                  </p>
                )}
              </div>
              <StateBadge registration={registration} />
              {editable && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(registration)}>
                  Edit categories
                </Button>
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
                return (
                  <div key={role.id} className="flex flex-wrap items-center gap-3 py-2.5 pl-8 pr-5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900">{role.name}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {row
                          ? formatDate(row.recordedAt) + (row.note ? ' · ' + row.note : '')
                          : 'No result recorded yet.'}
                      </p>
                    </div>
                    <CategoryBadge result={row} />
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
      })}

      {recording && (
        <ResultModal
          candidate={candidate}
          registration={recording.registration}
          initialRoleId={recording.roleId}
          onClose={() => setRecording(null)}
          onRecorded={onChanged}
        />
      )}
      {(adding || editing) && (
        <RegistrationModal
          candidate={candidate}
          registration={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
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
        (open ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-gray-200 bg-white text-gray-700')
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
          <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white/70 px-3 py-2">
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

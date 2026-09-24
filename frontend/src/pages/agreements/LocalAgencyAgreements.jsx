import { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Pagination, { usePaged } from '../../components/ui/Pagination';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { PageLoader } from '../../components/ui/Spinner';
import { agreementApi } from '../../lib/api';
import { alertError, confirmAction } from '../../lib/alert';
import { formatDate } from '../candidates/shared';
import { EmployerTable, openGoogleTranslate } from './EmployerAgreement';
import { downloadAgreementPdf, openAgreementPdf } from './Agreements';

/** Which agreements the table shows. */
const FILTERS = [
  { key: 'all', label: 'All agreements' },
  { key: 'unassigned', label: 'No candidate yet' },
  { key: 'assigned', label: 'Candidate assigned' },
];

/** The agreements the admin sent, one row each, the picked one highlighted. */
function AgreementTable({ agreements, selectedId, onSelect, onAssign }) {
  const { paged, total, pages, page, pageSize, setPage, setPageSize } = usePaged(agreements);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['', 'Agreement', 'Company', 'Received', 'Candidate', 'Assign'].map((header, i) => (
                <th
                  key={header || 'pick'}
                  scope="col"
                  className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  {i === 0 ? (
                    <span className="sr-only">Pick</span>
                  ) : i === 5 ? (
                    <span className="sr-only">Assign</span>
                  ) : (
                    header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-surface">
            {paged.map((a) => {
              const selected = a.id === selectedId;
              return (
                <tr
                  key={a.id}
                  onClick={() => onSelect(a.id)}
                  className={'cursor-pointer transition ' + (selected ? 'bg-primary-50/50' : 'hover:bg-gray-50')}
                >
                  <td className="px-5 py-3.5">
                    <input
                      type="radio"
                      name="agreement"
                      aria-label={a.title}
                      checked={selected}
                      onChange={() => onSelect(a.id)}
                      className="h-4 w-4 text-primary-600"
                    />
                  </td>
                  <td className="px-5 py-3.5 font-medium text-gray-900">{a.title}</td>
                  <td className="px-5 py-3.5 text-gray-700">{a.agencyName}</td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-gray-500">{formatDate(a.sentToAgencyAt)}</td>
                  <td className="px-5 py-3.5">
                    {a.candidateName ? (
                      <Badge tone="green" dot>
                        {a.candidateName}
                      </Badge>
                    ) : (
                      <Badge tone="amber" dot>
                        No candidate yet
                      </Badge>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Button
                      size="sm"
                      variant={a.candidateName ? 'secondary' : 'primary'}
                      // The row underneath is not picked by this click.
                      onClick={(e) => {
                        e.stopPropagation();
                        onAssign(a);
                      }}
                    >
                      {a.candidateName ? 'Change candidate' : 'Assign candidate'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pages={pages}
        pageSize={pageSize}
        total={total}
        onPage={setPage}
        onPageSize={setPageSize}
        label="agreements"
      />
    </>
  );
}

/**
 * The agency's candidates for one agreement, in a dialog of their own: those
 * who passed first, in the order they passed, then the rest. One already on
 * another agreement cannot be picked; the first that can be is picked
 * already, so assigning is one click.
 */
function CandidatePicker({ agreement, onAssigned, onClose }) {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState(null);
  const [picked, setPicked] = useState(agreement.candidateId || null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setCandidates(null);
    setPicked(agreement.candidateId || null);
    agreementApi
      .candidates(agreement.id)
      .then((res) => {
        if (!live) return;
        const rows = Array.isArray(res.data) ? res.data : [];
        setCandidates(rows);
        // Nobody on it yet: the one who passed first is picked, ready to assign.
        if (!agreement.candidateId) setPicked(rows.find((c) => !c.assignedTo)?.id || null);
      })
      .catch((err) => {
        if (!live) return;
        toast(err.message || 'Could not load the candidates.', 'error');
        setCandidates([]);
      });
    return () => {
      live = false;
    };
  }, [agreement.id, agreement.candidateId, toast]);

  const assign = async () => {
    const candidate = candidates.find((c) => c.id === picked);
    if (!candidate) return;
    if (agreement.candidateId && agreement.candidateId !== picked) {
      const sure = await confirmAction({
        title: 'Replace ' + agreement.candidateName + '?',
        text: candidate.name + "'s details take the place of the employee part filled so far.",
        confirmText: 'Replace',
      });
      if (!sure) return;
    }

    setBusy(true);
    try {
      const { data, message } = await agreementApi.assign(agreement.id, picked);
      toast(message || 'Candidate assigned.');
      onAssigned(data);
      onClose();
    } catch (err) {
      alertError(err.message || 'Could not assign the candidate.', 'Not assigned');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={'Assign a candidate - ' + agreement.title}
      subtitle="Candidates who passed are listed first, in the order they passed."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={assign} loading={busy} disabled={!picked || picked === agreement.candidateId}>
            {agreement.candidateId ? 'Assign instead' : 'Assign candidate'}
          </Button>
        </>
      }
    >
      {!candidates ? (
        <p className="px-5 py-6 text-sm text-gray-500">Loading...</p>
      ) : candidates.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-500">Your agency has no candidates yet.</p>
      ) : (
        <ul className="-mx-5 max-h-96 divide-y divide-gray-100 overflow-y-auto">
          {candidates.map((c) => {
            const elsewhere = Boolean(c.assignedTo);
            const id = 'candidate-' + c.id;
            return (
              <li key={c.id}>
                <label
                  htmlFor={id}
                  className={
                    'flex items-center gap-3 px-5 py-3 ' +
                    (elsewhere ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-gray-50') +
                    (picked === c.id ? ' bg-primary-50/40' : '')
                  }
                >
                  <input
                    id={id}
                    type="radio"
                    name="candidate"
                    checked={picked === c.id}
                    disabled={elsewhere}
                    onChange={() => setPicked(c.id)}
                    className="h-4 w-4 text-primary-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900">{c.name}</span>
                    <span className="block text-xs text-gray-500">
                      {c.nicNo} · {c.passportNo}
                      {c.jobRole ? ' · ' + c.jobRole : ''}
                    </span>
                  </span>
                  {elsewhere ? (
                    <Badge tone="gray">On {c.assignedTo.title}</Badge>
                  ) : c.passed ? (
                    <Badge tone="green" dot>
                      Passed {formatDate(c.passedAt)}
                    </Badge>
                  ) : (
                    <Badge tone="gray">Not passed</Badge>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

/** The employee part, filled from the candidate, with its Hebrew and Sinhala open to correction. */
function EmployeeDetails({ agreement, onSaved }) {
  const { toast } = useToast();
  const [values, setValues] = useState(agreement.values || {});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValues(agreement.values || {});
    setDirty(false);
  }, [agreement]);

  const change = (key, lang, text) => {
    setDirty(true);
    setValues((prev) => ({
      ...prev,
      [key]: { ...prev[key], [lang]: text, auto: { ...prev[key]?.auto, [lang]: false } },
    }));
  };

  const save = async () => {
    setBusy(true);
    try {
      const employee = Object.fromEntries(
        agreement.employeeSection.fields.map((f) => [f.key, values[f.key]]).filter(([, v]) => v)
      );
      const { data } = await agreementApi.update(agreement.id, { values: employee });
      toast('Agreement saved.');
      onSaved(data);
    } catch (err) {
      alertError(err.message || 'Could not save the agreement.', 'Not saved');
    } finally {
      setBusy(false);
    }
  };

  const unchecked = agreement.employeeSection.fields.some((f) => values[f.key]?.auto?.he || values[f.key]?.auto?.si);

  return (
    <Card>
      <CardHeader
        title={'Employee - ' + agreement.candidateName}
        subtitle="Filled from the candidate's file in English, Hebrew and Sinhala. Check the highlighted Hebrew and Sinhala."
      />
      <EmployerTable section={agreement.employeeSection} values={values} onChange={change} />
      <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-4">
        {/* Google's own page, to check a filled value against and correct it here. */}
        <span className="mr-auto flex flex-wrap items-center gap-2">
          <Button onClick={() => openGoogleTranslate(agreement.employeeSection.fields, values)}>
            Google Translate
          </Button>
          <span className="text-xs text-gray-500">English, Hebrew, Sinhala</span>
        </span>
        {unchecked && (
          <p className="text-xs text-amber-800">
            Highlighted values were filled automatically - check they read right.
          </p>
        )}
        <Button onClick={save} loading={busy} disabled={!dirty}>
          Save
        </Button>
      </div>
    </Card>
  );
}

/** Agreements with a candidate on them, each ready as a filled PDF. */
function CompletedAgreements({ agreements, onOpen }) {
  const done = agreements.filter((a) => a.candidateId);

  return (
    <Card>
      <CardHeader
        title="Completed agreements"
        subtitle="Assigned and saved. Each opens as the full agreement PDF with every blank filled in."
      />
      {done.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-500">No candidate has been assigned yet.</p>
      ) : (
        <div className="overflow-x-auto px-5 pb-4">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Agreement</th>
                <th className="py-2 pr-4 font-medium">Candidate</th>
                <th className="py-2 pr-4 font-medium">Foreign company</th>
                <th className="py-2 pr-4 font-medium">Saved</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {done.map((a) => (
                <tr key={a.id}>
                  <td className="py-2.5 pr-4 font-medium text-gray-900">{a.title}</td>
                  <td className="py-2.5 pr-4 text-gray-700">{a.candidateName}</td>
                  <td className="py-2.5 pr-4 text-gray-700">{a.agencyName}</td>
                  <td className="py-2.5 pr-4 text-gray-500">{formatDate(a.updatedAt)}</td>
                  <td className="whitespace-nowrap py-2.5 text-right">
                    <Button size="sm" variant="ghost" onClick={() => onOpen(a.id)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openAgreementPdf(a.id)}>
                      View PDF
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => downloadAgreementPdf(a.id)}>
                      Download
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/**
 * A local agency's agreements: the ones the admin side sent it, in a table.
 * Pick one, assign a candidate - passed ones first - and the employee part
 * fills from the candidate's file in all three languages. Completed ones
 * are listed apart, each to view or download as the filled PDF.
 */
export default function LocalAgencyAgreements() {
  const { toast } = useToast();
  const [agreements, setAgreements] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [agreement, setAgreement] = useState(null);
  const [filter, setFilter] = useState('all');
  const [assigning, setAssigning] = useState(null); // the agreement the dialog is open for

  useEffect(() => {
    agreementApi
      .list()
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : [];
        setAgreements(rows);
        if (rows.length === 1) setSelectedId(rows[0].id);
      })
      .catch((err) => {
        toast(err.message || 'Could not load the agreements.', 'error');
        setAgreements([]);
      });
  }, [toast]);

  useEffect(() => {
    if (!selectedId) {
      setAgreement(null);
      return;
    }
    let live = true;
    setAgreement(null);
    agreementApi
      .get(selectedId)
      .then((res) => live && setAgreement(res.data))
      .catch((err) => live && toast(err.message || 'Could not open the agreement.', 'error'));
    return () => {
      live = false;
    };
  }, [selectedId, toast]);

  // The card shows who is on it, so it follows an assignment made below.
  const updated = useCallback((data) => {
    setAgreement(data);
    setAgreements((rows) => rows.map((row) => (row.id === data.id ? { ...row, ...data } : row)));
  }, []);

  const shown = (agreements || []).filter((a) =>
    filter === 'all' ? true : filter === 'assigned' ? Boolean(a.candidateName) : !a.candidateName
  );

  if (!agreements) return <PageLoader label="Loading agreements..." />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Agreements sent to you"
          subtitle="From foreign companies, through the admin. Assign a candidate, or pick one to read it."
          action={
            <div>
              <label htmlFor="agreementFilter" className="sr-only">
                Show
              </label>
              <select
                id="agreementFilter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="field-input py-2 text-sm"
              >
                {FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          }
        />
        {agreements.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">No agreements have been sent to you yet.</p>
        ) : shown.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">
            {filter === 'assigned' ? 'No candidate has been assigned yet.' : 'Every agreement has a candidate on it.'}
          </p>
        ) : (
          <AgreementTable agreements={shown} selectedId={selectedId} onSelect={setSelectedId} onAssign={setAssigning} />
        )}
      </Card>

      {selectedId && !agreement && <PageLoader label="Opening the agreement..." />}

      {assigning && <CandidatePicker agreement={assigning} onAssigned={updated} onClose={() => setAssigning(null)} />}

      {agreement && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{agreement.title}</span> from {agreement.agencyName}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => openAgreementPdf(agreement.id)}>
                View filled PDF
              </Button>
              <Button variant="secondary" onClick={() => downloadAgreementPdf(agreement.id)}>
                Download PDF
              </Button>
            </div>
          </div>

          {agreement.candidateId && <EmployeeDetails agreement={agreement} onSaved={updated} />}

          <Card>
            <CardHeader title="Employer" subtitle="As the foreign company filled it." />
            <EmployerTable section={agreement.employerSection} values={agreement.values || {}} />
          </Card>
        </>
      )}

      <CompletedAgreements
        agreements={agreements}
        onOpen={(id) => {
          setSelectedId(id);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
}

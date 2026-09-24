import { useState } from 'react';
import Switch from '../../components/ui/Switch';
import { useToast } from '../../components/ui/Toast';
import { candidateApi } from '../../lib/api';
import { COORDINATOR } from '../../lib/access';

/**
 * Who does what with a candidate file, mirroring CandidateController:
 *
 *  - the agency switches the pass on and attaches the documents;
 *  - a coordinator (or the Main Admin) checks them and submits the profile;
 *  - anyone but the read-only auditor may put a candidate on a register -
 *    the agency for itself, a coordinator on an agency's behalf.
 */
export const isReviewer = (roleSlug) => roleSlug === 'main_admin' || roleSlug === COORDINATOR;

export const canRegister = (roleSlug) => Boolean(roleSlug) && roleSlug !== 'auditor';

/** Once the coordinator has submitted the profile, its documents are settled. */
export const isSettled = (candidate) => ['submitted', 'approved'].includes(candidate?.status);

/**
 * The coordinator's submit switch: where it stands, whether it may move, and
 * why not. It switches on only for a passed candidate with every document
 * attached; switched off, the profile goes back to the agency.
 */
export function submitState(candidate, missingCount) {
  if (candidate?.status === 'approved') {
    return { submitted: true, locked: true, reason: 'The profile has been approved.' };
  }
  if (candidate?.status === 'submitted') {
    return {
      submitted: true,
      locked: false,
      reason: 'Submitted. Switch off to send it back to the agency.',
    };
  }
  if (candidate?.poolStatus !== 'passed') {
    return {
      submitted: false,
      locked: true,
      reason: 'Only a candidate who has passed can be submitted.',
    };
  }
  if (missingCount > 0) {
    return {
      submitted: false,
      locked: true,
      reason:
        missingCount +
        (missingCount === 1 ? ' document is' : ' documents are') +
        ' still to be attached. Submitting opens once every document is in.',
    };
  }
  return {
    submitted: false,
    locked: false,
    reason: 'Every document is in. Check them, then switch on to submit.',
  };
}

/**
 * The submit switch for one row of a list, for a coordinator or the Main
 * Admin. `onChanged` reloads the list once the server has answered.
 */
export function SubmitSwitch({ candidate, onChanged }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const state = submitState(candidate, candidate.missingDocuments?.length ?? 8);

  const change = async (submit) => {
    setBusy(true);
    try {
      const res = await candidateApi.updateStatus(candidate.id, submit ? 'submitted' : 'draft');
      toast(res.message || (submit ? 'Profile submitted.' : 'Profile sent back to the agency.'));
      onChanged?.();
    } catch (err) {
      toast(err.message || 'Could not change the submission.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Switch
      checked={state.submitted}
      onChange={change}
      loading={busy}
      disabled={state.locked}
      label={'Profile submitted: ' + candidate.name}
      title={state.reason}
    />
  );
}

const SOURCE_TEXT = {
  agency: 'Added by agency',
  coordinator: 'Added by coordinator',
  main_admin: 'Added by Main Admin',
};

/**
 * Where the file came from. A candidate can be put on an agency's register
 * by the agency itself or by a coordinator, so every screen says which.
 */
export function SourceTag({ registeredBy }) {
  const source = registeredBy?.source || 'agency';
  const fromAgency = source === 'agency';

  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ' +
        (fromAgency
          ? 'bg-gray-50 text-gray-600 ring-gray-200'
          : 'bg-primary-50 text-primary-700 ring-primary-200')
      }
    >
      {SOURCE_TEXT[source] || SOURCE_TEXT.agency}
      {!fromAgency && registeredBy?.name ? ' · ' + registeredBy.name : ''}
    </span>
  );
}

/** A passport is expected to have at least this long left on it. */
export const PASSPORT_WANTED_YEARS = 3;

/**
 * Why the passport is a problem, or null when it is fine. Mirrors
 * Candidate::passportWarning() on the server: short validity is always said
 * out loud, and never stops the file being saved.
 */
export function passportWarning(expiry) {
  if (!expiry) return null;

  const today = new Date();
  const wanted = new Date();
  wanted.setFullYear(wanted.getFullYear() + PASSPORT_WANTED_YEARS);

  if (expiry < today.toISOString().slice(0, 10)) {
    return 'The passport expired on ' + formatDate(expiry) + '.';
  }
  if (expiry < wanted.toISOString().slice(0, 10)) {
    return (
      'The passport is valid until ' +
      formatDate(expiry) +
      ', which is less than ' +
      PASSPORT_WANTED_YEARS +
      ' years away.'
    );
  }
  return null;
}

export function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

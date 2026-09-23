import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardBody, CardFooter } from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import DateInput from '../../components/ui/DateInput';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import {
  IconUsers,
  IconMail,
  IconPhone,
  IconCheck,
  IconPlus,
  IconX,
} from '../../components/ui/Icons';
import { candidateApi, jobRoleApi, agencyApi } from '../../lib/api';
import { alertError, confirmAction, escapeHtml } from '../../lib/alert';
import { useAuth, isGlobalRole } from '../../context/AuthContext';
import { nicBirthDate, ageOn } from '../../lib/nic';
import { formatDate, passportWarning } from './shared';

const EMPTY = {
  agencyType: '',
  agencyId: '',
  firstName: '',
  lastName: '',
  fatherName: '',
  passportNo: '',
  passportExpiry: '',
  nicNo: '',
  companyAgencyId: '',
  jobRoleIds: [],
  testIndexNo: '',
  address: '',
  mobile: '',
  email: '',
};

/**
 * Field rules, mirroring the server so the same wording appears either way.
 * Nothing here is verified by code or email - a candidate never signs in.
 */
function validate(values, forAgency) {
  const errors = {};

  // Filing on an agency's behalf, so the agency has to be named.
  if (forAgency && !values.agencyType) errors.agencyType = 'Choose local or foreign.';
  if (forAgency && !values.agencyId)
    errors.agencyId = 'Choose the agency this candidate is registered with.';

  if (!values.firstName.trim()) errors.firstName = 'First name is required.';
  if (!values.lastName.trim()) errors.lastName = 'Last name is required.';
  if (!values.fatherName.trim()) errors.fatherName = "Father's name is required.";

  if (!values.passportNo.trim()) errors.passportNo = 'Passport number is required.';
  else if (!/^[A-Za-z0-9]+$/.test(values.passportNo.trim()))
    errors.passportNo = 'Letters and numbers only.';

  // Short validity is warned about beside the field, never refused.
  if (!values.passportExpiry) errors.passportExpiry = 'Passport validity is required.';

  // Required: the NIC is how a person is known across agencies.
  if (!values.nicNo.trim()) errors.nicNo = 'NIC number is required.';
  else if (!/^([0-9]{9}[VvXx]|[0-9]{12})$/.test(values.nicNo.trim()))
    errors.nicNo = 'Enter a valid NIC (9 digits plus V/X, or 12 digits).';
  // The date of birth is read from it, so it has to hold a real day.
  else if (!nicBirthDate(values.nicNo))
    errors.nicNo = 'This NIC does not hold a valid date of birth. Check the number.';

  if (values.jobRoleIds.length === 0) errors.jobRoleIds = 'Choose at least one job category.';

  // Whose test the candidate is registered for; the result is recorded there.
  if (!values.companyAgencyId) errors.companyAgencyId = 'Choose the foreign company they are tested for.';

  // Optional, but kept to what a test sheet number looks like.
  if (values.testIndexNo.trim() && !/^[A-Za-z0-9/-]+$/.test(values.testIndexNo.trim()))
    errors.testIndexNo = 'Letters, numbers, / and - only.';

  if (!values.address.trim()) errors.address = 'Address is required.';
  else if (values.address.trim().length < 5) errors.address = 'Please enter the full address.';

  if (!values.mobile.trim()) errors.mobile = 'Mobile number is required.';
  else if (!/^[0-9+\s-]{9,20}$/.test(values.mobile.trim()))
    errors.mobile = 'Enter a valid mobile number.';

  if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    errors.email = 'Enter a valid email address.';

  return errors;
}

export default function RegisterCandidate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { admin } = useAuth();
  const [params] = useSearchParams();

  // An agency registers for itself. A coordinator (or the Main Admin) files
  // on an agency's behalf, picks which, and the file says it came from them.
  const forAgency = isGlobalRole(admin?.roleSlug);
  // The Main Admin and coordinators look after the list of job categories.
  const canManageRoles = ['main_admin', 'coordinator'].includes(admin?.roleSlug);

  const [values, setValues] = useState(() => ({
    ...EMPTY,
    agencyId: params.get('agencyId') || '',
  }));
  const [agencies, setAgencies] = useState([]);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [newRole, setNewRole] = useState(null); // null: the add field is closed
  const [roleBusy, setRoleBusy] = useState(false);

  // The companies whose tests candidates are registered for.
  useEffect(() => {
    agencyApi
      .foreignOptions()
      .then(({ data }) => setCompanies(Array.isArray(data) ? data : []))
      .catch((err) => toast(err.message || 'Could not load the foreign companies.', 'error'));
  }, [toast]);

  // The same trades the skill tests are booked against.
  useEffect(() => {
    jobRoleApi
      .list()
      .then(({ data }) => setRoles(Array.isArray(data) ? data : []))
      .catch((err) => toast(err.message || 'Could not load the job categories.', 'error'));
  }, [toast]);

  useEffect(() => {
    if (!forAgency) return;
    agencyApi
      .list({ status: 'active' })
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        setAgencies(list);
        // An agency picked on the list arrives chosen, and so does its type.
        setValues((prev) => {
          const picked = list.find((a) => a.id === prev.agencyId);
          return picked && !prev.agencyType
            ? { ...prev, agencyType: picked.type || 'local' }
            : prev;
        });
      })
      .catch((err) => toast(err.message || 'Could not load the agency list.', 'error'));
  }, [forAgency, toast]);

  const birthDate = nicBirthDate(values.nicNo);
  const passportNote = passportWarning(values.passportExpiry);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const next = { ...values, [name]: value };
    setValues(next);
    if (touched[name])
      setErrors((prev) => ({
        ...prev,
        [name]: validate(next, forAgency)[name],
      }));
  };

  // Several trades may be ticked: a Tiler who can also do shuttering is tested
  // for either on the same file.
  const toggleRole = (roleId) => {
    const ids = values.jobRoleIds.includes(roleId)
      ? values.jobRoleIds.filter((id) => id !== roleId)
      : [...values.jobRoleIds, roleId];
    const next = { ...values, jobRoleIds: ids };
    setValues(next);
    setTouched((prev) => ({ ...prev, jobRoleIds: true }));
    setErrors((prev) => ({
      ...prev,
      jobRoleIds: validate(next, forAgency).jobRoleIds,
    }));
  };

  const addRole = async (e) => {
    e.preventDefault();
    const name = (newRole || '').trim();
    if (name.length < 2) {
      alertError('Enter a job category name of at least 2 characters.', 'Category not added');
      return;
    }

    setRoleBusy(true);
    try {
      const { data, message } = await jobRoleApi.create(name);
      setRoles((prev) =>
        [...prev.filter((r) => r.id !== data.id), data].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      // Added for this candidate, so it is ticked straight away.
      if (!values.jobRoleIds.includes(data.id)) toggleRole(data.id);
      setNewRole(null);
      toast(message || data.name + ' has been added.');
    } catch (err) {
      alertError(
        err.errors?.name || err.message || 'Could not add the job category.',
        'Category not added',
      );
    } finally {
      setRoleBusy(false);
    }
  };

  const removeRole = async (role) => {
    const sure = await confirmAction({
      title: 'Remove ' + role.name + '?',
      html:
        '<b>' +
        escapeHtml(role.name) +
        '</b> will no longer be offered for new candidates or tests. ' +
        'Candidates and tests that already have it keep it.',
      confirmText: 'Remove',
      danger: true,
    });
    if (!sure) return;

    setRoleBusy(true);
    try {
      const { message } = await jobRoleApi.remove(role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      if (values.jobRoleIds.includes(role.id)) toggleRole(role.id);
      toast(message || role.name + ' has been removed.');
    } catch (err) {
      alertError(err.message || 'Could not remove the job category.', 'Category not removed');
    } finally {
      setRoleBusy(false);
    }
  };

  // Switching between local and foreign clears an agency of the other kind.
  const handleTypeChange = (e) => {
    const agencyType = e.target.value;
    const current = agencies.find((a) => a.id === values.agencyId);
    const next = {
      ...values,
      agencyType,
      agencyId: current && (current.type || 'local') === agencyType ? values.agencyId : '',
    };
    setValues(next);
    setTouched((prev) => ({ ...prev, agencyType: true }));
    setErrors((prev) => ({ ...prev, agencyType: validate(next, forAgency).agencyType }));
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({
      ...prev,
      [name]: validate(values, forAgency)[name],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validate(values, forAgency);
    setErrors(found);
    setTouched(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, true])));
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      // An agency login is filed under its own agency whatever is sent.
      // The type only narrows the agency list; the agency is what is sent.
      const { agencyId, agencyType: _type, ...details } = values;
      const { data, message } = await candidateApi.create(
        forAgency ? { agencyId, ...details } : details,
      );
      toast(message || 'Candidate registered.');
      // Straight to the file, where the pass is switched and documents follow.
      navigate('/candidates/' + data.candidate.id);
    } catch (err) {
      if (err.errors) {
        // A problem with one ticked trade (jobRoleIds.0) shows on the group.
        const roleError = Object.entries(err.errors).find(([key]) => key.startsWith('jobRoleIds'));
        setErrors((prev) => ({
          ...prev,
          ...err.errors,
          ...(roleError ? { jobRoleIds: roleError[1] } : {}),
        }));
      }
      // A person who has passed with another agency is refused here.
      alertError(
        err.message || 'Could not register the candidate.',
        err.status === 409 ? 'Cannot register this candidate' : 'Registration failed',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Card>
        <CardHeader
          title="Register Candidate"
          subtitle={
            forAgency
              ? "Register a candidate on an agency's behalf. The file shows it was added by you; the agency attaches the documents once the candidate passes."
              : 'Enter the candidate details. Documents are attached once the candidate has passed.'
          }
        />

        <form onSubmit={handleSubmit} noValidate>
          <CardBody className="grid gap-x-8 gap-y-6 p-6 sm:grid-cols-2 sm:p-8">
            {forAgency && (
              <>
                <div>
                  <label htmlFor="agencyType" className="field-label">
                    Agency type <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="agencyType"
                    name="agencyType"
                    value={values.agencyType}
                    onChange={handleTypeChange}
                    onBlur={handleBlur}
                    aria-invalid={errors.agencyType ? true : undefined}
                    className={'field-input ' + (errors.agencyType ? 'field-input-error' : '')}
                  >
                    <option value="">Select local or foreign...</option>
                    <option value="local">Local agency</option>
                    <option value="foreign">Foreign company</option>
                  </select>
                  {errors.agencyType ? (
                    <p className="field-error">{errors.agencyType}</p>
                  ) : (
                    <p className="mt-1.5 text-xs text-gray-500">Narrows the agency list below.</p>
                  )}
                </div>

                <div>
                  <label htmlFor="agencyId" className="field-label">
                    Agency <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="agencyId"
                    name="agencyId"
                    value={values.agencyId}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    disabled={!values.agencyType}
                    aria-invalid={errors.agencyId ? true : undefined}
                    className={'field-input ' + (errors.agencyId ? 'field-input-error' : '')}
                  >
                    <option value="">
                      {values.agencyType ? 'Select the agency...' : 'Choose the agency type first'}
                    </option>
                    {agencies
                      .filter((agency) => (agency.type || 'local') === values.agencyType)
                      .map((agency) => (
                        <option key={agency.id} value={agency.id}>
                          {agency.name}
                        </option>
                      ))}
                  </select>
                  {errors.agencyId ? (
                    <p className="field-error">{errors.agencyId}</p>
                  ) : (
                    <p className="mt-1.5 text-xs text-gray-500">
                      The candidate goes on this agency's register.
                    </p>
                  )}
                </div>
              </>
            )}

            <Input
              label="First name"
              name="firstName"
              required
              placeholder="Kamal"
              value={values.firstName}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.firstName}
              icon={IconUsers}
            />

            <Input
              label="Last name"
              name="lastName"
              required
              placeholder="Perera"
              value={values.lastName}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.lastName}
            />

            <Input
              label="Father's name"
              name="fatherName"
              required
              placeholder="Sunil Perera"
              value={values.fatherName}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.fatherName}
              className="sm:col-span-2"
            />

            <Input
              label="Passport number"
              name="passportNo"
              required
              placeholder="N1234567"
              value={values.passportNo}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.passportNo}
            />

            <div>
              <DateInput
                label="Passport validity"
                name="passportExpiry"
                required
                value={values.passportExpiry}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errors.passportExpiry}
                hint={
                  !errors.passportExpiry && !passportNote
                    ? 'The date the passport expires.'
                    : undefined
                }
              />
              {/* Saved either way - the warning simply never goes away. */}
              {passportNote && (
                <p role="status" className="mt-1.5 text-xs font-medium text-amber-700">
                  {passportNote} The candidate can still be registered.
                </p>
              )}
            </div>

            <Input
              label="NIC number"
              name="nicNo"
              required
              placeholder="901234567V or 199012304567"
              value={values.nicNo}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.nicNo}
              hint={
                !errors.nicNo
                  ? 'Identifies the candidate across agencies. Old and new formats are treated as the same person.'
                  : undefined
              }
            />

            {/* Worked out from the NIC as it is typed; the server does the same. */}
            <div>
              <p className="field-label">Date of birth</p>
              <p
                data-testid="date-of-birth"
                className="flex min-h-[2.625rem] items-center rounded-lg border border-gray-200 bg-gray-50 px-3.5 text-sm text-gray-900"
              >
                {birthDate ? (
                  formatDate(birthDate) + ' · ' + ageOn(birthDate) + ' years'
                ) : (
                  <span className="text-gray-400">Filled in from the NIC</span>
                )}
              </p>
              <p className="mt-1.5 text-xs text-gray-500">
                Calculated automatically from the NIC number.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="companyAgencyId" className="field-label">
                Foreign company <span className="text-red-500">*</span>
              </label>
              <select
                id="companyAgencyId"
                name="companyAgencyId"
                value={values.companyAgencyId}
                onChange={handleChange}
                onBlur={handleBlur}
                className={
                  'field-input ' +
                  (touched.companyAgencyId && errors.companyAgencyId ? 'field-input-error' : '')
                }
              >
                <option value="">Select the company...</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                    {company.country ? ' - ' + company.country : ''}
                  </option>
                ))}
              </select>
              {touched.companyAgencyId && errors.companyAgencyId ? (
                <p className="field-error">{errors.companyAgencyId}</p>
              ) : (
                <p className="mt-1.5 text-xs text-gray-500">
                  Whose test this candidate sits. The company records the result later, from its own list.
                </p>
              )}
            </div>

            <fieldset
              className="sm:col-span-2"
              aria-invalid={errors.jobRoleIds ? true : undefined}
              aria-describedby="jobRoleIds-note"
            >
              <legend className="field-label">
                Job categories <span className="text-red-500">*</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => {
                  const checked = values.jobRoleIds.includes(role.id);
                  return (
                    <div
                      key={role.id}
                      className={
                        'inline-flex items-center rounded-lg border text-sm transition ' +
                        (checked
                          ? 'border-primary-500 bg-primary-50 font-medium text-primary-700'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50')
                      }
                    >
                      <label
                        className={
                          'inline-flex cursor-pointer items-center gap-2 py-2 pl-3 ' +
                          (canManageRoles ? 'pr-1.5' : 'pr-3')
                        }
                      >
                        <input
                          type="checkbox"
                          name="jobRoleIds"
                          value={role.id}
                          checked={checked}
                          onChange={() => toggleRole(role.id)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        {role.name}
                      </label>
                      {canManageRoles && (
                        <button
                          type="button"
                          onClick={() => removeRole(role)}
                          disabled={roleBusy}
                          aria-label={'Remove ' + role.name}
                          title={'Remove ' + role.name}
                          className="mr-1.5 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          <IconX className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}

                {canManageRoles &&
                  (newRole === null ? (
                    <button
                      type="button"
                      onClick={() => setNewRole('')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-primary-400 hover:text-primary-700"
                    >
                      <IconPlus className="h-4 w-4" />
                      Add category
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        aria-label="New job category"
                        placeholder="e.g. Scaffolder"
                        maxLength={120}
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value)}
                        onKeyDown={(e) => {
                          // Enter adds the category instead of submitting the whole form.
                          if (e.key === 'Enter') addRole(e);
                          if (e.key === 'Escape') setNewRole(null);
                        }}
                        className="field-input w-44 py-2"
                      />
                      <Button type="button" size="sm" loading={roleBusy} onClick={addRole}>
                        Add
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setNewRole(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ))}
              </div>
              {errors.jobRoleIds ? (
                <p id="jobRoleIds-note" className="field-error">
                  {errors.jobRoleIds}
                </p>
              ) : (
                <p id="jobRoleIds-note" className="mt-1.5 text-xs text-gray-500">
                  Tick every trade the candidate can do. Failing a test in one leaves the others
                  open, on the same file.
                </p>
              )}
            </fieldset>

            <Input
              label="Test index No"
              name="testIndexNo"
              placeholder="TI-2026-0148"
              value={values.testIndexNo}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.testIndexNo}
              hint={!errors.testIndexNo ? 'Optional. The number on the test sheet.' : undefined}
            />

            <div className="sm:col-span-2">
              <label htmlFor="address" className="field-label">
                Address <span className="text-red-500">*</span>
              </label>
              <textarea
                id="address"
                name="address"
                rows={4}
                placeholder="Street, city and postal code"
                value={values.address}
                onChange={handleChange}
                onBlur={handleBlur}
                aria-invalid={errors.address ? true : undefined}
                className={'field-input resize-none ' + (errors.address ? 'field-input-error' : '')}
              />
              {errors.address && <p className="field-error">{errors.address}</p>}
            </div>

            <Input
              label="Mobile number"
              name="mobile"
              type="tel"
              required
              placeholder="0771234567"
              value={values.mobile}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.mobile}
              icon={IconPhone}
            />

            <Input
              label="Email"
              name="email"
              type="email"
              placeholder="kamal@example.com"
              value={values.email}
              onChange={handleChange}
              onBlur={handleBlur}
              error={errors.email}
              icon={IconMail}
              hint={!errors.email ? 'Optional.' : undefined}
            />

            <div className="flex items-start gap-2.5 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600 sm:col-span-2">
              <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <p>
                None of these details need verifying — a candidate never signs in, so no code is
                sent to the mobile or the email.
              </p>
            </div>
          </CardBody>

          <CardFooter className="flex items-center justify-end gap-3 px-6 sm:px-8">
            <Button type="button" variant="secondary" onClick={() => navigate('/candidates')}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {saving ? 'Registering...' : 'Register Candidate'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import CopyButton from '../../components/ui/CopyButton';
import { StatusBadge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import {
  IconSearch,
  IconPlus,
  IconEdit,
  IconTrash,
  IconRefresh,
  IconCheck,
  IconMail,
  IconPhone,
} from '../../components/ui/Icons';
import { coordinatorApi } from '../../lib/api';
import { confirmAction } from '../../lib/alert';

const EMPTY = { name: '', username: '', email: '', phone: '', password: '', pages: [] };

/** Field rules, matching the server's. Returns { field: message }; empty means valid. */
export function validate(values, { creating }) {
  const errors = {};

  if (!values.name.trim()) errors.name = 'Full name is required.';
  else if (values.name.trim().length < 3) errors.name = 'Name must be at least 3 characters.';

  if (creating) {
    if (!values.username.trim()) errors.username = 'Username is required.';
    else if (!/^[a-zA-Z0-9._-]{4,20}$/.test(values.username.trim()))
      errors.username = '4-20 characters. Letters, numbers, dot, underscore or hyphen only.';

    if (
      values.password &&
      (values.password.length < 8 || !/[A-Z]/.test(values.password) || !/[0-9]/.test(values.password))
    )
      errors.password = 'At least 8 characters, with an uppercase letter and a number.';
  }

  if (!values.email.trim()) errors.email = 'Email address is required.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    errors.email = 'Enter a valid email address.';

  if (!values.phone.trim()) errors.phone = 'Phone number is required.';
  else if (!/^[0-9+\s-]{9,20}$/.test(values.phone.trim())) errors.phone = 'Enter a valid phone number.';

  return errors;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const CHIP =
  'inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 ring-1 ring-inset ring-primary-200';

/** The pages that can be opened, grouped under the menu sections they appear in. */
function PagePicker({ pages, selected, onChange }) {
  const sections = useMemo(() => {
    const groups = [];
    pages.forEach((page) => {
      let group = groups.find((g) => g.section === page.section);
      if (!group) {
        group = { section: page.section, pages: [] };
        groups.push(group);
      }
      group.pages.push(page);
    });
    return groups;
  }, [pages]);

  const toggle = (key) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  return (
    <fieldset>
      <legend className="field-label">Pages this person can open</legend>
      <div className="mb-3 flex gap-4 text-xs font-medium">
        <button
          type="button"
          className="text-primary-600 hover:text-primary-700"
          onClick={() => onChange(pages.map((p) => p.key))}
        >
          Select all
        </button>
        <button type="button" className="text-gray-500 hover:text-gray-700" onClick={() => onChange([])}>
          Clear
        </button>
      </div>

      <div className="space-y-3">
        {sections.map((group) => (
          <div key={group.section}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
              {group.section}
            </p>
            <div className="space-y-1.5">
              {group.pages.map((page) => {
                const checked = selected.includes(page.key);
                return (
                  <label
                    key={page.key}
                    htmlFor={'page-' + page.key}
                    className={
                      'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ' +
                      (checked ? 'border-primary-300 bg-primary-50/60' : 'border-gray-200 hover:bg-gray-50')
                    }
                  >
                    <input
                      id={'page-' + page.key}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(page.key)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">{page.label}</span>
                      <span className="block text-xs text-gray-500">{page.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Users, roles, permissions and this page always stay with the Main Admin.
      </p>
    </fieldset>
  );
}

/** Add a coordinator, or change an existing one's details and pages. */
function CoordinatorForm({ open, editing, pages, onClose, onSaved }) {
  const { toast } = useToast();
  const creating = !editing;
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(
      editing
        ? {
            ...EMPTY,
            name: editing.name,
            username: editing.username || '',
            email: editing.email,
            phone: editing.phone,
            pages: editing.pages,
          }
        : EMPTY
    );
    setErrors({});
  }, [open, editing]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validate(values, { creating });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    // Sent in menu order, which is how the server keeps them.
    const body = {
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      pages: pages.map((p) => p.key).filter((key) => values.pages.includes(key)),
    };

    setSaving(true);
    try {
      const { data, message } = creating
        ? await coordinatorApi.create({ ...body, username: values.username.trim(), password: values.password })
        : await coordinatorApi.update(editing.id, body);
      toast(message || 'Saved.');
      onSaved(data);
    } catch (err) {
      if (err.errors && typeof err.errors === 'object') setErrors(err.errors);
      toast(err.message || 'Could not save the coordinator.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={creating ? 'Add coordinator' : 'Edit ' + editing.name}
      subtitle={
        creating
          ? 'They confirm their phone and email with a code on the first sign-in.'
          : 'Signs in as ' + editing.username
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name"
            name="name"
            value={values.name}
            onChange={handleChange}
            error={errors.name}
            className="sm:col-span-2"
            required
          />
          <Input
            label="Username"
            name="username"
            value={values.username}
            onChange={handleChange}
            error={errors.username}
            hint={creating ? undefined : 'Usernames stay as issued.'}
            disabled={!creating}
            autoComplete="off"
            required
          />
          {creating && (
            <Input
              label="Password"
              name="password"
              type="password"
              value={values.password}
              onChange={handleChange}
              error={errors.password}
              hint="Leave blank to generate a strong one."
              autoComplete="new-password"
            />
          )}
          <Input
            label="Email address"
            name="email"
            type="email"
            value={values.email}
            onChange={handleChange}
            error={errors.email}
            required
          />
          <Input
            label="Phone number"
            name="phone"
            value={values.phone}
            onChange={handleChange}
            error={errors.phone}
            required
          />
        </div>

        <PagePicker
          pages={pages}
          selected={values.pages}
          onChange={(next) => setValues((v) => ({ ...v, pages: next }))}
        />
        {errors.pages && <p className="field-error">{errors.pages}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {creating ? 'Add coordinator' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** A password shown once, right after it was issued. */
function CredentialsDialog({ credentials, onClose }) {
  if (!credentials) return null;

  const text = 'Username: ' + credentials.username + '\nPassword: ' + credentials.password;

  return (
    <Modal
      open
      title={credentials.title}
      subtitle="Shown once - copy it before closing."
      onClose={onClose}
      footer={
        <>
          <CopyButton value={text} />
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <dt className="text-gray-500">Username</dt>
        <dd className="font-mono text-gray-900">{credentials.username}</dd>
        <dt className="text-gray-500">Password</dt>
        <dd className="break-all font-mono text-gray-900">{credentials.password}</dd>
      </dl>
      <p className="mt-3 text-sm text-gray-600">{credentials.note}</p>
    </Modal>
  );
}

/**
 * Coordinators: people the Main Admin adds to help run the system. Each one
 * sees only the pages ticked for them, and the API holds them to it.
 */
export default function Coordinators() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ open: false, editing: null });
  const [credentials, setCredentials] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await coordinatorApi.list();
      setRows(data.coordinators);
      setPages(data.pages);
    } catch (err) {
      toast(err.message || 'Could not load coordinators.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const labelFor = useMemo(() => Object.fromEntries(pages.map((p) => [p.key, p.label])), [pages]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.name, row.username, row.email, row.phone]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [rows, search]);

  const closeForm = useCallback(() => setForm({ open: false, editing: null }), []);

  const handleSaved = (data) => {
    closeForm();
    if (data.credentials) {
      setCredentials({
        title: data.name + ' can now sign in',
        username: data.credentials.username,
        password: data.credentials.password,
        note:
          'Share these with ' +
          data.name +
          '. On the first sign-in they confirm their phone and email with a one-time code; after that, the password is enough.',
      });
    }
    load();
  };

  const toggleStatus = async (row) => {
    setBusyId(row.id);
    try {
      const { message } = await coordinatorApi.setStatus(
        row.id,
        row.status === 'active' ? 'deactivated' : 'active'
      );
      toast(message);
      load();
    } catch (err) {
      toast(err.message || 'Could not change the status.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const askReset = (row) =>
    runConfirmed({
      title: 'Reset the password for ' + row.name + '?',
      body: 'A new password is generated and the current one stops working at once.',
      action: 'Reset password',
      failure: 'Could not reset the password.',
      run: async () => {
        const { data } = await coordinatorApi.resetPassword(row.id);
        setCredentials({
          title: 'New password for ' + row.name,
          username: data.username,
          password: data.password,
          note: 'The old password no longer works. Share this one with ' + row.name + '.',
        });
      },
    });

  const askRemove = (row) =>
    runConfirmed({
      title: 'Remove ' + row.name + '?',
      body: 'Their login is deleted and they can no longer sign in. Agencies and candidate files they worked on stay as they are.',
      action: 'Remove',
      danger: true,
      failure: 'Could not remove the coordinator.',
      run: async () => {
        const { message } = await coordinatorApi.remove(row.id);
        toast(message);
        load();
      },
    });

  // Asks first, then runs the action; SweetAlert holds the question.
  const runConfirmed = async (confirm) => {
    const sure = await confirmAction({
      title: confirm.title,
      text: confirm.body,
      confirmText: confirm.action,
      danger: Boolean(confirm.danger),
    });
    if (!sure) return;

    try {
      await confirm.run();
    } catch (err) {
      toast(err.message || confirm.failure, 'error');
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Coordinator',
      render: (row) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">
            {row.name
              .split(' ')
              .map((w) => w[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div>
            <p className="font-medium text-gray-900">{row.name}</p>
            <p className="text-xs text-gray-500">{row.username}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (row) => (
        <div className="space-y-0.5 text-xs text-gray-600">
          <p className="flex items-center gap-1.5">
            <IconMail className="h-3.5 w-3.5 text-gray-400" />
            {row.email}
          </p>
          <p className="flex items-center gap-1.5">
            <IconPhone className="h-3.5 w-3.5 text-gray-400" />
            {row.phone}
          </p>
          {row.phoneVerifiedAt && row.emailVerifiedAt ? (
            <p className="flex items-center gap-1 font-medium text-emerald-700">
              <IconCheck className="h-3 w-3" />
              Phone and email confirmed
            </p>
          ) : (
            <p className="text-gray-400">Confirms phone and email on first sign-in</p>
          )}
        </div>
      ),
    },
    {
      key: 'pages',
      header: 'Pages',
      render: (row) =>
        row.pages.length > 0 ? (
          <div className="flex max-w-xs flex-wrap gap-1.5 whitespace-normal">
            {row.pages.map((key) => (
              <span key={key} className={CHIP}>
                {labelFor[key] || key}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs font-medium text-amber-700">No pages yet</span>
        ),
    },
    {
      key: 'lastLogin',
      header: 'Last Sign-in',
      render: (row) =>
        row.lastLogin ? (
          <span className="text-gray-700">{formatDate(row.lastLogin)}</span>
        ) : (
          <span className="text-gray-400">Never</span>
        ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            icon={IconEdit}
            onClick={() => setForm({ open: true, editing: row })}
          >
            Edit access
          </Button>
          <Button
            size="sm"
            variant={row.status === 'active' ? 'secondary' : 'primary'}
            loading={busyId === row.id}
            onClick={() => toggleStatus(row)}
          >
            {row.status === 'active' ? 'Deactivate' : 'Activate'}
          </Button>
          <button
            type="button"
            onClick={() => askReset(row)}
            className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label={'Reset password for ' + row.name}
            title="Reset password"
          >
            <IconRefresh className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => askRemove(row)}
            className="rounded-md p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
            aria-label={'Remove ' + row.name}
            title="Remove"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Card>
        <CardHeader
          title="Coordinators"
          subtitle="People who help run the system. Each one can open only the pages you choose."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="coordinator-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search coordinators"
                  aria-label="Search coordinators"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm
                             placeholder:text-gray-400 focus:border-primary-500 focus:outline-none
                             focus:ring-4 focus:ring-primary-100 sm:w-56"
                />
              </div>
              <Button icon={IconPlus} onClick={() => setForm({ open: true, editing: null })}>
                Add Coordinator
              </Button>
            </div>
          }
        />

        <Table
          columns={columns}
          rows={visible}
          loading={loading}
          empty="No coordinators yet. Add one to share pages with them."
        />
      </Card>

      <CoordinatorForm
        open={form.open}
        editing={form.editing}
        pages={pages}
        onClose={closeForm}
        onSaved={handleSaved}
      />

      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
    </>
  );
}

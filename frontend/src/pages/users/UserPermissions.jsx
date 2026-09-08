import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardBody, CardFooter } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { IconShield, IconCheck } from '../../components/ui/Icons';
import { roleApi } from '../../lib/api';
import { PERMISSION_MODULES, PERMISSION_ACTIONS } from '../../data/mock';

/** Small accessible switch used in every matrix cell. */
function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ' +
        'focus:outline-none focus:ring-4 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50 ' +
        (checked ? 'bg-primary-600' : 'bg-gray-200')
      }
    >
      <span
        className={
          'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition ' +
          (checked ? 'translate-x-[1.15rem]' : 'translate-x-[0.2rem]')
        }
      />
    </button>
  );
}

const emptyModule = () => ({ view: false, create: false, edit: false, delete: false });

export default function UserPermissions() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [roles, setRoles] = useState([]);
  const [activeRole, setActiveRole] = useState(searchParams.get('role') || '');
  const [matrix, setMatrix] = useState({});
  const [original, setOriginal] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load roles once, then default to the first one.
  useEffect(() => {
    roleApi
      .list()
      .then(({ data }) => {
        setRoles(data);
        setActiveRole((current) => current || data[0]?.slug || '');
      })
      .catch((err) => toast(err.message || 'Could not load roles.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the permission matrix whenever the selected role changes.
  useEffect(() => {
    if (!activeRole) return;
    setLoading(true);
    roleApi
      .permissions(activeRole)
      .then(({ data }) => {
        const filled = Object.fromEntries(
          PERMISSION_MODULES.map((m) => [m.key, { ...emptyModule(), ...(data[m.key] || {}) }])
        );
        setMatrix(filled);
        setOriginal(filled);
      })
      .catch((err) => toast(err.message || 'Could not load permissions.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRole]);

  const dirty = useMemo(
    () => JSON.stringify(matrix) !== JSON.stringify(original),
    [matrix, original]
  );

  const role = roles.find((r) => r.slug === activeRole);
  const isSystemRole = role?.slug === 'main_admin';

  const grantedCount = useMemo(
    () =>
      Object.values(matrix).reduce(
        (sum, mod) => sum + Object.values(mod).filter(Boolean).length,
        0
      ),
    [matrix]
  );

  const setCell = (moduleKey, actionKey, value) => {
    setMatrix((prev) => {
      const next = { ...prev, [moduleKey]: { ...prev[moduleKey], [actionKey]: value } };
      // Granting create/edit/delete implies view; revoking view revokes everything.
      if (value && actionKey !== 'view') next[moduleKey].view = true;
      if (!value && actionKey === 'view') next[moduleKey] = emptyModule();
      return next;
    });
  };

  const toggleModuleRow = (moduleKey, value) => {
    setMatrix((prev) => ({
      ...prev,
      [moduleKey]: Object.fromEntries(PERMISSION_ACTIONS.map((a) => [a.key, value])),
    }));
  };

  const toggleActionColumn = (actionKey, value) => {
    setMatrix((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([mKey, mod]) => {
          const updated = { ...mod, [actionKey]: value };
          if (value && actionKey !== 'view') updated.view = true;
          if (!value && actionKey === 'view') return [mKey, emptyModule()];
          return [mKey, updated];
        })
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await roleApi.savePermissions(activeRole, matrix);
      setOriginal(matrix);
      toast('Permissions saved for ' + (role?.name || activeRole) + '.');
    } catch (err) {
      toast(err.message || 'Could not save permissions.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const selectRole = (slug) => {
    setActiveRole(slug);
    setSearchParams({ role: slug });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-4">
      {/* Role picker */}
      <div className="lg:col-span-1">
        <Card className="sticky top-24">
          <CardHeader title="User Types" subtitle="Pick a role to edit" />
          <CardBody className="space-y-1.5 p-3">
            {roles.map((r) => {
              const selected = r.slug === activeRole;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => selectRole(r.slug)}
                  className={
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ' +
                    (selected ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-gray-50')
                  }
                >
                  <span
                    className={
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ' +
                      (selected ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500')
                    }
                  >
                    <IconShield className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={
                        'block truncate text-sm font-medium ' +
                        (selected ? 'text-primary-800' : 'text-gray-900')
                      }
                    >
                      {r.name}
                    </span>
                    <span className="block text-xs text-gray-500">{r.users} users</span>
                  </span>
                </button>
              );
            })}
          </CardBody>
        </Card>
      </div>

      {/* Matrix */}
      <div className="lg:col-span-3">
        <Card>
          <CardHeader
            title={(role?.name || 'Role') + ' Permissions'}
            subtitle={role?.description || 'Assign access rights per module.'}
            action={
              <div className="flex items-center gap-2">
                <Badge tone={dirty ? 'amber' : 'green'} dot>
                  {dirty ? 'Unsaved changes' : 'Saved'}
                </Badge>
                <Badge tone="blue">{grantedCount} granted</Badge>
              </div>
            }
          />

          {isSystemRole && (
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
              The Main Admin role always holds full access. These toggles are locked.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Module
                  </th>
                  {PERMISSION_ACTIONS.map((action) => (
                    <th key={action.key} className="px-4 py-3 text-center">
                      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {action.label}
                      </span>
                      <button
                        type="button"
                        disabled={isSystemRole}
                        onClick={() =>
                          toggleActionColumn(
                            action.key,
                            !Object.values(matrix).every((m) => m[action.key])
                          )
                        }
                        className="mt-1 text-[11px] font-medium text-primary-600 hover:text-primary-700 disabled:opacity-40"
                      >
                        Toggle all
                      </button>
                    </th>
                  ))}
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Full
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {loading && (
                  <tr>
                    <td colSpan={PERMISSION_ACTIONS.length + 2} className="px-5 py-10 text-center text-gray-500">
                      Loading permissions...
                    </td>
                  </tr>
                )}

                {!loading &&
                  PERMISSION_MODULES.map((module) => {
                    const mod = matrix[module.key] || emptyModule();
                    const allOn = PERMISSION_ACTIONS.every((a) => mod[a.key]);
                    return (
                      <tr key={module.key} className="hover:bg-gray-50">
                        <td className="px-5 py-4">
                          <p className="font-medium text-gray-900">{module.label}</p>
                          <p className="text-xs text-gray-500">{module.description}</p>
                        </td>

                        {PERMISSION_ACTIONS.map((action) => (
                          <td key={action.key} className="px-4 py-4 text-center">
                            <Toggle
                              checked={isSystemRole ? true : !!mod[action.key]}
                              disabled={isSystemRole}
                              onChange={(v) => setCell(module.key, action.key, v)}
                              label={action.label + ' ' + module.label}
                            />
                          </td>
                        ))}

                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            disabled={isSystemRole}
                            onClick={() => toggleModuleRow(module.key, !allOn)}
                            className={
                              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition disabled:opacity-40 ' +
                              (allOn
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200')
                            }
                          >
                            {allOn && <IconCheck className="h-3 w-3" />}
                            {allOn ? 'Full access' : 'Grant all'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <CardFooter className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              Changes apply to every user assigned to{' '}
              <span className="font-medium text-gray-900">{role?.name || 'this role'}</span>.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" disabled={!dirty || saving} onClick={() => setMatrix(original)}>
                Discard
              </Button>
              <Button disabled={!dirty || isSystemRole} loading={saving} onClick={handleSave}>
                {saving ? 'Saving...' : 'Save Permissions'}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

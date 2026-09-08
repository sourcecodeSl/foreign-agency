import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardBody, CardFooter } from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { IconShield, IconTrash, IconUsers } from '../../components/ui/Icons';
import { roleApi } from '../../lib/api';

function validate({ name, description }) {
  const errors = {};
  if (!name.trim()) errors.name = 'Role name is required.';
  else if (name.trim().length < 3) errors.name = 'Use at least 3 characters.';
  if (!description.trim()) errors.description = 'Describe what this role can do.';
  return errors;
}

export default function UserTypes() {
  const { toast } = useToast();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState({ name: '', description: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await roleApi.list();
      setRoles(data);
    } catch (err) {
      toast(err.message || 'Could not load roles.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      await roleApi.create(values);
      toast('Role "' + values.name + '" created.');
      setValues({ name: '', description: '' });
      load();
    } catch (err) {
      toast(err.message || 'Could not create the role.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role) => {
    if (role.system) return;
    try {
      await roleApi.remove(role.id);
      toast('Role "' + role.name + '" removed.');
      load();
    } catch (err) {
      toast(err.message || 'Could not remove the role.', 'error');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Role list */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader
            title="User Types"
            subtitle="Each user in the system is assigned exactly one of these roles."
            action={
              <Link to="/users/permissions">
                <Button variant="secondary" size="sm" icon={IconShield}>
                  Edit Permissions
                </Button>
              </Link>
            }
          />
          <CardBody className="space-y-3">
            {loading && <p className="py-6 text-center text-sm text-gray-500">Loading roles...</p>}

            {!loading &&
              roles.map((role) => (
                <div
                  key={role.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-4 transition hover:border-gray-300"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                      <IconShield className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{role.name}</p>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                          {role.slug}
                        </code>
                        {role.system && <Badge tone="blue">System</Badge>}
                      </div>
                      <p className="mt-0.5 text-sm text-gray-500">{role.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
                      <IconUsers className="h-4 w-4 text-gray-400" />
                      {role.users}
                    </span>
                    <Link
                      to={'/users/permissions?role=' + role.slug}
                      className="text-sm font-medium text-primary-600 hover:text-primary-700"
                    >
                      Permissions
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(role)}
                      disabled={role.system}
                      title={role.system ? 'System roles cannot be deleted' : 'Delete role'}
                      className="rounded-md p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
          </CardBody>
        </Card>
      </div>

      {/* Create role */}
      <div>
        <Card className="sticky top-24">
          <CardHeader title="Add User Type" subtitle="New roles start with no permissions." />
          <form onSubmit={handleSubmit} noValidate>
            <CardBody className="space-y-5">
              <Input
                label="Role name"
                name="name"
                required
                placeholder="e.g. Support Agent"
                value={values.name}
                onChange={handleChange}
                error={errors.name}
              />
              <div>
                <label htmlFor="description" className="field-label">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={4}
                  placeholder="What is this role allowed to do?"
                  value={values.description}
                  onChange={handleChange}
                  className={'field-input resize-none ' + (errors.description ? 'field-input-error' : '')}
                />
                {errors.description && <p className="field-error">{errors.description}</p>}
              </div>
            </CardBody>
            <CardFooter>
              <Button type="submit" className="w-full" loading={saving}>
                {saving ? 'Creating...' : 'Create Role'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}

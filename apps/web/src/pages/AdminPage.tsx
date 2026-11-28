import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  CheckCircle2,
  Database,
  KeyRound,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import type {
  AppSettings,
  ClearDataResult,
  NotificationChannel,
  Role,
  SystemInfo,
  TemplateRecord,
  UserRecord,
} from '@vams/shared';
import {
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  TEMPLATE_VARIABLES,
} from '@vams/shared';
import { api, errorMessage, fieldErrors } from '../lib/api';
import { formatDateTime, timeAgo } from '../lib/format';
import { useToast } from '../components/Toast';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  SectionCard,
  Select,
  Tabs,
  Textarea,
} from '../components/ui';

type TabKey = 'users' | 'templates' | 'settings' | 'system';

export function AdminPage() {
  const [tab, setTab] = useState<TabKey>('users');

  return (
    <>
      <PageHeader
        title="Administration"
        description="Manage staff accounts, notification templates, scheduling rules and system status."
        actions={
          <Badge tone="purple">
            <ShieldCheck className="size-3" />
            Administrator only
          </Badge>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'users', label: 'Users & roles' },
          { value: 'templates', label: 'Notifications' },
          { value: 'settings', label: 'Scheduling rules' },
          { value: 'system', label: 'System' },
        ]}
      />

      <div className="mt-5">
        {tab === 'users' ? <UsersTab /> : null}
        {tab === 'templates' ? <TemplatesTab /> : null}
        {tab === 'settings' ? <SettingsTab /> : null}
        {tab === 'system' ? <SystemTab /> : null}
      </div>
    </>
  );
}

function UsersTab() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [resetUser, setResetUser] = useState<UserRecord | null>(null);

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api<{ items: UserRecord[] }>('/admin/users'),
  });

  const toggleActive = useMutation({
    mutationFn: (user: UserRecord) =>
      api<UserRecord>(`/admin/users/${user.id}`, {
        method: 'PATCH',
        body: { active: !user.active },
      }),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      notify(`${user.name} ${user.active ? 'reactivated' : 'deactivated'}.`);
    },
    onError: (caught) => notify(errorMessage(caught), 'error'),
  });

  return (
    <>
      <SectionCard
        title="Staff accounts"
        description="Peshi staff enter requests; the Secretary decides. Administrators configure the system."
        icon={Users}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            Add user
          </Button>
        }
        bodyClassName="p-0"
      >
        {usersQuery.isLoading ? (
          <LoadingBlock />
        ) : !usersQuery.data || usersQuery.data.items.length === 0 ? (
          <EmptyState title="No users" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base min-w-[680px]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last sign-in</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersQuery.data.items.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <p className="text-[13px] font-semibold text-slate-800">{user.name}</p>
                      <p className="text-[10px] text-slate-400">{user.email ?? 'No email'}</p>
                    </td>
                    <td className="font-mono text-[11px] text-slate-500">@{user.username}</td>
                    <td>
                      <Badge tone={user.role === 'SECRETARY' ? 'purple' : user.role === 'ADMIN' ? 'blue' : 'slate'}>
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <Badge tone={user.active ? 'green' : 'red'}>{user.active ? 'Active' : 'Disabled'}</Badge>
                        {user.mustChangePassword ? (
                          <span className="text-[9px] uppercase tracking-wider text-amber-600">Password reset</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="text-[11px] text-slate-500">
                      {user.lastLoginAt ? timeAgo(user.lastLoginAt) : 'Never'}
                    </td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditUser(user)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setResetUser(user)}>
                          <KeyRound className="size-3" />
                          Reset
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={user.active ? 'text-rose-600' : 'text-emerald-600'}
                          onClick={() => toggleActive.mutate(user)}
                        >
                          {user.active ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {editUser ? <EditUserModal user={editUser} onClose={() => setEditUser(null)} /> : null}
      {resetUser ? <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} /> : null}
    </>
  );
}

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    username: '',
    email: '',
    role: 'PESHI_STAFF' as Role,
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) {
      setForm({ name: '', username: '', email: '', role: 'PESHI_STAFF', password: '' });
      setError(null);
      setErrors({});
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      api<UserRecord>('/admin/users', {
        method: 'POST',
        body: { ...form, email: form.email || undefined },
      }),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      notify(`Account created for ${user.name}. They must change the password at first sign-in.`);
      onClose();
    },
    onError: (caught) => {
      setError(errorMessage(caught));
      setErrors(fieldErrors(caught));
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add staff account"
      description="The user will be prompted to change this temporary password."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            Create account
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" required error={errors.name}>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. Anil Kumar"
            />
          </Field>
          <Field label="Username" required error={errors.username}>
            <Input
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              placeholder="letters, numbers, dot, dash"
            />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="name@example.gov.in"
            />
          </Field>
          <Field label="Role" error={errors.role}>
            <Select
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          {ROLE_DESCRIPTIONS[form.role]}
        </p>
        <Field
          label="Temporary password"
          required
          error={errors.password}
          hint="Minimum 12 characters with uppercase, lowercase and a number."
        >
          <Input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            autoComplete="new-password"
          />
        </Field>
      </div>
    </Modal>
  );
}

function EditUserModal({ user, onClose }: { user: UserRecord; onClose: () => void }) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? '');
  const [role, setRole] = useState<Role>(user.role);
  const [active, setActive] = useState(user.active);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api<UserRecord>(`/admin/users/${user.id}`, {
        method: 'PATCH',
        body: { name, email: email || undefined, role, active },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      notify('Account updated.');
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${user.name}`}
      description={`@${user.username}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field label="Full name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            {ROLES.map((option) => (
              <option key={option} value={option}>
                {ROLE_LABELS[option]}
              </option>
            ))}
          </Select>
        </Field>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          {ROLE_DESCRIPTIONS[role]}
        </p>
        <Checkbox
          label="Account active"
          description="Disabled accounts cannot sign in; active sessions are revoked."
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: UserRecord; onClose: () => void }) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: () =>
      api<UserRecord>(`/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        body: { password },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      notify(`Password reset for ${user.name}. Existing sessions were revoked.`);
      onClose();
    },
    onError: (caught) => {
      setError(errorMessage(caught));
      setErrors(fieldErrors(caught));
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Reset password"
      description={`${user.name} · @${user.username}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            Reset password
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Alert tone="warning">
          All active sessions for this user will be signed out. Share the new password securely.
        </Alert>
        <Field label="New password" required error={errors.password} hint="Minimum 12 characters.">
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </Field>
      </div>
    </Modal>
  );
}

function TemplatesTab() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<NotificationChannel>('EMAIL');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const templatesQuery = useQuery({
    queryKey: ['admin', 'templates'],
    queryFn: () => api<{ items: TemplateRecord[] }>('/admin/templates'),
  });

  const template = templatesQuery.data?.items.find((item) => item.channel === channel);

  useEffect(() => {
    if (!template) return;
    setSubject(template.subject ?? '');
    setBody(template.body);
  }, [template?.channel, template?.version]);

  const mutation = useMutation({
    mutationFn: () =>
      api<TemplateRecord>(`/admin/templates/${channel.toLowerCase()}`, {
        method: 'PUT',
        body: { subject: channel === 'EMAIL' ? subject : undefined, body },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'templates'] });
      notify('Template saved. New approvals will use this version.');
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const appendVariable = (variable: string) => {
    setBody((current) => `${current}${current.endsWith(' ') || current.endsWith('\n') ? '' : ' '}{{${variable}}}`);
  };

  return (
    <SectionCard
      title="Notification templates"
      description="Confirmation content for Email and WhatsApp. Variables are replaced at send time."
      icon={Mail}
      actions={
        <Tabs
          value={channel}
          onChange={setChannel}
          tabs={[
            { value: 'EMAIL', label: 'Email' },
            { value: 'WHATSAPP', label: 'WhatsApp' },
          ]}
        />
      }
    >
      {templatesQuery.isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            {error ? <Alert tone="error">{error}</Alert> : null}
            {channel === 'EMAIL' ? (
              <Field label="Subject line">
                <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
              </Field>
            ) : (
              <Alert tone="info">
                WhatsApp messages use an approved utility template on the provider side. Keep this body
                concise and operational.
              </Alert>
            )}
            <Field label="Message body" hint="Use {{variable}} placeholders.">
              <Textarea rows={14} value={body} onChange={(event) => setBody(event.target.value)} />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400">
                {template
                  ? `Version ${template.version} · updated ${template.updatedAt ? timeAgo(template.updatedAt) : 'never'}${
                      template.updatedByName ? ` by ${template.updatedByName}` : ''
                    }`
                  : 'Default template'}
              </p>
              <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
                Save template
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Available variables
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TEMPLATE_VARIABLES.map((variable) => (
                <button
                  key={variable}
                  type="button"
                  onClick={() => appendVariable(variable)}
                  className="rounded-md border border-slate-200 bg-white px-1.5 py-1 font-mono text-[10px] text-slate-600 hover:border-brand-300 hover:text-brand-700"
                  title={`Insert {{${variable}}}`}
                >
                  {`{{${variable}}}`}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Preview</p>
              <div className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] text-slate-600">
                {channel === 'EMAIL' && subject ? (
                  <p className="mb-1 border-b border-slate-100 pb-1 font-semibold text-slate-800">{subject}</p>
                ) : null}
                {body}
              </div>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function SettingsTab() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [maxPerSlot, setMaxPerSlot] = useState('');
  const [allowStaffMaterialize, setAllowStaffMaterialize] = useState(false);
  const [venue, setVenue] = useState('');
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api<AppSettings>('/admin/settings'),
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    setMaxPerSlot(settingsQuery.data.maxPerSlot === null ? '' : String(settingsQuery.data.maxPerSlot));
    setAllowStaffMaterialize(settingsQuery.data.allowStaffMaterialize);
    setVenue(settingsQuery.data.venue);
    setInstructions(settingsQuery.data.instructions ?? '');
  }, [settingsQuery.data]);

  const mutation = useMutation({
    mutationFn: () =>
      api<AppSettings>('/admin/settings', {
        method: 'PUT',
        body: {
          maxPerSlot: maxPerSlot.trim() === '' ? null : Number(maxPerSlot),
          allowStaffMaterialize,
          venue,
          instructions,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      notify('Scheduling settings saved.');
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  return (
    <SectionCard
      title="Scheduling rules"
      description="These settings affect approvals and permissions across the system."
      icon={Settings2}
    >
      {settingsQuery.isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="max-w-2xl space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Maximum appointments per slot"
              hint="Leave blank for no limit beyond the Secretary's judgement."
            >
              <Input
                type="number"
                min={1}
                max={100}
                value={maxPerSlot}
                onChange={(event) => setMaxPerSlot(event.target.value)}
                placeholder="Unlimited"
              />
            </Field>
            <Field label="Venue printed on confirmations">
              <Input value={venue} onChange={(event) => setVenue(event.target.value)} />
            </Field>
          </div>
          <Field label="Instructions for visitors (optional)">
            <Textarea
              rows={3}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="e.g. Carry a valid photo ID and this reference number."
            />
          </Field>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <Checkbox
              label="Allow peshi staff to mark appointments as materialized"
              description="By default only the Secretary can complete a visit. Enabling this is recorded in the audit log."
              checked={allowStaffMaterialize}
              onChange={(event) => setAllowStaffMaterialize(event.target.checked)}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
              Save settings
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function SystemTab() {
  const queryClient = useQueryClient();
  const [clearOpen, setClearOpen] = useState(false);
  const systemQuery = useQuery({
    queryKey: ['admin', 'system'],
    queryFn: () => api<SystemInfo>('/admin/system'),
    refetchInterval: 30_000,
  });

  const system = systemQuery.data;

  return (
    <div className="space-y-5">
      <SectionCard
        title="System status"
        description="Read-only deployment information. Provider credentials are configured through environment variables."
        icon={Activity}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['admin', 'system'] })}
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        }
      >
        {systemQuery.isLoading || !system ? (
          <LoadingBlock />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: 'Application version', value: system.appVersion, icon: CheckCircle2 },
              { label: 'Environment', value: system.environment, icon: Activity },
              { label: 'Uptime', value: formatUptime(system.uptimeSeconds), icon: Activity },
              { label: 'Database file', value: system.dbFile, icon: Database },
              { label: 'Storage directory', value: system.storageDir, icon: Database },
              { label: 'Server time (IST)', value: formatDateTime(system.serverTime), icon: Activity },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-200 p-3.5">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <item.icon className="size-3.5" />
                  {item.label}
                </p>
                <p className="mt-1 break-all text-[12px] font-medium text-slate-700">{item.value}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Delivery channels" description="Provider status for outbound notifications." icon={MessageCircle}>
        {system ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ChannelCard
              icon={Mail}
              title="Email (SMTP)"
              configured={system.emailConfigured}
              detail={
                system.emailConfigured
                  ? 'SMTP relay configured. Messages are sent to the visitor email address.'
                  : 'No SMTP host configured. The development file transport records messages under storage/outbox and marks delivery as simulated.'
              }
            />
            <ChannelCard
              icon={MessageCircle}
              title="WhatsApp Business API"
              configured={system.whatsappConfigured}
              detail={
                system.whatsappConfigured
                  ? 'WhatsApp Cloud API credentials detected. Delivery receipts are applied from provider webhooks.'
                  : 'No WhatsApp credentials configured. Messages are simulated and written to storage/outbox.'
              }
            />
          </div>
        ) : null}
        <div className="mt-4">
          <Alert tone="info">
            Background worker: {system?.workerEnabled ? 'enabled' : 'disabled (on-demand dispatch)'} · Webhook endpoint:
            <code className="mx-1 rounded bg-white/60 px-1">POST /api/webhooks/whatsapp</code>
          </Alert>
        </div>
      </SectionCard>

      <SectionCard
        title="Danger zone"
        description="Irreversible maintenance actions for the administrator."
        icon={Trash2}
        className="border-rose-200"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-2xl text-xs leading-relaxed text-slate-600">
            <p className="text-[13px] font-semibold text-rose-700">Clear all data</p>
            <p className="mt-1">
              Permanently deletes every visitor, appointment request, notification, counter and
              the audit log. User accounts, settings and notification templates are kept, and
              signed-in sessions stay active.
            </p>
          </div>
          <Button variant="danger" onClick={() => setClearOpen(true)}>
            <Trash2 className="size-4" />
            Clear all data
          </Button>
        </div>
      </SectionCard>

      <ClearDataDialog open={clearOpen} onClose={() => setClearOpen(false)} />
    </div>
  );
}

function ClearDataDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPassword('');
      setError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      api<ClearDataResult>('/admin/clear-data', {
        method: 'POST',
        body: { password },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries();
      notify(
        `Data cleared: ${result.requests} requests, ${result.visitors} visitors, ${result.notifications} notifications, ${result.auditEntries} audit entries.`,
      );
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Clear all data"
      description="This action is permanent and cannot be undone."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            type="submit"
            form="clear-data-form"
            loading={mutation.isPending}
            disabled={!password}
          >
            <Trash2 className="size-4" />
            Clear all data
          </Button>
        </>
      }
    >
      <form
        id="clear-data-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          mutation.mutate();
        }}
      >
        <Alert tone="error" title="Deletes all business data">
          Visitors, requests, notifications, counters and the audit log will be deleted. Accounts,
          settings and templates are retained.
        </Alert>
        <Field label="Administrator password" required hint="Required to authorise the reset.">
          <Input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </form>
    </Modal>
  );
}

function ChannelCard({
  icon: Icon,
  title,
  configured,
  detail,
}: {
  icon: typeof Mail;
  title: string;
  configured: boolean;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
          <Icon className="size-4 text-slate-400" />
          {title}
        </p>
        <Badge tone={configured ? 'green' : 'amber'}>{configured ? 'Configured' : 'Simulated'}</Badge>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}


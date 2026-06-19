// Single source of truth for every assignable permission in the platform.
// Both the role editor UI (via GET /tenants/permissions/catalog) and backend
// validation (roles may only grant permissions that exist here) read from this.
//
// A permission is `<domain>:<action>`. Granting a whole domain is expressed with
// the `<domain>:*` wildcard, which the `authorize` middleware expands at check
// time (see shared/middleware/authorize.js).

export const PERMISSION_CATALOG = [
  {
    domain: '*',
    label: 'Platform Super-Admin',
    permissions: [
      { key: '*:*', label: 'Full platform access (bypasses all permission checks)', wildcard: true },
    ],
  },
  {
    domain: 'payments',
    label: 'Payments',
    permissions: [
      { key: 'payments:create', label: 'Create payment' },
      { key: 'payments:view', label: 'View own payments' },
      { key: 'payments:view_all', label: 'View all payments' },
      { key: 'payments:approve', label: 'Approve payment' },
      { key: 'payments:cancel', label: 'Cancel payment' },
      { key: 'payments:*', label: 'Full payments access', wildcard: true },
    ],
  },
  {
    domain: 'beneficiaries',
    label: 'Beneficiaries',
    permissions: [
      { key: 'beneficiaries:view', label: 'View beneficiaries' },
      { key: 'beneficiaries:create', label: 'Add / edit beneficiary' },
      { key: 'beneficiaries:delete', label: 'Delete beneficiary' },
      { key: 'beneficiaries:*', label: 'Full beneficiaries access', wildcard: true },
    ],
  },
  {
    domain: 'accounts',
    label: 'Accounts',
    permissions: [
      { key: 'accounts:view', label: 'View accounts' },
      { key: 'accounts:create', label: 'Create account' },
      { key: 'accounts:*', label: 'Full accounts access', wildcard: true },
    ],
  },
  {
    domain: 'reports',
    label: 'Reports',
    permissions: [
      { key: 'reports:view', label: 'View reports' },
      { key: 'reports:export', label: 'Export reports' },
      { key: 'reports:*', label: 'Full reports access', wildcard: true },
    ],
  },
  {
    domain: 'users',
    label: 'Users',
    permissions: [
      { key: 'users:invite', label: 'Invite users' },
      { key: 'users:view', label: 'View users' },
      { key: 'users:manage', label: 'Manage users & roles' },
      { key: 'users:*', label: 'Full user management', wildcard: true },
    ],
  },
  {
    domain: 'subclients',
    label: 'Sub-clients',
    permissions: [
      { key: 'subclients:view', label: 'View sub-clients' },
      { key: 'subclients:create', label: 'Create sub-client' },
      { key: 'subclients:*', label: 'Full sub-client access', wildcard: true },
    ],
  },
  {
    domain: 'compliance',
    label: 'Compliance',
    permissions: [
      { key: 'compliance:review', label: 'Review KYC / compliance' },
      { key: 'compliance:*', label: 'Full compliance access', wildcard: true },
    ],
  },
  {
    domain: 'fees',
    label: 'Fee Configuration',
    permissions: [
      { key: 'fees:view',   label: 'View fee rules (own tenant)' },
      { key: 'fees:manage', label: 'Create / update / delete fee rules (own tenant)' },
      { key: 'fees:global', label: 'Manage platform-wide global fee rules' },
      { key: 'fees:*',      label: 'Full fee configuration access', wildcard: true },
    ],
  },
  {
    domain: 'admin',
    label: 'Administration',
    permissions: [
      { key: 'admin:config', label: 'Tenant configuration' },
      { key: 'admin:features', label: 'Manage feature flags' },
      { key: 'admin:kyc', label: 'KYC queue administration' },
      { key: 'admin:*', label: 'Full admin access', wildcard: true },
    ],
  },
  {
    domain: 'nav',
    label: 'Sidebar Navigation',
    permissions: [
      { key: 'fx_rates:view',  label: 'View FX Rates page' },
      { key: 'network:view',   label: 'View Network page' },
      { key: 'kyc:view',       label: 'View KYC page' },
      { key: 'assistant:view', label: 'View AI Assistant page' },
    ],
  },
];

// Flat set of every valid permission key, for O(1) validation.
export const VALID_PERMISSION_KEYS = new Set(
  PERMISSION_CATALOG.flatMap((g) => g.permissions.map((p) => p.key)),
);

// Returns the subset of `permissions` that are not in the catalog. Empty = all valid.
export const findUnknownPermissions = (permissions) =>
  permissions.filter((p) => !VALID_PERMISSION_KEYS.has(p));

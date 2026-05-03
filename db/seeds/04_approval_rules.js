export const seed = async (knex) => {
  const tenant = await knex('tenants').where({ slug: 'remitx' }).first();
  if (!tenant) throw new Error('Default tenant not found — run 01_default_tenant first');

  const existing = await knex('approval_rules').where({ tenant_id: tenant.id }).count('* as count').first();
  if (parseInt(existing.count, 10) > 0) {
    console.log('[seed] Approval rules already seeded — skipping');
    return;
  }

  await knex('approval_rules').insert([
    {
      tenant_id: tenant.id,
      name: 'Auto-approve small',
      min_amount: '0.00000000',
      max_amount: '999.99000000',
      auto_approve: true,
      required_approvals: 0,
      priority: 1,
    },
    {
      tenant_id: tenant.id,
      name: 'Single checker',
      min_amount: '1000.00000000',
      max_amount: '49999.99000000',
      auto_approve: false,
      required_approvals: 1,
      priority: 2,
    },
    {
      tenant_id: tenant.id,
      name: 'Dual checker',
      min_amount: '50000.00000000',
      max_amount: null,
      auto_approve: false,
      required_approvals: 2,
      priority: 3,
    },
  ]);

  console.log('[seed] Approval rules seeded');
};

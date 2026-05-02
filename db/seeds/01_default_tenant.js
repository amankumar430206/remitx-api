export const seed = async (knex) => {
  const existing = await knex('tenants').where({ slug: 'remitx' }).first();
  if (existing) return;

  const [tenant] = await knex('tenants')
    .insert({ slug: 'remitx', name: 'RemitX', status: 'active' })
    .returning('*');

  await knex('tenant_theme_configs').insert({
    tenant_id: tenant.id,
    primary_color: '#1a56db',
    secondary_color: '#7e3af2',
    company_name: 'RemitX',
    font_family: 'Inter',
    webhook_enabled: false,
  });

  console.log(`[seed] Default tenant created: ${tenant.id}`);
};

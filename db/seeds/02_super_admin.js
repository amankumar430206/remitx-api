import bcrypt from 'bcrypt';

export const seed = async (knex) => {
  const tenant = await knex('tenants').where({ slug: 'remitx' }).first();
  if (!tenant) throw new Error('Default tenant not found — run 01_default_tenant first');

  const existing = await knex('users').where({ email: 'admin@remitx.com', tenant_id: tenant.id }).first();
  if (existing) return;

  const password = 'Admin@RemitX2024!';
  const password_hash = await bcrypt.hash(password, 12);

  const [user] = await knex('users')
    .insert({
      tenant_id: tenant.id,
      email: 'admin@remitx.com',
      password_hash,
      role: 'super_admin',
      kyc_status: 'approved',
      status: 'active',
      first_name: 'Super',
      last_name: 'Admin',
    })
    .returning('id');

  await knex('user_password_history').insert({
    user_id: user.id,
    password_hash,
    created_at: new Date(),
  });

  console.log('[seed] Super admin created:');
  console.log('  Email:    admin@remitx.com');
  console.log('  Password: Admin@RemitX2024!');
};

// Lookup tables for per-provider external identities.
// These decouple provider references from core tables so a user or beneficiary
// can have identities on multiple providers simultaneously without schema conflicts.

export const up = async (knex) => {
  // Tracks provider-side customer / KYC identity per user per provider.
  // Used when a provider requires tenant or user onboarding before payments
  // (e.g. Zoqq customer registration, delegated KYC).
  await knex.schema.createTable('user_provider_identities', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('provider_name', 64).notNullable();
    t.string('provider_customer_id', 256).nullable(); // provider's ID for this user
    t.string('kyc_ref', 256).nullable();              // provider's KYC submission reference
    t.string('kyc_status', 32).nullable();            // provider-reported KYC status
    t.timestamp('kyc_verified_at', { useTz: true }).nullable();
    t.string('status', 32).notNullable().defaultTo('pending'); // pending|active|rejected|suspended
    t.jsonb('metadata').nullable();                   // provider-specific extra fields
    t.timestamp('onboarded_at', { useTz: true }).nullable();
    t.timestamps(true, true);

    t.unique(['tenant_id', 'user_id', 'provider_name']); // one identity per user per provider
    t.index(['tenant_id', 'provider_name']);
    t.index(['user_id', 'provider_name']);
  });

  // Tracks provider-side beneficiary registration per beneficiary per provider.
  // Used when a provider requires pre-registering a beneficiary before a payment
  // can be sent to them (e.g. Zoqq counterparty registration).
  await knex.schema.createTable('beneficiary_provider_refs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.uuid('beneficiary_id').notNullable().references('id').inTable('beneficiaries').onDelete('CASCADE');
    t.string('provider_name', 64).notNullable();
    t.string('provider_beneficiary_id', 256).nullable(); // provider's ID for this beneficiary
    t.string('status', 32).notNullable().defaultTo('pending'); // pending|active|rejected
    t.jsonb('metadata').nullable();                            // provider-specific extra fields
    t.timestamp('synced_at', { useTz: true }).nullable();
    t.timestamps(true, true);

    t.unique(['beneficiary_id', 'provider_name']); // one ref per beneficiary per provider
    t.index(['tenant_id', 'provider_name']);
    t.index(['beneficiary_id', 'provider_name']);
  });
};

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('beneficiary_provider_refs');
  await knex.schema.dropTableIfExists('user_provider_identities');
};

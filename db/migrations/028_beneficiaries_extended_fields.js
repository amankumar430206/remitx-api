export const up = async (knex) => {
  await knex.schema.alterTable('beneficiaries', (t) => {
    // Entity type
    t.string('entity_type', 20).notNullable().defaultTo('INDIVIDUAL'); // INDIVIDUAL | COMPANY

    // Individual name parts (company uses existing `name` column as company_name)
    t.string('first_name', 128).nullable();
    t.string('last_name', 128).nullable();

    // Name on the bank account (may differ from beneficiary name)
    t.string('account_name', 256).nullable();

    // Transfer method preferred for this beneficiary
    t.string('transfer_method', 32).nullable(); // SWIFT | LOCAL | SEPA | ACH | WIRE

    // Address
    t.string('address_line1', 256).nullable();
    t.string('address_line2', 256).nullable();
    t.string('city', 128).nullable();
    t.string('state', 128).nullable();
    t.string('postal_code', 32).nullable();
  });
};

export const down = async (knex) => {
  await knex.schema.alterTable('beneficiaries', (t) => {
    t.dropColumn('entity_type');
    t.dropColumn('first_name');
    t.dropColumn('last_name');
    t.dropColumn('account_name');
    t.dropColumn('transfer_method');
    t.dropColumn('address_line1');
    t.dropColumn('address_line2');
    t.dropColumn('city');
    t.dropColumn('state');
    t.dropColumn('postal_code');
  });
};

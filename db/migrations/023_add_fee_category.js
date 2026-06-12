const FEE_CATEGORIES = ['account_activation', 'iban_creation', 'transaction_send', 'transaction_receive', 'monthly_maintenance', 'amc'];
const CHECK = `fee_category IN ('${FEE_CATEGORIES.join("','")}')`;

export const up = async (knex) => {
  // ── fee_configs ──────────────────────────────────────────────────────────────

  // 1. Add fee_category — existing rows become transaction_send
  await knex.raw(`
    ALTER TABLE fee_configs
    ADD COLUMN fee_category TEXT NOT NULL DEFAULT 'transaction_send'
    CONSTRAINT fee_configs_fee_category_check CHECK (${CHECK})
  `);

  // 2. source_currency → nullable (AMC has no currency; NULL = not currency-specific)
  await knex.raw(`ALTER TABLE fee_configs ALTER COLUMN source_currency DROP NOT NULL`);

  // 3. Drop old unique constraint
  await knex.raw(`
    ALTER TABLE fee_configs
    DROP CONSTRAINT IF EXISTS fee_configs_tenant_id_source_currency_dest_currency_unique
  `);

  // 4. New functional unique index — treats NULL as '' for dedup purposes
  await knex.raw(`
    CREATE UNIQUE INDEX fee_configs_category_corridor_unique
    ON fee_configs (
      tenant_id,
      fee_category,
      COALESCE(source_currency, ''),
      COALESCE(dest_currency, '')
    )
  `);

  // 5. Update activity index to include category
  await knex.raw(`DROP INDEX IF EXISTS fee_configs_tenant_id_source_currency_is_active_index`);
  await knex.raw(`
    CREATE INDEX fee_configs_tenant_category_active_idx
    ON fee_configs (tenant_id, fee_category, source_currency, is_active)
  `);

  // ── global_fee_configs ───────────────────────────────────────────────────────

  await knex.raw(`
    ALTER TABLE global_fee_configs
    ADD COLUMN fee_category TEXT NOT NULL DEFAULT 'transaction_send'
    CONSTRAINT global_fee_configs_fee_category_check CHECK (${CHECK})
  `);

  await knex.raw(`ALTER TABLE global_fee_configs ALTER COLUMN source_currency DROP NOT NULL`);

  await knex.raw(`
    ALTER TABLE global_fee_configs
    DROP CONSTRAINT IF EXISTS global_fee_configs_source_currency_dest_currency_unique
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX global_fee_configs_category_corridor_unique
    ON global_fee_configs (
      fee_category,
      COALESCE(source_currency, ''),
      COALESCE(dest_currency, '')
    )
  `);

  await knex.raw(`DROP INDEX IF EXISTS global_fee_configs_source_currency_is_active_index`);
  await knex.raw(`
    CREATE INDEX global_fee_configs_category_active_idx
    ON global_fee_configs (fee_category, source_currency, is_active)
  `);
};

export const down = async (knex) => {
  // ── global_fee_configs ───────────────────────────────────────────────────────
  await knex.raw(`DROP INDEX IF EXISTS global_fee_configs_category_active_idx`);
  await knex.raw(`DROP INDEX IF EXISTS global_fee_configs_category_corridor_unique`);
  await knex.raw(`ALTER TABLE global_fee_configs ALTER COLUMN source_currency SET NOT NULL`);
  await knex.raw(`ALTER TABLE global_fee_configs DROP CONSTRAINT IF EXISTS global_fee_configs_fee_category_check`);
  await knex.raw(`ALTER TABLE global_fee_configs DROP COLUMN IF EXISTS fee_category`);
  await knex.raw(`
    ALTER TABLE global_fee_configs
    ADD CONSTRAINT global_fee_configs_source_currency_dest_currency_unique
    UNIQUE (source_currency, dest_currency)
  `);
  await knex.raw(`CREATE INDEX global_fee_configs_source_currency_is_active_index ON global_fee_configs (source_currency, is_active)`);

  // ── fee_configs ──────────────────────────────────────────────────────────────
  await knex.raw(`DROP INDEX IF EXISTS fee_configs_tenant_category_active_idx`);
  await knex.raw(`DROP INDEX IF EXISTS fee_configs_category_corridor_unique`);
  await knex.raw(`ALTER TABLE fee_configs ALTER COLUMN source_currency SET NOT NULL`);
  await knex.raw(`ALTER TABLE fee_configs DROP CONSTRAINT IF EXISTS fee_configs_fee_category_check`);
  await knex.raw(`ALTER TABLE fee_configs DROP COLUMN IF EXISTS fee_category`);
  await knex.raw(`
    ALTER TABLE fee_configs
    ADD CONSTRAINT fee_configs_tenant_id_source_currency_dest_currency_unique
    UNIQUE (tenant_id, source_currency, dest_currency)
  `);
  await knex.raw(`CREATE INDEX fee_configs_tenant_id_source_currency_is_active_index ON fee_configs (tenant_id, source_currency, is_active)`);
};

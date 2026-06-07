/**
 * Reset dev/seed account passwords to their canonical documented values.
 *
 * Why this exists:
 *   The seeds (02_super_admin.js, 05_test_data.js) are insert-only — once a user
 *   row exists they never touch the password again. So if an account's password
 *   is later changed (or the seed default is edited), `npm run seed` silently
 *   leaves the old hash in place and the documented credentials stop working.
 *
 * This script is idempotent: it always re-hashes and updates the password for
 * each known dev account, so it can be run any time to restore a working state.
 * It only UPDATEs existing rows (never inserts/deletes), so payment approval
 * history and other FK references to these users stay intact.
 *
 * The credential list below MUST stay in sync with the dev quick-login panels:
 *   remitx-web/src/pages/Login.tsx      (DEV_GROUPS)
 *   remitx-mobile/src/screens/Login.tsx (DEV_GROUPS)
 *
 * Usage:  npm run seed:reset-passwords
 */
import bcrypt from 'bcrypt';
import db from '../src/config/database.js';

const BCRYPT_ROUNDS = 12;

// Canonical dev credentials, grouped by tenant slug. Keep in sync with the
// dev quick-login panels in remitx-web and remitx-mobile.
const DEV_CREDENTIALS = [
  { slug: 'remitx', email: 'admin@remitx.com', password: 'Admin@RemitX2024!' },
  { slug: 'remitx', email: 'cadmin@remitx.com', password: 'Test@1234!' },
  { slug: 'remitx', email: 'maker1@remitx.com', password: 'Test@1234!' },
  { slug: 'remitx', email: 'checker1@remitx.com', password: 'Test@1234!' },
  { slug: 'acme-corp', email: 'admin@acme.com', password: 'Test@1234!' },
  { slug: 'acme-corp', email: 'maker@acme.com', password: 'Test@1234!' },
  { slug: 'acme-corp', email: 'checker@acme.com', password: 'Test@1234!' },
  { slug: 'globalpay', email: 'admin@globalpay.com', password: 'Test@1234!' },
  { slug: 'globalpay', email: 'maker@globalpay.com', password: 'Test@1234!' },
];

const run = async () => {
  if (process.env.NODE_ENV === 'production') {
    console.error('[reset-passwords] Refusing to run with NODE_ENV=production. Aborting.');
    process.exitCode = 1;
    return;
  }

  let updated = 0;
  let missing = 0;

  await db.transaction(async (trx) => {
    for (const { slug, email, password } of DEV_CREDENTIALS) {
      const tenant = await trx('tenants').where({ slug }).first();
      if (!tenant) {
        console.warn(`[reset-passwords] Tenant '${slug}' not found — skipping ${email}`);
        missing++;
        continue;
      }

      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const [user] = await trx('users')
        .where({ email, tenant_id: tenant.id })
        .update({ password_hash: hash, updated_at: new Date() })
        .returning('id');

      if (!user) {
        console.warn(`[reset-passwords] User '${email}' (${slug}) not found — run 'npm run seed' first`);
        missing++;
        continue;
      }

      await trx('user_password_history').insert({
        user_id: user.id,
        password_hash: hash,
        created_at: new Date(),
      });

      console.log(`[reset-passwords] ✓ ${email} (${slug}) → ${password}`);
      updated++;
    }
  });

  console.log(`[reset-passwords] Done. ${updated} updated, ${missing} skipped.`);
};

run()
  .catch((err) => {
    console.error('[reset-passwords] Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());

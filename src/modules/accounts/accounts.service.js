import Big from 'big.js';
import db from '../../config/database.js';
import { resolveProvider } from '../../providers/ProviderRouter.js';
import { AppError } from '../../shared/errors/AppError.js';
import * as repo from './accounts.repository.js';

export const provisionAccount = async ({ currency, userId, tenantId }) => {
  const provider = await resolveProvider(tenantId, currency, currency);
  const providerResult = await provider.createAccount({ currency, userId, tenantId });

  const account = await repo.createAccount({
    tenant_id: tenantId,
    user_id: userId,
    currency: currency.toUpperCase(),
    account_number: providerResult.accountNumber,
    provider_name: providerResult.providerName,
    provider_account_id: providerResult.providerAccountId,
    status: 'active',
  });

  return account;
};

export const listAccounts = async (tenantId, userIds) => {
  const accounts = await repo.listAccounts(tenantId, userIds);

  return Promise.all(
    accounts.map(async (acc) => {
      const balance = await getAccountBalance(acc.id, tenantId);
      return { ...acc, balance };
    }),
  );
};

const ADMIN_ROLES = new Set(['super_admin', 'client_admin']);

export const getAccount = async (id, tenantId, userId, role = null) => {
  const account = await repo.findAccountById(id, tenantId);
  if (!account) throw new AppError('NOT_FOUND', 'Account not found', 404);
  if (!ADMIN_ROLES.has(role) && account.user_id !== userId) throw new AppError('NOT_FOUND', 'Account not found', 404);

  const balance = await getAccountBalance(id, tenantId);
  const recentEntries = await repo.getRecentLedgerEntries(id, tenantId, 20);

  return { ...account, balance, recentEntries };
};

export const getLedger = async (id, tenantId, userId, { from, to, page, limit }) => {
  const account = await repo.findAccountById(id, tenantId);
  if (!account) throw new AppError('NOT_FOUND', 'Account not found', 404);
  if (account.user_id !== userId) throw new AppError('NOT_FOUND', 'Account not found', 404);

  const offset = (page - 1) * limit;
  const { data, total } = await repo.listLedgerEntries({ accountId: id, tenantId, from, to, limit, offset });

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getAccountBalance = async (accountId, tenantId, trx = db) => {
  const last = await repo.getLastLedgerEntry(accountId, trx);
  return last?.balance_after ?? '0.00000000';
};

export const adjustBalance = async ({ accountId, tenantId, type, amount, description }, trx = db) => {
  return db.transaction(async (t) => {
    const account = await repo.findAccountById(accountId, tenantId, t);
    if (!account) throw new AppError('NOT_FOUND', 'Account not found', 404);

    if (type === 'credit') {
      await creditAccount({ accountId, amount, tenantId, description }, t);
    } else {
      await debitAccount({ accountId, amount, tenantId, description }, t);
    }

    const balance = await getAccountBalance(accountId, tenantId, t);
    return { accountId, type, amount, description, balanceAfter: balance };
  });
};

export const debitAccount = async ({ accountId, amount, paymentId = null, tenantId, description }, trx) => {
  const last = await repo.getLastLedgerEntryForUpdate(accountId, trx);
  const current = new Big(last?.balance_after ?? 0);
  const debitAmt = new Big(amount);

  if (current.lt(debitAmt)) {
    throw new AppError('INSUFFICIENT_BALANCE', 'Insufficient account balance', 422);
  }

  const balanceAfter = current.minus(debitAmt).toFixed(8);
  const account = await repo.findAccountById(accountId, tenantId, trx);

  await repo.insertLedgerEntry({
    tenant_id: tenantId,
    account_id: accountId,
    payment_id: paymentId,
    entry_type: 'debit',
    amount: debitAmt.toFixed(8),
    currency: account.currency,
    balance_after: balanceAfter,
    description: description || 'Debit',
  }, trx);

  return balanceAfter;
};

export const creditAccount = async ({ accountId, amount, paymentId = null, tenantId, description }, trx) => {
  const last = await repo.getLastLedgerEntryForUpdate(accountId, trx);
  const current = new Big(last?.balance_after ?? 0);
  const creditAmt = new Big(amount);
  const balanceAfter = current.plus(creditAmt).toFixed(8);
  const account = await repo.findAccountById(accountId, tenantId, trx);

  await repo.insertLedgerEntry({
    tenant_id: tenantId,
    account_id: accountId,
    payment_id: paymentId,
    entry_type: 'credit',
    amount: creditAmt.toFixed(8),
    currency: account.currency,
    balance_after: balanceAfter,
    description: description || 'Credit',
  }, trx);

  return balanceAfter;
};

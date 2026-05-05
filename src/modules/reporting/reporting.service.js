import { AppError } from '../../shared/errors/AppError.js';
import * as repo from './reporting.repository.js';
import { streamLedgerCsv, streamTransactionsCsv } from './formatters/csv.js';
import { streamStatementPdf } from './formatters/pdf.js';
import { buildMt940 } from './formatters/mt940.js';

// ─── Statement ────────────────────────────────────────────────────────────────

export const getStatement = async ({ tenantId, accountId, from, to, format = 'json' }, res) => {
  if (!from) throw new AppError('VALIDATION_ERROR', 'from date is required', 400);
  if (!to)   throw new AppError('VALIDATION_ERROR', 'to date is required', 400);

  const entries = await repo.getLedgerEntries({ tenantId, accountId, from, to });
  const openingBalance = await repo.getOpeningBalance({ tenantId, accountId, from });

  const currency = entries[0]?.currency || null;
  const accountNumber = entries[0]?.account_number || null;

  switch (format) {
    case 'csv':
      return streamLedgerCsv(res, entries);

    case 'pdf':
      return streamStatementPdf(res, { entries, accountNumber, currency, from, to, openingBalance });

    case 'mt940': {
      const text = buildMt940({ entries, accountNumber, currency, from, openingBalance });
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', 'attachment; filename="statement.mt940"');
      return res.send(text);
    }

    default: // json
      return {
        account: { accountNumber, currency },
        period: { from, to },
        openingBalance,
        entries,
        totalEntries: entries.length,
      };
  }
};

// ─── Transactions ─────────────────────────────────────────────────────────────

export const getTransactions = async ({ tenantId, userId, from, to, status, currency, page = 1, limit = 20, format = 'json' }, res) => {
  const { data, total } = await repo.getTransactions({ tenantId, userId, from, to, status, currency, page, limit });

  if (format === 'csv') {
    return streamTransactionsCsv(res, data);
  }

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ─── FX Summary ───────────────────────────────────────────────────────────────

export const getFxSummary = async ({ tenantId, from, to }) => {
  const rows = await repo.getFxSummary({ tenantId, from, to });
  return rows.map((r) => ({
    pair: `${r.source_currency}/${r.dest_currency}`,
    count: parseInt(r.count, 10),
    totalSource: r.total_source,
    totalDest: r.total_dest,
    avgRate: parseFloat(r.avg_rate).toFixed(6),
  }));
};

// ─── Reconciliation ───────────────────────────────────────────────────────────

export const listReconciliationReports = async (tenantId) =>
  repo.listReconciliationReports(tenantId);

export const getReconciliationReport = async (tenantId, date) => {
  const report = await repo.getReconciliationReport(tenantId, date);
  if (!report) throw new AppError('NOT_FOUND', `No reconciliation report for ${date}`, 404);
  return report;
};

// ─── Audit ────────────────────────────────────────────────────────────────────

export const getAuditLogs = async ({ tenantId, from, to, action, resourceType, page = 1, limit = 50 }) => {
  const { data, total } = await repo.getAuditLogs({ tenantId, from, to, action, resourceType, page, limit });
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

import { format as createCsvStream } from 'fast-csv';

export const streamLedgerCsv = (res, entries, filename = 'statement.csv') => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const csv = createCsvStream({ headers: true });
  csv.pipe(res);

  for (const e of entries) {
    csv.write({
      date: e.created_at,
      type: e.entry_type,
      amount: e.amount,
      currency: e.currency,
      description: e.description,
      payment_id: e.payment_id || '',
      balance_after: e.balance_after,
    });
  }

  csv.end();
};

export const streamTransactionsCsv = (res, rows, filename = 'transactions.csv') => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const csv = createCsvStream({ headers: true });
  csv.pipe(res);

  for (const p of rows) {
    csv.write({
      date: p.created_at,
      reference: p.reference,
      status: p.status,
      source_currency: p.source_currency,
      source_amount: p.source_amount,
      dest_currency: p.dest_currency,
      dest_amount: p.dest_amount,
      exchange_rate: p.exchange_rate,
      fee: p.fee_amount,
      purpose: p.purpose_code,
    });
  }

  csv.end();
};

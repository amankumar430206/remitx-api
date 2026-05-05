// Simplified SWIFT MT940 statement format

const fmtDate = (d) => {
  const dt = new Date(d);
  const yy = String(dt.getUTCFullYear()).slice(2);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
};

const fmtAmount = (amount) =>
  String(parseFloat(amount).toFixed(2)).replace('.', ',');

export const buildMt940 = ({ entries, accountNumber, currency, from, openingBalance, reference }) => {
  const lines = [];
  const ref = reference || `STMT-${Date.now()}`;

  lines.push(`:20:${ref.slice(0, 16)}`);
  lines.push(`:25:${(accountNumber || 'UNKNOWN').slice(0, 35)}`);
  lines.push(`:28C:00001/001`);

  const openAmt = parseFloat(openingBalance || 0);
  const openSign = openAmt >= 0 ? 'C' : 'D';
  const fromDate = from ? fmtDate(from) : fmtDate(new Date());
  lines.push(`:60F:${openSign}${fromDate}${currency || 'USD'}${fmtAmount(Math.abs(openAmt))}`);

  let running = openAmt;
  for (const e of entries) {
    const sign = e.entry_type === 'credit' ? 'C' : 'D';
    const amt = parseFloat(e.amount);
    running = e.entry_type === 'credit' ? running + amt : running - amt;
    const d = fmtDate(e.created_at);
    lines.push(`:61:${d}${d}${sign}${fmtAmount(amt)}NTRF${(e.payment_id || 'NONREF').slice(0, 16)}`);
    lines.push(`:86:${(e.description || '').slice(0, 140)}`);
  }

  const closeSign = running >= 0 ? 'C' : 'D';
  const toDate = entries.length ? fmtDate(entries[entries.length - 1].created_at) : fromDate;
  lines.push(`:62F:${closeSign}${toDate}${currency || 'USD'}${fmtAmount(Math.abs(running))}`);

  return lines.join('\r\n');
};

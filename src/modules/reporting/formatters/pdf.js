import PDFDocument from 'pdfkit';

export const streamStatementPdf = (res, { entries, accountNumber, currency, from, to, openingBalance }) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="statement.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);

  // Header
  doc.fontSize(18).font('Helvetica-Bold').text('RemitX — Account Statement', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Account: ${accountNumber || 'All accounts'}   Currency: ${currency || 'All'}`, { align: 'center' });
  doc.text(`Period: ${from || 'Inception'} → ${to || 'Now'}`, { align: 'center' });
  doc.text(`Opening balance: ${openingBalance}`, { align: 'center' });
  doc.moveDown(1);

  // Column headers
  const cols = { date: 40, type: 180, desc: 240, amount: 410, balance: 490 };
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text('Date',        cols.date,   doc.y, { continued: true, width: 135 });
  doc.text('Type',        cols.type,   doc.y, { continued: true, width: 55 });
  doc.text('Description', cols.desc,   doc.y, { continued: true, width: 165 });
  doc.text('Amount',      cols.amount, doc.y, { continued: true, width: 75, align: 'right' });
  doc.text('Balance',     cols.balance,doc.y, { width: 75, align: 'right' });

  doc.moveTo(40, doc.y + 4).lineTo(555, doc.y + 4).stroke();
  doc.moveDown(0.5);

  // Rows
  doc.font('Helvetica').fontSize(8);
  for (const e of entries) {
    const y = doc.y;
    const dateStr = new Date(e.created_at).toISOString().slice(0, 10);
    doc.text(dateStr,       cols.date,   y, { continued: true, width: 135 });
    doc.text(e.entry_type,  cols.type,   y, { continued: true, width: 55 });
    doc.text((e.description || '').slice(0, 40), cols.desc, y, { continued: true, width: 165 });
    doc.text(String(e.amount),      cols.amount, y, { continued: true, width: 75, align: 'right' });
    doc.text(String(e.balance_after || ''), cols.balance, y, { width: 75, align: 'right' });

    if (doc.y > 750) { doc.addPage(); }
  }

  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(9)
    .text(`Total entries: ${entries.length}`, { align: 'right' });

  doc.end();
};

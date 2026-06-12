import PDFDocument from 'pdfkit';

// ─── Page constants ────────────────────────────────────────────────────────────
const PW   = 841.89;  // landscape A4 width
const PH   = 595.28;  // landscape A4 height
const ML   = 40;      // left margin
const CW   = PW - ML * 2;  // 761.89 usable

// ─── Design tokens ─────────────────────────────────────────────────────────────
const BLACK  = '#111827';
const MUTED  = '#6B7280';
const SUBTLE = '#9CA3AF';
const BG_HDR = '#F3F4F6';
const BG_ALT = '#FAFAFA';
const BORDER = '#E5E7EB';
const BORDER_LT = '#F3F4F6';
const SUCCESS = '#059669';
const WARNING = '#D97706';
const DANGER  = '#DC2626';
const INFO    = '#2563EB';

// ─── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_SHORT = {
  pending_approval:          'Pending',
  pending_manual_processing: 'Manual',
  pending_compliance:        'Compliance',
  completed:                 'Completed',
  processing:                'Processing',
  approved:                  'Approved',
  rejected:                  'Rejected',
  failed:                    'Failed',
  cancelled:                 'Cancelled',
};

const statusShort  = (s = '') => STATUS_SHORT[s] || s.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
const statusColour = (s = '') => {
  if (s === 'completed')                      return SUCCESS;
  if (s === 'approved' || s === 'processing') return INFO;
  if (s === 'rejected' || s === 'failed')     return DANGER;
  if (s === 'cancelled')                      return SUBTLE;
  return WARNING;
};

// ─── Image fetch ────────────────────────────────────────────────────────────────
const fetchImageBuffer = async (url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
};

// ─── Low-level drawing primitives ──────────────────────────────────────────────
const fill = (doc, x, y, w, h, color) => {
  doc.save().rect(x, y, w, h).fillColor(color).fill().restore();
};

const line = (doc, x1, y1, x2, y2, color = BORDER, lw = 0.5) => {
  doc.save().moveTo(x1, y1).lineTo(x2, y2).strokeColor(color).lineWidth(lw).stroke().restore();
};

// Place text at exact (x, y) with no cursor side-effects.
// `lineBreak: false` + explicit width keeps it single-line; truncates if too long.
const txt = (doc, text, x, y, w, {
  font = 'Helvetica', size = 8, color = BLACK, align = 'left', rowH = 20,
} = {}) => {
  const PAD = 5;
  const ty  = y + Math.floor((rowH - size) / 2);
  const tw  = w - PAD * (align === 'right' ? 1 : 2);
  const tx  = align === 'right' ? x : x + PAD;
  doc.font(font).fontSize(size).fillColor(color)
     .text(String(text ?? '—'), tx, ty, { width: tw, align, lineBreak: false });
};

// ─── Transaction column definitions ────────────────────────────────────────────
// 8 cols, widths sum to 761
const TX = [
  { label: 'Date',      w: 68,  align: 'left'  },
  { label: 'Reference', w: 120, align: 'left'  },
  { label: 'Recipient', w: 130, align: 'left'  },
  { label: 'Sent',      w: 95,  align: 'right' },
  { label: 'Received',  w: 95,  align: 'right' },
  { label: 'Rate',      w: 60,  align: 'right' },
  { label: 'Fee',       w: 78,  align: 'right' },
  { label: 'Status',    w: 115, align: 'left'  },
];
const TX_X = TX.reduce((acc, col) => {
  acc.push(acc.length ? acc[acc.length - 1] + TX[acc.length - 1].w : ML);
  return acc;
}, []);
// fix: simpler x computation
const txX = (() => { let x = ML; return TX.map(c => { const r = x; x += c.w; return r; }); })();

// ─── Layout zones (fixed Y positions, landscape page) ─────────────────────────
const ACCENT_H    = 3;
const BRAND_TOP   = 8;
const BRAND_H     = 82;   // logo box (52) + name/subtitle + breathing room
const SUMMARY_TOP = BRAND_TOP + BRAND_H + 1;  // 91
const SUMMARY_H   = 26;
const THEAD_TOP   = SUMMARY_TOP + SUMMARY_H;  // 117
const THEAD_H     = 22;
const TBODY_TOP   = THEAD_TOP + THEAD_H;       // 139
const FOOTER_Y    = PH - 22;                   // 573
const ROW_H       = 18;

// ─── Component: accent bar ─────────────────────────────────────────────────────
const drawAccent = (doc, primary) => {
  fill(doc, 0, 0, PW, ACCENT_H, primary);
};

// ─── Component: brand header ───────────────────────────────────────────────────
const drawBrand = async (doc, { title, from, to, branding = {}, cw = CW }) => {
  const name    = branding.tenantName   || 'RemitX';
  const logoUrl = branding.logoUrl      || null;
  const primary = branding.primaryColor || '#6366F1';

  const BOX = 50;
  const bx  = ML;
  const by  = BRAND_TOP + 2;

  // ── Logo box ────────────────────────────────────────────────────────────────
  doc.save()
     .roundedRect(bx, by, BOX, BOX, 8)
     .fillColor('#F8F9FA').fill()
     .roundedRect(bx, by, BOX, BOX, 8)
     .strokeColor(BORDER).lineWidth(0.75).stroke()
     .restore();

  let logoOk = false;
  if (logoUrl) {
    const buf = await fetchImageBuffer(logoUrl);
    if (buf) {
      try {
        doc.image(buf, bx + 5, by + 5, { fit: [BOX - 10, BOX - 10], align: 'center', valign: 'center' });
        logoOk = true;
      } catch { /* fall through to initials */ }
    }
  }
  if (!logoOk) {
    const ini   = name.slice(0, 2).toUpperCase();
    const iSize = 16;
    const iW    = doc.font('Helvetica-Bold').fontSize(iSize).widthOfString(ini);
    doc.font('Helvetica-Bold').fontSize(iSize).fillColor(primary)
       .text(ini, bx + (BOX - iW) / 2, by + (BOX - iSize) / 2 - 1);
  }

  // ── Company name & subtitle (below box, fixed Y) ────────────────────────────
  const nameY = by + BOX + 6;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK)
     .text(name, bx, nameY, { width: BOX + 60, lineBreak: false });
  doc.font('Helvetica').fontSize(7).fillColor(MUTED)
     .text('Official Report', bx, nameY + 13, { width: BOX + 60, lineBreak: false });

  // ── Report meta (right-aligned, fixed Y) ────────────────────────────────────
  const RE = ML + cw;  // right edge

  doc.font('Helvetica-Bold').fontSize(14).fillColor(BLACK);
  const titleW = doc.widthOfString(title);
  doc.text(title, RE - titleW, BRAND_TOP + 2);

  const LH = 17;
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);

  if (from || to) {
    const s = `${from || 'Inception'} — ${to || 'Now'}`;
    doc.text(s, RE - doc.widthOfString(s), BRAND_TOP + 2 + LH);
  }
  const gen = `Generated ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  doc.text(gen, RE - doc.widthOfString(gen), BRAND_TOP + 2 + LH * 2);

  // ── Rule ────────────────────────────────────────────────────────────────────
  line(doc, ML, BRAND_TOP + BRAND_H, ML + cw, BRAND_TOP + BRAND_H, BORDER, 0.75);
};

// ─── Component: summary strip ──────────────────────────────────────────────────
const drawSummary = (doc, stats, cw = CW) => {
  fill(doc, ML, SUMMARY_TOP, cw, SUMMARY_H, '#F9FAFB');
  line(doc, ML, SUMMARY_TOP,              ML + cw, SUMMARY_TOP,              BORDER, 0.5);
  line(doc, ML, SUMMARY_TOP + SUMMARY_H,  ML + cw, SUMMARY_TOP + SUMMARY_H,  BORDER, 0.5);

  const ty = SUMMARY_TOP + (SUMMARY_H - 8) / 2;
  let x = ML + 12;
  for (let i = 0; i < stats.length; i++) {
    const { label, value } = stats[i];
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
       .text(label + '  ', x, ty, { lineBreak: false });
    x += doc.widthOfString(label + '  ');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BLACK)
       .text(String(value), x, ty, { lineBreak: false });
    x += doc.widthOfString(String(value)) + 20;
    if (i < stats.length - 1) {
      line(doc, x - 10, SUMMARY_TOP + 6, x - 10, SUMMARY_TOP + SUMMARY_H - 6, BORDER, 0.75);
    }
  }
};

// ─── Component: column header row ──────────────────────────────────────────────
const drawThead = (doc, cols, colX, primary, top = THEAD_TOP, h = THEAD_H, cw = CW) => {
  fill(doc, ML, top, cw, h, BG_HDR);
  line(doc, ML, top,     ML + cw, top,     BORDER, 0.5);
  line(doc, ML, top + h, ML + cw, top + h, primary + '88', 1);
  cols.forEach((col, i) => {
    txt(doc, col.label, colX[i], top, col.w,
      { font: 'Helvetica-Bold', size: 7.5, color: MUTED, align: col.align || 'left', rowH: h });
  });
};

// ─── Component: footer ─────────────────────────────────────────────────────────
const drawFooter = (doc, pg, total, tenantName, reportTitle, cw = CW, ph = PH) => {
  const fy = ph - 22;
  line(doc, ML, fy, ML + cw, fy, BORDER, 0.5);
  const ty = fy + 6;
  doc.font('Helvetica').fontSize(7).fillColor(MUTED)
     .text(tenantName, ML, ty, { lineBreak: false });
  const mid = ML + cw / 2 - doc.widthOfString(reportTitle) / 2;
  doc.font('Helvetica').fontSize(7).fillColor(MUTED)
     .text(reportTitle, mid, ty, { lineBreak: false });
  const pStr = `Page ${pg} of ${total}`;
  doc.font('Helvetica').fontSize(7).fillColor(MUTED)
     .text(pStr, ML + cw - doc.widthOfString(pStr), ty, { lineBreak: false });
};

// ─── Transactions PDF ───────────────────────────────────────────────────────────

export const streamTransactionsPdf = async (res, rows, { from, to, branding } = {}) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions.pdf"');

  const primary    = branding?.primaryColor || '#6366F1';
  const tenantName = branding?.tenantName   || 'RemitX';
  const REPORT     = 'Transaction Report';

  // Pagination
  const ROWS_FIRST = Math.floor((FOOTER_Y - 4 - TBODY_TOP) / ROW_H);
  const CONT_THEAD = ACCENT_H + 26;          // compact continuation header height
  const CONT_TBODY = CONT_THEAD + THEAD_H;
  const ROWS_CONT  = Math.floor((FOOTER_Y - 4 - CONT_TBODY) / ROW_H);
  const totalPages = rows.length === 0 ? 1
    : rows.length <= ROWS_FIRST ? 1
    : 1 + Math.ceil((rows.length - ROWS_FIRST) / ROWS_CONT);

  const doc = new PDFDocument({ margin: 0, size: 'A4', layout: 'landscape', autoFirstPage: true });
  doc.pipe(res);

  // ── Page 1: full header ────────────────────────────────────────────────────
  drawAccent(doc, primary);
  await drawBrand(doc, { title: REPORT, from, to, branding });

  const periodStr = (from && to) ? `${from} — ${to}` : from || to || 'All time';
  const completed = rows.filter(r => r.status === 'completed').length;
  drawSummary(doc, [
    { label: 'Transactions', value: rows.length },
    { label: 'Period',       value: periodStr },
    { label: 'Completed',    value: completed },
  ]);

  drawThead(doc, TX, txX, primary);

  // ── Data rows ──────────────────────────────────────────────────────────────
  let y  = TBODY_TOP;
  let pg = 1;

  const drawRow = (p, rowY, alt) => {
    if (alt) fill(doc, ML, rowY, CW, ROW_H, BG_ALT);

    const date    = new Date(p.created_at).toISOString().slice(0, 10);
    const ref     = (p.reference || p.id || '').slice(0, 22);
    const bene    = (p.beneficiary_name || '—').slice(0, 25);
    const sent    = `${p.source_currency} ${parseFloat(p.source_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const recv    = `${p.dest_currency} ${parseFloat(p.dest_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const rate    = parseFloat(p.exchange_rate).toFixed(4);
    const fee     = parseFloat(p.fee_amount) === 0
                  ? 'Free'
                  : `${p.source_currency} ${parseFloat(p.fee_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const sc      = statusColour(p.status);
    const sl      = statusShort(p.status);

    const o = { rowH: ROW_H };
    txt(doc, date, txX[0], rowY, TX[0].w, { ...o, size: 7.5 });
    txt(doc, ref,  txX[1], rowY, TX[1].w, { ...o, font: 'Courier', size: 7, color: MUTED });
    txt(doc, bene, txX[2], rowY, TX[2].w, { ...o, font: 'Helvetica-Bold', size: 7.5 });
    txt(doc, sent, txX[3], rowY, TX[3].w, { ...o, font: 'Courier', size: 7.5, align: 'right' });
    txt(doc, recv, txX[4], rowY, TX[4].w, { ...o, font: 'Courier', size: 7.5, align: 'right', color: SUCCESS });
    txt(doc, rate, txX[5], rowY, TX[5].w, { ...o, font: 'Courier', size: 7,   align: 'right', color: MUTED });
    txt(doc, fee,  txX[6], rowY, TX[6].w, { ...o, font: 'Courier', size: 7,   align: 'right', color: MUTED });

    // Status: pill background + coloured dot + short label
    const pillX = txX[7] + 5;
    const pillY = rowY + (ROW_H - 14) / 2;
    doc.save()
       .roundedRect(pillX, pillY, 10, 10, 5)
       .fillColor(sc + '22').fill()
       .restore();
    doc.save().circle(pillX + 5, pillY + 5, 2.5).fillColor(sc).fill().restore();
    txt(doc, sl, txX[7] + 18, rowY, TX[7].w - 18, { ...o, size: 7.5, color: sc, font: 'Helvetica-Bold' });

    line(doc, ML, rowY + ROW_H, ML + CW, rowY + ROW_H, BORDER_LT, 0.4);
  };

  for (let i = 0; i < rows.length; i++) {
    if (y + ROW_H > FOOTER_Y - 6) {
      drawFooter(doc, pg, totalPages, tenantName, REPORT);
      doc.addPage();
      pg++;
      // Compact header for continuation pages
      drawAccent(doc, primary);
      const chY = ACCENT_H + 4;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK).text(REPORT, ML, chY + 4, { lineBreak: false });
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(tenantName, ML + 130, chY + 5, { lineBreak: false });
      const cStr = '(continued)';
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
         .text(cStr, ML + CW - doc.widthOfString(cStr), chY + 5, { lineBreak: false });
      drawThead(doc, TX, txX, primary, CONT_THEAD, THEAD_H);
      y = CONT_TBODY;
    }
    drawRow(rows[i], y, i % 2 === 1);
    y += ROW_H;
  }

  // Empty state
  if (rows.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(MUTED)
       .text('No transactions found for the selected filters.', ML, TBODY_TOP + 24,
         { width: CW, align: 'center', lineBreak: false });
  }

  // Totals row
  if (rows.length > 0) {
    fill(doc, ML, y, CW, ROW_H, primary + '0f');
    line(doc, ML, y, ML + CW, y, primary + '66', 0.75);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(primary)
       .text(`${rows.length} transaction${rows.length !== 1 ? 's' : ''}`,
         ML + 6, y + (ROW_H - 7.5) / 2, { lineBreak: false });
  }

  drawFooter(doc, pg, totalPages, tenantName, REPORT);
  doc.end();
};

// ─── Statement PDF (portrait A4) ───────────────────────────────────────────────

const SPW = 595.28;
const SPH = 841.89;
const SCW = SPW - ML * 2;  // 515

const ST_BRAND_H    = 82;
const ST_SUM_TOP    = ST_BRAND_H + BRAND_TOP + 1;
const ST_SUM_H      = 26;
const ST_THEAD_TOP  = ST_SUM_TOP + ST_SUM_H;
const ST_THEAD_H    = 22;
const ST_TBODY_TOP  = ST_THEAD_TOP + ST_THEAD_H;
const ST_FOOTER_Y   = SPH - 22;
const ST_ROW_H      = 20;

const ST_COLS = [
  { label: 'Date',        w: 80,  align: 'left'  },
  { label: 'Type',        w: 65,  align: 'left'  },
  { label: 'Description', w: 185, align: 'left'  },
  { label: 'Amount',      w: 95,  align: 'right' },
  { label: 'Balance',     w: 90,  align: 'right' },
];
const stX = (() => { let x = ML; return ST_COLS.map(c => { const r = x; x += c.w; return r; }); })();

export const streamStatementPdf = async (res, { entries = [], accountNumber, currency, from, to, openingBalance, branding } = {}) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="statement.pdf"');

  const primary    = branding?.primaryColor || '#6366F1';
  const tenantName = branding?.tenantName   || 'RemitX';
  const REPORT     = 'Account Statement';

  const ROWS_FIRST = Math.floor((ST_FOOTER_Y - 4 - ST_TBODY_TOP) / ST_ROW_H);
  const ST_CONT_THEAD = ACCENT_H + 28;
  const ST_CONT_TBODY = ST_CONT_THEAD + ST_THEAD_H;
  const ROWS_CONT     = Math.floor((ST_FOOTER_Y - 4 - ST_CONT_TBODY) / ST_ROW_H);
  const totalPages = entries.length === 0 ? 1
    : entries.length <= ROWS_FIRST ? 1
    : 1 + Math.ceil((entries.length - ROWS_FIRST) / ROWS_CONT);

  const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });
  doc.pipe(res);

  drawAccent(doc, primary);
  await drawBrand(doc, { title: REPORT, from, to, branding, cw: SCW });

  // Summary
  fill(doc, ML, ST_SUM_TOP, SCW, ST_SUM_H, '#F9FAFB');
  line(doc, ML, ST_SUM_TOP, ML + SCW, ST_SUM_TOP, BORDER, 0.5);
  line(doc, ML, ST_SUM_TOP + ST_SUM_H, ML + SCW, ST_SUM_TOP + ST_SUM_H, BORDER, 0.5);

  const ty = ST_SUM_TOP + (ST_SUM_H - 8) / 2;
  let sx = ML + 12;
  const sStats = [
    { label: 'Account',  value: accountNumber || 'All' },
    { label: 'Currency', value: currency      || 'All' },
    { label: 'Opening',  value: String(openingBalance ?? '0') },
    { label: 'Entries',  value: entries.length },
  ];
  sStats.forEach(({ label, value }, i) => {
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(label + '  ', sx, ty, { lineBreak: false });
    sx += doc.widthOfString(label + '  ');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BLACK).text(String(value), sx, ty, { lineBreak: false });
    sx += doc.widthOfString(String(value)) + 18;
    if (i < sStats.length - 1) line(doc, sx - 9, ST_SUM_TOP + 6, sx - 9, ST_SUM_TOP + ST_SUM_H - 6, BORDER, 0.75);
  });

  drawThead(doc, ST_COLS, stX, primary, ST_THEAD_TOP, ST_THEAD_H, SCW);

  let y  = ST_TBODY_TOP;
  let pg = 1;

  const drawStRow = (e, rowY, alt) => {
    if (alt) fill(doc, ML, rowY, SCW, ST_ROW_H, BG_ALT);
    const date   = new Date(e.created_at).toISOString().slice(0, 10);
    const isCredit = e.entry_type === 'credit';
    const typeColor = isCredit ? SUCCESS : DANGER;
    const o = { rowH: ST_ROW_H };

    txt(doc, date,                        stX[0], rowY, ST_COLS[0].w, { ...o, size: 7.5 });
    txt(doc, e.entry_type || '—',         stX[1], rowY, ST_COLS[1].w, { ...o, font: 'Helvetica-Bold', size: 7.5, color: typeColor });
    txt(doc, (e.description || '').slice(0, 50), stX[2], rowY, ST_COLS[2].w, { ...o, color: MUTED });
    txt(doc, String(e.amount),            stX[3], rowY, ST_COLS[3].w, { ...o, font: 'Courier', size: 7.5, align: 'right', color: typeColor });
    txt(doc, String(e.balance_after ?? ''), stX[4], rowY, ST_COLS[4].w, { ...o, font: 'Courier', size: 7.5, align: 'right' });
    line(doc, ML, rowY + ST_ROW_H, ML + SCW, rowY + ST_ROW_H, BORDER_LT, 0.4);
  };

  for (let i = 0; i < entries.length; i++) {
    if (y + ST_ROW_H > ST_FOOTER_Y - 6) {
      drawFooter(doc, pg, totalPages, tenantName, REPORT, SCW, SPH);
      doc.addPage();
      pg++;
      drawAccent(doc, primary);
      const chY = ACCENT_H + 5;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK).text(REPORT, ML, chY + 3, { lineBreak: false });
      const cStr = '(continued)';
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
         .text(cStr, ML + SCW - doc.widthOfString(cStr), chY + 4, { lineBreak: false });
      drawThead(doc, ST_COLS, stX, primary, ST_CONT_THEAD, ST_THEAD_H, SCW);
      y = ST_CONT_TBODY;
    }
    drawStRow(entries[i], y, i % 2 === 1);
    y += ST_ROW_H;
  }

  if (entries.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(MUTED)
       .text('No entries found for the selected period.', ML, ST_TBODY_TOP + 24,
         { width: SCW, align: 'center', lineBreak: false });
  }

  if (entries.length > 0) {
    fill(doc, ML, y, SCW, ST_ROW_H, primary + '0f');
    line(doc, ML, y, ML + SCW, y, primary + '66', 0.75);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(primary)
       .text(`${entries.length} entr${entries.length !== 1 ? 'ies' : 'y'}`,
         ML + 6, y + (ST_ROW_H - 7.5) / 2, { lineBreak: false });
  }

  drawFooter(doc, pg, totalPages, tenantName, REPORT, SCW, SPH);
  doc.end();
};

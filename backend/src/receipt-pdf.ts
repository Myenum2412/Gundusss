import PDFDocument from 'pdfkit';

export interface ReceiptPdfData {
  receiptId: string;
  paymentDate: string;
  amount: string | number;
  method: string;
  status: string;
  notes?: string;
  orderId?: string;
  utr?: string;
  payerVpa?: string;

  student: {
    studentId: string;
    studentName: string;
    phone?: string;
    email?: string;
    course?: string;
    group?: string;
    branch?: string;
    guardian?: string;
    address?: string;
    gender?: string;
  };

  organization: {
    name: string;
    tagline?: string;
    email?: string;
    phone?: string;
    website?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    upiId?: string;
    branchName?: string;
    authorizedSignatory?: string;
    /** Public logo URL or a data: URL (PNG / JPEG / WebP). */
    logoUrl?: string;
  };
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLORS = {
  primary: '#1e3a8a',
  primaryDeep: '#172554',
  accent: '#3b82f6',
  accentSoft: '#bfdbfe',
  ink: '#0f172a',
  muted: '#475569',
  faint: '#64748b',
  border: '#cbd5e1',
  hairline: '#e2e8f0',
  card: '#f8fafc',
  green: '#047857',
  greenBg: '#ecfdf5',
  greenBorder: '#a7f3d0',
  red: '#b91c1c',
  redBg: '#fef2f2',
  redBorder: '#fecaca',
};

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function twoDigitWords(value: number): string {
  if (value < 20) return ONES[value] ?? '';
  const tens = TENS[Math.floor(value / 10)] ?? '';
  const ones = ONES[value % 10] ?? '';
  return ones ? `${tens} ${ones}` : tens;
}

/** Indian numbering system: crore / lakh / thousand / hundred. */
function numberToWords(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'Zero';

  const parts: string[] = [];
  let rest = Math.floor(value);

  const crore = Math.floor(rest / 10000000);
  rest %= 10000000;
  const lakh = Math.floor(rest / 100000);
  rest %= 100000;
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  const hundred = Math.floor(rest / 100);
  rest %= 100;

  if (crore) parts.push(`${numberToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigitWords(rest));

  return parts.join(' ').trim() || 'Zero';
}

function amountInWords(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.abs(amount) : 0;
  const rupees = Math.floor(safe);
  const paise = Math.round((safe - rupees) * 100);
  const rupeeWords = `Rupees ${numberToWords(rupees)}`;
  const paiseWords = paise > 0 ? ` and ${twoDigitWords(paise)} Paise` : '';
  return `${rupeeWords}${paiseWords} Only`;
}

function formatAmount(amount: number): string {
  return `INR ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Turns the configured logo into a square PNG that pdfkit can embed.
 * The logo may be a data: URL (the settings page stores WebP) or a public URL.
 * Returns null when there is no usable logo so the header can fall back to a
 * monogram tile.
 */
async function loadLogoPng(logoUrl?: string): Promise<Buffer | null> {
  const url = String(logoUrl || '').trim();
  if (!url) return null;

  let input: Buffer | null = null;

  try {
    if (url.startsWith('data:')) {
      const comma = url.indexOf(',');
      if (comma < 0) return null;
      const metadata = url.slice(5, comma);
      const payload = url.slice(comma + 1);
      input = metadata.includes(';base64')
        ? Buffer.from(payload, 'base64')
        : Buffer.from(decodeURIComponent(payload), 'utf8');
    } else if (/^https?:\/\//i.test(url)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > 6_000_000) return null;
        input = Buffer.from(arrayBuffer);
      } finally {
        clearTimeout(timer);
      }
    }
  } catch {
    return null;
  }

  if (!input || input.length === 0) return null;

  try {
    const { default: sharp } = await import('sharp');
    return await sharp(input)
      .rotate()
      .resize(256, 256, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .png()
      .toBuffer();
  } catch {
    // sharp is optional at runtime; fall back to the monogram tile.
    return null;
  }
}

function drawMonogram(
  doc: PDFKit.PDFDocument,
  organizationName: string,
  x: number,
  y: number,
  size: number
) {
  const initials =
    organizationName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('') || 'MF';

  doc.roundedRect(x, y, size, size, 7).fillAndStroke('#ffffff', '#93c5fd');
  doc
    .fillColor(COLORS.primary)
    .font('Helvetica-Bold')
    .fontSize(size * 0.36)
    .text(initials, x, y + size / 2 - size * 0.18, {
      width: size,
      align: 'center',
      lineBreak: false,
    });
}

function drawLogo(
  doc: PDFKit.PDFDocument,
  logo: Buffer | null,
  organizationName: string,
  x: number,
  y: number,
  size: number
) {
  if (logo) {
    doc.roundedRect(x, y, size, size, 7).fillAndStroke('#ffffff', '#93c5fd');
    try {
      doc.image(logo, x + 4, y + 4, { width: size - 8, height: size - 8 });
      return;
    } catch {
      // fall through to the monogram tile
    }
  }
  drawMonogram(doc, organizationName, x, y, size);
}

export async function generateReceiptPdf(data: ReceiptPdfData): Promise<Buffer> {
  const logo = await loadLogoPng(data.organization.logoUrl);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      bufferPages: true,
      info: {
        Title: `Receipt-${data.receiptId}`,
        Author: data.organization.name || 'MyFees',
        Subject: `Official Fee Payment Receipt #${data.receiptId}`,
        Keywords: 'fee receipt, payment, accounts, myfees',
        Creator: 'MyFees',
        Producer: 'MyFees',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const organizationName = data.organization.name || 'Educational Institution';
    const studentName = data.student.studentName || 'Student';
    const isPaid =
      ['PAID', 'SUCCESS'].includes(String(data.status || '').toUpperCase());
    const paymentDate =
      data.paymentDate || new Date().toISOString().slice(0, 10);
    const rawAmount = parseFloat(String(data.amount)) || 0;
    const formattedAmount = formatAmount(rawAmount);

    const cleanMethod = (data.method || 'UPI')
      .replace(/_/g, ' ')
      .replace('CASH COUNTER', 'Cash at Counter')
      .replace('CARD COUNTER', 'Card POS Machine');

    const addressLine = [
      data.organization.address,
      data.organization.city,
      data.organization.state,
      data.organization.pincode,
    ]
      .filter(Boolean)
      .join(', ');

    const contactPhoneEmail = [
      data.organization.phone ? `Phone: ${data.organization.phone}` : '',
      data.organization.email ? `Email: ${data.organization.email}` : '',
    ].filter(Boolean);

    // ---------------------------------------------------------------------
    // Header band (dark navy panel with logo + organization identity)
    // ---------------------------------------------------------------------
    const headerX = 24;
    const headerY = 24;
    const headerW = PAGE_WIDTH - headerX * 2;
    const headerH = 116;

    doc.roundedRect(headerX, headerY, headerW, headerH, 8).fill(COLORS.primary);

    drawLogo(doc, logo, organizationName, 38, 52, 56);

    const headerTextX = 108;
    const headerTextW = 252;

    // Shrink long institution names instead of truncating them.
    let nameSize = 15;
    doc.font('Helvetica-Bold').fontSize(nameSize);
    while (nameSize > 10.5 && doc.widthOfString(organizationName) > headerTextW) {
      nameSize -= 0.5;
      doc.fontSize(nameSize);
    }

    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(nameSize)
      .text(organizationName, headerTextX, 38, {
        width: headerTextW,
        height: 20,
        ellipsis: true,
      });

    const subtitleParts = [
      data.organization.branchName
        ? `Campus: ${data.organization.branchName}`
        : '',
      data.organization.tagline || '',
    ].filter(Boolean);

    if (subtitleParts.length > 0) {
      doc
        .fillColor(COLORS.accentSoft)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(subtitleParts.join('  ·  '), headerTextX, 59, {
          width: headerTextW,
          height: 11,
          ellipsis: true,
        });
    }

    let orgY = 73;

    if (addressLine) {
      doc.fillColor('#dbeafe').font('Helvetica').fontSize(7.2);
      const addressHeight = Math.min(
        20,
        Math.max(
          10,
          doc.heightOfString(addressLine, {
            width: headerTextW,
            lineGap: 1.5,
          })
        )
      );
      doc.text(addressLine, headerTextX, orgY, {
        width: headerTextW,
        height: addressHeight,
        ellipsis: true,
        lineGap: 1.5,
      });
      orgY += addressHeight + 4;
    }

    if (contactPhoneEmail.length > 0) {
      doc
        .fillColor('#dbeafe')
        .font('Helvetica')
        .fontSize(7.2)
        .text(contactPhoneEmail.join('  |  '), headerTextX, orgY, {
          width: headerTextW,
          height: 10,
          ellipsis: true,
        });
      orgY += 12;
    }

    if (data.organization.website) {
      doc
        .fillColor('#dbeafe')
        .font('Helvetica')
        .fontSize(7.2)
        .text(`Web: ${data.organization.website}`, headerTextX, orgY, {
          width: headerTextW,
          height: 10,
          ellipsis: true,
        });
      orgY += 12;
    }

    if (data.organization.upiId) {
      doc
        .fillColor(COLORS.accentSoft)
        .font('Helvetica-Bold')
        .fontSize(7.2)
        .text(`Merchant UPI: ${data.organization.upiId}`, headerTextX, orgY, {
          width: headerTextW,
          height: 10,
          ellipsis: true,
        });
    }

    // Right side of the header: document title + identifiers + status
    const rightX = 368;
    const rightW = PAGE_WIDTH - 40 - rightX;

    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(15)
      .text('FEE RECEIPT', rightX, 38, {
        width: rightW,
        align: 'right',
        characterSpacing: 0.8,
      });

    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(`Receipt No: ${data.receiptId}`, rightX, 60, {
        width: rightW,
        align: 'right',
        ellipsis: true,
      });

    doc
      .fillColor('#dbeafe')
      .font('Helvetica')
      .fontSize(8)
      .text(`Date: ${paymentDate}`, rightX, 74, {
        width: rightW,
        align: 'right',
      });

    const badgeW = 104;
    const badgeH = 20;
    const badgeX = PAGE_WIDTH - 40 - badgeW;
    const badgeY = 92;

    doc
      .roundedRect(badgeX, badgeY, badgeW, badgeH, 10)
      .fillAndStroke(
        isPaid ? COLORS.greenBg : COLORS.redBg,
        isPaid ? COLORS.greenBorder : COLORS.redBorder
      );

    doc
      .fillColor(isPaid ? COLORS.green : COLORS.red)
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(
        isPaid ? 'PAID' : String(data.status || 'UNPAID').toUpperCase(),
        badgeX,
        badgeY + 6,
        { width: badgeW, align: 'center' }
      );

    // ---------------------------------------------------------------------
    // Optional watermark
    // ---------------------------------------------------------------------
    doc.save();
    doc.translate(PAGE_WIDTH / 2, 470);
    doc.rotate(-28);
    doc
      .fillColor(isPaid ? COLORS.green : COLORS.red)
      .fillOpacity(0.03)
      .font('Helvetica-Bold')
      .fontSize(92)
      .text(isPaid ? 'PAID' : 'UNPAID', -150, -46, {
        width: 300,
        align: 'center',
      });
    doc.restore();

    // ---------------------------------------------------------------------
    // Student + payment cards
    // ---------------------------------------------------------------------
    let y = 156;
    const cardW = (CONTENT_WIDTH - 14) / 2;
    const cardH = 124;

    const drawCard = (x: number, title: string) => {
      doc.roundedRect(x, y, cardW, cardH, 6).fillAndStroke(COLORS.card, COLORS.border);
      doc.rect(x + 1, y + 1, cardW - 2, 3).fill(COLORS.accent);
      doc
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .text(title, x + 12, y + 12);
      doc
        .strokeColor(COLORS.hairline)
        .lineWidth(0.5)
        .moveTo(x + 12, y + 27)
        .lineTo(x + cardW - 12, y + 27)
        .stroke();
    };

    drawCard(MARGIN, 'STUDENT PROFILE');

    let sY = y + 36;
    const sLabelX = MARGIN + 12;
    const sValueX = MARGIN + 82;

    const studentRows: Array<[string, string]> = [
      ['Student Name', studentName],
      ['Student ID', data.student.studentId || '—'],
      [
        'Course & Batch',
        [data.student.course, data.student.group].filter(Boolean).join(' · ') ||
          '—',
      ],
      ['Guardian', data.student.guardian || '—'],
      ['Contact', data.student.phone || data.student.email || '—'],
      [
        'Campus',
        data.student.branch || data.organization.branchName || 'Main Campus',
      ],
    ];

    for (const [label, value] of studentRows) {
      doc
        .fillColor(COLORS.faint)
        .font('Helvetica')
        .fontSize(7.4)
        .text(label, sLabelX, sY);
      doc
        .fillColor(COLORS.ink)
        .font('Helvetica-Bold')
        .fontSize(7.6)
        .text(value, sValueX, sY, {
          width: cardW - 94,
          height: 11,
          ellipsis: true,
        });
      sY += 14.5;
    }

    const rightCardX = MARGIN + cardW + 14;
    drawCard(rightCardX, 'PAYMENT & TRANSACTION');

    let pY = y + 36;
    const pLabelX = rightCardX + 12;
    const pValueX = rightCardX + 86;

    const paymentRows: Array<[string, string, boolean]> = [
      ['Receipt No', data.receiptId, false],
      ['Method', cleanMethod, false],
      ['Payment Date', paymentDate, false],
      ['Order / Ref ID', data.orderId || 'Counter Pass', false],
      ['Bank Ref / UTR', data.utr || data.payerVpa || 'Recorded & Confirmed', false],
      ['Amount Paid', formattedAmount, true],
    ];

    for (const [label, value, isAmount] of paymentRows) {
      doc
        .fillColor(COLORS.faint)
        .font('Helvetica')
        .fontSize(7.4)
        .text(label, pLabelX, pY);
      doc
        .fillColor(isAmount ? COLORS.green : COLORS.ink)
        .font('Helvetica-Bold')
        .fontSize(isAmount ? 8.6 : 7.6)
        .text(value, pValueX, pY, {
          width: cardW - 98,
          height: 11,
          ellipsis: true,
        });
      pY += 14.5;
    }

    // ---------------------------------------------------------------------
    // Fee particulars table
    // ---------------------------------------------------------------------
    y = 296;

    doc
      .fillColor(COLORS.primary)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('FEE PARTICULARS', MARGIN, y);

    doc
      .fillColor(COLORS.faint)
      .font('Helvetica')
      .fontSize(7.5)
      .text('Breakdown of the amount received', MARGIN, y + 12);

    const tableY = 318;
    const tableHeaderH = 24;
    const rowH = 32;

    doc.rect(MARGIN, tableY, CONTENT_WIDTH, tableHeaderH).fill(COLORS.primary);

    const colSl = MARGIN;
    const colDesc = MARGIN + 34;
    const colRef = MARGIN + 300;
    const colAmtEnd = MARGIN + CONTENT_WIDTH - 12;

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.6);
    doc.text('#', colSl + 10, tableY + 8);
    doc.text('DESCRIPTION', colDesc, tableY + 8);
    doc.text('COURSE / GROUP', colRef, tableY + 8);
    doc.text('AMOUNT', colAmtEnd - 100, tableY + 8, {
      width: 100,
      align: 'right',
    });

    y = tableY + tableHeaderH;

    doc.rect(MARGIN, y, CONTENT_WIDTH, rowH).fillAndStroke('#ffffff', COLORS.border);

    const descText =
      data.notes && data.notes.trim()
        ? data.notes.trim()
        : `Fee payment for ${data.student.course || 'Academic Course'} (${data.student.group || 'Regular Batch'})`;

    const batchText =
      [data.student.course, data.student.group].filter(Boolean).join(' · ') ||
      'General';

    doc
      .fillColor(COLORS.ink)
      .font('Helvetica')
      .fontSize(8.2)
      .text('1', colSl + 12, y + 11);
    doc
      .text(descText, colDesc, y + 11, { width: colRef - colDesc - 10, height: 12, ellipsis: true })
      .font('Helvetica')
      .fillColor(COLORS.muted)
      .text(batchText, colRef, y + 11, {
        width: colAmtEnd - colRef - 112,
        height: 12,
        ellipsis: true,
      });
    doc
      .fillColor(COLORS.ink)
      .font('Helvetica-Bold')
      .fontSize(8.6)
      .text(formattedAmount, colAmtEnd - 110, y + 11, {
        width: 110,
        align: 'right',
      });

    y += rowH;

    // ---------------------------------------------------------------------
    // Amount in words + totals
    // ---------------------------------------------------------------------
    const summaryY = y + 16;

    doc
      .fillColor(COLORS.faint)
      .font('Helvetica-Bold')
      .fontSize(7)
      .text('AMOUNT IN WORDS', MARGIN, summaryY);

    doc
      .fillColor(COLORS.ink)
      .font('Helvetica-Bold')
      .fontSize(8.2)
      .text(amountInWords(rawAmount), MARGIN, summaryY + 12, {
        width: 270,
        height: 34,
      });

    const totalBoxW = 220;
    const totalBoxX = PAGE_WIDTH - MARGIN - totalBoxW;
    const totalBoxH = 56;

    doc
      .roundedRect(totalBoxX, summaryY - 4, totalBoxW, totalBoxH, 5)
      .fillAndStroke(COLORS.card, COLORS.border);

    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(8)
      .text('Total Paid', totalBoxX + 12, summaryY + 6);

    doc
      .fillColor(COLORS.green)
      .font('Helvetica-Bold')
      .fontSize(12.5)
      .text(formattedAmount, totalBoxX + 90, summaryY + 4, {
        width: totalBoxW - 102,
        align: 'right',
      });

    doc
      .strokeColor(COLORS.hairline)
      .lineWidth(0.5)
      .moveTo(totalBoxX + 12, summaryY + 28)
      .lineTo(totalBoxX + totalBoxW - 12, summaryY + 28)
      .stroke();

    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(7.5)
      .text('Balance Due', totalBoxX + 12, summaryY + 38);

    doc
      .fillColor(COLORS.ink)
      .font('Helvetica-Bold')
      .fontSize(8.2)
      .text('INR 0.00', totalBoxX + 90, summaryY + 37, {
        width: totalBoxW - 102,
        align: 'right',
      });

    // ---------------------------------------------------------------------
    // Verification banner
    // ---------------------------------------------------------------------
    y = summaryY + totalBoxH + 22;

    const notesH = 56;
    doc
      .roundedRect(MARGIN, y, CONTENT_WIDTH, notesH, 6)
      .fillAndStroke(COLORS.greenBg, COLORS.greenBorder);

    doc
      .fillColor(COLORS.green)
      .font('Helvetica-Bold')
      .fontSize(8.6)
      .text('PAYMENT VERIFICATION & ACKNOWLEDGMENT', MARGIN + 14, y + 9);

    const confirmationNote = `This official receipt acknowledges ${formattedAmount} received via ${cleanMethod} from ${studentName} (${data.student.studentId || 'N/A'}) on ${paymentDate}. The payment has been verified and credited to the records of ${organizationName}.`;

    doc
      .fillColor('#166534')
      .font('Helvetica')
      .fontSize(7.2)
      .text(confirmationNote, MARGIN + 14, y + 24, {
        width: CONTENT_WIDTH - 28,
        height: 28,
        lineGap: 1.6,
      });

    // ---------------------------------------------------------------------
    // Terms & declaration
    // ---------------------------------------------------------------------
    let termsY = y + notesH + 22;

    doc
      .fillColor(COLORS.primary)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('TERMS & DECLARATION', MARGIN, termsY);

    termsY += 14;

    const terms = [
      'This is a computer-generated receipt and is valid without a physical seal.',
      "Fees once paid are non-refundable unless the institution's refund policy states otherwise.",
      'Please quote the receipt number above for any future correspondence or reconciliation.',
    ];

    for (const term of terms) {
      doc.circle(MARGIN + 3, termsY + 3, 1.4).fill(COLORS.accent);
      doc
        .fillColor(COLORS.muted)
        .font('Helvetica')
        .fontSize(7)
        .text(term, MARGIN + 12, termsY, {
          width: CONTENT_WIDTH - 12,
          height: 10,
          ellipsis: true,
        });
      termsY += 12;
    }

    // ---------------------------------------------------------------------
    // Signatures
    // ---------------------------------------------------------------------
    const signatureLineY = 636;
    const signatureW = 160;

    doc
      .strokeColor(COLORS.border)
      .lineWidth(0.8)
      .moveTo(MARGIN, signatureLineY)
      .lineTo(MARGIN + signatureW, signatureLineY)
      .stroke();

    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(7.2)
      .text('Student / Depositor Signature', MARGIN, signatureLineY + 6, {
        width: signatureW,
        align: 'center',
      });

    const signX = PAGE_WIDTH - MARGIN - signatureW;
    const signatoryName =
      data.organization.authorizedSignatory || organizationName;

    doc
      .fillColor(COLORS.ink)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(signatoryName, signX, signatureLineY - 16, {
        width: signatureW,
        align: 'center',
        height: 11,
        ellipsis: true,
      });

    doc
      .strokeColor(COLORS.border)
      .lineWidth(0.8)
      .moveTo(signX, signatureLineY)
      .lineTo(signX + signatureW, signatureLineY)
      .stroke();

    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(7)
      .text('Authorized Signatory', signX, signatureLineY + 6, {
        width: signatureW,
        align: 'center',
      });

    doc
      .fillColor(COLORS.faint)
      .font('Helvetica-Oblique')
      .fontSize(8)
      .text(`Thank you for your payment, ${studentName}.`, MARGIN, 704, {
        width: CONTENT_WIDTH,
        align: 'center',
      });

    doc
      .fillColor(COLORS.faint)
      .font('Helvetica')
      .fontSize(7)
      .text('Please keep this receipt for your records.', MARGIN, 717, {
        width: CONTENT_WIDTH,
        align: 'center',
      });

    // ---------------------------------------------------------------------
    // Footer
    // ---------------------------------------------------------------------
    const footerLineY = 756;

    doc
      .strokeColor(COLORS.hairline)
      .lineWidth(0.5)
      .moveTo(MARGIN, footerLineY)
      .lineTo(PAGE_WIDTH - MARGIN, footerLineY)
      .stroke();

    doc
      .fillColor(COLORS.muted)
      .font('Helvetica-Bold')
      .fontSize(6.8)
      .text(organizationName, MARGIN, footerLineY + 8, {
        width: 150,
        height: 9,
        ellipsis: true,
      });

    doc
      .fillColor(COLORS.faint)
      .font('Helvetica')
      .fontSize(6.6)
      .text(
        `Computer-generated receipt · Valid without physical seal${
          data.organization.email || data.organization.phone
            ? ` · ${data.organization.email || data.organization.phone}`
            : ''
        }`,
        MARGIN + 150,
        footerLineY + 8,
        { width: CONTENT_WIDTH - 220, align: 'center', height: 9, ellipsis: true }
      );

    doc
      .fillColor(COLORS.faint)
      .font('Helvetica')
      .fontSize(6.8)
      .text('Page 1 of 1', PAGE_WIDTH - MARGIN - 60, footerLineY + 8, {
        width: 60,
        align: 'right',
      });

    // ---------------------------------------------------------------------
    // A4 sheet border (outer keyline + inner hairline)
    // ---------------------------------------------------------------------
    doc
      .roundedRect(18, 18, PAGE_WIDTH - 36, PAGE_HEIGHT - 36, 10)
      .lineWidth(1.2)
      .strokeColor(COLORS.primary)
      .stroke();

    doc
      .roundedRect(23, 23, PAGE_WIDTH - 46, PAGE_HEIGHT - 46, 8)
      .lineWidth(0.5)
      .strokeColor('#93c5fd')
      .stroke();

    doc.end();
  });
}

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
  };
}

export function generateReceiptPdf(data: ReceiptPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 36,
      info: {
        Title: `Receipt-${data.receiptId}`,
        Author: data.organization.name || 'MyFees',
        Subject: `Official Fee Payment Receipt #${data.receiptId}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const primaryColor = '#1e3a8a'; // Deep Navy / Indigo
    const primaryAccent = '#3b82f6';
    const slateDark = '#0f172a';
    const slateMuted = '#475569';
    const borderGray = '#cbd5e1';
    const cardBg = '#f8fafc';
    const paidGreen = '#047857';
    const paidBg = '#ecfdf5';
    const paidBorder = '#a7f3d0';

    const pageWidth = 595.28;
    const margin = 36;
    const contentWidth = pageWidth - margin * 2; // 523.28

    // 1. Top Decorative Brand Bar
    doc.rect(0, 0, pageWidth, 7).fill(primaryColor);

    // 2. Header Area
    let y = 28;

    // Left Column: Organization Profile Details
    const leftWidth = 330;
    doc
      .fillColor(primaryColor)
      .fontSize(17)
      .font('Helvetica-Bold')
      .text(data.organization.name || 'Educational Institution', margin, y, {
        width: leftWidth,
        ellipsis: true,
      });

    y += 22;

    // Tagline / Category / Branch
    const subtitleParts = [
      data.organization.branchName ? `Campus: ${data.organization.branchName}` : '',
      data.organization.tagline || '',
    ].filter(Boolean);

    if (subtitleParts.length > 0) {
      doc
        .fillColor('#4338ca')
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(subtitleParts.join('  ·  '), margin, y, { width: leftWidth, ellipsis: true });
      y += 13;
    }

    // Address
    const addressLine = [
      data.organization.address,
      data.organization.city,
      data.organization.state,
      data.organization.pincode,
    ]
      .filter(Boolean)
      .join(', ');

    if (addressLine) {
      doc
        .fillColor(slateMuted)
        .fontSize(8.5)
        .font('Helvetica')
        .text(addressLine, margin, y, { width: leftWidth, ellipsis: true });
      y += 12;
    }

    // Contact details: Phone, Email, Web
    const contactParts = [
      data.organization.phone ? `Phone: ${data.organization.phone}` : '',
      data.organization.email ? `Email: ${data.organization.email}` : '',
      data.organization.website ? `Web: ${data.organization.website}` : '',
    ].filter(Boolean);

    if (contactParts.length > 0) {
      doc
        .fillColor(slateMuted)
        .fontSize(8)
        .font('Helvetica')
        .text(contactParts.join('  |  '), margin, y, { width: leftWidth, ellipsis: true });
      y += 12;
    }

    // Merchant UPI ID
    if (data.organization.upiId) {
      doc
        .fillColor('#1d4ed8')
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(`Merchant UPI: ${data.organization.upiId}`, margin, y, { width: leftWidth });
      y += 12;
    }

    // Right Column: Receipt Title, Number, Date, Status
    const rightX = 370;
    const rightWidth = pageWidth - margin - rightX;
    let rightY = 28;

    doc
      .fillColor(primaryColor)
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('FEE RECEIPT', rightX, rightY, { width: rightWidth, align: 'right' });

    rightY += 22;

    doc
      .fillColor(slateDark)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(`Receipt #: ${data.receiptId}`, rightX, rightY, { width: rightWidth, align: 'right' });

    rightY += 14;

    doc
      .fillColor(slateMuted)
      .fontSize(8.5)
      .font('Helvetica')
      .text(`Date: ${data.paymentDate || new Date().toISOString().slice(0, 10)}`, rightX, rightY, {
        width: rightWidth,
        align: 'right',
      });

    rightY += 15;

    // Status Badge
    const isPaid = (data.status || '').toUpperCase() === 'PAID' || (data.status || '').toUpperCase() === 'SUCCESS';
    const badgeW = 95;
    const badgeH = 20;
    const badgeX = pageWidth - margin - badgeW;

    doc
      .roundedRect(badgeX, rightY, badgeW, badgeH, 4)
      .fillAndStroke(isPaid ? paidBg : '#fef2f2', isPaid ? paidBorder : '#fecaca');

    doc
      .fillColor(isPaid ? paidGreen : '#b91c1c')
      .fontSize(9.5)
      .font('Helvetica-Bold')
      .text(isPaid ? 'STATUS: PAID' : `STATUS: ${(data.status || 'UNPAID').toUpperCase()}`, badgeX, rightY + 5, {
        width: badgeW,
        align: 'center',
      });

    // Horizontal Separator Line
    y = Math.max(y + 8, rightY + badgeH + 12);
    doc
      .strokeColor(borderGray)
      .lineWidth(1)
      .moveTo(margin, y)
      .lineTo(pageWidth - margin, y)
      .stroke();

    y += 14;

    // 3. Two Column Profile Cards
    const cardWidth = (contentWidth - 14) / 2; // ~254 pt
    const cardHeight = 126;

    // Left Card: Student Profile Details
    doc.roundedRect(margin, y, cardWidth, cardHeight, 6).fillAndStroke(cardBg, borderGray);

    doc
      .fillColor(primaryColor)
      .fontSize(9.5)
      .font('Helvetica-Bold')
      .text('STUDENT PROFILE & DETAILS', margin + 12, y + 10);

    let sY = y + 26;
    const sRows: [string, string][] = [
      ['Student Name:', data.student.studentName || '—'],
      ['Student ID:', data.student.studentId || '—'],
      ['Course & Batch:', [data.student.course, data.student.group].filter(Boolean).join(' · ') || '—'],
      ['Guardian:', data.student.guardian || '—'],
      ['Contact Phone:', data.student.phone || '—'],
      ['Campus / Branch:', data.student.branch || data.organization.branchName || 'Main Campus'],
    ];

    for (const [label, val] of sRows) {
      doc.fillColor(slateMuted).font('Helvetica').fontSize(8).text(label, margin + 12, sY);
      doc
        .fillColor(slateDark)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(val, margin + 86, sY, { width: cardWidth - 94, ellipsis: true });
      sY += 15.5;
    }

    // Right Card: Payment & Transaction Profile
    const rightCardX = margin + cardWidth + 14;
    doc.roundedRect(rightCardX, y, cardWidth, cardHeight, 6).fillAndStroke(cardBg, borderGray);

    doc
      .fillColor(primaryColor)
      .fontSize(9.5)
      .font('Helvetica-Bold')
      .text('PAYMENT & TRANSACTION PROFILE', rightCardX + 12, y + 10);

    let pY = y + 26;
    const numAmount = parseFloat(String(data.amount)) || 0;
    const formattedAmount = `INR ${numAmount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

    const cleanMethod = (data.method || 'UPI')
      .replace(/_/g, ' ')
      .replace('CASH COUNTER', 'Cash at Counter')
      .replace('CARD COUNTER', 'Card POS Machine');

    const pRows: [string, string][] = [
      ['Receipt Number:', data.receiptId],
      ['Payment Method:', cleanMethod],
      ['Payment Date:', data.paymentDate || new Date().toISOString().slice(0, 10)],
      ['Order / Ref ID:', data.orderId || 'Counter Pass'],
      ['Bank Ref / UTR:', data.utr || 'Recorded & Confirmed'],
      ['Total Paid:', formattedAmount],
    ];

    for (const [label, val] of pRows) {
      const isTotal = label === 'Total Paid:';
      doc.fillColor(slateMuted).font('Helvetica').fontSize(8).text(label, rightCardX + 12, pY);
      doc
        .fillColor(isTotal ? paidGreen : slateDark)
        .font(isTotal ? 'Helvetica-Bold' : 'Helvetica-Bold')
        .fontSize(isTotal ? 9 : 8)
        .text(val, rightCardX + 88, pY, { width: cardWidth - 96, ellipsis: true });
      pY += 15.5;
    }

    y += cardHeight + 16;

    // 4. Breakdown Table
    doc
      .fillColor(primaryColor)
      .fontSize(10.5)
      .font('Helvetica-Bold')
      .text('FEE PARTICULARS & RECEIPT BREAKDOWN', margin, y);

    y += 15;

    // Table Header
    const colX = {
      sl: margin,
      desc: margin + 30,
      ref: margin + 280,
      amt: margin + 410,
    };
    const colW = {
      sl: 30,
      desc: 250,
      ref: 130,
      amt: contentWidth - 410,
    };

    doc.rect(margin, y, contentWidth, 22).fill('#f1f5f9');
    doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8.5);

    doc.text('#', colX.sl + 6, y + 6);
    doc.text('DESCRIPTION / PARTICULARS', colX.desc, y + 6);
    doc.text('COURSE & CLASS GROUP', colX.ref, y + 6);
    doc.text('AMOUNT (INR)', colX.amt, y + 6, { width: colW.amt - 10, align: 'right' });

    y += 22;

    // Row 1
    doc.rect(margin, y, contentWidth, 28).fillAndStroke('#ffffff', borderGray);
    doc.fillColor(slateDark).font('Helvetica').fontSize(8.5);
    doc.text('1', colX.sl + 6, y + 9);

    const descText =
      data.notes && data.notes.trim() && !data.notes.includes('YOUPI PG ·')
        ? data.notes.trim()
        : `Fee payment for ${data.student.course || 'Academic Course'} (${data.student.group || 'Regular Batch'})`;

    doc.text(descText, colX.desc, y + 9, { width: colW.desc - 10, ellipsis: true });

    const batchText =
      [data.student.course, data.student.group].filter(Boolean).join(' · ') || 'General';
    doc.text(batchText, colX.ref, y + 9, { width: colW.ref - 10, ellipsis: true });

    doc
      .font('Helvetica-Bold')
      .text(formattedAmount, colX.amt, y + 9, { width: colW.amt - 10, align: 'right' });

    y += 28;

    // Total Summary Box
    const totalBoxW = 210;
    const totalBoxX = pageWidth - margin - totalBoxW;
    const totalBoxH = 48;

    doc.rect(totalBoxX, y + 10, totalBoxW, totalBoxH).fillAndStroke(cardBg, borderGray);

    doc
      .fillColor(slateMuted)
      .font('Helvetica')
      .fontSize(8.5)
      .text('Total Amount Received:', totalBoxX + 12, y + 17);

    doc
      .fillColor(paidGreen)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(formattedAmount, totalBoxX + 12, y + 16, { width: totalBoxW - 24, align: 'right' });

    doc
      .fillColor(slateMuted)
      .font('Helvetica')
      .fontSize(8)
      .text('Outstanding Balance Due:', totalBoxX + 12, y + 33);

    doc
      .fillColor(slateDark)
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text('INR 0.00', totalBoxX + 12, y + 33, { width: totalBoxW - 24, align: 'right' });

    y += totalBoxH + 26;

    // 5. Notes & Verification Banner
    const notesBoxH = 50;
    doc.roundedRect(margin, y, contentWidth, notesBoxH, 6).fillAndStroke('#f0fdf4', '#bbf7d0');

    doc
      .fillColor(paidGreen)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('OFFICIAL PAYMENT VERIFICATION & ACKNOWLEDGMENT', margin + 14, y + 9);

    const institutionTitle = data.organization.name || 'the Institute Office';
    const confirmationNote = `This official receipt acknowledges full payment of ${formattedAmount} received via ${cleanMethod} for student ${data.student.studentName} (${data.student.studentId || 'N/A'}). The payment is officially credited and recorded in the database of ${institutionTitle}.`;

    doc
      .fillColor('#166534')
      .font('Helvetica')
      .fontSize(7.5)
      .text(confirmationNote, margin + 14, y + 23, { width: contentWidth - 28, lineGap: 1.5 });

    y += notesBoxH + 26;

    // 6. Signatures Area
    const sigLineW = 150;
    const sigY = y + 22;

    // Left Signature: Student / Depositor
    doc
      .strokeColor(borderGray)
      .lineWidth(1)
      .moveTo(margin, sigY)
      .lineTo(margin + sigLineW, sigY)
      .stroke();

    doc
      .fillColor(slateMuted)
      .font('Helvetica')
      .fontSize(7.5)
      .text('Student / Depositor Signature', margin, sigY + 5, { width: sigLineW, align: 'center' });

    // Right Signature: Authorized Signatory
    const rightSigX = pageWidth - margin - sigLineW;
    doc
      .strokeColor(borderGray)
      .lineWidth(1)
      .moveTo(rightSigX, sigY)
      .lineTo(rightSigX + sigLineW, sigY)
      .stroke();

    const signatoryName =
      data.organization.authorizedSignatory ||
      data.organization.name ||
      'Accounts Department';

    doc
      .fillColor(slateDark)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(signatoryName, rightSigX, sigY + 4, { width: sigLineW, align: 'center' });

    doc
      .fillColor(slateMuted)
      .font('Helvetica')
      .fontSize(7)
      .text('Authorized Signatory (Finance & Accounts)', rightSigX, sigY + 14, {
        width: sigLineW,
        align: 'center',
      });

    // 7. Footer Notice
    const footerY = 800;
    doc
      .strokeColor(borderGray)
      .lineWidth(0.5)
      .moveTo(margin, footerY)
      .lineTo(pageWidth - margin, footerY)
      .stroke();

    const footerNotice = `Computer-generated official fee receipt issued by ${data.organization.name || 'Institution'}${data.organization.branchName ? ` (${data.organization.branchName})` : ''}. Valid without physical seal. For questions or reconciliation, contact: ${data.organization.email || data.organization.phone || 'accounts desk'}.`;

    doc
      .fillColor(slateMuted)
      .font('Helvetica')
      .fontSize(7)
      .text(footerNotice, margin, footerY + 6, { width: contentWidth, align: 'center' });

    doc.end();
  });
}

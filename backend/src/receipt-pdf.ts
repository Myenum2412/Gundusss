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

  student: {
    studentId: string;
    studentName: string;
    phone?: string;
    email?: string;
    course?: string;
    group?: string;
    branch?: string;
    guardian?: string;
  };

  organization: {
    name: string;
    email?: string;
    phone?: string;
    website?: string;
    address?: string;
    city?: string;
    state?: string;
  };
}

export function generateReceiptPdf(data: ReceiptPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `Receipt-${data.receiptId}`,
        Author: data.organization.name || 'MyFees',
        Subject: `Fee Payment Receipt #${data.receiptId}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const primaryColor = '#1e3a8a'; // Deep Indigo/Navy
    const slateDark = '#0f172a';
    const slateMuted = '#64748b';
    const borderGray = '#e2e8f0';
    const cardBg = '#f8fafc';
    const paidGreen = '#059669';

    const pageWidth = 595.28;
    const margin = 40;
    const contentWidth = pageWidth - margin * 2; // 515.28

    // 1. Top Decorative Brand Bar
    doc.rect(0, 0, pageWidth, 6).fill(primaryColor);

    // 2. Header Area
    let y = 30;

    // Left: Organization Info
    doc
      .fillColor(primaryColor)
      .fontSize(18)
      .font('Helvetica-Bold')
      .text(data.organization.name || 'MyFees Education', margin, y);

    y += 24;
    doc
      .fillColor(slateMuted)
      .fontSize(9)
      .font('Helvetica');

    if (data.organization.address) {
      const loc = [
        data.organization.address,
        data.organization.city,
        data.organization.state,
      ]
        .filter(Boolean)
        .join(', ');
      doc.text(loc, margin, y);
      y += 13;
    }

    const orgContacts = [
      data.organization.phone ? `Phone: ${data.organization.phone}` : '',
      data.organization.email ? `Email: ${data.organization.email}` : '',
      data.organization.website ? `Web: ${data.organization.website}` : '',
    ]
      .filter(Boolean)
      .join('  |  ');

    if (orgContacts) {
      doc.text(orgContacts, margin, y);
      y += 13;
    }

    // Right: Receipt Heading & Status Box
    const rightX = 350;
    let rightY = 30;

    doc
      .fillColor(primaryColor)
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('FEE RECEIPT', rightX, rightY, { width: contentWidth - (rightX - margin), align: 'right' });

    rightY += 24;
    doc
      .fillColor(slateMuted)
      .fontSize(9)
      .font('Helvetica')
      .text(`Receipt #: ${data.receiptId}`, rightX, rightY, { width: contentWidth - (rightX - margin), align: 'right' });

    rightY += 13;
    doc
      .text(`Date: ${data.paymentDate || new Date().toISOString().slice(0, 10)}`, rightX, rightY, { width: contentWidth - (rightX - margin), align: 'right' });

    rightY += 16;
    // PAID badge
    const badgeW = 90;
    const badgeH = 20;
    const badgeX = pageWidth - margin - badgeW;
    doc
      .roundedRect(badgeX, rightY, badgeW, badgeH, 4)
      .fillAndStroke('#ecfdf5', '#a7f3d0');

    doc
      .fillColor(paidGreen)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(
        data.status?.toUpperCase() === 'PAID' ? 'STATUS: PAID' : `STATUS: ${data.status?.toUpperCase() || 'PAID'}`,
        badgeX,
        rightY + 4,
        { width: badgeW, align: 'center' }
      );

    // Separator line
    y = Math.max(y + 10, rightY + badgeH + 15);
    doc
      .strokeColor(borderGray)
      .lineWidth(1)
      .moveTo(margin, y)
      .lineTo(pageWidth - margin, y)
      .stroke();

    y += 15;

    // 3. Two Column Info Cards
    const cardWidth = (contentWidth - 15) / 2;
    const cardHeight = 115;

    // Left Card: Student Info
    doc.roundedRect(margin, y, cardWidth, cardHeight, 6).fillAndStroke(cardBg, borderGray);
    doc
      .fillColor(primaryColor)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('STUDENT INFORMATION', margin + 12, y + 10);

    let sY = y + 28;
    const sRows = [
      ['Student Name:', data.student.studentName || '—'],
      ['Student ID:', data.student.studentId || '—'],
      ['Course / Class:', [data.student.course, data.student.group].filter(Boolean).join(' · ') || '—'],
      ['Guardian:', data.student.guardian || '—'],
      ['Phone / Contact:', data.student.phone || '—'],
    ];

    for (const [label, val] of sRows) {
      doc.fillColor(slateMuted).font('Helvetica').fontSize(8.5).text(label, margin + 12, sY);
      doc
        .fillColor(slateDark)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .text(val, margin + 88, sY, { width: cardWidth - 95, ellipsis: true });
      sY += 15;
    }

    // Right Card: Payment Summary
    const rightCardX = margin + cardWidth + 15;
    doc.roundedRect(rightCardX, y, cardWidth, cardHeight, 6).fillAndStroke(cardBg, borderGray);
    doc
      .fillColor(primaryColor)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('PAYMENT DETAILS', rightCardX + 12, y + 10);

    let pY = y + 28;
    const numAmount = parseFloat(String(data.amount)) || 0;
    const formattedAmount = `INR ${numAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const pRows = [
      ['Receipt Number:', data.receiptId],
      ['Payment Method:', data.method || 'Cash / UPI'],
      ['Payment Date:', data.paymentDate || '—'],
      ['Reference / Order:', data.orderId || data.utr || 'Counter / Direct'],
      ['Total Paid:', formattedAmount],
    ];

    for (const [label, val] of pRows) {
      doc.fillColor(slateMuted).font('Helvetica').fontSize(8.5).text(label, rightCardX + 12, pY);
      doc
        .fillColor(label === 'Total Paid:' ? paidGreen : slateDark)
        .font(label === 'Total Paid:' ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8.5)
        .text(val, rightCardX + 96, pY, { width: cardWidth - 105, ellipsis: true });
      pY += 15;
    }

    y += cardHeight + 20;

    // 4. Breakdown Table
    doc
      .fillColor(primaryColor)
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('FEE PARTICULARS', margin, y);

    y += 16;

    // Table Header
    const colX = {
      sl: margin,
      desc: margin + 30,
      ref: margin + 280,
      amt: margin + 400,
    };
    const colW = {
      sl: 30,
      desc: 250,
      ref: 120,
      amt: contentWidth - 400,
    };

    doc.rect(margin, y, contentWidth, 22).fill('#f1f5f9');
    doc
      .fillColor('#334155')
      .font('Helvetica-Bold')
      .fontSize(8.5);

    doc.text('#', colX.sl + 6, y + 6);
    doc.text('DESCRIPTION / PARTICULARS', colX.desc, y + 6);
    doc.text('COURSE & BATCH', colX.ref, y + 6);
    doc.text('AMOUNT', colX.amt, y + 6, { width: colW.amt - 10, align: 'right' });

    y += 22;

    // Row 1
    doc.rect(margin, y, contentWidth, 26).fillAndStroke('#ffffff', borderGray);
    doc.fillColor(slateDark).font('Helvetica').fontSize(8.5);
    doc.text('1', colX.sl + 6, y + 8);

    const descText = data.notes && data.notes.trim()
      ? data.notes.trim()
      : `Fee payment for ${data.student.course || 'Academic Course'} (${data.student.group || 'Regular'})`;
    doc.text(descText, colX.desc, y + 8, { width: colW.desc - 10, ellipsis: true });

    const batchText = [data.student.course, data.student.group].filter(Boolean).join(' · ') || 'General';
    doc.text(batchText, colX.ref, y + 8, { width: colW.ref - 10, ellipsis: true });

    doc
      .font('Helvetica-Bold')
      .text(formattedAmount, colX.amt, y + 8, { width: colW.amt - 10, align: 'right' });

    y += 26;

    // Total Summary Box
    const totalBoxW = 200;
    const totalBoxX = pageWidth - margin - totalBoxW;
    const totalBoxH = 50;

    doc.rect(totalBoxX, y + 10, totalBoxW, totalBoxH).fillAndStroke(cardBg, borderGray);

    doc
      .fillColor(slateMuted)
      .font('Helvetica')
      .fontSize(9)
      .text('Total Amount Received:', totalBoxX + 12, y + 18);

    doc
      .fillColor(paidGreen)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(formattedAmount, totalBoxX + 12, y + 18, { width: totalBoxW - 24, align: 'right' });

    doc
      .fillColor(slateMuted)
      .font('Helvetica')
      .fontSize(8.5)
      .text('Balance Due:', totalBoxX + 12, y + 36);

    doc
      .fillColor(slateDark)
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text('INR 0.00', totalBoxX + 12, y + 36, { width: totalBoxW - 24, align: 'right' });

    y += totalBoxH + 35;

    // 5. Notes & Verification Banner
    const notesBoxH = 55;
    doc.roundedRect(margin, y, contentWidth, notesBoxH, 6).fillAndStroke('#f0fdf4', '#bbf7d0');

    doc
      .fillColor(paidGreen)
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .text('PAYMENT VERIFIED & CONFIRMED', margin + 14, y + 10);

    const confirmationNote = `This receipt acknowledges full receipt of ${formattedAmount} via ${data.method || 'electronic transfer'}. The enrolment record and fee structure for ${data.student.studentName} are marked updated and active.`;

    doc
      .fillColor('#166534')
      .font('Helvetica')
      .fontSize(8)
      .text(confirmationNote, margin + 14, y + 26, { width: contentWidth - 28 });

    y += notesBoxH + 30;

    // 6. Signatures Area
    const sigLineW = 140;
    const sigY = y + 25;

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
      .fontSize(8)
      .text('Student / Depositor Signature', margin, sigY + 5, { width: sigLineW, align: 'center' });

    // Right Signature: Accounts Desk
    const rightSigX = pageWidth - margin - sigLineW;
    doc
      .strokeColor(borderGray)
      .lineWidth(1)
      .moveTo(rightSigX, sigY)
      .lineTo(rightSigX + sigLineW, sigY)
      .stroke();

    doc
      .fillColor(slateMuted)
      .font('Helvetica')
      .fontSize(8)
      .text('Authorized Signatory (Accounts)', rightSigX, sigY + 5, { width: sigLineW, align: 'center' });

    // 7. Footer Notice
    const footerY = 790;
    doc
      .strokeColor(borderGray)
      .lineWidth(0.5)
      .moveTo(margin, footerY)
      .lineTo(pageWidth - margin, footerY)
      .stroke();

    doc
      .fillColor(slateMuted)
      .font('Helvetica')
      .fontSize(7.5)
      .text(
        'This is a computer-generated official payment receipt. Valid without physical signature. Questions? Contact accounts department.',
        margin,
        footerY + 8,
        { width: contentWidth, align: 'center' }
      );

    doc.end();
  });
}

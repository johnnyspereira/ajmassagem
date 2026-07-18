type ReceiptItem = {
  name: string;
  quantity: number;
  unitPrice?: number;
  discount?: number;
  taxRate?: number;
  taxAmount?: number;
  total: number;
};

type ReceiptPayment = {
  method: string;
  amount: number;
  paidAt: string;
  status?: string;
  reference?: string | null;
};

export type ReceiptDocument = {
  saleNumber: number;
  createdAt: string;
  completedAt?: string | null;
  currency: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  business: {
    name: string;
    logoUrl?: string | null;
    publicUrl?: string | null;
  };
  client: {
    name?: string | null;
    email?: string | null;
    taxId?: string | null;
    reference?: string | null;
  };
  items: ReceiptItem[];
  payments: ReceiptPayment[];
};

const METHODS: Record<string, string> = {
  cash: 'Dinheiro',
  card: 'Cartão',
  mb_way: 'MB Way',
  multibanco: 'Multibanco',
  bank_transfer: 'Transferência bancária',
  voucher: 'Voucher',
  client_credit: 'Cartão-saldo',
  other: 'Outro',
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(Number(value || 0));
}

function date(value: string) {
  return new Date(value).toLocaleString('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export async function downloadReceiptPdf(receipt: ReceiptDocument) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 18;
  const right = pageWidth - 18;
  const accent = '#f43f5e';
  const ink = '#172033';
  const muted = '#667085';

  doc.setFillColor(ink);
  doc.rect(0, 0, pageWidth, 34, 'F');
  doc.setFillColor(accent);
  doc.rect(0, 0, 6, 34, 'F');
  doc.setTextColor('#ffffff');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(receipt.business.name || 'Recibo', left, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('COMPROVATIVO DE PAGAMENTO', left, 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`RECIBO #${receipt.saleNumber}`, right, 17, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(date(receipt.completedAt || receipt.createdAt), right, 23, {
    align: 'right',
  });

  doc.setTextColor(ink);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE', left, 46);
  doc.setFont('helvetica', 'normal');
  doc.text(receipt.client.name || 'Consumidor final', left, 53);
  if (receipt.client.taxId) doc.text(`NIF: ${receipt.client.taxId}`, left, 59);
  if (receipt.client.email)
    doc.text(receipt.client.email, left, receipt.client.taxId ? 65 : 59);
  if (receipt.client.reference)
    doc.text(`Ref. cliente: ${receipt.client.reference}`, 110, 53);

  let y = 78;
  doc.setFillColor('#f2f4f7');
  doc.rect(left, y - 6, right - left, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DESCRIÇÃO', left + 2, y);
  doc.text('QTD.', 112, y, { align: 'right' });
  doc.text('IVA', 135, y, { align: 'right' });
  doc.text('TOTAL', right - 2, y, { align: 'right' });
  y += 9;
  doc.setFont('helvetica', 'normal');
  for (const item of receipt.items) {
    if (y > 235) {
      doc.addPage();
      y = 22;
    }
    const lines = doc.splitTextToSize(item.name, 75) as string[];
    doc.text(lines, left + 2, y);
    doc.text(String(item.quantity), 112, y, { align: 'right' });
    doc.text(`${Number(item.taxRate || 0).toLocaleString('pt-PT')}%`, 135, y, {
      align: 'right',
    });
    doc.text(money(item.total, receipt.currency), right - 2, y, {
      align: 'right',
    });
    y += Math.max(8, lines.length * 4.2 + 2);
    doc.setDrawColor('#eaecf0');
    doc.line(left, y - 4, right, y - 4);
  }

  if (y > 220) {
    doc.addPage();
    y = 22;
  }
  y += 4;
  const totalsX = 132;
  const totalRow = (label: string, value: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(label, totalsX, y);
    doc.text(money(value, receipt.currency), right - 2, y, { align: 'right' });
    y += 7;
  };
  totalRow('Subtotal', receipt.subtotal);
  if (receipt.discountAmount > 0)
    totalRow('Descontos', -receipt.discountAmount);
  totalRow('IVA incluído', receipt.taxAmount);
  totalRow('Total', receipt.totalAmount, true);
  totalRow('Pago', receipt.paidAmount, true);
  if (receipt.balanceDue > 0) totalRow('Pendente', receipt.balanceDue, true);

  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.text('PAGAMENTOS', left, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  for (const payment of receipt.payments.filter(
    (item) => item.status !== 'voided'
  )) {
    if (y > 258) {
      doc.addPage();
      y = 22;
    }
    doc.text(
      `${METHODS[payment.method] || payment.method} · ${date(payment.paidAt)}`,
      left,
      y
    );
    doc.text(money(payment.amount, receipt.currency), right - 2, y, {
      align: 'right',
    });
    y += 6;
  }

  doc.setDrawColor('#d0d5dd');
  doc.line(left, 274, right, 274);
  doc.setTextColor(muted);
  doc.setFontSize(7.5);
  doc.text(
    'Este documento comprova o pagamento registado no CRM e não substitui uma fatura fiscal.',
    left,
    280
  );
  doc.text(
    'A fatura fiscal pode ser solicitada no Portal do Cliente.',
    left,
    285
  );
  if (receipt.business.publicUrl)
    doc.text(receipt.business.publicUrl, right, 285, { align: 'right' });

  doc.save(`recibo-${receipt.saleNumber}.pdf`);
}

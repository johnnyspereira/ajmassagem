import { drawBrandMark, imageUrlToPng } from '@/lib/finance/pdf-design';
import type { FinanceVoucher } from '@/types';

type VoucherBrand = {
  name: string;
  logoUrl?: string | null;
  publicUrl?: string | null;
};

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
}

function formatAmount(value: number, currency: string) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(value);
}

function voucherValidationUrl(voucher: FinanceVoucher) {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : undefined;
  const pin = encodeURIComponent(voucher.pin_code || '');
  return `${origin || ''}/voucher/${encodeURIComponent(voucher.id)}?pin=${pin}`;
}

export async function downloadVoucherPdf(
  voucher: FinanceVoucher,
  brand: VoucherBrand
) {
  const [{ jsPDF }, QRCode, logo] = await Promise.all([
    import('jspdf'),
    import('qrcode'),
    imageUrlToPng(brand.logoUrl),
  ]);
  const document = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a5',
  });

  const width = document.internal.pageSize.getWidth();
  const height = document.internal.pageSize.getHeight();
  const recipient =
    voucher.recipient_name || voucher.owner?.name || 'Alguém especial';
  const validity = voucher.expires_at
    ? new Date(voucher.expires_at).toLocaleDateString('pt-PT')
    : 'Sem data limite';
  const validationUrl = voucherValidationUrl(voucher);
  const qrCode = await QRCode.toDataURL(validationUrl, {
    width: 600,
    margin: 2,
    color: { dark: '#111827', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });
  const isService = voucher.voucher_type === 'service';
  const headline = isService
    ? voucher.service?.name || 'Uma experiência especial'
    : formatAmount(Number(voucher.initial_balance), voucher.currency);
  const gold = '#d6b36a';
  const midnight = '#0b1020';
  const panel = '#151d33';
  const pale = '#cbd5e1';

  document.setFillColor(midnight);
  document.rect(0, 0, width, height, 'F');
  document.setFillColor('#111a31');
  document.circle(width - 10, 2, 59, 'F');
  document.setFillColor('#5f1634');
  document.circle(width + 1, 7, 39, 'F');
  document.setFillColor('#be123c');
  document.circle(-8, height + 6, 31, 'F');
  document.setDrawColor(gold);
  document.setLineWidth(0.45);
  document.roundedRect(9, 9, width - 18, height - 18, 4, 4, 'S');
  document.setLineWidth(0.15);
  document.roundedRect(11, 11, width - 22, height - 22, 3, 3, 'S');

  for (let radius = 19; radius <= 57; radius += 8) {
    document.setDrawColor('#29334c');
    document.circle(width - 9, 5, radius, 'S');
  }

  drawBrandMark(document, {
    name: brand.name,
    logo,
    x: 19,
    y: 18,
    size: 17,
    dark: true,
  });
  document.setTextColor('#ffffff');
  document.setFont('helvetica', 'bold');
  document.setFontSize(11);
  document.text(brand.name || 'Vale-presente', 42, 25);
  document.setFont('helvetica', 'normal');
  document.setTextColor(pale);
  document.setFontSize(6.5);
  document.text('SIGNATURE GIFT EXPERIENCE', 42, 31);

  document.setFillColor('#f8fafc');
  document.roundedRect(width - 66, 18, 47, 53, 4, 4, 'F');
  document.setFillColor('#ffffff');
  document.roundedRect(width - 60.5, 23, 36, 36, 2, 2, 'F');
  document.addImage(qrCode, 'PNG', width - 58.5, 25, 32, 32);
  document.setFont('helvetica', 'bold');
  document.setFontSize(6.2);
  document.setTextColor('#172033');
  document.text('LER · CONSULTAR · VALIDAR', width - 42.5, 65, {
    align: 'center',
  });

  document.setDrawColor(gold);
  document.setLineDashPattern([1.2, 1.2], 0);
  document.line(width - 74, 18, width - 74, height - 34);
  document.setLineDashPattern([], 0);
  document.setFillColor(midnight);
  document.circle(width - 74, 9, 3, 'F');
  document.circle(width - 74, height - 9, 3, 'F');

  document.setFillColor(gold);
  document.roundedRect(19, 45, isService ? 39 : 34, 7.5, 3.75, 3.75, 'F');
  document.setTextColor(midnight);
  document.setFont('helvetica', 'bold');
  document.setFontSize(6.2);
  document.text(isService ? 'VOUCHER DE SERVIÇO' : 'CARTÃO-PRESENTE', 23, 50);

  document.setTextColor('#ffffff');
  document.setFont('helvetica', 'bold');
  document.setFontSize(isService ? 20 : 31);
  const headlineLines = document.splitTextToSize(headline, 105) as string[];
  document.text(headlineLines.slice(0, 2), 19, 65);

  const recipientY = isService && headlineLines.length > 1 ? 85 : 80;
  document.setFont('helvetica', 'normal');
  document.setFontSize(6.5);
  document.setTextColor(gold);
  document.text('EXCLUSIVAMENTE PARA', 19, recipientY);
  document.setFont('helvetica', 'bold');
  document.setFontSize(15);
  document.setTextColor('#ffffff');
  document.text(
    (document.splitTextToSize(recipient, 101) as string[]).slice(0, 1),
    19,
    recipientY + 8
  );

  if (voucher.message) {
    document.setDrawColor('#35405a');
    document.line(19, recipientY + 13, 125, recipientY + 13);
    document.setFont('helvetica', 'italic');
    document.setFontSize(7.5);
    document.setTextColor(pale);
    const message = document.splitTextToSize(
      `“${voucher.message}”`,
      102
    ) as string[];
    document.text(message.slice(0, 2), 19, recipientY + 20);
  }

  const detailY = height - 32;
  document.setFillColor(panel);
  document.roundedRect(17, detailY, width - 34, 20, 3, 3, 'F');
  const columns = [
    { label: 'CÓDIGO', value: voucher.code, x: 23 },
    { label: 'PIN', value: voucher.pin_code || '—', x: 68 },
    { label: 'VALIDADE', value: validity, x: 93 },
    { label: 'UTILIZAÇÃO', value: 'Apresente este voucher', x: 136 },
  ];
  for (const column of columns) {
    document.setFont('helvetica', 'bold');
    document.setFontSize(6);
    document.setTextColor(gold);
    document.text(column.label, column.x, detailY + 7);
    document.setFontSize(8.5);
    document.setTextColor('#ffffff');
    document.text(column.value, column.x, detailY + 14);
  }

  document.setFont('helvetica', 'normal');
  document.setFontSize(6);
  document.setTextColor('#94a3b8');
  document.text(
    [
      brand.publicUrl,
      'Documento digital autenticável por QR Code',
      `Ref. ${voucher.code}`,
    ]
      .filter(Boolean)
      .join('   •   '),
    width / 2,
    height - 4.5,
    { align: 'center' }
  );

  document.setProperties({
    title: `Voucher ${voucher.code}`,
    subject: isService ? 'Voucher de serviço' : 'Cartão-presente',
    author: brand.name,
    creator: brand.name,
  });
  const filename = safeFilePart(`voucher-${recipient}-${voucher.code}`);
  document.save(`${filename || 'voucher'}.pdf`);
}

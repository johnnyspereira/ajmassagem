import type { FinanceVoucher } from '@/types';

type VoucherBrand = {
  name: string;
  logoUrl?: string | null;
  publicUrl?: string | null;
};

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
}

async function imageUrlToPng(url?: string | null) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = objectUrl;
      });
      const canvas = document.createElement('canvas');
      const size = 600;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.clearRect(0, 0, size, size);
      const scale = Math.min(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(
        image,
        (size - width) / 2,
        (size - height) / 2,
        width,
        height
      );
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

function formatAmount(value: number, currency: string) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(value);
}

export async function downloadVoucherPdf(
  voucher: FinanceVoucher,
  brand: VoucherBrand
) {
  const [{ jsPDF }, QRCode] = await Promise.all([
    import('jspdf'),
    import('qrcode'),
  ]);
  const document = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a5',
  });

  const width = document.internal.pageSize.getWidth();
  const height = document.internal.pageSize.getHeight();
  const ink = '#172033';
  const accent = '#f43f5e';
  const soft = '#fff1f2';
  const muted = '#667085';
  const recipient =
    voucher.recipient_name || voucher.owner?.name || 'Alguém especial';
  const validity = voucher.expires_at
    ? new Date(voucher.expires_at).toLocaleDateString('pt-PT')
    : 'Sem data limite';
  const qrPayload = `VOUCHER:${voucher.code}`;
  const [logo, qrCode] = await Promise.all([
    imageUrlToPng(brand.logoUrl),
    QRCode.toDataURL(qrPayload, {
      width: 500,
      margin: 1,
      color: { dark: ink, light: '#ffffff' },
      errorCorrectionLevel: 'H',
    }),
  ]);

  document.setFillColor(ink);
  document.rect(0, 0, width, height, 'F');
  document.setFillColor(accent);
  document.rect(0, 0, 7, height, 'F');

  document.setFillColor('#ffffff');
  document.roundedRect(14, 12, width - 28, height - 24, 4, 4, 'F');
  document.setFillColor(soft);
  document.roundedRect(width - 64, 20, 42, 42, 3, 3, 'F');
  document.addImage(qrCode, 'PNG', width - 59, 25, 32, 32);

  if (logo) {
    document.addImage(logo, 'PNG', 24, 20, 19, 19);
  } else {
    document.setFillColor(accent);
    document.circle(33.5, 29.5, 9.5, 'F');
    document.setTextColor('#ffffff');
    document.setFont('helvetica', 'bold');
    document.setFontSize(14);
    document.text(brand.name.slice(0, 2).toUpperCase(), 33.5, 31.5, {
      align: 'center',
    });
  }

  document.setTextColor(ink);
  document.setFont('helvetica', 'bold');
  document.setFontSize(12);
  document.text(brand.name || 'Vale-presente', 48, 27);
  document.setFont('helvetica', 'normal');
  document.setTextColor(muted);
  document.setFontSize(8);
  document.text('UMA EXPERIÊNCIA PARA OFERECER', 48, 33);

  document.setTextColor(accent);
  document.setFont('helvetica', 'bold');
  document.setFontSize(9);
  document.text(
    voucher.voucher_type === 'service'
      ? 'VOUCHER DE SERVIÇO'
      : 'CARTÃO-PRESENTE',
    24,
    52
  );
  document.setTextColor(ink);
  document.setFontSize(voucher.voucher_type === 'service' ? 18 : 28);
  document.text(
    voucher.voucher_type === 'service'
      ? document.splitTextToSize(
          voucher.service?.name || 'Uma experiência especial',
          105
        )
      : formatAmount(Number(voucher.initial_balance), voucher.currency),
    24,
    66
  );

  document.setFont('helvetica', 'normal');
  document.setFontSize(9);
  document.setTextColor(muted);
  document.text('Preparado especialmente para', 24, 77);
  document.setFont('helvetica', 'bold');
  document.setFontSize(14);
  document.setTextColor(ink);
  document.text(document.splitTextToSize(recipient, 98), 24, 85);

  if (voucher.message) {
    document.setFont('helvetica', 'italic');
    document.setFontSize(8.5);
    document.setTextColor(muted);
    const message = document.splitTextToSize(`“${voucher.message}”`, 104);
    document.text(message.slice(0, 2), 24, 98);
  }

  document.setDrawColor('#e4e7ec');
  document.line(24, height - 29, width - 24, height - 29);
  document.setFont('helvetica', 'normal');
  document.setFontSize(7.5);
  document.setTextColor(muted);
  document.text('CÓDIGO DO VOUCHER', 24, height - 20);
  document.text('PIN', 70, height - 20);
  document.text('VÁLIDO ATÉ', 92, height - 20);
  document.text('COMO UTILIZAR', 137, height - 20);
  document.setFont('helvetica', 'bold');
  document.setFontSize(10);
  document.setTextColor(ink);
  document.text(voucher.code, 24, height - 14);
  document.text(voucher.pin_code || '----', 70, height - 14);
  document.text(validity, 92, height - 14);
  document.setFontSize(8);
  document.text('Apresente o código e PIN.', 137, height - 14);

  const filename = safeFilePart(`voucher-${recipient}-${voucher.code}`);
  document.save(`${filename || 'voucher'}.pdf`);
}

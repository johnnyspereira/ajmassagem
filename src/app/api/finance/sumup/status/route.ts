import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function GET() {
  try {
    await requireRole('admin');
    const apiKey = process.env.SUMUP_API_KEY?.trim();
    const merchantCode = process.env.SUMUP_MERCHANT_CODE?.replace(/\s+/g, '').toUpperCase();
    const payToEmail = process.env.SUMUP_PAY_TO_EMAIL?.trim();
    return NextResponse.json({
      configured: Boolean(apiKey && merchantCode),
      payToEmailConfigured: Boolean(payToEmail),
      merchantCode: merchantCode ? `••••${merchantCode.slice(-4)}` : null,
      mode: apiKey?.startsWith('sumup_test_') ? 'test' : 'live',
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

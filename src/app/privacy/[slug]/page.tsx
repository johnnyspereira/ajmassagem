import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const metadata: Metadata = {
  title: 'Política de privacidade',
  robots: { index: true, follow: true },
};

export default async function PrivacyPolicyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = supabaseAdmin();
  const { data: portal } = await db
    .from('client_portal_settings')
    .select('account_id,account:accounts(name,logo_url)')
    .ilike('slug', slug.trim())
    .maybeSingle();
  if (!portal) notFound();
  const { data: privacy } = await db
    .from('privacy_settings')
    .select('*')
    .eq('account_id', portal.account_id)
    .maybeSingle();
  const account = Array.isArray(portal.account)
    ? portal.account[0]
    : portal.account;
  const name =
    privacy?.controller_name || account?.name || 'Responsável pelo tratamento';
  const purposes = [
    [
      'Agendamento e prestação dos serviços',
      'Execução do contrato e diligências pré-contratuais.',
    ],
    [
      'Faturação, pagamentos, packs e vouchers',
      'Execução do contrato e cumprimento de obrigações legais.',
    ],
    [
      'Comunicações operacionais',
      'Execução do serviço e interesses legítimos, respeitando as suas escolhas de canal.',
    ],
    [
      'Marketing e campanhas',
      'Consentimento, que pode ser retirado a qualquer momento.',
    ],
    [
      'Anamnese e segurança do atendimento',
      'Consentimento explícito para dados de saúde e prestação segura do serviço.',
    ],
    [
      'Indique e Ganhe',
      'Execução do programa e consentimento para contactar a pessoa indicada.',
    ],
  ];
  return (
    <main className="bg-muted/30 min-h-screen px-4 py-10">
      <article className="border-border bg-background mx-auto max-w-3xl rounded-2xl border p-6 shadow-sm md:p-10">
        <header className="border-border flex items-center gap-4 border-b pb-6">
          <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-xl">
            <ShieldCheck />
          </span>
          <div>
            <p className="text-muted-foreground text-sm">{name}</p>
            <h1 className="text-2xl font-bold">Política de privacidade</h1>
            <p className="text-muted-foreground text-xs">
              Versão {privacy?.privacy_notice_version || '1.0'} · atualizada em{' '}
              {new Date(privacy?.updated_at || 0).toLocaleDateString('pt-PT')}
            </p>
          </div>
        </header>
        <section className="mt-7 space-y-6 text-sm leading-6">
          <Policy title="Responsável pelo tratamento">
            {name}
            {privacy?.controller_address
              ? `, ${privacy.controller_address}`
              : ''}
            . Contacto: {privacy?.controller_email || 'a disponibilizar'}
            {privacy?.dpo_email ? `. EPD/DPO: ${privacy.dpo_email}` : ''}.
          </Policy>
          <Policy title="Dados e finalidades">
            <div className="space-y-3">
              {purposes.map(([title, text]) => (
                <div key={title}>
                  <strong>{title}:</strong> {text}
                </div>
              ))}
            </div>
          </Policy>
          <Policy title="Conservação">
            Clientes: {privacy?.contact_retention_months ?? 60} meses; anamnese:{' '}
            {privacy?.health_retention_months ?? 60} meses; comunicações:{' '}
            {privacy?.communication_retention_months ?? 24} meses; documentos
            financeiros: {privacy?.finance_retention_months ?? 120} meses, sem
            prejuízo de obrigações legais superiores.
          </Policy>
          <Policy title="Destinatários e transferências">
            Os dados só são partilhados com profissionais autorizados e
            fornecedores necessários ao serviço, sujeitos a deveres de
            confidencialidade e proteção de dados.{' '}
            {privacy?.international_transfers ||
              'Eventuais transferências internacionais dependem de mecanismo legal adequado.'}
          </Policy>
          <Policy title="Os seus direitos">
            Pode pedir acesso, retificação, apagamento, limitação, oposição e
            portabilidade no Portal 360 ou através de{' '}
            {privacy?.controller_email || 'contacto do responsável'}. O
            consentimento pode ser retirado sem afetar o tratamento anterior. A
            identidade poderá ser verificada.
          </Policy>
          <Policy title="Reclamações">
            Pode reclamar junto da{' '}
            {privacy?.complaint_authority ||
              'Comissão Nacional de Proteção de Dados (CNPD)'}
            .
          </Policy>
          <Policy title="Segurança e incidentes">
            Aplicamos controlo de acessos, auditoria, cópias de segurança e
            medidas proporcionais ao risco. Incidentes são avaliados e
            comunicados quando legalmente exigido.
          </Policy>
        </section>
      </article>
    </main>
  );
}
function Policy({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="text-muted-foreground">{children}</div>
    </section>
  );
}

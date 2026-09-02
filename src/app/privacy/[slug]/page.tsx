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
  const updatedLabel = privacy?.updated_at
    ? ` · atualizada em ${new Date(privacy.updated_at).toLocaleDateString('pt-PT')}`
    : '';
  const purposes = [
    [
      'Agendamento e prestação dos serviços',
      'Execução do contrato e diligências pré-contratuais (artigo 6.º, n.º 1, alínea b) do RGPD).',
    ],
    [
      'Faturação, pagamentos, packs e vouchers',
      'Execução do contrato e cumprimento de obrigações legais (artigo 6.º, n.º 1, alíneas b) e c) do RGPD).',
    ],
    [
      'Comunicações operacionais',
      'Execução do contrato quando necessárias à marcação ou ao serviço (artigo 6.º, n.º 1, alínea b) do RGPD). Não são usadas como autorização para campanhas.',
    ],
    [
      'Marketing e campanhas',
      'Consentimento específico para cada canal (artigo 6.º, n.º 1, alínea a) do RGPD e artigo 13.º-A da Lei n.º 41/2004), que pode ser retirado a qualquer momento.',
    ],
    [
      'Anamnese e segurança do atendimento',
      'Consentimento e consentimento explícito para dados de saúde (artigo 6.º, n.º 1, alínea a), e artigo 9.º, n.º 2, alínea a) do RGPD).',
    ],
    [
      'Indique e Ganhe',
      'Registo mínimo da indicação e execução das condições do programa após adesão. O envio de campanhas ao amigo depende do consentimento do próprio.',
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
              Versão {privacy?.privacy_notice_version || '1.0'}
              {updatedLabel}
            </p>
          </div>
        </header>
        <section className="mt-7 space-y-6 text-sm leading-6">
          <Policy title="Responsável pelo tratamento">
            {name}
            {privacy?.controller_tax_id
              ? `, NIF/NIPC ${privacy.controller_tax_id}`
              : ''}
            {privacy?.controller_address
              ? `, ${privacy.controller_address}`
              : ''}
            . Contacto: {privacy?.controller_email || 'a disponibilizar'}
            {privacy?.dpo_email
              ? `. EPD/DPO: ${privacy.dpo_email}`
              : '. Não existe EPD/DPO designado'}
            .
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

type PortalForm = {
  status: string;
  appointment?:
    { status?: string | null } | { status?: string | null }[] | null;
};

/** Match the public link rule: unfinished forms cannot be filled after the session is completed. */
export function portalAnamnesisStatus(form: PortalForm) {
  const appointment = Array.isArray(form.appointment)
    ? form.appointment[0]
    : form.appointment;
  return form.status === 'pending' && appointment?.status === 'completed'
    ? 'revoked'
    : form.status;
}

export function portalAnamnesisLabel(status: string) {
  return (
    (
      {
        pending: 'A preencher',
        submitted: 'Enviada',
        reviewed: 'Revista pela equipa',
        expired: 'Expirada',
        revoked: 'Cancelada',
      } as Record<string, string>
    )[status] || status
  );
}

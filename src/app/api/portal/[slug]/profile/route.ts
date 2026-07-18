import sharp from 'sharp';

import {
  PortalError,
  portalErrorResponse,
  requirePortalAccess,
} from '@/lib/portal/server';
import { isValidE164 } from '@/lib/whatsapp/phone-utils';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function text(value: unknown, max: number) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, max) : null;
}

function boolean(value: unknown) {
  return value === true;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, settings, access } = await requirePortalAccess(slug);
    if (settings.profile_edit_enabled === false) {
      throw new PortalError('A edição do perfil está desativada.', 403);
    }
    const body = (await request.json()) as Record<string, unknown>;
    const name = text(body.name, 120);
    const phone = text(body.phone, 30);
    if (!name) throw new PortalError('Informe o seu nome.', 400);
    if (!phone || !isValidE164(phone.replace(/\s/g, ''))) {
      throw new PortalError(
        'Informe um telefone válido com indicativo do país.',
        400
      );
    }

    const birthDate = text(body.birthDate, 10);
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      throw new PortalError('A data de nascimento é inválida.', 400);
    }
    const gender = text(body.gender, 24);
    if (
      gender &&
      !['male', 'female', 'non_binary', 'not_informed'].includes(gender)
    ) {
      throw new PortalError('A opção de género é inválida.', 400);
    }
    const preferredContact = text(body.preferredContact, 20);
    if (
      preferredContact &&
      !['whatsapp', 'phone', 'email'].includes(preferredContact)
    ) {
      throw new PortalError('O canal preferido é inválido.', 400);
    }

    const { data, error } = await admin
      .from('contacts')
      .update({
        name,
        phone,
        company: text(body.company, 160),
        birth_date: birthDate,
        tax_id: text(body.taxId, 40),
        gender,
        address_line: text(body.addressLine, 240),
        postal_code: text(body.postalCode, 30),
        city: text(body.city, 120),
        country: text(body.country, 80) || 'Portugal',
        preferred_contact: preferredContact || 'whatsapp',
        marketing_consent: boolean(body.marketingConsent),
        whatsapp_consent: boolean(body.whatsappConsent),
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', access.account_id)
      .eq('id', access.contact_id)
      .select(
        'id,name,email,phone,company,avatar_url,client_reference,birth_date,tax_id,gender,address_line,postal_code,city,country,preferred_contact,marketing_consent,whatsapp_consent'
      )
      .single();
    if (error) {
      if (error.code === '23505') {
        throw new PortalError('Este telefone já pertence a outra ficha.', 409);
      }
      throw error;
    }
    return Response.json({ client: data });
  } catch (error) {
    return portalErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, settings, access, user } = await requirePortalAccess(slug);
    if (settings.profile_edit_enabled === false) {
      throw new PortalError('A edição do perfil está desativada.', 403);
    }
    const form = await request.formData();
    const file = form.get('avatar');
    if (!(file instanceof File))
      throw new PortalError('Selecione uma fotografia.', 400);
    if (!AVATAR_TYPES.has(file.type) || file.size > MAX_AVATAR_BYTES) {
      throw new PortalError(
        'Use uma imagem JPG, PNG, WebP ou GIF com até 2 MB.',
        400
      );
    }

    const optimized = await sharp(Buffer.from(await file.arrayBuffer()), {
      animated: false,
    })
      .rotate()
      .resize(512, 512, { fit: 'cover', position: 'attention' })
      .webp({ quality: 84 })
      .toBuffer();
    const path = `${user.id}/client-${access.contact_id}-${Date.now()}.webp`;
    const { error: uploadError } = await admin.storage
      .from('avatars')
      .upload(path, optimized, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: false,
      });
    if (uploadError) throw uploadError;
    const { data: publicData } = admin.storage
      .from('avatars')
      .getPublicUrl(path);
    const { error: updateError } = await admin
      .from('contacts')
      .update({
        avatar_url: publicData.publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', access.account_id)
      .eq('id', access.contact_id);
    if (updateError) {
      await admin.storage.from('avatars').remove([path]);
      throw updateError;
    }
    return Response.json({ avatarUrl: publicData.publicUrl });
  } catch (error) {
    return portalErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, settings, access } = await requirePortalAccess(slug);
    if (settings.profile_edit_enabled === false) {
      throw new PortalError('A edição do perfil está desativada.', 403);
    }
    const { error } = await admin
      .from('contacts')
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq('account_id', access.account_id)
      .eq('id', access.contact_id);
    if (error) throw error;
    return Response.json({ avatarUrl: null });
  } catch (error) {
    return portalErrorResponse(error);
  }
}

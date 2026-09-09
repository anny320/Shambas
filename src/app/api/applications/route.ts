import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { intakeSchema } from '@/lib/validation/application';
import type { Application, AppUser, Farmer } from '@/lib/types/database';

/**
 * Creates a farmer and a submitted application for the caller's institution.
 *
 * Everything the form validated is validated again here. institution_id and
 * created_by are taken from the session and never from the request body, and
 * the consent timestamp comes from the server clock, so a crafted request
 * cannot plant a row in another tenant or backdate consent.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from('users')
    .select('id, institution_id, email, role, created_at')
    .eq('id', user.id)
    .maybeSingle<AppUser>();

  if (!membership) {
    return NextResponse.json(
      { error: 'Your account is not linked to an institution yet.' },
      { status: 403 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const parsed = intakeSchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: first?.message ?? 'The application is not valid.',
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }

  const values = parsed.data;

  const { data: farmer, error: farmerError } = await supabase
    .from('farmers')
    .insert({
      institution_id: membership.institution_id,
      name: values.farmerName,
      phone: values.phone,
      location_lat: values.locationLat,
      location_lng: values.locationLng,
      farm_size_ha: values.farmSizeHa,
      primary_crop: values.primaryCrop,
      created_by: user.id,
    })
    .select('id')
    .single<Pick<Farmer, 'id'>>();

  if (farmerError || !farmer) {
    // The unique index on (institution_id, phone) is the common case here.
    const duplicate = farmerError?.code === '23505';
    return NextResponse.json(
      {
        error: duplicate
          ? 'A farmer with this phone number is already enrolled at your institution.'
          : 'Could not save the farmer.',
      },
      { status: duplicate ? 409 : 500 },
    );
  }

  const { data: application, error: applicationError } = await supabase
    .from('applications')
    .insert({
      institution_id: membership.institution_id,
      farmer_id: farmer.id,
      status: 'submitted',
      consent_given: true,
      consent_at: new Date().toISOString(),
      created_by: user.id,
    })
    .select('id, status')
    .single<Pick<Application, 'id' | 'status'>>();

  if (applicationError || !application) {
    // Leave no orphan farmer behind if the application could not be created.
    await supabase.from('farmers').delete().eq('id', farmer.id);
    return NextResponse.json(
      { error: 'Could not save the application.' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { id: application.id, status: application.status },
    { status: 201 },
  );
}

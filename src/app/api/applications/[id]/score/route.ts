import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { collectFeatures } from '@/adapters';
import { score } from '@/scoring/score';
import type { Application, AppUser, Farmer } from '@/lib/types/database';

/**
 * Scores one application.
 *
 * The shape here is the whole architecture in miniature: adapters fetch and
 * normalise, score() decides, and this handler only moves data between them
 * and the database. No scoring logic lives in this file, and none should.
 *
 * The full feature bundle is stored with the result. A score you cannot trace
 * back to its inputs is not auditable, and auditability is the thing an
 * institution is buying.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  // Row Level Security means an application belonging to another institution
  // simply is not here, so this doubles as the authorisation check.
  const { data: application } = await supabase
    .from('applications')
    .select('id, institution_id, farmer_id, status, consent_given, consent_at')
    .eq('id', id)
    .maybeSingle<
      Pick<
        Application,
        | 'id'
        | 'institution_id'
        | 'farmer_id'
        | 'status'
        | 'consent_given'
        | 'consent_at'
      >
    >();

  if (!application) {
    return NextResponse.json(
      { error: 'Application not found.' },
      { status: 404 },
    );
  }

  /*
   * Consent gates processing, not just storage. Kenya's Data Protection Act
   * makes consent the lawful basis for using this farmer's data, so an
   * application without it must not be scored even though the row exists.
   */
  if (!application.consent_given) {
    return NextResponse.json(
      {
        error:
          'This application has no recorded consent, so it cannot be scored.',
      },
      { status: 409 },
    );
  }

  if (application.status === 'approved' || application.status === 'declined') {
    return NextResponse.json(
      { error: 'This application has already been decided.' },
      { status: 409 },
    );
  }

  const { data: farmer } = await supabase
    .from('farmers')
    .select('id, location_lat, location_lng, farm_size_ha, primary_crop')
    .eq('id', application.farmer_id)
    .maybeSingle<
      Pick<
        Farmer,
        'id' | 'location_lat' | 'location_lng' | 'farm_size_ha' | 'primary_crop'
      >
    >();

  if (!farmer) {
    return NextResponse.json({ error: 'Farmer not found.' }, { status: 404 });
  }

  const bundle = await collectFeatures({
    farmerId: farmer.id,
    latitude: farmer.location_lat,
    longitude: farmer.location_lng,
    farmSizeHa: Number(farmer.farm_size_ha),
    primaryCrop: farmer.primary_crop,
    asOf: new Date(),
  });

  const result = score(bundle);

  const { data: saved, error: saveError } = await supabase
    .from('scores')
    .insert({
      institution_id: membership.institution_id,
      application_id: application.id,
      score: result.score,
      band: result.band,
      pd: result.probabilityOfDefault,
      confidence: result.confidence.level,
      confidence_value: result.confidence.evidence,
      recommended_amount: result.terms?.amountKes ?? null,
      recommended_term_months: result.terms?.termMonths ?? null,
      factors: result.factors,
      warnings: result.warnings,
      feature_snapshot: {
        context: { ...bundle.context, asOf: bundle.context.asOf.toISOString() },
        satellite: bundle.satellite,
        weather: bundle.weather,
        mobileMoney: bundle.mobileMoney,
        familyScores: result.familyScores,
        confidenceReasons: result.confidence.reasons,
        terms: result.terms,
      },
      model_version: result.modelVersion,
      scored_by: user.id,
    })
    .select('id')
    .single<{ id: string }>();

  if (saveError || !saved) {
    return NextResponse.json(
      { error: 'Scored, but the result could not be saved.' },
      { status: 500 },
    );
  }

  // Only move a submitted application forward. A re-score of something
  // already scored leaves the status where it is.
  if (application.status === 'submitted') {
    await supabase
      .from('applications')
      .update({ status: 'scored' })
      .eq('id', application.id);
  }

  return NextResponse.json({ scoreId: saved.id, result }, { status: 201 });
}

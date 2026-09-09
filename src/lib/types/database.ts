/**
 * Hand-written row types for the tables in supabase/migrations.
 *
 * Kept by hand rather than generated so the repo stays runnable without a
 * live Supabase project. If these drift from the migrations, the migrations
 * are the source of truth.
 */

export type UserRole = 'officer' | 'head_of_credit' | 'admin';

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'scored'
  | 'approved'
  | 'declined';

export type DecisionType = 'approve' | 'decline';

export interface Institution {
  id: string;
  name: string;
  created_at: string;
}

export interface AppUser {
  id: string;
  institution_id: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface Farmer {
  id: string;
  institution_id: string;
  name: string;
  phone: string;
  location_lat: number;
  location_lng: number;
  farm_size_ha: number;
  primary_crop: string;
  created_by: string;
  created_at: string;
}

export interface Application {
  id: string;
  institution_id: string;
  farmer_id: string;
  status: ApplicationStatus;
  consent_given: boolean;
  consent_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Decision {
  id: string;
  institution_id: string;
  application_id: string;
  decision: DecisionType;
  loan_amount: number | null;
  loan_term: number | null;
  officer_notes: string | null;
  input_snapshot: Record<string, unknown>;
  decided_by: string;
  decided_at: string;
}

/** An application joined to its farmer, as the list and detail views need it. */
export interface ApplicationWithFarmer extends Application {
  farmer: Pick<
    Farmer,
    | 'id'
    | 'name'
    | 'phone'
    | 'primary_crop'
    | 'farm_size_ha'
    | 'location_lat'
    | 'location_lng'
  >;
}

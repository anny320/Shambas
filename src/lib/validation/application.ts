import { z } from 'zod';

/**
 * Intake validation, shared by the form and the route handler.
 *
 * The route handler revalidates everything the form checks. The form is a
 * convenience for the officer; the server is the boundary that decides.
 *
 * DATA MINIMISATION: this schema is the full set of fields collected about a
 * farmer. There is deliberately no national ID, government ID, or financial
 * account number, and none should be added.
 */

/** Kenyan mobile numbers in E.164, e.g. +254712345678. */
export const KENYAN_PHONE = /^\+254[17][0-9]{8}$/;

/**
 * Rough bounding box for Kenya. A pin outside it is far more likely to be a
 * mis-drag than a real farm, so it is rejected rather than scored.
 */
export const KENYA_BOUNDS = {
  minLat: -4.9,
  maxLat: 5.1,
  minLng: 33.8,
  maxLng: 41.95,
} as const;

/** Crops the mock and live adapters carry regional norms for. */
export const PRIMARY_CROPS = [
  'maize',
  'beans',
  'sorghum',
  'potato',
  'tea',
  'coffee',
  'horticulture',
  'other',
] as const;

export type PrimaryCrop = (typeof PRIMARY_CROPS)[number];

/**
 * Accepts the shapes an officer actually types — 0712345678, 254712345678,
 * spaces and dashes — and returns E.164. Returns null when it cannot.
 */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, '');

  let candidate: string;
  if (digits.startsWith('+254')) candidate = digits;
  else if (digits.startsWith('254')) candidate = `+${digits}`;
  else if (digits.startsWith('0')) candidate = `+254${digits.slice(1)}`;
  else if (/^[17][0-9]{8}$/.test(digits)) candidate = `+254${digits}`;
  else return null;

  return KENYAN_PHONE.test(candidate) ? candidate : null;
}

export const intakeSchema = z.object({
  farmerName: z
    .string()
    .trim()
    .min(2, 'Enter the farmer’s full name.')
    .max(200, 'Name is too long.'),

  phone: z
    .string()
    .trim()
    .min(1, 'Enter a phone number.')
    .transform((value, ctx) => {
      const normalised = normalisePhone(value);
      if (!normalised) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Enter a Kenyan mobile number, for example 0712345678 or +254712345678.',
        });
        return z.NEVER;
      }
      return normalised;
    }),

  locationLat: z
    .number()
    .min(KENYA_BOUNDS.minLat, 'Place the pin inside Kenya.')
    .max(KENYA_BOUNDS.maxLat, 'Place the pin inside Kenya.'),

  locationLng: z
    .number()
    .min(KENYA_BOUNDS.minLng, 'Place the pin inside Kenya.')
    .max(KENYA_BOUNDS.maxLng, 'Place the pin inside Kenya.'),

  farmSizeHa: z
    .number()
    .positive('Farm size must be greater than zero.')
    .max(1000, 'Farm size looks wrong. Enter the size in hectares.'),

  primaryCrop: z.enum(PRIMARY_CROPS, {
    message: 'Choose the main crop grown on this farm.',
  }),

  /*
   * Consent is not a checkbox that defaults true. It must be literally true,
   * and the timestamp is set server-side from the clock, never from the
   * client, so the audit trail cannot be backdated.
   */
  consentGiven: z.literal(true, {
    message:
      'The farmer must consent before an application can be submitted.',
  }),
});

export type IntakeInput = z.input<typeof intakeSchema>;
export type IntakeValues = z.output<typeof intakeSchema>;

/** The consent wording shown at intake and stored with the decision. */
export const CONSENT_TEXT =
  'The farmer has been told, in a language they understand, that ' +
  'Shamba Score will use their farm location, farm details, satellite and ' +
  'weather data for that location, and — where they separately authorise it — ' +
  'a summary of their mobile-money activity, for the sole purpose of ' +
  'assessing this credit application. They consent to that use, and they ' +
  'have been told they may withdraw consent and request their data at any ' +
  'time.';

import { describe, expect, it } from 'vitest';
import {
  KENYA_BOUNDS,
  intakeSchema,
  normalisePhone,
} from '@/lib/validation/application';

const validIntake = {
  farmerName: 'Wanjiku Kamau',
  phone: '0712345678',
  locationLat: -0.4237,
  locationLng: 36.9476,
  farmSizeHa: 1.2,
  primaryCrop: 'maize',
  consentGiven: true,
} as const;

describe('normalisePhone', () => {
  it('accepts the shapes an officer actually types', () => {
    const expected = '+254712345678';
    expect(normalisePhone('0712345678')).toBe(expected);
    expect(normalisePhone('254712345678')).toBe(expected);
    expect(normalisePhone('+254712345678')).toBe(expected);
    expect(normalisePhone('712345678')).toBe(expected);
    expect(normalisePhone('+254 712 345 678')).toBe(expected);
    expect(normalisePhone('0712-345-678')).toBe(expected);
  });

  it('handles the 01 prefix range', () => {
    expect(normalisePhone('0112345678')).toBe('+254112345678');
  });

  it('rejects numbers that are not Kenyan mobiles', () => {
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone('0812345678')).toBeNull(); // not a mobile prefix
    expect(normalisePhone('071234567')).toBeNull(); // too short
    expect(normalisePhone('07123456789')).toBeNull(); // too long
    expect(normalisePhone('+44712345678')).toBeNull(); // wrong country
    expect(normalisePhone('not a phone')).toBeNull();
  });
});

describe('intakeSchema', () => {
  it('accepts a complete application and normalises the phone', () => {
    const result = intakeSchema.safeParse(validIntake);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe('+254712345678');
      expect(result.data.farmerName).toBe('Wanjiku Kamau');
    }
  });

  it('trims surrounding whitespace from the name', () => {
    const result = intakeSchema.safeParse({
      ...validIntake,
      farmerName: '  Wanjiku Kamau  ',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.farmerName).toBe('Wanjiku Kamau');
  });

  it('refuses to submit without consent', () => {
    for (const consentGiven of [false, undefined, null, 'yes', 1]) {
      const result = intakeSchema.safeParse({ ...validIntake, consentGiven });
      expect(result.success, `consent ${String(consentGiven)}`).toBe(false);
    }
  });

  it('rejects a pin outside Kenya', () => {
    // Kampala, Uganda.
    const outside = intakeSchema.safeParse({
      ...validIntake,
      locationLat: 0.3476,
      locationLng: 32.5825,
    });
    expect(outside.success).toBe(false);

    // The corners of the accepted box are still inside it.
    for (const [lat, lng] of [
      [KENYA_BOUNDS.minLat, KENYA_BOUNDS.minLng],
      [KENYA_BOUNDS.maxLat, KENYA_BOUNDS.maxLng],
    ] as const) {
      const corner = intakeSchema.safeParse({
        ...validIntake,
        locationLat: lat,
        locationLng: lng,
      });
      expect(corner.success, `corner ${lat},${lng}`).toBe(true);
    }
  });

  it('rejects impossible farm sizes', () => {
    for (const farmSizeHa of [0, -1, 1001, Number.NaN]) {
      const result = intakeSchema.safeParse({ ...validIntake, farmSizeHa });
      expect(result.success, `size ${farmSizeHa}`).toBe(false);
    }
  });

  it('rejects a crop outside the supported list', () => {
    const result = intakeSchema.safeParse({
      ...validIntake,
      primaryCrop: 'khat',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a name that is too short to be real', () => {
    const result = intakeSchema.safeParse({ ...validIntake, farmerName: 'A' });
    expect(result.success).toBe(false);
  });
});

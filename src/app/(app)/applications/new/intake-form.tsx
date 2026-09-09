'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  CONSENT_TEXT,
  KENYA_BOUNDS,
  PRIMARY_CROPS,
  intakeSchema,
  type PrimaryCrop,
} from '@/lib/validation/application';

// Leaflet touches window on import, so it can only load in the browser.
const FarmMap = dynamic(() => import('@/components/farm-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 items-center justify-center rounded-md border border-soil-100 bg-white text-sm text-soil-700">
      Loading map…
    </div>
  ),
});

type FieldErrors = Partial<Record<string, string>>;

const CROP_LABELS: Record<PrimaryCrop, string> = {
  maize: 'Maize',
  beans: 'Beans',
  sorghum: 'Sorghum',
  potato: 'Potato',
  tea: 'Tea',
  coffee: 'Coffee',
  horticulture: 'Horticulture',
  other: 'Other',
};

export function IntakeForm() {
  const router = useRouter();

  const [farmerName, setFarmerName] = useState('');
  const [phone, setPhone] = useState('');
  const [farmSizeHa, setFarmSizeHa] = useState('');
  const [primaryCrop, setPrimaryCrop] = useState<PrimaryCrop | ''>('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [locating, setLocating] = useState(false);

  function useDeviceLocation() {
    if (!('geolocation' in navigator)) {
      setFormError('This device cannot report its location.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setFormError(
          'Could not read this device’s location. Place the pin by hand instead.',
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const parsed = intakeSchema.safeParse({
      farmerName,
      phone,
      locationLat: lat,
      locationLng: lng,
      farmSizeHa: farmSizeHa === '' ? Number.NaN : Number(farmSizeHa),
      primaryCrop,
      consentGiven,
    });

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && !fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      // A missing pin produces an error on latitude, which is not a field the
      // officer can see. Say what they actually need to do.
      if (lat === null || lng === null) {
        fieldErrors['locationLat'] = 'Tap the map to place the farm pin.';
      }
      setErrors(fieldErrors);
      return;
    }

    setPending(true);
    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      const body: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof body === 'object' &&
          body !== null &&
          'error' in body &&
          typeof (body as { error: unknown }).error === 'string'
            ? (body as { error: string }).error
            : 'Could not save the application.';
        setFormError(message);
        setPending(false);
        return;
      }

      router.push('/applications');
      router.refresh();
    } catch {
      setFormError('Could not reach the server. Check your connection.');
      setPending(false);
    }
  }

  const field =
    'mt-1 w-full rounded-md border border-soil-100 px-3 py-2 text-sm outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-100';

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      <section className="rounded-xl border border-soil-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Farmer</h2>
        <p className="mt-1 text-sm text-soil-700">
          Only what the assessment needs. Do not record a national ID or any
          account number here.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="farmerName" className="block text-sm font-medium">
              Full name
            </label>
            <input
              id="farmerName"
              value={farmerName}
              onChange={(e) => setFarmerName(e.target.value)}
              className={field}
              aria-invalid={Boolean(errors['farmerName'])}
            />
            {errors['farmerName'] && (
              <p className="mt-1 text-sm text-red-700">{errors['farmerName']}</p>
            )}
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium">
              Mobile number
            </label>
            <input
              id="phone"
              inputMode="tel"
              placeholder="0712345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={field}
              aria-invalid={Boolean(errors['phone'])}
            />
            {errors['phone'] && (
              <p className="mt-1 text-sm text-red-700">{errors['phone']}</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-soil-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Farm</h2>
        <p className="mt-1 text-sm text-soil-700">
          Tap the map where the farm is, or drag the pin to adjust. The
          location drives the satellite and weather signals.
        </p>

        <div className="mt-4">
          <FarmMap
            lat={lat}
            lng={lng}
            onChange={(nextLat, nextLng) => {
              setLat(nextLat);
              setLng(nextLng);
              setErrors((prev) => ({ ...prev, locationLat: undefined }));
            }}
          />

          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <button
              type="button"
              onClick={useDeviceLocation}
              disabled={locating}
              className="rounded-md border border-soil-100 px-2.5 py-1 hover:bg-soil-50 disabled:opacity-60"
            >
              {locating ? 'Locating…' : 'Use this device’s location'}
            </button>
            <span className="text-soil-700">
              {lat !== null && lng !== null
                ? `Pin at ${lat.toFixed(5)}, ${lng.toFixed(5)}`
                : 'No pin placed yet'}
            </span>
          </div>

          {errors['locationLat'] && (
            <p className="mt-1 text-sm text-red-700">{errors['locationLat']}</p>
          )}
          {errors['locationLng'] && (
            <p className="mt-1 text-sm text-red-700">{errors['locationLng']}</p>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="farmSizeHa" className="block text-sm font-medium">
              Farm size (hectares)
            </label>
            <input
              id="farmSizeHa"
              inputMode="decimal"
              placeholder="1.2"
              value={farmSizeHa}
              onChange={(e) => setFarmSizeHa(e.target.value)}
              className={field}
              aria-invalid={Boolean(errors['farmSizeHa'])}
            />
            {errors['farmSizeHa'] && (
              <p className="mt-1 text-sm text-red-700">{errors['farmSizeHa']}</p>
            )}
          </div>

          <div>
            <label htmlFor="primaryCrop" className="block text-sm font-medium">
              Main crop
            </label>
            <select
              id="primaryCrop"
              value={primaryCrop}
              onChange={(e) => setPrimaryCrop(e.target.value as PrimaryCrop)}
              className={field}
              aria-invalid={Boolean(errors['primaryCrop'])}
            >
              <option value="">Choose a crop…</option>
              {PRIMARY_CROPS.map((crop) => (
                <option key={crop} value={crop}>
                  {CROP_LABELS[crop]}
                </option>
              ))}
            </select>
            {errors['primaryCrop'] && (
              <p className="mt-1 text-sm text-red-700">{errors['primaryCrop']}</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-soil-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Consent</h2>
        <label className="mt-3 flex gap-3">
          <input
            type="checkbox"
            checked={consentGiven}
            onChange={(e) => setConsentGiven(e.target.checked)}
            className="mt-1 size-4 shrink-0 accent-leaf-600"
            aria-invalid={Boolean(errors['consentGiven'])}
          />
          <span className="text-sm text-soil-700">{CONSENT_TEXT}</span>
        </label>
        {errors['consentGiven'] && (
          <p className="mt-2 text-sm text-red-700">{errors['consentGiven']}</p>
        )}
      </section>

      {formError && (
        <p role="alert" className="text-sm text-red-700">
          {formError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !consentGiven}
          className="rounded-md bg-leaf-600 px-4 py-2 text-sm font-medium text-white hover:bg-leaf-700 disabled:opacity-60"
        >
          {pending ? 'Submitting…' : 'Submit application'}
        </button>
        {!consentGiven && (
          <span className="text-sm text-soil-700">
            Submission stays locked until consent is recorded.
          </span>
        )}
      </div>

      <p className="text-xs text-soil-700">
        Kenya bounds in use: {KENYA_BOUNDS.minLat} to {KENYA_BOUNDS.maxLat}{' '}
        latitude, {KENYA_BOUNDS.minLng} to {KENYA_BOUNDS.maxLng} longitude.
      </p>
    </form>
  );
}

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
    <div className="flex h-72 items-center justify-center rounded-md border border-ink-200 bg-white text-sm text-ink-500">
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
    'mt-1.5 w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm outline-none placeholder:text-ink-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-50';

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <div className="h-1 bg-sky-500" aria-hidden="true" />
        <div className="p-6">
        <div className="flex items-start gap-3">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sm font-bold text-sky-700"
            aria-hidden="true"
          >
            1
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink-900">Farmer</h2>
            <p className="mt-1 text-sm text-ink-500">
              Only what the assessment needs. Do not record a national ID or any
              account number here.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="farmerName" className="block text-sm font-semibold">
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
              <p className="mt-1.5 text-sm font-medium text-danger-700">
                {errors['farmerName']}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-semibold">
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
              <p className="mt-1.5 text-sm font-medium text-danger-700">
                {errors['phone']}
              </p>
            )}
          </div>
        </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <div className="h-1 bg-sun-500" aria-hidden="true" />
        <div className="p-6">
        <div className="flex items-start gap-3">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sun-50 text-sm font-bold text-sun-700"
            aria-hidden="true"
          >
            2
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink-900">Farm</h2>
            <p className="mt-1 text-sm text-ink-500">
              Tap the map where the farm is, or drag the pin to adjust. The
              location drives the satellite and weather signals.
            </p>
          </div>
        </div>

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
              className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-1.5 font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60"
            >
              {locating ? 'Locating…' : '📍 Use this device’s location'}
            </button>
            <span className="text-ink-500">
              {lat !== null && lng !== null
                ? `Pin at ${lat.toFixed(5)}, ${lng.toFixed(5)}`
                : 'No pin placed yet'}
            </span>
          </div>

          {errors['locationLat'] && (
            <p className="mt-1.5 text-sm font-medium text-danger-700">
              {errors['locationLat']}
            </p>
          )}
          {errors['locationLng'] && (
            <p className="mt-1.5 text-sm font-medium text-danger-700">
              {errors['locationLng']}
            </p>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="farmSizeHa" className="block text-sm font-semibold">
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
              <p className="mt-1.5 text-sm font-medium text-danger-700">
                {errors['farmSizeHa']}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="primaryCrop" className="block text-sm font-semibold">
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
              <p className="mt-1.5 text-sm font-medium text-danger-700">
                {errors['primaryCrop']}
              </p>
            )}
          </div>
        </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border-2 border-plum-100 bg-plum-50">
        <div className="h-1 bg-plum-500" aria-hidden="true" />
        <div className="p-6">
        <div className="flex items-start gap-3">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-plum-100 text-sm font-bold text-plum-700"
            aria-hidden="true"
          >
            3
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink-900">Consent</h2>
            <p className="mt-1 text-sm text-plum-700">
              Required by law before any of this farmer’s data is processed.
            </p>
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer gap-3 rounded-xl bg-white p-4">
          <input
            type="checkbox"
            checked={consentGiven}
            onChange={(e) => setConsentGiven(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-plum-600"
            aria-invalid={Boolean(errors['consentGiven'])}
          />
          <span className="text-sm text-ink-700">{CONSENT_TEXT}</span>
        </label>
        {errors['consentGiven'] && (
          <p className="mt-2 text-sm font-semibold text-danger-700">
            {errors['consentGiven']}
          </p>
        )}
        </div>
      </section>

      {formError && (
        <p
          role="alert"
          className="rounded-lg bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
        >
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending || !consentGiven}
          className="rounded-lg bg-brand-700 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Submitting…' : 'Submit application'}
        </button>
        {!consentGiven && (
          <span className="text-sm font-medium text-plum-700">
            🔒 Locked until consent is recorded in step 3.
          </span>
        )}
      </div>

      <p className="text-xs text-ink-500">
        Farm pins must fall inside Kenya: {KENYA_BOUNDS.minLat} to{' '}
        {KENYA_BOUNDS.maxLat} latitude, {KENYA_BOUNDS.minLng} to{' '}
        {KENYA_BOUNDS.maxLng} longitude.
      </p>
    </form>
  );
}

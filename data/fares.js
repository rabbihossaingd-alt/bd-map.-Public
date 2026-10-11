// ---- Fare rules: every price in the app is computed from this file ----
// Bus rates: BRTA gazette as reported by Prothom Alo / Dhaka Tribune / bdnews24 (effective 22 Sep 2026).
// CNG: government meter rate as reported in the press. Ride rates: Uber's published Dhaka rates (old) —
// treat them as the starting rate card for this app's own ride service and change them freely.

const FARES = {
  effective: '২২ সেপ্টেম্বর ২০২৬',
  bus: {
    metro:     { perKm: 2.70, min: 10, label: 'মহানগর বাস (ঢাকা/চট্টগ্রাম)' },
    minibus:   { perKm: 2.60, min: 8,  label: 'মহানগর মিনিবাস' },
    dtca:      { perKm: 2.60, min: 10, label: 'ঢাকার আশপাশের জেলা (DTCA এলাকা)' },   // min is assumed, not in the gazette
    intercity: { perKm: 2.40, min: 10, label: 'আন্তঃজেলা / দূরপাল্লা (নন-এসি)' },   // min is assumed
    acRange: [1.6, 2.5],        // AC fares are not set by the government; estimate = non-AC x this range
    roadFactor: 1.15,           // straight stop-to-stop distance -> road distance
    nearStopKm: 1.2,            // how far a point may be from a local bus stop
    localSpeedKmh: [10, 18]     // Dhaka local bus average speed range, jam to clear road
  },
  // Distance (km) from a city centre that counts as inside the fare zone.
  zones: {
    dhakaMetro: { lat: 23.78,  lon: 90.40, r: 16 },
    ctgMetro:   { lat: 22.335, lon: 91.83, r: 12 },
    dtca:       { lat: 23.78,  lon: 90.40, r: 45 }
  },
  cng: { base: 40, baseKm: 2, perKm: 12, waitPerMin: 2, maxKm: 40 },
  rides: [
    { id: 'bike', name: 'বাইক', sub: '১ জন',      base: 30, perKm: 12, perMin: 0.5, min: 40,  maxKm: 60 },
    { id: 'car',  name: 'কার',  sub: '৪ জন, এসি', base: 50, perKm: 21, perMin: 3,   min: 100, maxKm: 150 }
  ]
};

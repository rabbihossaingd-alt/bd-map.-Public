// ---- Fare rules: every price in the app is computed from this file ----
// Bus rates: BRTA gazette as reported by Prothom Alo / Dhaka Tribune / bdnews24 (effective 22 Sep 2026).
// CNG: government meter rate as reported in the press.
// Rides: the operators' own published rates — the latest that are public. Neither company publishes a
// current rate card, and both raise prices with demand, so the app shows these as the normal-time fare.
//   Bike: Pathao's notice of August 2022 (Dhaka ৳15/km, Chattogram ৳12.50, Sylhet ৳8.50; base ৳25, ৳0.50/min).
//   Car:  Uber's Dhaka UberX rates (base ৳50, ৳21/km, ৳3/min), last published in 2017.

const FARES = {
  effective: '২২ সেপ্টেম্বর ২০২৬',
  bus: {
    metro:     { perKm: 2.70, min: 10, label: 'মহানগর বাস (ঢাকা/চট্টগ্রাম)' },
    minibus:   { perKm: 2.60, min: 8,  label: 'মহানগর মিনিবাস' },
    dtca:      { perKm: 2.60, min: 10, label: 'ঢাকার আশপাশের জেলা (DTCA এলাকা)' },   // min is assumed, not in the gazette
    intercity: { perKm: 2.40, min: 10, label: 'আন্তঃজেলা / দূরপাল্লা (নন-এসি)' },   // min is assumed
    acRange: [1.6, 2.5],        // AC fares are not set by the government; estimate = non-AC x this range
    roadFactor: 1.08,           // stop-to-stop straight lines -> road distance (stops are now close together)
    roundTo: 5,                 // local buses charge in steps of ৳5; the computed fare is rounded down to one
    nearStopKm: 1.2,            // how far a point may be from a local bus stop
    localSpeedKmh: [10, 18]     // Dhaka local bus average speed range, jam to clear road
  },
  // Distance (km) from a city centre that counts as inside the fare zone.
  zones: {
    dhakaMetro: { lat: 23.78,  lon: 90.40, r: 16 },
    ctgMetro:   { lat: 22.335, lon: 91.83, r: 12 },
    dtca:       { lat: 23.78,  lon: 90.40, r: 45 },
    sylhet:     { lat: 24.895, lon: 91.869, r: 12 }
  },
  cng: { base: 40, baseKm: 2, perKm: 12, waitPerMin: 2, maxKm: 40 },
  rides: [
    { id: 'bike', name: 'বাইক', sub: '১ জন',      base: 25, perKm: 15, perMin: 0.5, min: 50, maxKm: 60,
      cities: { ctgMetro: { perKm: 12.5, min: 40 }, sylhet: { perKm: 8.5, min: 30 } } },
    { id: 'car',  name: 'কার',  sub: '৪ জন, এসি', base: 50, perKm: 21, perMin: 3,   min: 50, maxKm: 150 }
  ],
  rideSource: 'বাইক: পাঠাও-র প্রকাশিত হার (আগস্ট ২০২২)। কার: উবারের প্রকাশিত হার (২০১৭)। অ্যাপে চাহিদা বাড়লে ভাড়াও বাড়ে।'
};

// Fares confirmed by people who ride the route, as "stopId>stopId": taka (either direction).
// These override the calculated fare. Add one whenever a real fare is known.
const KNOWN_FARES = {
  'jatrabari>signboard': 10
};

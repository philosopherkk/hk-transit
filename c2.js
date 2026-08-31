    listEl.classList.toggle("open", hits.length > 0);
    listEl.querySelectorAll(".suggest-item").forEach((el) => {
      el.onclick = () => {
        const h = hits[+el.dataset.i];
        const title = typeof h.name === "string" ? h.name : (state.lang === "zh" ? h.name.zh : h.name.en);
        onPick({ lat: h.lat, lng: h.lng, name: title });
        listEl.classList.remove("open");
      };
    });
  }

  async function loadData() {
    setStatus(t("loading"));
    $("loadNote").textContent = t("loading");
    const [db, fares] = await Promise.all([
      fetch(CATALOG_URL).then((r) => r.json()),
      fetch(MTR_FARE_URL).then((r) => r.json()).catch(() => ({})),
    ]);
    state.db = db;
    state.mtrFare = fares;
    const map = new Map();
    for (const [key, route] of Object.entries(db.routeList)) {
      for (const co of route.co || []) {
        const stops = (route.stops && route.stops[co]) || [];
        if (co === "mtr" || co === "lightRail") {
          stops.forEach((sid) => state.mtrIds.add(sid));
          for (let i = 0; i < stops.length - 1; i++) {
            addEdge(stops[i], stops[i + 1], route.route, co);
            addEdge(stops[i + 1], stops[i], route.route, co);
          }
        }
        stops.forEach((sid, seq) => {
          if (!map.has(sid)) map.set(sid, []);
          map.get(sid).push({ key, co, seq });
        });
      }
    }
    state.stopToRoutes = map;
    $("loadNote").textContent = `${Object.keys(db.routeList).length} routes · ${Object.keys(db.stopList).length} stops`;
    setStatus(t("ready"));
  }

  function addEdge(a, b, line, co) {
    if (!state.mtrAdj.has(a)) state.mtrAdj.set(a, []);
    state.mtrAdj.get(a).push({ to: b, line, co });
  }

  function nearbyStops(lat, lng, radius = 640, limit = 30) {
    const out = [];
    for (const [id, s] of Object.entries(state.db.stopList)) {
      if (!s.location) continue;
      const d = haversine(lat, lng, s.location.lat, s.location.lng);
      if (d <= radius) out.push({ id, walk: d, name: s.name, location: s.location });
    }
    out.sort((a, b) => a.walk - b.walk);
    return out.slice(0, limit);
  }

  function nearbyMtr(lat, lng, radius = 1100, limit = 5) {
    const out = [];
    for (const id of state.mtrIds) {
      const s = state.db.stopList[id];
      if (!s || !s.location) continue;
      const d = haversine(lat, lng, s.location.lat, s.location.lng);
      if (d <= radius) out.push({ id, walk: d, name: s.name, location: s.location });
    }
    out.sort((a, b) => a.walk - b.walk);
    return out.slice(0, limit);
  }

  function sectionFare(route, boardSeq, alightSeq) {
    const fares = route.fares;
    if (!fares || !fares.length) return defaultFare(route);
    const idx = Math.min(boardSeq, fares.length - 1);
    const raw = parseFloat(fares[idx]);
    if (Number.isNaN(raw)) return defaultFare(route);
    const span = Math.max(1, (route.seq || fares.length) - 1);
    const used = Math.max(1, alightSeq - boardSeq);
    if (used / span < 0.45 && raw > 5) return Math.max(3.5, Math.round(raw * 0.72 * 10) / 10);
    return raw;
  }
  function defaultFare(route) {
    const co = route.co[0];
    if (co === "gmb") return 7.4;
    if (co === "nlb") return 10;
    if (co === "mtr") return 8.5;
    return 6.8;
  }

  function rideMinutes(route, boardSeq, alightSeq) {
    const hops = Math.max(1, alightSeq - boardSeq);
    const jt = parseFloat(route.jt);
    const totalStops = Math.max(2, (route.stops[route.co[0]] || []).length);
    if (!Number.isNaN(jt) && jt > 0) return Math.max(3, jt * (hops / (totalStops - 1)));
    const co = route.co[0];
    const per = co === "mtr" ? 2.15 : co === "gmb" ? 1.35 : co === "lightRail" ? 1.8 : 1.65;
    return hops * per;
  }

  function defaultWait(co) {
    if (co === "mtr") return 3.5;
    if (co === "lightRail") return 5;
    if (co === "gmb") return 8;
    return 6.5;
  }

  function nm(obj) { return state.lang === "zh" ? obj.zh : obj.en; }

  function makeDirectTrips(origin, dest) {
    const trips = [];
    const origNear = nearbyStops(origin.lat, origin.lng, 680, 28);
    const seen = new Set();
    for (const os of origNear) {
      const refs = state.stopToRoutes.get(os.id) || [];
      for (const ref of refs) {
        const route = state.db.routeList[ref.key];
        if (!route) continue;
        const seqStops = (route.stops && route.stops[ref.co]) || [];
        let best = null;
        for (let i = ref.seq + 1; i < seqStops.length; i++) {
          const st = state.db.stopList[seqStops[i]];
          if (!st || !st.location) continue;
          const dDest = haversine(dest.lat, dest.lng, st.location.lat, st.location.lng);
          if (dDest <= 680 && (!best || dDest < best.dDest)) {
            best = { alightSeq: i, alightId: seqStops[i], alight: st, dDest };
          }
        }
        if (!best) continue;
        const sig = `${ref.key}|${ref.co}|${ref.seq}|${best.alightSeq}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        const wait = defaultWait(ref.co);
        const ride = rideMinutes(route, ref.seq, best.alightSeq);
        const w1 = walkMin(os.walk), w2 = walkMin(best.dDest);
        const fare = ref.co === "mtr"
          ? mtrPairFare(os.id, best.alightId)
          : sectionFare(route, ref.seq, best.alightSeq);
        trips.push({
          id: sig,
          kind: "direct",
          duration: w1 + wait + ride + w2,
          fare,
          transfers: 0,
          board: os,
          legs: [
            walkLeg(origin, os, w1),
            {
              type: modeOf(ref.co),
              co: ref.co,
              route: route.route,
              routeKey: ref.key,
              serviceType: route.serviceType,
              bound: (route.bound && route.bound[ref.co]) || "",
              from: nm(os.name),
              to: nm(best.alight.name),
              destName: nm(route.dest),
              stopId: os.id,
              alightId: best.alightId,
              boardSeq: ref.seq,
              alightSeq: best.alightSeq,
              mins: ride,
              wait,
              etaMin: null,
              color: LINE_COLOR[route.route] || null,
            },
            walkLeg(best.alight.location, dest, w2, nm(best.alight.name)),
          ],
        });
      }
    }
    return trips;
  }

  function walkLeg(from, to, mins, fromName) {
    return {
      type: "walk",
      from: fromName || (from.name || t("walk")),
      to: to.name || "",
      mins,
      meters: Math.round(mins * 80),
    };
  }

  function mtrPairFare(a, b) {
    if (a === b) return 0;
    const k1 = `${a}-${b}`, k2 = `${b}-${a}`;
    if (state.mtrFare[k1] != null) return state.mtrFare[k1];
    if (state.mtrFare[k2] != null) return state.mtrFare[k2];
    if (AEL_FARE[k1] != null) return AEL_FARE[k1];
    if (AEL_FARE[k2] != null) return AEL_FARE[k2];
    return 8.5;
  }

  function mtrPathTrips(origin, dest) {
    const starts = nearbyMtr(origin.lat, origin.lng, 1200, 4);
    const ends = nearbyMtr(dest.lat, dest.lng, 1200, 4);

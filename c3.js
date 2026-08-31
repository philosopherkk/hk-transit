    if (!starts.length || !ends.length) return [];
    const endSet = new Set(ends.map((e) => e.id));
    const endWalk = Object.fromEntries(ends.map((e) => [e.id, e]));
    const trips = [];

    for (const s of starts) {
      const distMap = new Map();
      const prev = new Map();
      const pq = [[walkMin(s.walk) + 3.2, s.id, null, 0]];
      distMap.set(s.id + "|", walkMin(s.walk) + 3.2);

      while (pq.length) {
        pq.sort((a, b) => a[0] - b[0]);
        const [cost, node, line, xfers] = pq.shift();
        if (endSet.has(node) && node !== s.id) {
          const path = reconstruct(prev, node, line);
          const ew = endWalk[node];
          const fare = mtrPathFare(path);
          const ride = cost - walkMin(s.walk) - 3.2;
          trips.push({
            id: `mtr|${s.id}|${node}|${path.map((p) => p.line).join("-")}`,
            kind: "mtr",
            duration: cost + walkMin(ew.walk),
            fare,
            transfers: Math.max(0, new Set(path.map((p) => p.line)).size - 1),
            board: s,
            legs: [
              walkLeg(origin, s, walkMin(s.walk)),
              ...collapseMtr(path, s),
              walkLeg(ew.location, dest, walkMin(ew.walk), nm(ew.name)),
            ],
          });
          endSet.delete(node);
          if (![...endSet].length) break;
        }
        const edges = state.mtrAdj.get(node) || [];
        const used = new Set();
        for (const e of edges) {
          const sig = e.to + e.line;
          if (used.has(sig)) continue;
          used.add(sig);
          const xfer = line && line !== e.line ? 3.8 : 0;
          const nextCost = cost + 2.15 + xfer;
          const key = e.to + "|" + e.line;
          if (nextCost < (distMap.get(key) || 1e9) && xfers + (xfer ? 1 : 0) <= 3) {
            distMap.set(key, nextCost);
            prev.set(key, { from: node, line: e.line, co: e.co, prevLine: line });
            pq.push([nextCost, e.to, e.line, xfers + (xfer ? 1 : 0)]);
          }
        }
        if (pq.length > 800) break;
      }
    }
    return trips;
  }

  function reconstruct(prev, node, line) {
    const path = [];
    let cur = node, curLine = line, guard = 0;
    while (cur && guard++ < 80) {
      const key = cur + "|" + (curLine || "");
      const p = prev.get(key) || prev.get(cur + "|" + curLine);
      if (!p) break;
      path.push({ to: cur, line: p.line, co: p.co });
      cur = p.from;
      curLine = p.prevLine;
    }
    path.reverse();
    return path;
  }

  function collapseMtr(path, start) {
    if (!path.length) return [];
    const legs = [];
    let i = 0;
    while (i < path.length) {
      const line = path[i].line;
      let j = i;
      while (j < path.length && path[j].line === line) j++;
      const last = path[j - 1];
      const fromStop = i === 0 ? start : state.db.stopList[path[i - 1].to] || start;
      const toStop = state.db.stopList[last.to];
      legs.push({
        type: "mtr",
        co: last.co || "mtr",
        route: line,
        from: nm(fromStop.name || { en: start.id, zh: start.id }),
        to: nm((toStop && toStop.name) || { en: last.to, zh: last.to }),
        destName: line,
        stopId: (fromStop.id || start.id),
        alightId: last.to,
        mins: (j - i) * 2.15,
        wait: i === 0 ? 3.2 : 3.8,
        etaMin: null,
        color: LINE_COLOR[line],
      });
      i = j;
    }
    return legs;
  }

  function mtrPathFare(path) {
    if (!path.length) return 0;
    const stations = [];
    const ids = path.map((p) => p.to);
    const firstLine = path[0].line;
    const lastLine = path[path.length - 1].line;
    const end = path[path.length - 1].to;
    if (firstLine === "AEL" || lastLine === "AEL") {
      const aelStops = path.filter((p) => p.line === "AEL").map((p) => p.to);
      const a = aelStops[0], b = aelStops[aelStops.length - 1];
      let f = AEL_FARE[`${a}-${b}`] || AEL_FARE[`${b}-${a}`] || 115;
      const rest = path.filter((p) => p.line !== "AEL");
      if (rest.length) f += mtrPairFare(rest[0].to, rest[rest.length - 1].to);
      return Math.round(f * 10) / 10;
    }
    return mtrPairFare(ids[0], end);
  }

  function transferTrips(origin, dest, existing) {
    if (existing.some((tr) => tr.duration < 32 && tr.transfers === 0)) return [];
    const hubs = nearbyMtr(origin.lat, origin.lng, 2200, 6);
    const destM = nearbyMtr(dest.lat, dest.lng, 1600, 4);
    if (!hubs.length || !destM.length) return [];
    const trips = [];
    const seen = new Set();
    for (const hub of hubs) {
      const mtrPart = mtrPathTrips(
        { lat: hub.location.lat, lng: hub.location.lng, name: nm(hub.name) },
        dest
      ).sort((a, b) => a.duration - b.duration)[0];
      if (!mtrPart) continue;
      const origNear = nearbyStops(origin.lat, origin.lng, 480, 8);
      for (const os of origNear) {
        const refs = state.stopToRoutes.get(os.id) || [];
        for (const ref of refs) {
          if (ref.co === "mtr" || ref.co === "lightRail") continue;
          const route = state.db.routeList[ref.key];
          if (!route) continue;
          const seqStops = (route.stops && route.stops[ref.co]) || [];
          let alight = null;
          const maxI = Math.min(seqStops.length, ref.seq + 14);
          for (let i = ref.seq + 1; i < maxI; i++) {
            const st = state.db.stopList[seqStops[i]];
            if (!st) continue;
            const d = haversine(st.location.lat, st.location.lng, hub.location.lat, hub.location.lng);
            if (d < 280) { alight = { i, st, d, id: seqStops[i] }; break; }
          }
          if (!alight) continue;
          const sig = `${ref.key}|${hub.id}`;
          if (seen.has(sig)) continue;
          seen.add(sig);
          const wait = defaultWait(ref.co);
          const ride = rideMinutes(route, ref.seq, alight.i);
          trips.push({
            id: "xf|" + sig,
            kind: "transfer",
            duration: walkMin(os.walk) + wait + ride + walkMin(alight.d) + mtrPart.duration,
            fare: sectionFare(route, ref.seq, alight.i) + mtrPart.fare,
            transfers: 1 + (mtrPart.transfers || 0),
            board: os,
            legs: [
              walkLeg(origin, os, walkMin(os.walk)),
              {
                type: modeOf(ref.co), co: ref.co, route: route.route, routeKey: ref.key,
                serviceType: route.serviceType, bound: (route.bound && route.bound[ref.co]) || "",
                from: nm(os.name), to: nm(alight.st.name), destName: nm(route.dest),
                stopId: os.id, alightId: alight.id, boardSeq: ref.seq, alightSeq: alight.i,
                mins: ride, wait, etaMin: null,
              },
              walkLeg(alight.st.location, hub.location, walkMin(alight.d), nm(alight.st.name)),
              ...mtrPart.legs.filter((l) => l.type === "mtr"),
              mtrPart.legs[mtrPart.legs.length - 1],

import { dev } from "./edition.js";
import { msg } from "./messages.js";
import { recordCounts } from "./record-kinds.js";
import { get, url, xy, ll, key, Tiles } from "./grid.js";
export async function mountMap(a, tr, boundaries = get("frozen/map.json")) {
  const wrap = document.querySelector("#map-wrap"),
    svg = document.querySelector("#map"),
    tip = document.querySelector("#map-tip"),
    coord = document.querySelector("#readout"),
    tiles = new Tiles(a),
    map = await boundaries,
    ds = new Map(a.districts.map((d) => [d.id, d])),
    NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, parent = svg) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    parent.append(e);
    return e;
  }
  const bb = a.project.bbox_wgs84,
    cos = Math.cos(((bb[1] + bb[3]) * Math.PI) / 360),
    mid = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
  let w,
    h,
    zoom = 1,
    ox = 0,
    oy = 0,
    scale,
    cx,
    cy,
    districtMode = false,
    hover = 0,
    sel = 0,
    token = 0,
    tt = 0;
  const world = el("g", {}),
    relief = el(
      "image",
      {
        href: url("frozen/relief.webp"),
        x: (bb[0] - mid[0]) * cos,
        y: mid[1] - bb[3],
        width: (bb[2] - bb[0]) * cos,
        height: bb[3] - bb[1],
        preserveAspectRatio: "none",
      },
      world,
    ),
    reg = el("g", {}, world),
    labels = el("g", { "pointer-events": "none" }),
    ticks = el("g", { "pointer-events": "none" });
  const marks = el("g", { "aria-label": "Assigned virtual plots" }),
    paths = new Map(),
    plotCache = new Map(),
    pending = new Set();
  let highlight = "",
    locked = null;
  const actions = new WeakMap();
  const featuresLayer = el("g", {
    "aria-label": tr("Places on the map", "పటంలోని ప్రదేశాలు"),
  });
  let features = [],
    trailLines = [];
  const tileBoxes = a.plots.map((k) => {
    const [i, j] = k.split("_").map(Number),
      ps = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ].map(([x, y]) => ll(a.project, (i + x) * 256, (j + y) * 256));
    return [
      k,
      Math.min(...ps.map((v) => v[0])),
      Math.min(...ps.map((v) => v[1])),
      Math.max(...ps.map((v) => v[0])),
      Math.max(...ps.map((v) => v[1])),
    ];
  });
  const palette = [
    "#b8c8a7",
    "#bac8ae",
    "#cccfac",
    "#b1c2a8",
    "#d0c8a9",
    "#c3cba2",
  ];
  for (const f of map.features) {
    const rings =
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;
    const path = rings
      .map((poly) =>
        poly
          .map(
            (r) =>
              r
                .map(
                  ([x, y], i) =>
                    (i ? "L" : "M") +
                    ((x - mid[0]) * cos).toFixed(5) +
                    " " +
                    (mid[1] - y).toFixed(5),
                )
                .join("") + "Z",
          )
          .join(""),
      )
      .join("");
    const p = el(
      "path",
      {
        d: path,
        "fill-rule": "evenodd",
        "data-d": f.properties.id,
        "vector-effect": "non-scaling-stroke",
        "stroke-width": 0.65,
        stroke: "#738772",
      },
      reg,
    );
    paths.set(f.properties.id, p);
  }
  const text = (parent, x, y, msg, attrs = {}) => {
    const t = el(
      "text",
      {
        x,
        y,
        "text-anchor": "middle",
        "font-family": "Manrope,NotoTelugu,sans-serif",
        ...attrs,
      },
      parent,
    );
    t.textContent = msg;
    return t;
  };
  const sx = (lon) => cx + (lon - mid[0]) * cos * scale,
    sy = (lat) => cy + (mid[1] - lat) * scale;
  const lang = () => document.documentElement.lang === "te";
  function paint() {
    for (const [id, p] of paths) {
      p.setAttribute(
        "fill",
        id === (hover || sel)
          ? "#bb7844"
          : districtMode
            ? palette[(id * 7) % 6]
            : "#98ac77",
      );
      p.setAttribute(
        "fill-opacity",
        id === (hover || sel) ? 0.49 : districtMode ? 0.92 : 0.04,
      );
      p.setAttribute("stroke", id === (hover || sel) ? "#975633" : "#637f68");
    }
    relief.style.display = zoom > 30 ? "none" : "";
    relief.style.opacity = districtMode ? ".39" : "1";
  }
  function aim(lon, lat, factor) {
    zoom = Math.max(1, Math.min(2400, factor));
    const fit = Math.min(
      (w - 64) / ((bb[2] - bb[0]) * cos),
      (h - 45) / (bb[3] - bb[1]),
    );
    ox = -(lon - mid[0]) * cos * fit * zoom;
    oy = -(mid[1] - lat) * fit * zoom;
    draw();
  }
  function pins() {
    const ids = new Set();
    marks.replaceChildren();
    const occupiedLabels = [];
    function mark(lon, lat, rows, label, count) {
      const x = sx(lon),
        y = sy(lat);
      if (x < 8 || x > w - 8 || y < 12 || y > h - 12) return;
      const n = count ?? rows.length,
        single = !!rows && n === 1,
        group = el(
          "g",
          {
            transform: `translate(${x} ${y})`,
            tabindex: 0,
            role: "button",
            "aria-label": label || `@${rows[0].u}, open virtual plot`,
            "data-plot": single ? rows[0].u : "cluster",
            style: "cursor:pointer",
          },
          marks,
        );
      el(
        "circle",
        {
          r: single ? 5 : 8.5,
          fill: "#a25e3d",
          stroke: "#fffbe9",
          "stroke-width": 1.8,
        },
        group,
      );
      el("circle", { r: 12, fill: "transparent" }, group);
      if (!single)
        text(group, 0, 3, String(n), {
          "font-size": 8,
          "font-weight": 800,
          fill: "white",
        });
      const selected = single && rows[0].u === highlight;
      const half = single ? (rows[0].u.length + 1) * 3.1 : 0;
      // Labels are never hit targets; the actual circle stays tappable in dense neighbourhoods.
      if (
        single &&
        (selected ||
          (zoom > 540 &&
            !highlight &&
            !occupiedLabels.some(
              ([xx, yy, hh]) =>
                Math.abs(x - xx) < half + hh + 3 && Math.abs(y - yy) < 14,
            )))
      ) {
        occupiedLabels.push([x, y, half]);
        text(group, 0, -11, "@" + rows[0].u, {
          "pointer-events": "none",
          "font-size": 11,
          "font-weight": 750,
          fill: "#493e31",
          stroke: "#fff8e9",
          "stroke-width": 3,
          "paint-order": "stroke",
        });
      }
      if (selected) {
        el(
          "circle",
          {
            r: 8.5,
            fill: "none",
            stroke: "#ad573b",
            "stroke-width": 1.4,
            "pointer-events": "none",
          },
          group,
        );
        group.setAttribute("data-selected", "true");
      }
      const title = el("title", {}, group);
      title.textContent =
        label || (single ? "@" + rows[0].u : `${n} assigned acres · zoom in`);
      const open = (e) => {
        e.stopPropagation();
        if (single) {
          window.dispatchEvent(
            new CustomEvent("atlas:visit", { detail: rows[0].u }),
          );
        } else aim(lon, lat, Math.max(8, zoom * 5));
      };
      actions.set(group, open);
      group.addEventListener("click", (e) => {
        if (e.detail === 0) open(e);
      });
      group.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(e);
        }
      });
    }
    if (zoom < 3) {
      // Make a legible regional inventory, not 61 coincident targets. Fuse the closest screen neighbours;
      // weighted map centres keep every district's count and separate naturally as the map is enlarged.
      const regions = a.districts
        .filter((d) => d.count)
        .map((d) => {
          const [lon, lat] = ll(
            a.project,
            d.anchor[0] + 0.5,
            d.anchor[1] + 0.5,
          );
          return { lon, lat, n: d.count, names: [lang() ? d.te : d.name] };
        });
      for (;;) {
        let near = 24 ** 2,
          A = -1,
          B = -1;
        for (let i = 0; i < regions.length; i++)
          for (let j = i + 1; j < regions.length; j++) {
            const l = regions[i],
              r = regions[j],
              dd = (sx(l.lon) - sx(r.lon)) ** 2 + (sy(l.lat) - sy(r.lat)) ** 2;
            if (dd < near) {
              near = dd;
              A = i;
              B = j;
            }
          }
        if (A < 0) break;
        const l = regions[A],
          r = regions.splice(B, 1)[0],
          total = l.n + r.n;
        l.lon = (l.lon * l.n + r.lon * r.n) / total;
        l.lat = (l.lat * l.n + r.lat * r.n) / total;
        l.n = total;
        l.names.push(...r.names);
      }
      for (const g of regions)
        mark(
          g.lon,
          g.lat,
          null,
          `${g.names.join(", ")} · ${msg("home.count", { n: g.n })}`,
          g.n,
        );
      return;
    }
    const bins = new Map(),
      visible = new Set();
    for (const [k, l, b, r, t] of tileBoxes) {
      if (sx(l) > w + 20 || sx(r) < -20 || sy(t) > h + 20 || sy(b) < -20)
        continue;
      visible.add(k);
      if (!plotCache.has(k)) {
        if (!pending.has(k)) {
          pending.add(k);
          get(`data/plots/${k}.json`)
            .then((rs) => {
              plotCache.set(
                k,
                rs.map(([x, y, u, style, did, h]) => ({
                  u,
                  did,
                  pt: ll(a.project, x + 0.5, y + 0.5),
                })),
              );
              pending.delete(k);
              pins();
            })
            .catch(() => pending.delete(k));
        }
        continue;
      }
      for (const obj of plotCache.get(k)) {
        ids.add(obj.did);
        const [lo, la] = obj.pt,
          x = sx(lo),
          y = sy(la);
        if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue;
        const id =
          obj.u === highlight
            ? "selected:" + obj.u
            : `${Math.floor(x / 20)},${Math.floor(y / 20)}`;
        (bins.get(id) || bins.set(id, []).get(id)).push(obj);
      }
    }

    for (const rows of bins.values()) {
      const z = (j) => rows.reduce((v, r) => v + r.pt[j], 0) / rows.length;
      mark(z(0), z(1), rows);
    }
    const promoted = marks.querySelector('[data-selected="true"]');
    if (promoted) marks.append(promoted);
    if (plotCache.size > 32)
      for (const k of plotCache.keys())
        if (!visible.has(k)) plotCache.delete(k);
  }
  function draw() {
    if (!wrap.isConnected) return;
    w = wrap.clientWidth;
    h = wrap.clientHeight;
    if (w < 65 || h < 46) return;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const fit = Math.min(
      (w - 64) / ((bb[2] - bb[0]) * cos),
      (h - 45) / (bb[3] - bb[1]),
    );
    if (locked) {
      ox = -(locked.lon - mid[0]) * cos * fit * zoom;
      oy = -(mid[1] - locked.lat) * fit * zoom;
    }
    scale = fit * zoom;
    cx = w * 0.5 + ox;
    cy = h * 0.5 + oy;
    world.setAttribute("transform", `translate(${cx} ${cy}) scale(${scale})`);
    labels.replaceChildren();
    ticks.replaceChildren();
    paint();
    const lab = (lon, lat, msg, size) =>
      text(labels, sx(lon), sy(lat), msg, {
        "font-size": size,
        "font-weight": 750,
        "letter-spacing": size > 12 ? "1.6" : ".1",
        fill: "#294e3b",
        stroke: "#eef3d9",
        "stroke-width": size > 12 ? 3 : 2,
        "paint-order": "stroke",
      });
    if (zoom < 1.8) {
      for (const st of ["Telangana", "Andhra Pradesh"]) {
        const ls = a.districts.filter((d) => d.state === st),
          sum = ls.reduce((v, d) => v + d.area_m2, 0),
          val = (j) => ls.reduce((v, d) => v + d.label[j] * d.area_m2, 0) / sum;
        lab(
          val(0),
          val(1),
          lang()
            ? st === "Telangana"
              ? "తెలంగాణ"
              : "ఆంధ్ర ప్రదేశ్"
            : st.toUpperCase(),
          w < 500 ? 10.5 : 13,
        );
      }
    } else {
      let boxes = [];
      for (const d of [...a.districts].sort((a, b) => b.area_m2 - a.area_m2)) {
        const [lo, la] = d.label,
          x = sx(lo),
          y = sy(la),
          str = (lang() ? d.te : d.name) + ` · ${d.count}`,
          span = str.length * 2.8;
        if (
          x < 0 ||
          x > w ||
          y < 10 ||
          y > h - 10 ||
          boxes.some(
            ([xx, yy, ss]) =>
              Math.abs(x - xx) < ss + span && Math.abs(y - yy) < 13,
          )
        )
          continue;
        boxes.push([x, y, span]);
        lab(lo, la, str, 10);
      }
    }
    const delta =
      [
        0.0005, 0.001, 0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5,
      ].find((d) => d * scale > 39) || 5;
    for (
      let lon = Math.ceil((mid[0] - cx / scale / cos) / delta) * delta;
      sx(lon) < w;
      lon += delta
    ) {
      let x = sx(lon);
      if (x < 16 || x > w - 18) continue;
      el("path", { d: `M${x} 0v5 M${x} ${h}v-4`, stroke: "#94a895" }, ticks);
      text(ticks, x, 12, `${+lon.toFixed(4)}°E`, {
        "font-size": 8,
        fill: "#667c6d",
      });
    }
    for (
      let lat = Math.ceil((mid[1] - (h - cy) / scale) / delta) * delta;
      sy(lat) > 0;
      lat += delta
    ) {
      const y = sy(lat);
      if (y < 25 || y > h - 15) continue;
      el("path", { d: `M0 ${y}h5 M${w} ${y}h-4`, stroke: "#94a895" }, ticks);
      text(ticks, 8, y + 3, `${+lat.toFixed(4)}°N`, {
        "text-anchor": "start",
        "font-size": 8,
        fill: "#667c6d",
      });
    }
    featuresLayer.replaceChildren();
    if (zoom >= 8)
      for (const line of trailLines) {
        if (!line.length) continue;
        const x = sx(line[0][0]),
          y = sy(line[0][1]);
        if (x < -200 || x > w + 200 || y < -200 || y > h + 200) continue;
        el(
          "path",
          {
            d: line
              .map(
                ([lo, la], i) =>
                  (i ? "L" : "M") + sx(lo).toFixed(2) + " " + sy(la).toFixed(2),
              )
              .join(" "),
            fill: "none",
            stroke: "#a47b46",
            "stroke-dasharray": "3 2",
            "stroke-width": 2,
            "pointer-events": "none",
          },
          featuresLayer,
        );
      }
    for (const s of features) {
      const x = sx(s.lon),
        y = sy(s.lat);
      if (x < 5 || y < 5 || x > w - 5 || y > h - 5) continue;
      const n = el(
        "g",
        {
          "data-place": s.id,
          role: "button",
          tabindex: "0",
          "aria-label": lang() ? s.title_te || s.title : s.title,
          transform: `translate(${x} ${y})`,
        },
        featuresLayer,
      );
      el(
        "circle",
        {
          r: zoom > 2 ? 8 : 5,
          fill: "#40654b",
          stroke: "#fff6d5",
          "stroke-width": 2,
        },
        n,
      );
      if (zoom >= 5)
        text(n, 12, 4, lang() ? s.title_te || s.title : s.title, {
          "font-size": 12,
          fill: "#234b39",
          stroke: "#fff8e8",
          "paint-order": "stroke",
          "stroke-width": 3,
        });
      const go = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent("atlas:place", { detail: s.id }));
      };
      actions.set(n, go);
      n.onclick = (e) => {
        if (e.detail === 0) go(e);
      };
      n.onkeydown = (e) => {
        if (["Enter", " "].includes(e.key)) go(e);
      };
    }
    pins();
    const km =
      [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200].find(
        (x) => (x * scale) / 111.32 > 32,
      ) || 200;
    wrap.querySelector(".map-scale span").style.width =
      `${(km / 111.32) * scale}px`;
    wrap.querySelector(".map-scale b").textContent =
      km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`;
  }
  function atPoint(x, y) {
    return [mid[0] + (x - cx) / (scale * cos), mid[1] - (y - cy) / scale];
  }
  // Browser letterboxing, subpixel CSS sizes and safe insets all belong to the SVG CTM.
  const localPx = (x, y) => {
    const q = svg.createSVGPoint();
    q.x = x;
    q.y = y;
    const p = q.matrixTransform(svg.getScreenCTM().inverse());
    return [p.x, p.y];
  };
  function report(e) {
    const b = svg.getBoundingClientRect(),
      pt = atPoint(...localPx(e.clientX, e.clientY)),
      [gx, gy] = xy(a.project, ...pt),
      k = key(gx, gy),
      fmt = `${pt[1].toFixed(4)}° N · ${pt[0].toFixed(4)}° E`;
    coord.textContent = fmt;
    const id = +e.target.getAttribute("data-d");
    hover = id;
    if (id || sel) {
      const d = ds.get(id || sel);
      tip.textContent = `${lang() ? d.te : d.name} · ${dev ? recordCounts(a.recordStats.byDistrict[String(d.id)], tr) : d.count ? msg("home.count", { n: d.count }) : msg("home.empty")}`;
      tip.hidden = false;
    } else {
      tip.hidden = true;
    }
    paint();
    const req = ++token;
    clearTimeout(tt);
    tt = setTimeout(async () => {
      if (!tiles.keys.has(k)) return;
      try {
        await tiles.load(k);
        if (req !== token) return;
        const v = tiles.at(gx, gy);
        coord.textContent = fmt + (v?.d ? ` · ${v.z} m` : "");
        tiles.trim(new Set([k]));
      } catch {
        coord.textContent = fmt + " · — m";
      }
    }, 75);
  }
  let tapAt = null,
    lastEnter = -1e8,
    pinch = null,
    pendingMap = null;
  function enter(lonLat = tapAt || atPoint(w / 2, h / 2), button = false) {
    if (dev) return false;
    if (window.__atlasMapFallback) return false;
    const pt = svg.createSVGPoint();
    pt.x = (lonLat[0] - mid[0]) * cos;
    pt.y = mid[1] - lonLat[1];
    const inside = [...paths.values()].some((p) => p.isPointInFill(pt));
    if (!inside) {
      if (button && !tapAt) {
        const d = ds.get(sel) || a.districts.find((d) => d.name === "Nalgonda");
        if (d)
          return enter(ll(a.project, d.anchor[0] + 0.5, d.anchor[1] + 0.5));
      }
      coord.textContent = msg("walk.land");
      return false;
    }
    lastEnter = performance.now();
    window.dispatchEvent(
      new CustomEvent("atlas:map-zoom", {
        detail: [
          ...lonLat,
          111320 / (scale * Math.max(0.01, svg.getScreenCTM()?.a || 1)),
        ],
      }),
    );
    return true;
  }
  function z(f, x = w / 2, y = h / 2, button = false, pinching = false) {
    const anchor = button ? tapAt || atPoint(x, y) : atPoint(x, y);
    locked = null;
    const n = Math.max(1, Math.min(2400, zoom * f)),
      ratio = n / zoom;
    ox = (cx - x) * ratio + x - w * 0.5;
    oy = (cy - y) * ratio + y - h * 0.5;
    zoom = n;
    if (zoom === 1) ox = oy = 0;
    draw();
    if (!dev && f > 1 && zoom >= 1.52 && !window.__atlasMapFallback) {
      if (pinching) pendingMap = anchor;
      else enter(anchor, button);
    }
  }
  const pts = new Map();
  let moved = false,
    down,
    pressedFeature = null;
  svg.onpointerdown = (e) => {
    locked = null;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) {
      moved = false;
      pressedFeature = e.target.closest("[data-place],[data-plot]");
    }
    if (pts.size === 2) {
      pressedFeature = null;
      moved = true;
      const [a, b] = [...pts.values()],
        screen = localPx((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      pinch = {
        anchor: atPoint(...screen),
        span: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])),
        zoom,
        fit: scale / zoom,
      };
    }
    down = [e.clientX, e.clientY, +e.target.getAttribute("data-d")];
    svg.setPointerCapture(e.pointerId);
    report(e);
  };
  svg.onpointermove = (e) => {
    if (!pts.has(e.pointerId)) {
      report(e);
      return;
    }
    const old = pts.get(e.pointerId),
      next = [e.clientX, e.clientY];
    if (pts.size === 2) {
      const other = [...pts.entries()].find(([k]) => k !== e.pointerId)[1],
        dist = (p) => Math.hypot(p[0] - other[0], p[1] - other[1]);
      if (!pinch) return;
      const mp = localPx((next[0] + other[0]) / 2, (next[1] + other[1]) / 2);
      zoom = Math.max(
        1,
        Math.min(2400, (pinch.zoom * dist(next)) / pinch.span),
      );
      const sc = pinch.fit * zoom,
        [lon, lat] = pinch.anchor;
      ox = mp[0] - w / 2 - (lon - mid[0]) * cos * sc;
      oy = mp[1] - h / 2 - (mid[1] - lat) * sc;
      if (zoom === 1) ox = oy = 0;
      draw();
      pendingMap =
        !dev && zoom > pinch.zoom && zoom >= 1.52 && !window.__atlasMapFallback
          ? pinch.anchor
          : null;
      moved = true;
    } else {
      if (!moved && Math.hypot(next[0] - down[0], next[1] - down[1]) <= 3)
        return;
      moved = true;
      pressedFeature = null;
      tapAt = null;
      ox += next[0] - old[0];
      oy += next[1] - old[1];
      moved ||= Math.hypot(next[0] - down[0], next[1] - down[1]) > 3;
      draw();
    }
    pts.set(e.pointerId, next);
    report(e);
  };
  svg.onpointerup = (e) => {
    pts.delete(e.pointerId);
    if (!pts.size) pinch = null;
    if (pendingMap && pts.size === 0) {
      const a = pendingMap;
      pendingMap = null;
      if (zoom >= 1.52) enter(a);
    }
    if (!moved && pressedFeature && !pts.size) {
      const fn = actions.get(pressedFeature);
      pressedFeature = null;
      fn?.(e);
      return;
    }
    if (!moved && down?.[2]) {
      {
        const b = svg.getBoundingClientRect();
        tapAt = atPoint(...localPx(e.clientX, e.clientY));
      }
      sel = down[2];
      hover = 0;
      const d = ds.get(sel);
      tip.textContent = `${lang() ? d.te : d.name} · ${dev ? recordCounts(a.recordStats.byDistrict[String(d.id)], tr) : d.count ? msg("home.count", { n: d.count }) : msg("home.empty")}`;
      tip.hidden = false;
      paint();
    }
  };
  svg.onpointercancel = (e) => {
    moved = true;
    pressedFeature = null;
    pinch = null;
    pts.delete(e.pointerId);
    pendingMap = null;
  };
  svg.onpointerleave = () => {
    if (!pts.size) {
      hover = 0;
      paint();
      if (!sel) tip.hidden = true;
    }
  };
  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      z(
        Math.exp(
          -Math.max(
            -1.4,
            Math.min(1.4, e.deltaY * (e.deltaMode === 1 ? 18 : 1) * 0.0024),
          ),
        ),
        ...localPx(e.clientX, e.clientY),
      );
    },
    { passive: false },
  );
  document.querySelector("#zin").onclick = () => z(1.55, w / 2, h / 2, true);
  document.querySelector("#zout").onclick = () => z(1 / 1.55);
  document.querySelector("#fit").onclick = () => {
    locked = null;
    tapAt = null;
    zoom = 1;
    ox = oy = sel = hover = 0;
    tip.hidden = true;
    draw();
  };
  const mode = document.querySelector("#map-mode");
  mode.onclick = () => {
    districtMode = !districtMode;
    draw();
    mode.querySelector("span").textContent = districtMode
      ? tr("Districts", "జిల్లాలు")
      : tr("Terrain", "భూభాగం");
  };
  window.addEventListener("atlas:map-fit", () =>
    document.querySelector("#fit").click(),
  );
  new ResizeObserver(draw).observe(wrap);
  window.addEventListener("languagechange-atlas", draw);
  draw();
  return {
    enter,
    focusPoint(lon, lat, zoom) {
      tapAt = [lon, lat];
      locked = null;
      aim(lon, lat, zoom);
    },
    setFeatures(items, lines = []) {
      features = items;
      trailLines = lines;
      draw();
    },
    refresh: draw,
    focusHouse(r) {
      highlight = r.u;
      locked = r;
      aim(r.lon, r.lat, 1600);
      wrap.scrollIntoView({ block: "center", behavior: "instant" });
      coord.textContent = `${r.lat.toFixed(6)}° N · ${r.lon.toFixed(6)}° E · ${r.z} m`;
    },
  };
}

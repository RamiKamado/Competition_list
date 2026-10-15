/* WCA大会ファインダー 共通処理（index.html と cal.html で共有） */
(function (global) {
  "use strict";

  const WCA_BASE = "https://www.worldcubeassociation.org";

  // ---------- 国 ----------
  const ISO2 = ("AD AE AF AG AI AL AM AO AR AS AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ " +
    "CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FO FR " +
    "GA GB GD GE GH GL GM GN GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH " +
    "KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU " +
    "MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PR PS PT PW PY QA RO RS RU RW SA SB " +
    "SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY " +
    "UZ VA VC VE VN VU WS XK YE ZA ZM ZW").split(" ");

  let regionNames = null;
  try { regionNames = new Intl.DisplayNames(["ja"], { type: "region" }); } catch (e) { /* 古いブラウザ */ }
  const countryName = (code) => {
    if (code === "XK") return "コソボ";
    try { return (regionNames && regionNames.of(code)) || code; } catch (e) { return code; }
  };
  const flag = (code) => /^[A-Z]{2}$/.test(code || "")
    ? String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : "🏳️";

  // ---------- 種目（WCAの並び順） ----------
  const EVENTS = {
    "333": "3x3x3", "222": "2x2x2", "444": "4x4x4", "555": "5x5x5", "666": "6x6x6", "777": "7x7x7",
    "333bf": "3x3x3 目隠し", "333fm": "3x3x3 最少手数", "333oh": "3x3x3 片手",
    "clock": "クロック", "minx": "メガミンクス", "pyram": "ピラミンクス", "skewb": "スキューブ", "sq1": "スクエア1",
    "444bf": "4x4x4 目隠し", "555bf": "5x5x5 目隠し", "333mbf": "3x3x3 複数目隠し",
    "fto": "FTO", "333ft": "3x3x3 足（廃止）", "magic": "マジック（廃止）", "mmagic": "マスターマジック（廃止）", "333mbo": "複数目隠し旧形式（廃止）"
  };
  const EVENT_ORDER = ["333","222","444","555","666","777","333bf","333fm","333oh","clock","minx","pyram","skewb","sq1","444bf","555bf","333mbf","fto","333ft","magic","mmagic","333mbo"];
  // 絞り込みに使う現行種目と短い表記
  const EVENT_SHORT = {
    "333": "3x3", "222": "2x2", "444": "4x4", "555": "5x5", "666": "6x6", "777": "7x7",
    "333bf": "3BLD", "333fm": "FMC", "333oh": "OH", "clock": "Clock", "minx": "Mega", "pyram": "Pyra",
    "skewb": "Skewb", "sq1": "SQ-1", "444bf": "4BLD", "555bf": "5BLD", "333mbf": "MBLD", "fto": "FTO"
  };
  // 数字だけのキーは Object.keys で昇順に並び替わるため、WCAの順序を明示する
  const FILTER_EVENTS = ["333","222","444","555","666","777","333bf","333fm","333oh","clock","minx","pyram","skewb","sq1","444bf","555bf","333mbf","fto"];
  const OFFICIAL_ICON = new Set(["333","222","444","555","666","777","333bf","333fm","333oh","clock","minx","pyram","skewb","sq1","444bf","555bf","333mbf","333ft","333mbo","magic","mmagic"]);
  const iconClass = (id) => OFFICIAL_ICON.has(id) ? `event-${id}` : `unofficial-${id}`;
  const eventIndex = (e) => { const i = EVENT_ORDER.indexOf(e); return i < 0 ? 999 : i; };
  const sortEvents = (ids) => [...(ids || [])].sort((a, b) => eventIndex(a) - eventIndex(b));
  const eventName = (id) => EVENTS[id] || id;

  // ---------- 日付 ----------
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s) => { const d = parseYmd(s); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}(${WD[d.getDay()]})`; };
  function fmtRange(a, b) {
    if (!b || a === b) return fmtDate(a);
    const da = parseYmd(a), db = parseYmd(b);
    const tail = da.getFullYear() === db.getFullYear()
      ? `${pad(db.getMonth() + 1)}/${pad(db.getDate())}(${WD[db.getDay()]})` : fmtDate(b);
    return `${fmtDate(a)} 〜 ${tail}`;
  }
  const fmtDateTime = (d) =>
    `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}(${WD[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const TZ = (() => {
    try {
      const p = new Intl.DateTimeFormat("ja-JP", { timeZoneName: "short" }).formatToParts(new Date());
      const t = p.find(x => x.type === "timeZoneName");
      return t ? t.value : "";
    } catch (e) { return ""; }
  })();

  // ---------- その他 ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, ch =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const venueName = (v) => v ? v.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim() : "";
  const compUrl = (c) => c.url || `${WCA_BASE}/competitions/${encodeURIComponent(c.id)}`;

  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = () => navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);

  // ---------- カレンダー (.ics / RFC 5545) ----------
  const icsEscape = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  function fold(line) { // 75オクテットごとに折り返し
    const enc = new TextEncoder();
    const out = [];
    let cur = "", bytes = 0;
    for (const ch of line) {
      const b = enc.encode(ch).length;
      if (bytes + b > 75) { out.push(cur); cur = " " + ch; bytes = 1 + b; }
      else { cur += ch; bytes += b; }
    }
    out.push(cur);
    return out.join("\r\n");
  }
  const icsDate = (s) => s.replace(/-/g, "");
  const icsUtc = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const nextDay = (s) => { const d = parseYmd(s); d.setDate(d.getDate() + 1); return ymd(d); };

  function buildIcs(c, kind) {
    const url = compUrl(c);
    const venue = venueName(c.venue);
    const location = [venue, c.venue_address || c.city, countryName(c.country_iso2)].filter(Boolean).join(", ");
    const regOpen = c.registration_open ? fmtDateTime(new Date(c.registration_open)) : "未定";
    const regClose = c.registration_close ? fmtDateTime(new Date(c.registration_close)) : "未定";
    const desc = [
      c.name,
      `開催日: ${fmtRange(c.start_date, c.end_date)}`,
      `地域: ${c.city || ""}`,
      `申込開始: ${regOpen} ${TZ}`,
      `申込終了: ${regClose} ${TZ}`,
      `種目: ${sortEvents(c.event_ids).map(eventName).join(" / ")}`,
      url
    ].join("\n");

    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WCA Competition Finder//JA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VEVENT", `DTSTAMP:${icsUtc(new Date())}`
    ];
    if (kind === "reg") {
      const start = new Date(c.registration_open);
      const end = new Date(start.getTime() + 30 * 60000);
      lines.push(
        `UID:${c.id}-registration@wca-finder`,
        `DTSTART:${icsUtc(start)}`, `DTEND:${icsUtc(end)}`,
        `SUMMARY:${icsEscape("【申込開始】" + c.name)}`,
        `URL:${url}`,
        `DESCRIPTION:${icsEscape(desc)}`,
        // アラーム: 申込開始の1時間前と10分前
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(c.name + " の申込開始まであと1時間")}`, "TRIGGER:-PT1H", "END:VALARM",
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(c.name + " の申込開始まであと10分")}`, "TRIGGER:-PT10M", "END:VALARM"
      );
    } else {
      lines.push(
        `UID:${c.id}@wca-finder`,
        `DTSTART;VALUE=DATE:${icsDate(c.start_date)}`,
        `DTEND;VALUE=DATE:${icsDate(nextDay(c.end_date || c.start_date))}`,
        `SUMMARY:${icsEscape(c.name)}`,
        `LOCATION:${icsEscape(location)}`,
        `URL:${url}`,
        `DESCRIPTION:${icsEscape(desc)}`,
        "TRANSP:TRANSPARENT",
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape("明日は " + c.name)}`, "TRIGGER:-PT15H", "END:VALARM"
      );
    }
    lines.push("END:VEVENT", "END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
  }

  // Safari / PC ブラウザで直接 .ics を開く
  function openIcsDirect(c, kind) {
    const ics = buildIcs(c, kind);
    if (isIOS) {
      // iPhone の Safari では .ics を開くと「カレンダーに追加」画面が表示される
      window.location.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
      return;
    }
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${c.id}${kind === "reg" ? "-registration" : ""}.ics`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // cal.html に渡すための最小データ（URLのハッシュに入れる）
  const PICK = ["id", "name", "start_date", "end_date", "registration_open", "registration_close",
    "venue", "venue_address", "city", "country_iso2", "event_ids", "url"];
  function encodeComp(c) {
    const o = {};
    PICK.forEach(k => { if (c[k] != null) o[k] = c[k]; });
    const bin = Array.from(new TextEncoder().encode(JSON.stringify(o)), b => String.fromCharCode(b)).join("");
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeComp(s) {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))));
  }

  global.WCA = {
    WCA_BASE, ISO2, countryName, flag,
    EVENTS, EVENT_SHORT, FILTER_EVENTS, iconClass, sortEvents, eventName,
    pad, ymd, parseYmd, fmtDate, fmtRange, fmtDateTime, TZ,
    esc, venueName, compUrl, isIOS, isStandalone,
    buildIcs, openIcsDirect, encodeComp, decodeComp
  };
})(window);

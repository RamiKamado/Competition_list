/* WCA大会ファインダー メイン画面 */
(() => {
  "use strict";
  const W = window.WCA;
  const { esc, flag, countryName } = W;

  const API = `${W.WCA_BASE}/api/v0/competitions`;
  const STORE_KEY = "wcaFinder.countries";     // 登録した国・地域
  const EV_KEY = "wcaFinder.eventFilter";      // 種目フィルター
  const ROUNDS_KEY = "wcaFinder.rounds";       // ラウンド数のキャッシュ
  const HINT_KEY = "wcaFinder.installHintClosed";
  const PAGE = 50;                             // 一度に表示する件数

  const $ = (id) => document.getElementById(id);
  const sel = $("countrySelect"), chips = $("chips"), list = $("list"), statusEl = $("status"), qEl = $("q");

  // ---------- 状態 ----------
  let areas = loadAreas();     // 国コード（JP など）または地域キー（WORLD / _Asia など）
  let competitions = [];
  let filter = "all";
  let shownLimit = PAGE;
  let lastLoad = Date.now();
  let loading = false;

  function loadAreas() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (Array.isArray(v)) return v.filter(c => W.ISO2.includes(c) || W.isRegion(c));
    } catch (e) {}
    return ["JP"];
  }
  function saveAreas() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(areas)); } catch (e) {}
  }
  const areaLabel = (a) => W.isRegion(a) ? `${W.regionOf(a).icon} ${W.regionLabel(a)}` : `${flag(a)} ${countryName(a)}`;

  // ---------- 国・地域の選択 ----------
  const sorted = W.ISO2.map(c => ({ c, n: countryName(c) })).sort((a, b) => a.n.localeCompare(b.n, "ja"));
  sel.innerHTML = `<option value="">国・地域を選んで追加…</option>` +
    `<optgroup label="地域">${W.REGIONS.map(r => `<option value="${esc(r.key)}">${r.icon} ${esc(W.regionLabel(r.key))}</option>`).join("")}</optgroup>` +
    `<optgroup label="国">${sorted.map(o => `<option value="${o.c}">${flag(o.c)} ${esc(o.n)}</option>`).join("")}</optgroup>`;

  sel.addEventListener("change", () => {
    const a = sel.value;
    if (a && !areas.includes(a)) { areas.push(a); saveAreas(); renderChips(); load(); }
    sel.value = "";
  });

  function renderChips() {
    chips.innerHTML = areas.map(a =>
      `<span class="chip">${esc(areaLabel(a))}<button aria-label="${esc(areaLabel(a))}を削除" data-c="${esc(a)}">×</button></span>`
    ).join("") || `<span class="sub">国・地域が登録されていません</span>`;
    chips.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      areas = areas.filter(x => x !== b.dataset.c);
      saveAreas(); renderChips(); load();
    }));
    $("worldNote").hidden = !areas.includes("WORLD");
  }

  // ---------- 絞り込み操作 ----------
  const refilter = () => { shownLimit = PAGE; render(); };
  $("reloadBtn").addEventListener("click", () => load());
  qEl.addEventListener("input", refilter);
  document.querySelectorAll("#regSeg button").forEach(b => b.addEventListener("click", () => {
    filter = b.dataset.f;
    document.querySelectorAll("#regSeg button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    refilter();
  }));

  // ---------- 開催日の期間 ----------
  // preset があれば今日を基準に毎回計算（「3か月以内」は日が変わっても3か月先までになる）
  const DATE_KEY = "wcaFinder.dateFilter";
  let dateFilter = { preset: "", from: "", to: "" };
  try {
    const v = JSON.parse(localStorage.getItem(DATE_KEY) || "null");
    if (v && typeof v === "object") dateFilter = { preset: v.preset || "", from: v.from || "", to: v.to || "" };
  } catch (e) {}
  const saveDate = () => { try { localStorage.setItem(DATE_KEY, JSON.stringify(dateFilter)); } catch (e) {} };

  function presetRange(p) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const y = t.getFullYear(), m = t.getMonth();
    const plusMonths = (n) => { const d = new Date(t); d.setMonth(d.getMonth() + n); return d; };
    switch (p) {
      case "thisMonth": return [t, new Date(y, m + 1, 0)];
      case "nextMonth": return [new Date(y, m + 1, 1), new Date(y, m + 2, 0)];
      case "m3": return [t, plusMonths(3)];
      case "m6": return [t, plusMonths(6)];
      default: return null;
    }
  }
  // 現在の期間 { from: "YYYY-MM-DD" | "", to: "YYYY-MM-DD" | "" }
  function currentRange() {
    let from = dateFilter.from, to = dateFilter.to;
    const r = presetRange(dateFilter.preset);
    if (r) { from = W.ymd(r[0]); to = W.ymd(r[1]); }
    if (from && to && from > to) [from, to] = [to, from]; // 逆に入力されたら入れ替え
    return { from, to };
  }
  // 大会の開催期間（初日〜最終日）が指定期間と1日でも重なれば表示
  function matchDate(c, range) {
    const s = c.start_date, e = c.end_date || c.start_date;
    if (range.from && e < range.from) return false;
    if (range.to && s > range.to) return false;
    return true;
  }

  function renderDateFilter() {
    const r = currentRange();
    $("dFrom").value = r.from; $("dTo").value = r.to;
    $("dFrom").classList.toggle("set", !!r.from);
    $("dTo").classList.toggle("set", !!r.to);
    $("dFrom").min = W.ymd(new Date());
    $("dTo").min = r.from || W.ymd(new Date());
    const active = dateFilter.preset || (!r.from && !r.to ? "" : null);
    document.querySelectorAll("#dPresets button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.p === active)));
  }
  document.querySelectorAll("#dPresets button").forEach(b => b.addEventListener("click", () => {
    dateFilter = { preset: b.dataset.p, from: "", to: "" };
    saveDate(); renderDateFilter(); refilter();
  }));
  ["dFrom", "dTo"].forEach(id => $(id).addEventListener("change", () => {
    // 手入力したら「自分で指定」に切り替え（プリセットの値を引き継ぐ）
    const r = currentRange();
    dateFilter = { preset: "", from: r.from, to: r.to };
    dateFilter[id === "dFrom" ? "from" : "to"] = $(id).value;
    // 開始日が終了日より後になったら、もう一方を空にする（入れ替えると意図しない期間になるため）
    if (dateFilter.from && dateFilter.to && dateFilter.from > dateFilter.to) {
      if (id === "dFrom") dateFilter.to = ""; else dateFilter.from = "";
    }
    saveDate(); renderDateFilter(); refilter();
  }));
  renderDateFilter();

  // ---------- 種目フィルター ----------
  // evState: { 種目ID: "inc"（含む） | "exc"（含まない） }
  // evRounds: { 種目ID: "eq1" | "ge2" | "ge3" | "eq4" }（✓の種目のラウンド数条件）
  // evMode: "all"（✓をすべて含む） | "any"（✓のどれかを含む）
  const ROUND_OPTS = [
    ["", "指定なし", ""], ["eq1", "1ラウンドのみ", "1R"], ["ge2", "2ラウンド以上", "2R以上"],
    ["ge3", "3ラウンド以上", "3R以上"], ["eq4", "4ラウンド", "4R"]
  ];
  const roundShort = (cond) => (ROUND_OPTS.find(o => o[0] === cond) || ["", "", ""])[2];
  const condOk = (n, cond) => cond === "eq1" ? n === 1 : cond === "ge2" ? n >= 2 : cond === "ge3" ? n >= 3 : cond === "eq4" ? n >= 4 : true;

  let evState = {}, evRounds = {}, evMode = "all";
  try {
    const v = JSON.parse(localStorage.getItem(EV_KEY) || "null");
    if (v && typeof v === "object") {
      Object.entries(v.state || {}).forEach(([k, s]) => {
        if (W.FILTER_EVENTS.includes(k) && (s === "inc" || s === "exc")) evState[k] = s;
      });
      Object.entries(v.rounds || {}).forEach(([k, r]) => {
        if (evState[k] === "inc" && ROUND_OPTS.some(o => o[0] && o[0] === r)) evRounds[k] = r;
      });
      if (v.mode === "any") evMode = "any";
    }
  } catch (e) {}
  const saveEv = () => { try { localStorage.setItem(EV_KEY, JSON.stringify({ state: evState, rounds: evRounds, mode: evMode })); } catch (e) {} };
  const evOf = (s) => W.FILTER_EVENTS.filter(k => evState[k] === s);
  const hasRoundCond = () => Object.keys(evRounds).length > 0;

  // true: 一致 / false: 不一致 / null: ラウンド数の取得待ち
  function matchEvents(c) {
    const ids = c.event_ids || [];
    if (evOf("exc").some(e => ids.includes(e))) return false;
    const inc = evOf("inc");
    if (!inc.length) return true;
    const res = inc.map(e => {
      if (!ids.includes(e)) return false;
      const cond = evRounds[e];
      if (!cond) return true;
      const r = roundsOf(c.id);
      if (r === undefined) return roundsFailed.has(c.id) ? false : null;
      return condOk(r[e] || 0, cond);
    });
    if (evMode === "all") return res.includes(false) ? false : res.includes(null) ? null : true;
    return res.includes(true) ? true : res.includes(null) ? null : false;
  }

  function renderEvPanel() {
    const counts = {};
    competitions.forEach(c => (c.event_ids || []).forEach(e => { counts[e] = (counts[e] || 0) + 1; }));
    $("evChips").innerHTML = W.FILTER_EVENTS.map(e => {
      const s = evState[e] || "";
      const n = counts[e] || 0;
      const stateLabel = s === "inc" ? "含む" : s === "exc" ? "含まない" : "指定なし";
      return `<button class="evchip ${s}${n ? "" : " none"}" data-e="${e}" title="${esc(W.eventName(e))}"
        aria-label="${esc(W.eventName(e))}：${stateLabel}（${n}件）">
        <span class="cubing-icon ${esc(W.iconClass(e))}"></span>
        <span class="lbl">${esc(W.EVENT_SHORT[e])}</span>
        <span class="mark">${s === "inc" ? "✓" : s === "exc" ? "✕" : (competitions.length ? n : "")}</span>
      </button>`;
    }).join("");
    $("evChips").querySelectorAll(".evchip").forEach(b => b.addEventListener("click", () => {
      const e = b.dataset.e;
      const next = { "": "inc", inc: "exc", exc: "" }[evState[e] || ""];
      if (next) evState[e] = next; else delete evState[e];
      if (next !== "inc") delete evRounds[e];
      saveEv(); renderEvPanel(); refilter();
    }));

    // ✓ の種目ごとのラウンド数
    const inc = evOf("inc");
    $("evRounds").innerHTML = inc.length
      ? inc.map(e => `
        <label class="rrow">
          <span class="cubing-icon ${esc(W.iconClass(e))}"></span>
          <span class="rname">${esc(W.EVENT_SHORT[e])}</span>
          <select data-e="${e}" aria-label="${esc(W.eventName(e))}のラウンド数">
            ${ROUND_OPTS.map(([v, t]) => `<option value="${v}"${(evRounds[e] || "") === v ? " selected" : ""}>${t}</option>`).join("")}
          </select>
        </label>`).join("")
      : `<p class="rhint">種目を ✓（含む）にすると、その種目のラウンド数を指定できます。</p>`;
    $("evRounds").querySelectorAll("select").forEach(s => s.addEventListener("change", () => {
      if (s.value) evRounds[s.dataset.e] = s.value; else delete evRounds[s.dataset.e];
      saveEv(); renderEvPanel(); refilter();
    }));

    const parts = [];
    if (inc.length) parts.push(`✓ ${inc.map(e => W.EVENT_SHORT[e] + (evRounds[e] ? `(${roundShort(evRounds[e])})` : "")).join(evMode === "all" ? "＋" : "／")}`);
    const exc = evOf("exc");
    if (exc.length) parts.push(`✕ ${exc.map(e => W.EVENT_SHORT[e]).join("・")}`);
    $("evSummary").textContent = parts.join("　") || "指定なし";
    $("evSummary").classList.toggle("active", parts.length > 0);
    document.querySelectorAll("#evMode button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.m === evMode)));
  }

  document.querySelectorAll("#evMode button").forEach(b => b.addEventListener("click", () => {
    evMode = b.dataset.m; saveEv(); renderEvPanel(); refilter();
  }));
  $("evReset").addEventListener("click", () => { evState = {}; evRounds = {}; evMode = "all"; saveEv(); renderEvPanel(); refilter(); });
  if (Object.keys(evState).length) $("evPanel").open = true;

  // ---------- WCA API へのアクセス（利用制限に合わせて間隔を調整） ----------
  // WCA API は 1つのIPアドレスにつき「1分あたり60回」まで。超えると 429 (Too Many Requests) で拒否される。
  // 余裕を見てアプリ側で1分あたり50回までに抑え、それでも429が返ったら1分待ってやり直す。
  const RATE_MAX = 50, RATE_WINDOW = 60 * 1000;
  let reqTimes = [], pausedUntil = 0;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const isWaitingForLimit = () => Date.now() < pausedUntil ||
    reqTimes.filter(t => Date.now() - t < RATE_WINDOW).length >= RATE_MAX;

  async function waitSlot() {
    for (;;) {
      const now = Date.now();
      if (now < pausedUntil) { await sleep(pausedUntil - now); continue; }
      reqTimes = reqTimes.filter(t => now - t < RATE_WINDOW);
      if (reqTimes.length < RATE_MAX) { reqTimes.push(now); return; }
      await sleep(RATE_WINDOW - (now - reqTimes[0]) + 100);
    }
  }

  async function apiGet(url) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await waitSlot();
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.status === 429) {          // 利用制限に達した → 1分待って再試行
        pausedUntil = Date.now() + RATE_WINDOW;
        onRateLimited();
        continue;
      }
      if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
      return res.json();
    }
    const e = new Error("HTTP 429"); e.status = 429; throw e;
  }

  // ---------- ラウンド数（大会ごとに /competitions/{id}/events から取得） ----------
  const ROUNDS_TTL = 24 * 3600 * 1000; // 24時間は保存した値を使う
  let roundsCache = {};
  try { roundsCache = JSON.parse(localStorage.getItem(ROUNDS_KEY) || "{}") || {}; } catch (e) {}
  const roundsFailed = new Map(); // 大会ID → 失敗理由
  const roundsOf = (id) => { const e = roundsCache[id]; return e && Date.now() - e.t < ROUNDS_TTL ? e.r : undefined; };

  let saveTimer = 0;
  function saveRoundsSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const now = Date.now();
      Object.keys(roundsCache).forEach(k => { if (now - roundsCache[k].t >= ROUNDS_TTL) delete roundsCache[k]; });
      try { localStorage.setItem(ROUNDS_KEY, JSON.stringify(roundsCache)); } catch (e) {}
    }, 1000);
  }

  async function fetchRounds(id) {
    const data = await apiGet(`${API}/${encodeURIComponent(id)}/events`);
    const r = {};
    (Array.isArray(data) ? data : []).forEach(ev => { if (ev && ev.id) r[ev.id] = (ev.rounds || []).length; });
    return r;
  }

  // 取得待ちの列。high: ラウンド数での絞り込みに必要な大会、low: 画面に見えているカードの表示用
  const R_CONCURRENCY = 2;
  let rHigh = [], rLow = [], rQueued = new Set(), rActive = 0;
  function requestRounds(ids, priority = "high") {
    ids.forEach(id => {
      if (roundsOf(id) !== undefined || roundsFailed.has(id)) return;
      if (rQueued.has(id)) {
        if (priority === "high" && rLow.includes(id)) { rLow = rLow.filter(x => x !== id); rHigh.push(id); }
        return;
      }
      rQueued.add(id);
      (priority === "high" ? rHigh : rLow).push(id);
    });
    pumpRounds();
  }
  function pumpRounds() {
    while (rActive < R_CONCURRENCY && (rHigh.length || rLow.length)) {
      const id = rHigh.length ? rHigh.shift() : rLow.shift();
      rActive++;
      fetchRounds(id)
        .then(r => { roundsCache[id] = { t: Date.now(), r }; saveRoundsSoon(); })
        .catch(e => {
          if (e.status === 429) return;        // 制限中: 失敗扱いにせず、あとで再取得
          roundsFailed.set(id, e.status === 404 ? "notfound" : e.status ? "server" : "network");
        })
        .finally(() => {
          rActive--; rQueued.delete(id);
          updateCardRounds(id);
          if (hasRoundCond()) scheduleRender();
          pumpRounds();
        });
    }
  }
  function onRateLimited() { if (hasRoundCond()) scheduleRender(); }

  let renderTimer = 0;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => render({ panel: false }), rHigh.length ? 700 : 50);
  }

  // 画面に見えているカードだけラウンド数を取得（アクセス回数を節約）
  const cardObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
        const ids = entries.filter(en => en.isIntersecting).map(en => en.target.dataset.id);
        if (ids.length) requestRounds(ids, "low");
      }, { rootMargin: "200px 0px" })
    : null;

  // カードの種目アイコンにラウンド数を表示
  function updateCardRounds(id) {
    const card = list.querySelector(`article[data-id="${CSS.escape(id)}"]`);
    if (!card) return;
    const r = roundsOf(id);
    card.querySelectorAll(".ev[data-e]").forEach(el => {
      const rc = el.querySelector(".rc");
      const n = r ? r[el.dataset.e] : undefined;
      if (rc) rc.textContent = n ? String(n) : "";
      el.title = W.eventName(el.dataset.e) + (n ? `（${n}ラウンド）` : "");
    });
  }

  // ---------- 大会一覧の取得 ----------
  // 軽量な competition_index を使い、1回で最大1000件まとめて取得（中止大会は除外）
  const INDEX_API = `${W.WCA_BASE}/api/v0/competition_index`;
  const PER_PAGE = 1000;
  const KEEP = ["id", "name", "start_date", "end_date", "registration_open", "registration_close", "cancelled_at",
    "venue", "venue_address", "city", "country_iso2", "event_ids", "url"];
  const slim = (c) => { const o = {}; KEEP.forEach(k => { if (c[k] != null) o[k] = c[k]; }); return o; };

  async function fetchAll(query, startStr, onProgress) {
    const all = [];
    for (let page = 1; page <= 10; page++) {
      const url = `${INDEX_API}?${query ? query + "&" : ""}start=${startStr}&include_cancelled=false&per_page=${PER_PAGE}&page=${page}`;
      let data;
      try { data = await apiGet(url); }
      catch (e) { if (page === 1) throw e; break; } // 2ページ目以降の失敗は取得済み分で表示
      if (!Array.isArray(data) || !data.length) break;
      all.push(...data.map(slim));
      onProgress && onProgress(all.length);
      if (data.length < PER_PAGE) break; // 最終ページ
    }
    return all;
  }

  function buildQueries() {
    if (areas.includes("WORLD")) return [{ label: W.regionLabel("WORLD"), query: "" }];
    return areas.map(a => W.isRegion(a)
      ? { label: W.regionLabel(a), query: `continent=${encodeURIComponent(a)}` }
      : { label: countryName(a), query: `country_iso2=${encodeURIComponent(a)}` });
  }

  let loadSeq = 0;
  async function load() {
    const seq = ++loadSeq;
    competitions = [];
    shownLimit = PAGE;
    roundsFailed.clear(); // 前回取得に失敗したラウンド数は再取得する
    if (!areas.length) { render(); return; }
    loading = true;
    setStatus("大会情報を読み込み中…");
    list.innerHTML = "";
    $("reloadBtn").classList.add("spin");

    const today = new Date();
    const since = new Date(today); since.setDate(since.getDate() - 7); // 開催中の複数日大会も拾う
    const todayStr = W.ymd(today);
    const queries = buildQueries();
    const progress = new Array(queries.length).fill(0);

    const results = await Promise.allSettled(queries.map((q, i) => fetchAll(q.query, W.ymd(since), n => {
      progress[i] = n;
      if (seq === loadSeq) setStatus(`大会情報を読み込み中… ${progress.reduce((a, b) => a + b, 0)} 件`);
    })));
    if (seq !== loadSeq) return;
    loading = false;
    $("reloadBtn").classList.remove("spin");

    const seen = new Set();
    const failed = [];
    results.forEach((r, i) => {
      if (r.status !== "fulfilled") { failed.push(queries[i].label); return; }
      r.value.forEach(c => {
        if (seen.has(c.id)) return;
        seen.add(c.id);
        if (c.cancelled_at) return;                          // 中止大会は除外
        if ((c.end_date || c.start_date) < todayStr) return; // 終了済みは除外
        competitions.push(c);
      });
    });
    competitions.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name));

    const t = new Date();
    $("updated").textContent = `${W.pad(t.getHours())}:${W.pad(t.getMinutes())} 更新`;
    lastLoad = t.getTime();
    loadError = failed.length ? `${failed.join("、")} の取得に失敗しました。通信状況を確認して「更新」を押してください。` : "";
    render();
  }
  let loadError = "";

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("error", !!isError);
  }

  // ---------- 表示 ----------
  function regState(c, now) {
    const open = c.registration_open ? new Date(c.registration_open) : null;
    const close = c.registration_close ? new Date(c.registration_close) : null;
    if (open && now < open) {
      const days = Math.ceil((open - now) / 86400000);
      return { key: "soon", label: days <= 1 ? "まもなく申込開始" : `申込開始まで${days}日` };
    }
    if (close && now < close) return { key: "open", label: "申込受付中" };
    return { key: "closed", label: "申込締切" };
  }

  function render(opts = {}) {
    if (opts.panel !== false) renderEvPanel();
    releaseBlobUrls(); // 前回の描画で作ったカレンダー用リンクを破棄
    const now = new Date();
    const q = qEl.value.trim().toLowerCase();

    const items = [], pending = [];
    let roundErrors = 0;
    const range = currentRange();
    competitions.forEach(c => {
      if (filter !== "all" && regState(c, now).key !== filter) return;
      if (!matchDate(c, range)) return;
      if (q) {
        const hay = [c.name, c.city, W.venueName(c.venue), countryName(c.country_iso2)].join(" ").toLowerCase();
        if (!hay.includes(q)) return;
      }
      const m = matchEvents(c);
      if (m === true) items.push(c);
      else if (m === null) pending.push(c);
      else if (hasRoundCond() && roundsFailed.has(c.id)) roundErrors++;
    });
    if (pending.length) requestRounds(pending.map(c => c.id));

    if (loadError) setStatus(loadError, true);
    else if (!areas.length) setStatus("");
    else {
      let msg = `${items.length} 件の大会${items.length !== competitions.length ? `（全 ${competitions.length} 件中）` : ""}`;
      if (pending.length) {
        msg += isWaitingForLimit()
          ? ` ・ WCAの利用制限（1分あたり60回）のため待機中…（ラウンド数の確認 残り ${pending.length} 件）`
          : ` ・ ラウンド数を確認中…（残り ${pending.length} 件）`;
      }
      if (roundErrors) msg += ` ・ ${roundErrors} 件はラウンド数を取得できませんでした（${failReasonText()}）`;
      setStatus(msg);
    }

    if (!areas.length) {
      list.innerHTML = `<div class="empty">上のメニューから国・地域を追加すると、予定されている大会が表示されます。</div>`;
      return;
    }
    if (!items.length) {
      list.innerHTML = `<div class="empty">${pending.length ? "ラウンド数を確認しています…" : competitions.length ? "条件に合う大会がありません。" : "予定されている大会は見つかりませんでした。"}</div>`;
      return;
    }

    const shown = items.slice(0, shownLimit);
    list.innerHTML = shown.map(c => cardHtml(c, now)).join("") +
      (items.length > shown.length
        ? `<button class="btn more" id="moreBtn">さらに表示（残り ${items.length - shown.length} 件）</button>` : "");

    list.querySelectorAll("button[data-cal]").forEach(b => b.addEventListener("click", () => {
      const c = competitions.find(x => x.id === b.dataset.id);
      if (c) openInSafari(c, b.dataset.cal);
    }));
    const more = $("moreBtn");
    if (more) more.addEventListener("click", () => { shownLimit += PAGE; render({ panel: false }); });

    // 画面に見えているカードのラウンド数を取得してアイコンに表示
    if (cardObserver) {
      cardObserver.disconnect();
      list.querySelectorAll("article[data-id]").forEach(el => { if (roundsOf(el.dataset.id) === undefined) cardObserver.observe(el); });
    } else {
      requestRounds(shown.slice(0, 10).map(c => c.id), "low");
    }
  }

  function failReasonText() {
    const reasons = new Set(roundsFailed.values());
    const t = [];
    if (reasons.has("network")) t.push("通信エラー");
    if (reasons.has("notfound")) t.push("大会情報が非公開");
    if (reasons.has("server")) t.push("WCA側のエラー");
    return (t.join("・") || "不明") + "。「更新」で再取得します";
  }

  function cardHtml(c, now) {
    const st = regState(c, now);
    const open = c.registration_open ? W.fmtDateTime(new Date(c.registration_open)) : "未定";
    const close = c.registration_close ? W.fmtDateTime(new Date(c.registration_close)) : "未定";
    const url = W.compUrl(c);
    const venue = W.venueName(c.venue);
    const canRemindOpen = c.registration_open && new Date(c.registration_open) > now;
    const r = roundsOf(c.id);
    return `
      <article class="card" data-id="${esc(c.id)}">
        <div class="card-head">
          <div class="where">${flag(c.country_iso2)} ${esc(countryName(c.country_iso2))}</div>
          <span class="badge ${st.key}">${st.label}</span>
        </div>
        <div class="name"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(c.name)}</a></div>
        <dl class="info">
          <dt>開催日</dt><dd>${W.fmtRange(c.start_date, c.end_date)}</dd>
          <dt>地域</dt><dd>${esc(c.city || "")}${venue ? `<br><span class="sub">${esc(venue)}</span>` : ""}</dd>
          <dt>申込開始</dt><dd>${open} <span class="tz">${esc(W.TZ)}</span></dd>
          <dt>申込終了</dt><dd>${close} <span class="tz">${esc(W.TZ)}</span></dd>
          <dt>URL</dt><dd class="url"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></dd>
        </dl>
        <div class="events" aria-label="種目（数字はラウンド数）">
          ${W.sortEvents(c.event_ids).map(e => {
            const n = r ? r[e] : undefined;
            return `<span class="ev${evState[e] === "inc" ? " hit" : ""}" data-e="${esc(e)}" title="${esc(W.eventName(e) + (n ? `（${n}ラウンド）` : ""))}"><span class="cubing-icon ${esc(W.iconClass(e))}"></span><span class="rc">${n ? n : ""}</span></span>`;
          }).join("")}
        </div>
        <div class="actions">
          <a href="${esc(url)}" target="_blank" rel="noopener">🌐 WCAページ</a>
          ${calControl(c, "comp", "📅 大会日程をカレンダーに追加")}
          ${canRemindOpen ? calControl(c, "reg", "⏰ 申込開始日時をカレンダーに追加") : ""}
        </div>
      </article>`;
  }

  // ---------- カレンダー ----------
  // Safari / PC: .ics（Blob）への本物のリンクを置き、タップでそのまま開く。
  //   ※ iOS 26.6 以降は data: URL やスクリプトからの遷移では反応しないため。
  // ホーム画面アプリ: iOS がアプリ内で .ics を開けないため、Safari で cal.html を開く。
  let blobUrls = [];
  function releaseBlobUrls() { blobUrls.forEach(u => URL.revokeObjectURL(u)); blobUrls = []; }

  function calControl(c, kind, label) {
    if (W.isIOS && W.isStandalone()) {
      return `<button class="cal" data-cal="${kind}" data-id="${esc(c.id)}">${label}</button>`;
    }
    const { href, download } = W.icsLinkAttrs(c, kind);
    blobUrls.push(href);
    return `<a class="cal" href="${esc(href)}" download="${esc(download)}" target="_self" rel="noopener">${label}</a>`;
  }

  function openInSafari(c, kind) {
    const helper = new URL(`cal.html#k=${kind}&d=${W.encodeComp(c)}`, location.href).href;
    let left = false;
    const onHide = () => { if (document.visibilityState === "hidden") left = true; };
    document.addEventListener("visibilitychange", onHide);
    // iOS 17 以降: x-safari-https:// で Safari アプリを直接開ける
    window.location.href = "x-safari-" + helper;
    setTimeout(() => {
      document.removeEventListener("visibilitychange", onHide);
      if (!left) showSafariDialog(helper);
    }, 1500);
  }

  function showSafariDialog(helper) {
    const dlg = $("safariDialog");
    $("safariLink").href = helper;
    $("copyLink").onclick = async () => {
      try { await navigator.clipboard.writeText(helper); $("copyLink").textContent = "コピーしました"; }
      catch (e) { prompt("このリンクをコピーして Safari で開いてください", helper); }
    };
    $("copyLink").textContent = "リンクをコピー";
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }
  $("closeDialog").addEventListener("click", () => {
    const dlg = $("safariDialog");
    if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open");
  });

  // ---------- ホーム画面に追加の案内（iPhone の Safari のみ） ----------
  (function installHint() {
    let closed = false;
    try { closed = localStorage.getItem(HINT_KEY) === "1"; } catch (e) {}
    if (!W.isIOS || W.isStandalone() || closed) return;
    const el = $("installHint");
    el.hidden = false;
    $("closeHint").addEventListener("click", () => {
      el.hidden = true;
      try { localStorage.setItem(HINT_KEY, "1"); } catch (e) {}
    });
  })();

  // アプリに戻ってきたら自動更新（30分以上経過時）
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !loading && Date.now() - lastLoad > 30 * 60000) load();
  });

  // ---------- Service Worker ----------
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }

  renderChips();
  load();
})();

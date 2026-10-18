/* WCA大会ファインダー メイン画面 */
(() => {
  "use strict";
  const W = window.WCA;
  const { esc, flag, countryName } = W;

  const API = `${W.WCA_BASE}/api/v0/competitions`;
  const STORE_KEY = "wcaFinder.countries";
  const HINT_KEY = "wcaFinder.installHintClosed";

  // ---------- 状態 ----------
  let countries = loadCountries();
  let competitions = [];
  let filter = "all";
  let lastLoad = Date.now();

  function loadCountries() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (Array.isArray(v)) return v.filter(c => W.ISO2.includes(c));
    } catch (e) {}
    return ["JP"];
  }
  function saveCountries() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(countries)); } catch (e) {}
  }

  // ---------- 要素 ----------
  const $ = (id) => document.getElementById(id);
  const sel = $("countrySelect"), chips = $("chips"), list = $("list"), statusEl = $("status"), qEl = $("q");

  const sorted = W.ISO2.map(c => ({ c, n: countryName(c) })).sort((a, b) => a.n.localeCompare(b.n, "ja"));
  sel.innerHTML = `<option value="">国を選んで追加…</option>` +
    sorted.map(o => `<option value="${o.c}">${flag(o.c)} ${esc(o.n)}</option>`).join("");

  sel.addEventListener("change", () => {
    const c = sel.value;
    if (c && !countries.includes(c)) { countries.push(c); saveCountries(); renderChips(); load(); }
    sel.value = "";
  });
  $("reloadBtn").addEventListener("click", () => load());
  qEl.addEventListener("input", () => render());
  document.querySelectorAll("#regSeg button").forEach(b => b.addEventListener("click", () => {
    filter = b.dataset.f;
    document.querySelectorAll("#regSeg button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    render();
  }));

  // ---------- 種目フィルター ----------
  // evState: { 種目ID: "inc"（含む） | "exc"（含まない） }、evMode: "all" | "any"
  const EV_KEY = "wcaFinder.eventFilter";
  let evState = {}, evMode = "all";
  try {
    const v = JSON.parse(localStorage.getItem(EV_KEY) || "null");
    if (v && typeof v === "object") {
      Object.entries(v.state || {}).forEach(([k, s]) => {
        if (W.FILTER_EVENTS.includes(k) && (s === "inc" || s === "exc")) evState[k] = s;
      });
      if (v.mode === "any") evMode = "any";
    }
  } catch (e) {}
  const saveEv = () => { try { localStorage.setItem(EV_KEY, JSON.stringify({ state: evState, mode: evMode })); } catch (e) {} };
  const evOf = (s) => Object.keys(evState).filter(k => evState[k] === s);

  function matchEvents(c) {
    const ids = c.event_ids || [];
    const inc = evOf("inc"), exc = evOf("exc");
    if (exc.some(e => ids.includes(e))) return false;
    if (inc.length) {
      return evMode === "all" ? inc.every(e => ids.includes(e)) : inc.some(e => ids.includes(e));
    }
    return true;
  }

  function renderEvChips() {
    // 読み込んだ大会で各種目が何件あるか
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
      saveEv(); render();
    }));

    const inc = evOf("inc"), exc = evOf("exc");
    const parts = [];
    if (inc.length) parts.push(`✓ ${inc.map(e => W.EVENT_SHORT[e]).join(evMode === "all" ? "＋" : "／")}`);
    if (exc.length) parts.push(`✕ ${exc.map(e => W.EVENT_SHORT[e]).join("・")}`);
    $("evSummary").textContent = parts.join("　") || "指定なし";
    $("evSummary").classList.toggle("active", parts.length > 0);
    document.querySelectorAll("#evMode button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.m === evMode)));
  }

  document.querySelectorAll("#evMode button").forEach(b => b.addEventListener("click", () => {
    evMode = b.dataset.m; saveEv(); render();
  }));
  $("evReset").addEventListener("click", () => { evState = {}; evMode = "all"; saveEv(); render(); });
  if (Object.keys(evState).length) $("evPanel").open = true;

  function renderChips() {
    chips.innerHTML = countries.map(c =>
      `<span class="chip">${flag(c)} ${esc(countryName(c))}<button aria-label="${esc(countryName(c))}を削除" data-c="${c}">×</button></span>`
    ).join("") || `<span class="sub">国が登録されていません</span>`;
    chips.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      countries = countries.filter(x => x !== b.dataset.c);
      saveCountries(); renderChips(); load();
    }));
  }

  // ---------- 取得 ----------
  async function fetchCountry(iso, startStr) {
    const all = [];
    for (let page = 1; page <= 20; page++) {
      const url = `${API}?country_iso2=${encodeURIComponent(iso)}&start=${startStr}` + (page > 1 ? `&page=${page}` : "");
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        if (page === 1) throw new Error(`HTTP ${res.status}`);
        break;
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      all.push(...data);
      if (data.length < 25) break; // 最終ページ
    }
    return all;
  }

  let loadSeq = 0;
  async function load() {
    const seq = ++loadSeq;
    competitions = [];
    if (!countries.length) { render(); return; }
    setStatus("大会情報を読み込み中…");
    list.innerHTML = "";
    $("reloadBtn").classList.add("spin");

    const today = new Date();
    const since = new Date(today); since.setDate(since.getDate() - 7); // 開催中の複数日大会も拾う
    const todayStr = W.ymd(today);

    const results = await Promise.allSettled(countries.map(c => fetchCountry(c, W.ymd(since))));
    if (seq !== loadSeq) return;
    $("reloadBtn").classList.remove("spin");

    const seen = new Set();
    const failed = [];
    results.forEach((r, i) => {
      if (r.status !== "fulfilled") { failed.push(countryName(countries[i])); return; }
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
    render();
    if (failed.length) {
      setStatus(`${failed.join("、")} の取得に失敗しました。通信状況を確認して「更新」を押してください。`, true);
    }
  }

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

  function render() {
    const now = new Date();
    const q = qEl.value.trim().toLowerCase();
    renderEvChips();
    releaseBlobUrls(); // 前回の描画で作ったカレンダー用リンクを破棄
    const items = competitions.filter(c => {
      if (filter !== "all" && regState(c, now).key !== filter) return false;
      if (!matchEvents(c)) return false;
      if (q) {
        const hay = [c.name, c.city, W.venueName(c.venue), countryName(c.country_iso2)].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    setStatus(countries.length
      ? `${items.length} 件の大会${items.length !== competitions.length ? `（全 ${competitions.length} 件中）` : ""}`
      : "");

    if (!countries.length) {
      list.innerHTML = `<div class="empty">上のメニューから国を追加すると、その国で予定されている大会が表示されます。</div>`;
      return;
    }
    if (!items.length) {
      list.innerHTML = `<div class="empty">${competitions.length ? "条件に合う大会がありません。" : "予定されている大会は見つかりませんでした。"}</div>`;
      return;
    }

    list.innerHTML = items.map(c => {
      const st = regState(c, now);
      const open = c.registration_open ? W.fmtDateTime(new Date(c.registration_open)) : "未定";
      const close = c.registration_close ? W.fmtDateTime(new Date(c.registration_close)) : "未定";
      const url = W.compUrl(c);
      const venue = W.venueName(c.venue);
      const canRemindOpen = c.registration_open && new Date(c.registration_open) > now;
      return `
      <article class="card">
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
        <div class="events" aria-label="種目">
          ${W.sortEvents(c.event_ids).map(e => `<span class="ev${evState[e] === "inc" ? " hit" : ""}" title="${esc(W.eventName(e))}" aria-label="${esc(W.eventName(e))}"><span class="cubing-icon ${esc(W.iconClass(e))}"></span></span>`).join("")}
        </div>
        <div class="actions">
          <a href="${esc(url)}" target="_blank" rel="noopener">🌐 WCAページ</a>
          ${calControl(c, "comp", "📅 大会日程をカレンダーに追加")}
          ${canRemindOpen ? calControl(c, "reg", "⏰ 申込開始日時をカレンダーに追加") : ""}
        </div>
      </article>`;
    }).join("");

    list.querySelectorAll("button[data-cal]").forEach(b => b.addEventListener("click", () => {
      const c = competitions.find(x => x.id === b.dataset.id);
      if (c) openInSafari(c, b.dataset.cal);
    }));
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
    if (document.visibilityState === "visible" && Date.now() - lastLoad > 30 * 60000) load();
  });

  // ---------- Service Worker ----------
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }

  renderChips();
  load();
})();

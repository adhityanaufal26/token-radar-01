// Token Launch Radar — page logic. No network: every number below comes
// from the data file written beside this page, and the detail view
// recomputes each row from its own stored factors, so the page and the
// board file can never quietly disagree.
(function () {
  var D = globalThis.RADAR_DATA;
  var rows = D.rows;
  var live = D.live;
  var meta = D.meta;

  var state = { tab: "pre", q: "", cat: "", chain: "", wl: false, sort: "rank", dir: 1, open: null };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) {
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return "$" + Math.round(n / 1e3) + "K";
    return "$" + Number(n).toLocaleString("en-US");
  }
  function fullMoney(n) { return "$" + Number(n).toLocaleString("en-US"); }
  function pct(v) {
    if (v === null || v === undefined) return "—";
    return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
  }
  function ageText(d) {
    if (d >= 365) return (d / 365).toFixed(1) + "y";
    return d + "d";
  }

  // ---- hash deep links: #p=<slug> #category= #chain= #q= #watchlist=1 #tab=
  function readHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    state.tab = h.get("tab") === "live" ? "live" : "pre";
    state.q = h.get("q") || "";
    state.cat = h.get("category") || "";
    state.chain = h.get("chain") || "";
    state.wl = h.get("watchlist") === "1";
    state.open = h.get("p") || null;
    state.sort = state.tab === "live" ? "mcap" : "rank";
    state.dir = state.tab === "live" ? -1 : 1;
  }
  function writeHash() {
    var h = new URLSearchParams();
    if (state.tab === "live") h.set("tab", "live");
    if (state.q) h.set("q", state.q);
    if (state.cat) h.set("category", state.cat);
    if (state.chain) h.set("chain", state.chain);
    if (state.wl) h.set("watchlist", "1");
    if (state.open) h.set("p", state.open);
    var s = h.toString();
    history.replaceState(null, "", s ? "#" + s : location.pathname + location.search);
  }

  // ---- spotlight: the five most valuable pre-token rows
  function renderSpot() {
    var top = rows.slice(0, 5);
    $("spot").innerHTML = top.map(function (r) {
      return '<article class="spot" data-slug="' + esc(r.slug) + '" tabindex="0">' +
        '<div class="r">RANK ' + r.rank + (r.watchlist ? " · WATCHLIST" : "") + "</div>" +
        '<div class="n">' + esc(r.name) + "</div>" +
        '<div class="v">' + money(r.implied_value_usd) + "</div>" +
        '<div class="s">' + esc(r.category || "No category") + " · TVL " + money(r.tvl_usd) + "</div>" +
        "</article>";
    }).join("");
  }

  // ---- filters
  function counts(list, key) {
    var c = {};
    list.forEach(function (r) {
      var vals = key === "chain" ? r.chains : [r.category || "No category"];
      vals.forEach(function (v) { c[v] = (c[v] || 0) + 1; });
    });
    return c;
  }
  function renderFilters() {
    var cats = counts(rows, "cat");
    var chains = counts(rows, "chain");
    var catHtml = '<option value="">All categories (' + rows.length + ")</option>" +
      Object.keys(cats).sort().map(function (c) {
        return '<option value="' + esc(c) + '"' + (state.cat === c ? " selected" : "") + ">" + esc(c) + " (" + cats[c] + ")</option>";
      }).join("");
    var chainHtml = '<option value="">All chains (' + rows.length + ")</option>" +
      Object.keys(chains).sort().map(function (c) {
        return '<option value="' + esc(c) + '"' + (state.chain === c ? " selected" : "") + ">" + esc(c) + " (" + chains[c] + ")</option>";
      }).join("");
    $("cat").innerHTML = catHtml;
    $("chain").innerHTML = chainHtml;
    $("q").value = state.q;
    $("wl").checked = state.wl;
    $("tab-pre").classList.toggle("on", state.tab === "pre");
    $("tab-live").classList.toggle("on", state.tab === "live");
    $("wl").disabled = state.tab === "live";
  }

  function visibleRows() {
    var list = state.tab === "live" ? live : rows;
    var q = state.q.trim().toLowerCase();
    return list.filter(function (r) {
      if (state.tab === "pre") {
        if (state.wl && !r.watchlist) return false;
        if (state.cat && (r.category || "No category") !== state.cat) return false;
        if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      }
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function sortedRows(list) {
    var key = state.sort;
    var dir = state.dir;
    var val = function (r) {
      if (key === "name") return r.name.toLowerCase();
      if (key === "mcap") return r.mcap_usd || 0;
      if (key === "ratio") return r.ratio || 0;
      if (key === "tvl") return r.tvl_usd;
      if (key === "change") return r.change_7d === null ? -9999 : r.change_7d;
      if (key === "age") return r.age_days;
      if (key === "implied") return r.implied_value_usd || 0;
      return r.rank || 0;
    };
    return list.slice().sort(function (a, b) {
      var va = val(a), vb = val(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }

  // ---- table
  var PRE_COLS = [
    { key: "rank", label: "Rank", num: true },
    { key: "name", label: "Protocol", num: false },
    { key: "tvl", label: "TVL", num: true },
    { key: "change", label: "7d", num: true },
    { key: "age", label: "Age", num: true },
    { key: "implied", label: "Implied value", num: true },
  ];
  var LIVE_COLS = [
    { key: "rank", label: "#", num: true },
    { key: "name", label: "Protocol", num: false },
    { key: "tvl", label: "TVL", num: true },
    { key: "mcap", label: "Market cap", num: true },
    { key: "ratio", label: "Mcap / TVL", num: true },
    { key: "age", label: "Age", num: true },
  ];

  function renderTable() {
    var cols = state.tab === "live" ? LIVE_COLS : PRE_COLS;
    $("head").innerHTML = "<tr>" + cols.map(function (c) {
      var arrow = state.sort === c.key ? (state.dir === 1 ? " ▲" : " ▼") : "";
      return '<th data-key="' + c.key + '" class="sortable' + (c.num ? " num" : "") + '">' + c.label + arrow + "</th>";
    }).join("") + "</tr>";
    var list = sortedRows(visibleRows());
    var total = state.tab === "live" ? live.length : rows.length;
    document.querySelector(".count").innerHTML =
      "Showing <b>" + list.length + "</b> of <b>" + total + "</b> " +
      (state.tab === "live" ? "live-token protocols" : "pre-token protocols") +
      (state.tab === "pre" ? " · total implied value <b>" + money(meta.totalImplied) + "</b>" : "");
    $("rows").innerHTML = list.map(function (r, i) {
      var cells;
      if (state.tab === "live") {
        cells = "<td class=\"num\">" + (i + 1) + "</td>" +
          "<td><b>" + esc(r.name) + "</b><span class=\"sub\">" + esc(r.category || "No category") + " · " + esc(r.chains.join(", ")) + "</span></td>" +
          "<td class=\"num\">" + money(r.tvl_usd) + "</td>" +
          "<td class=\"num\">" + money(r.mcap_usd) + "</td>" +
          "<td class=\"num\">" + r.ratio.toFixed(3) + "</td>" +
          "<td class=\"num\">" + ageText(r.age_days) + "</td>";
      } else {
        var ch = r.change_7d === null ? "" : (r.change_7d >= 0 ? " up" : " down");
        cells = "<td class=\"num\">" + r.rank + "</td>" +
          "<td><b>" + esc(r.name) + "</b>" + (r.watchlist ? '<span class="pill">WATCHLIST</span>' : "") +
          "<span class=\"sub\">" + esc(r.category || "No category") + " · " + esc(r.chains.join(", ")) + "</span></td>" +
          "<td class=\"num\">" + money(r.tvl_usd) + "</td>" +
          "<td class=\"num" + ch + "\">" + pct(r.change_7d) + "</td>" +
          "<td class=\"num\">" + ageText(r.age_days) + "</td>" +
          "<td class=\"num\"><b>" + money(r.implied_value_usd) + "</b></td>";
      }
      return '<tr data-slug="' + esc(r.slug) + '" tabindex="0">' + cells + "</tr>";
    }).join("");
  }

  // ---- model panel: formula plus every category multiple
  function renderModel() {
    var multRows = D.multiples.map(function (m) {
      var src = m.fallback
        ? "Whole-market median — only " + m.sample + " live name" + (m.sample === 1 ? "" : "s") + " in this category"
        : "Median of " + m.sample + " live-token market-cap / TVL ratios";
      return "<tr><td>" + esc(m.category) + "</td><td class=\"num\">" + m.multiple.toFixed(4) + "</td><td class=\"num\">" + m.sample + "</td><td>" + esc(src) + "</td></tr>";
    }).join("");
    $("model").innerHTML =
      "<h2>How the radar works</h2>" +
      '<p class="formula">implied = TVL × category multiple × growth × maturity × breadth</p>' +
      "<p>Growth is the 7-day TVL change, clamped to −60%…+120% and half-weighted; unreported growth counts as zero. " +
      "Maturity runs from 0.6 for a brand-new listing to 1.0 after three years with no token yet; an unknown listing date counts as 365 days. " +
      "Breadth adds 2% per extra chain, capped at +10%. The category multiple is the median market-cap / TVL of the live-token protocols " +
      "in the same category in this same snapshot, when at least three of them report both figures — otherwise the whole market's median, " +
      "clamped to 0.05…1.2. Protocols reporting a market cap of zero or less are left out of the medians: a dead token carries no price signal.</p>" +
      "<p>The board ranks " + rows.length + " pre-token protocols: the full 40-protocol watchlist, plus every pre-token protocol below the " +
      "$50M floor that passes the watchlist's own visible tests. Above the floor, only the watchlist is ranked — the house rule also reads " +
      "the parent-protocol record, which this snapshot does not carry, so a large pre-token protocol the list leaves out is a bridge, a staked " +
      "product, an exchange product, a versioned pool, or a product of a protocol whose token already trades. The " + live.length +
      " live-token protocols on the other tab are the market the multiples are read from, shown with their market caps as facts, not a model.</p>" +
      "<h3>Category multiples</h3>" +
      "<table><thead><tr><th>Category</th><th class=\"num\">Multiple</th><th class=\"num\">Live sample</th><th>Source</th></tr></thead><tbody>" +
      multRows + "</tbody></table>" +
      "<p>Snapshot: " + esc(meta.asOf) + " · " + esc(meta.source) + "</p>";
  }

  // ---- detail dialog
  function whyText(r) {
    var parts = [];
    parts.push("Rank " + r.rank + " of " + rows.length + " with an implied value of " + fullMoney(r.implied_value_usd) + ".");
    var tvlShare = (r.tvl_usd / rows.reduce(function (s, x) { return s + x.tvl_usd; }, 0) * 100);
    parts.push("Its TVL of " + fullMoney(r.tvl_usd) + " is " + tvlShare.toFixed(1) + "% of all the TVL on this board.");
    if (r.change_7d !== null && r.change_7d > 5) parts.push("TVL grew " + r.change_7d.toFixed(1) + "% in the last 7 days, which lifts the value through the growth factor.");
    else if (r.change_7d !== null && r.change_7d < -5) parts.push("TVL fell " + Math.abs(r.change_7d).toFixed(1) + "% in the last 7 days, which drags the value down through the growth factor.");
    else parts.push("Seven-day growth is near flat, so the growth factor barely moves the value either way.");
    if (r.age_days >= 1095) parts.push("It has run for over three years with no token on record, so the maturity factor is at its full 1.00.");
    else if (r.age_days >= 365) parts.push("It has run for " + ageText(r.age_days) + " with no token on record, so the maturity factor is " + r.maturity_factor.toFixed(2) + ".");
    else parts.push("It is only " + ageText(r.age_days) + " old, so the maturity factor is " + r.maturity_factor.toFixed(2) + " — youth costs it against older names.");
    parts.push(r.chains.length > 1
      ? "TVL sits on " + r.chains.length + " chains, earning the full breadth bonus the model allows."
      : "TVL sits on a single chain, so there is no breadth bonus yet.");
    return parts.join(" ");
  }

  function openDetail(slug) {
    var r = rows.find(function (x) { return x.slug === slug; });
    var dlg = document.querySelector("dialog.detail");
    if (!r) {
      var l = live.find(function (x) { return x.slug === slug; });
      if (!l) return;
      dlg.innerHTML = '<div class="inner"><button class="x">Close</button>' +
        "<h2>" + esc(l.name) + "</h2>" +
        '<p class="kicker">LIVE TOKEN · ' + esc(l.category || "No category") + " · " + esc(l.chains.join(", ")) + "</p>" +
        '<p class="big">' + money(l.mcap_usd) + " market cap</p>" +
        "<p>This protocol already has a token trading, so the radar does not score it — it is shown here because its market cap is one of the " +
        "prices the category multiples are read from. Market cap / TVL is " + l.ratio.toFixed(3) + " on TVL of " + money(l.tvl_usd) + ".</p>" +
        "<h3>Record</h3><table><tbody>" +
        "<tr><td>TVL</td><td class=\"num\">" + fullMoney(l.tvl_usd) + "</td></tr>" +
        "<tr><td>Market cap</td><td class=\"num\">" + fullMoney(l.mcap_usd) + "</td></tr>" +
        "<tr><td>7-day TVL change</td><td class=\"num\">" + pct(l.change_7d) + "</td></tr>" +
        "<tr><td>Age</td><td class=\"num\">" + ageText(l.age_days) + "</td></tr>" +
        "</tbody></table></div>";
      dlg.showModal();
      bindDialogClose(dlg);
      return;
    }
    var recomputed = Math.round(r.tvl_usd * r.category_multiple * r.growth_factor * r.maturity_factor * r.breadth_factor);
    var mult = D.multiples.find(function (m) { return m.category === (r.category || "(no category)"); });
    var multNote = mult
      ? (mult.fallback ? "whole-market median (only " + mult.sample + " live names in this category)" : "median of " + mult.sample + " live-token ratios in this category")
      : "whole-market median";
    dlg.innerHTML = '<div class="inner"><button class="x">Close</button>' +
      "<h2>" + esc(r.name) + "</h2>" +
      '<p class="kicker">RANK ' + r.rank + " · " + esc(r.category || "No category") + " · " + esc(r.chains.join(", ")) +
      (r.watchlist ? " · WATCHLIST" : "") + "</p>" +
      '<p class="big">' + money(r.implied_value_usd) + " implied value</p>" +
      "<h3>Model breakdown</h3><table><tbody>" +
      "<tr><td>TVL</td><td class=\"num\">" + fullMoney(r.tvl_usd) + "</td></tr>" +
      "<tr><td>Category multiple (" + esc(multNote) + ")</td><td class=\"num\">" + r.category_multiple + "</td></tr>" +
      "<tr><td>Growth factor (7d " + pct(r.change_7d) + ", clamped −60%…+120%, half-weighted)</td><td class=\"num\">" + r.growth_factor.toFixed(4) + "</td></tr>" +
      "<tr><td>Maturity factor (" + ageText(r.age_days) + " old)</td><td class=\"num\">" + r.maturity_factor.toFixed(4) + "</td></tr>" +
      "<tr><td>Breadth factor (" + r.chains.length + " chain" + (r.chains.length === 1 ? "" : "s") + ")</td><td class=\"num\">" + r.breadth_factor.toFixed(4) + "</td></tr>" +
      "<tr><td>Recomputed from these factors</td><td class=\"num\">" + fullMoney(recomputed) + "</td></tr>" +
      "</tbody></table>" +
      '<p class="' + (recomputed === r.implied_value_usd ? "ok" : "") + '">Recompute check: ' +
      (recomputed === r.implied_value_usd
        ? "the page recomputes " + fullMoney(recomputed) + " — the same number board.json carries."
        : "mismatch — the page recomputes " + fullMoney(recomputed) + " against " + fullMoney(r.implied_value_usd) + " in board.json.") + "</p>" +
      "<h3>Why this rank</h3><p>" + esc(whyText(r)) + "</p>" +
      "<h3>How to farm it — six steps</h3><ol>" +
      r.farm_steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") +
      "</ol></div>";
    dlg.showModal();
    bindDialogClose(dlg);
  }

  function bindDialogClose(dlg) {
    dlg.querySelector(".x").addEventListener("click", function () { closeDetail(); });
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg) closeDetail();
    });
  }
  function closeDetail() {
    var dlg = document.querySelector("dialog.detail");
    if (dlg.open) dlg.close();
    if (state.open) { state.open = null; writeHash(); }
  }

  // ---- wiring
  function renderAll() {
    $("meta").textContent = "Snapshot " + meta.asOf + " · " + meta.rows + " pre-token protocols ranked · " +
      meta.live + " live-token protocols · total implied " + money(meta.totalImplied);
    renderSpot();
    renderFilters();
    renderTable();
    renderModel();
  }

  document.addEventListener("click", function (e) {
    var spot = e.target.closest(".spot");
    var row = e.target.closest("#rows tr");
    var tabBtn = e.target.closest("[data-tab]");
    var th = e.target.closest("th.sortable");
    if (th) {
      var key = th.getAttribute("data-key");
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === "name" ? 1 : -1; }
      renderTable();
      return;
    }
    if (tabBtn) {
      state.tab = tabBtn.getAttribute("data-tab");
      state.sort = state.tab === "live" ? "mcap" : "rank";
      state.dir = state.tab === "live" ? -1 : 1;
      state.open = null;
      writeHash();
      renderFilters();
      renderTable();
      return;
    }
    var el = spot || row;
    if (el) {
      state.open = el.getAttribute("data-slug");
      writeHash();
      openDetail(state.open);
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      var el = e.target.closest(".spot, #rows tr");
      if (el) { state.open = el.getAttribute("data-slug"); writeHash(); openDetail(state.open); }
    }
  });

  $("q").addEventListener("input", function () { state.q = $("q").value; writeHash(); renderTable(); });
  $("cat").addEventListener("change", function () { state.cat = $("cat").value; writeHash(); renderTable(); });
  $("chain").addEventListener("change", function () { state.chain = $("chain").value; writeHash(); renderTable(); });
  $("wl").addEventListener("change", function () { state.wl = $("wl").checked; writeHash(); renderTable(); });
  document.querySelector("dialog.detail").addEventListener("close", function () {
    if (state.open) { state.open = null; writeHash(); }
  });
  window.addEventListener("hashchange", function () {
    readHash();
    renderFilters();
    renderTable();
    if (state.open) openDetail(state.open);
    else { var d = document.querySelector("dialog.detail"); if (d.open) d.close(); }
  });

  readHash();
  renderAll();
  if (state.open) openDetail(state.open);
})();

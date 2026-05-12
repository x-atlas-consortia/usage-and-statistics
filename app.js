// Navigation/iframe logic removed — not used by this index.html variant

function formatBytes(bytes) {
  // Prefer using the `filesize` library if available (browser global added via CDN).
  if (bytes === null || bytes === undefined || bytes === "") return "";
  // allow numeric strings
  const n = Number(bytes);
  if (Number.isNaN(n)) return String(bytes);

  // determine render mode: 'smart' (default) or 'rounded'
  const mode =
    typeof window !== "undefined" && window.downloadBytesRenderMode
      ? window.downloadBytesRenderMode
      : "smart";

  // If rounded mode is requested, always round to the nearest whole number for the unit
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  function formatWithUnit(value, roundWhole, baseFactor = 1024) {
    let i = 0;
    while (value >= baseFactor && i < sizes.length - 1) {
      value /= baseFactor;
      i++;
    }
    const display = roundWhole
      ? Math.round(value)
      : value < 10 && value % 1 !== 0
      ? Math.round(value * 10) / 10
      : Math.round(value);
    return `<span class="downloaded-bold">${display}</span><span class="size-unit">${sizes[i]}</span>`;
  }

  if (mode === "rounded") {
    // rounded in SI (decimal) units
    return formatWithUnit(n, true, 1000);
  }

  // special TB-only mode (SI): always express value in TB with two decimals (1 TB = 10^12 bytes)
  if (mode === "tb") {
    const tb = n / Math.pow(1000, 4);
    const display = tb.toFixed(2);
    return `<span class="downloaded-bold">${display}</span><span class="size-unit">TB</span>`;
  }

  // IEC mode: show TiB using binary base (2^40) and 'TiB' unit
  if (mode === "iec") {
    const tib = n / Math.pow(1024, 4);
    const display = (Math.round(tib * 100) / 100).toFixed(2);
    return `<span class="downloaded-bold">${display}</span><span class="size-unit">TiB</span>`;
  }

  // raw mode: display the raw integer bytes value with unit 'B'
  if (mode === "raw") {
    try {
      const fmt = new Intl.NumberFormat().format(Math.round(n));
      return `<span class="downloaded-bold">${fmt}</span><span class="size-unit">B</span>`;
    } catch (e) {
      return `<span class="downloaded-bold">${Math.round(
        n
      )}</span><span class="size-unit">B</span>`;
    }
  }

  // smart mode: prefer using global `filesize` if provided (added via CDN in index.html)
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.filesize === "function"
    ) {
      // use binary (IEC) units so smart mode prefers TiB for large transfer totals
      const formatted = window.filesize(n, {base: 2, round: 2, spacer: " "});
      // filesize may use non-breaking spaces; normalize and split into value + unit
      const out = String(formatted)
        .replace(/\u00A0/g, " ")
        .trim();
      const parts = out.split(/\s+/);
      const numPart = parts.shift() || "";
      const unitPart = parts.join(" ") || "";
      if (unitPart)
        return `<span class="downloaded-bold">${numPart}</span><span class="size-unit">${unitPart}</span>`;
      return `<span class="downloaded-bold">${out}</span>`;
    }
  } catch (e) {
    // fall through to fallback
  }

  // Fallback to human-readable formatter
  return formatWithUnit(n, false);
}

// Loading overlay helpers
function showLoadingOverlay(message) {
  if (document.getElementById("loading-overlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "loading-overlay";
  overlay.className = "loading-overlay";
  const wrap = document.createElement("div");
  wrap.className = "spinner-wrap";
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  spinner.setAttribute("role", "status");
  spinner.setAttribute("aria-live", "polite");
  spinner.setAttribute("aria-label", message || "Loading");
  const text = document.createElement("div");
  text.className = "loading-text";
  text.textContent = message || "Loading…";
  const sr = document.createElement("span");
  sr.className = "visually-hidden";
  sr.textContent = message || "Loading";
  wrap.appendChild(spinner);
  wrap.appendChild(text);
  wrap.appendChild(sr);
  overlay.appendChild(wrap);
  document.body.appendChild(overlay);
  document.body.classList.add("dimmed");
}

function hideLoadingOverlay() {
  const el = document.getElementById("loading-overlay");
  if (el) el.remove();
  document.body.classList.remove("dimmed");
}

const DEFAULT_API_URL = "http://10.4.119.74:8484/publication-and-usage-stats";

function getConfiguredApiUrl() {
  // (provided by envs.js)
  try {
    if (
      typeof window !== "undefined" &&
      window.__APP_CONFIG__ &&
      typeof window.__APP_CONFIG__.API_URL === "string" &&
      window.__APP_CONFIG__.API_URL.trim()
    ) {
      return window.__APP_CONFIG__.API_URL.trim();
    }
  } catch (e) {
    // ignore
  }
  return DEFAULT_API_URL;
}

async function init() {
  // Remove any existing overlays from previous attempts
  const existing = document.getElementById("error-overlay");
  if (existing) existing.remove();

  const API_URL = getConfiguredApiUrl();
  function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const signal = controller.signal;
    const timeout = setTimeout(() => controller.abort(), ms);
    return fetch(url, {signal}).finally(() => clearTimeout(timeout));
  }

  // Show spinner while we attempt to load data (will be hidden in finally)
  showLoadingOverlay("Loading usage data…");

  try {
    // Ensure the resizable tab area starts at up to 1200px (or viewport width minus container margins)
    try {
      const resizable = document.querySelector(".resizable-tab-content");
      if (resizable) {
        const containerSideMargins = 56; // matches .container margin: 28px on each side
        const desired = Math.min(
          1200,
          Math.max(320, window.innerWidth - containerSideMargins)
        );
        resizable.style.width = desired + "px";
      }
    } catch (e) {
      // ignore
    }
    let data;
    try {
      const apiRes = await fetchWithTimeout(API_URL, 30000);
      if (!apiRes.ok) throw new Error("API returned " + apiRes.status);
      data = await apiRes.json();
      console.info("Loaded data from " + API_URL);
    } catch (apiErr) {
      console.warn(
        "Failed to load from API, attempting fallback to sample data",
        apiErr
      );
      // Try fallback to bundled sample JSON so the UI can render in offline/dev scenarios
      try {
        const sampleRes = await fetch("sampleUsageResponse.json");
        if (!sampleRes.ok)
          throw new Error("Sample file returned " + sampleRes.status);
        const text = await sampleRes.text();
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          try {
            const coerced = "[" + text.replace(/}\s*\{/g, "},{") + "]";
            const arr = JSON.parse(coerced);
            if (Array.isArray(arr) && arr.length > 0) {
              data = arr[0];
              console.warn(
                "Parsed concatenated JSON from sampleUsageResponse.json; using first object"
              );
            } else {
              throw parseErr;
            }
          } catch (_) {
            throw parseErr;
          }
        }
        showSimulatedBanner(apiErr);
        console.info("Loaded sample data from sampleUsageResponse.json");
      } catch (sampleErr) {
        console.error("Failed to load sample data", sampleErr);
        // If loading the bundled sample also fails, show the modal error overlay.
        showErrorOverlay(sampleErr || apiErr);
        return; // nothing we can do
      }
    }

    // Use `last_touch` from the returned data to populate the page header
    try {
      const rawLast =
        data &&
        (data.last_touch || data.lastTouch || data.lastGenerated || null);
      if (rawLast) {
        const d = new Date(rawLast);
        if (!isNaN(d)) {
          const formatted = d.toLocaleString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
          });
          const lastEl = document.getElementById("lastTouchDate");
          if (lastEl) lastEl.textContent = formatted;
        }
      }
    } catch (e) {
      // ignore formatting errors
    }

    // monthly (sorted) and totals
    const monthly = (data.monthly_transfer_totals || [])
      .slice()
      .sort((a, b) => {
        const da = new Date(a.month);
        const db = new Date(b.month);
        if (!isNaN(da) && !isNaN(db)) return da - db;
        return String(a.month).localeCompare(String(b.month));
      });

    const values = monthly.map((m) => m.bytes_downloaded || 0);
    const totalBytes = values.reduce((s, v) => s + (v || 0), 0);
    const parts = (function () {
      try {
        if (typeof filesize === "function") {
          const out = String(
            filesize(totalBytes || 0, {base: 2, round: 2, spacer: " "})
          );
          const p = out.split(/\s+/);
          const n = p[0] ? Number(p[0]) : 0;
          const u = p.slice(1).join("") || "B";
          return {
            num: Number.isFinite(n) ? n.toFixed(2) : String(p[0] || "0.00"),
            unit: u,
          };
        }
      } catch (e) {
        // fall through to fallback
      }
      if (totalBytes === 0) return {num: "0.00", unit: "B"};
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB", "TB"];
      let i = Math.floor(Math.log(totalBytes) / Math.log(k));
      if (i < 0) i = 0;
      if (i >= sizes.length) i = sizes.length - 1;
      const num = (totalBytes / Math.pow(k, i)).toFixed(2);
      return {num: String(num), unit: sizes[i]};
    })();

    const totalValueEl = document.getElementById("totalValue");
    if (totalValueEl) {
      totalValueEl.innerHTML = `${parts.num} <sup class="sup">${parts.unit}</sup>`;
    }

    // Downloaded Data Table (with ACCUMULATED TOTAL row)
    const downloadedDataTable = document.getElementById("downloadedDataTable");
    if (downloadedDataTable && downloadedDataTable.querySelector) {
      const tbody = downloadedDataTable.querySelector("tbody");
      if (tbody) {
        // Compute TiB once and store processed downloaded entries in app state
        function computeTiBNumber(numBytes) {
          const v = Number(numBytes) || 0;
          try {
            if (
              typeof window !== "undefined" &&
              typeof window.filesize === "function"
            ) {
              // force exponent 4 (TiB) and binary base; parse numeric portion
              const out = String(
                window.filesize(v, {
                  base: 2,
                  round: 2,
                  spacer: " ",
                  exponent: 4,
                })
              )
                .replace(/\u00A0/g, " ")
                .trim();
              const parts = out.split(/\s+/);
              const n = parts[0] ? Number(parts[0]) : 0;
              return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
            }
          } catch (e) {
            // fall through to fallback
          }
          const TiB = Math.pow(1024, 4);
          return Number((v / TiB || 0).toFixed(2));
        }

        // Build array of processed downloaded rows with bytes + TiB numeric value
        const processedDownloaded = monthly.map((m) => ({
          month: m.month,
          bytes: Number(m.bytes_downloaded) || 0,
          TiB: computeTiBNumber(m.bytes_downloaded),
        }));
        // For the table display we prefer latest-month-first (reverse chronological)
        const displayDownloaded = processedDownloaded.slice().reverse();
        const accumulatedTotalTiB = computeTiBNumber(totalBytes || 0);

        // expose processed data for other parts of the app to refer to
        try {
          window.__USAGE_APP_STATE__ = window.__USAGE_APP_STATE__ || {};
          window.__USAGE_APP_STATE__.rawData = data;
          window.__USAGE_APP_STATE__.downloaded = processedDownloaded;
          window.__USAGE_APP_STATE__.totalBytes = totalBytes;
          window.__USAGE_APP_STATE__.totalTiB = accumulatedTotalTiB;
        } catch (e) {
          // ignore if global assign fails in some constrained environments
        }

        // Render rows using precomputed TiB (store original bytes for tooltips)
        let downloadedRows = [];
        downloadedRows.push(
          `<tr><td style="font-weight:600;">ACCUMULATED TOTAL</td><td class="accumulatedTotal numFormat" data-bytes="${totalBytes}" data-tib="${accumulatedTotalTiB}">${accumulatedTotalTiB.toFixed(
            2
          )}</td></tr>`
        );
        downloadedRows = downloadedRows.concat(
          displayDownloaded.map((d) => {
            const dDate = new Date(d.month);
            let label;
            if (!isNaN(dDate)) {
              const month = dDate.toLocaleDateString(undefined, {
                month: "short",
              });
              const year = dDate.getFullYear();
              label = `<span class=\"month-bold\">${month}</span> <span class=\"year-muted\">${year}</span>`;
            } else {
              label = String(d.month);
            }
            return `<tr><td>${label}</td><td class="numFormat" data-bytes="${
              d.bytes
            }" data-tib="${d.TiB}">${d.TiB.toFixed(2)}</td></tr>`;
          })
        );
        tbody.innerHTML = downloadedRows.join("");

        // helper to (re)render cells from their attributes without recomputing TiB
        function renderDownloadedCells() {
          tbody.querySelectorAll("td[data-bytes]").forEach((td) => {
            const raw = td.getAttribute("data-bytes");
            const tibAttr = td.getAttribute("data-tib");
            let tb = "0.00";
            try {
              if (tibAttr !== null) {
                tb = (Number(tibAttr) || 0).toFixed(2);
              } else {
                tb = computeTiBNumber(raw).toFixed(2);
              }
            } catch (e) {
              tb = computeTiBNumber(raw).toFixed(2);
            }
            td.innerHTML = `<span class="downloaded-bold">${tb}</span>`;
            // expose the raw numeric bytes value on hover (tooltip) for each cell and its row
            const rawStr = String(raw ?? "");
            try {
              const formatted = rawStr
                ? Intl.NumberFormat().format(Number(rawStr))
                : "";
              const tooltip = formatted ? `bytes: ${formatted}` : "";
              td.setAttribute("title", tooltip);
              const row = td.closest && td.closest("tr");
              if (row) row.setAttribute("title", tooltip);
            } catch (e) {
              // ignore DOM errors
            }
          });
        }
        renderDownloadedCells();
      }
    }

    // chart — ensure monthly data is sorted chronologically (oldest -> newest)
    // reuse the already sorted 'monthly' variable above
    const chartMonthly = monthly; // or just use 'monthly' directly below
    const labels = chartMonthly.map((m) => {
      const d = new Date(m.month);
      if (!isNaN(d))
        return d.toLocaleDateString(undefined, {
          month: "short",
          year: "2-digit",
        });
      return String(m.month);
    });
    const chartValues = chartMonthly.map((m) => m.bytes_downloaded);
    // compute cumulative totals (running sum) so chart shows cumulative bytes over time
    let running = 0;
    const cumulativeValues = values.map((v) => {
      running += v || 0;
      return running;
    });
    // set startDate and endDate based on earliest/latest monthly entries with a value
    const firstWithValue =
      monthly.find((m) => m.bytes_downloaded && m.bytes_downloaded > 0) || null;
    let lastWithValue = null;
    for (let i = monthly.length - 1; i >= 0; i--) {
      const m = monthly[i];
      if (m && m.bytes_downloaded && m.bytes_downloaded > 0) {
        lastWithValue = m;
        break;
      }
    }
    function formatMonthLabel(s) {
      const d = new Date(s);
      if (!isNaN(d))
        return d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
        });
      return String(s);
    }
    const startLabel = firstWithValue
      ? formatMonthLabel(firstWithValue.month)
      : "—";
    const endLabel = lastWithValue
      ? formatMonthLabel(lastWithValue.month)
      : "—";
    // Date range for the Downloaded Data tab: use first and last available months in the dataset
    const rangeStart =
      monthly && monthly.length > 0 ? formatMonthLabel(monthly[0].month) : "—";
    const rangeEnd =
      monthly && monthly.length > 0
        ? formatMonthLabel(monthly[monthly.length - 1].month)
        : "—";
    const startEl = document.getElementById("startDate");
    const endEl = document.getElementById("endDate");
    if (startEl) startEl.textContent = startLabel;
    if (endEl) endEl.textContent = endLabel;
    // Populate the downloaded-data tab range label (e.g. "May 2020 - Jun 2026")
    const downloadedRangeEl = document.getElementById("downloadedRange");
    if (downloadedRangeEl)
      downloadedRangeEl.textContent = `${rangeStart} - ${rangeEnd}`;
    // also populate any cap-specific date placeholders inside card caps
    document.querySelectorAll(".cap-start").forEach((el) => {
      el.textContent = startLabel;
    });
    document.querySelectorAll(".cap-end").forEach((el) => {
      el.textContent = endLabel;
    });
    // append the date range to the total label for context
    const totalLabelEl = document.getElementById("totalLabel");
    if (totalLabelEl) {
      totalLabelEl.innerHTML = `Total data consumed from the portal <small class="small">between ${startLabel} and ${endLabel}</small>`;
    }

    // datasets table
    // Aggregate datasets by `dataset_type` so primary + component are combined
    const rawDatasets = data.datasets || [];
    const agg = rawDatasets.reduce((m, d) => {
      const key = d.dataset_type || "Unknown";
      m[key] = (m[key] || 0) + (d.ds_count || 0);
      return m;
    }, {});
    const datasets = Object.keys(agg).map((k) => ({
      dataset_type: k,
      ds_count: agg[k],
    }));
    datasets.sort((a, b) => b.ds_count - a.ds_count);
    const datasetsTable = document.getElementById("datasetsTable");
    datasetsTable.innerHTML = datasets
      .map((d) => `<tr><td>${d.dataset_type}</td><td>${d.ds_count}</td></tr>`)
      .join("");
    const totalDatasets = datasets.reduce((acc, d) => acc + d.ds_count, 0);

    // organs table
    const organs = (data.organ_types || [])
      .slice()
      .sort((a, b) => b.organ_count - a.organ_count);
    const organsTable = document.getElementById("organsTable");
    // Wrap (Left) and (Right) in a span for styling
    function formatOrganName(name) {
      return name.replace(/\s*\((Left|Right)\)/gi, function (match, p1) {
        return ` <span class="organ-side">(${p1})</span>`;
      });
    }
    organsTable.innerHTML = organs
      .map(
        (o) =>
          `<tr><td>${formatOrganName(o.name)}</td><td>${
            o.organ_count
          }</td></tr>`
      )
      .join("");
    const totalOrgans = organs.reduce((acc, o) => acc + o.organ_count, 0);
  } catch (err) {
    console.error("Failed to load usage data", err);
    showErrorOverlay(err);
  } finally {
    hideLoadingOverlay();
  }
}

function showSimulatedBanner(originalError) {
  // Avoid duplicating the banner
  if (document.getElementById("simulated-data-banner")) return;
  const banner = document.createElement("div");
  banner.id = "simulated-data-banner";
  banner.className = "simulated-data-banner";
  banner.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 14h-2v-2h2v2zm0-4h-2V6h2v6z" fill="#8a5c00"/></svg>
        <div>
          <strong>Using simulated data</strong>
          <div style="font-size:0.9rem;color:#6b4b00;">Connection to the Ingest API failed; data shown is from sampleUsageResponse.json.</div>
        </div>
      </div>
      <div>
        <button id="dismiss-simulated-banner" class="btn">Dismiss</button>
      </div>
    </div>
  `;
  // Basic inline styling so it looks acceptable without changing styles.css
  banner.style.background = "#fff7ed";
  banner.style.border = "1px solid #ffecd1";
  banner.style.padding = "10px 14px";
  banner.style.margin = "8px 12px";
  banner.style.borderRadius = "6px";
  banner.style.color = "#4a2e00";
  banner.style.fontFamily = "Inter, system-ui, sans-serif";
  banner.style.fontSize = "0.95rem";

  // Insert above the main container if present, otherwise at top of body
  const container = document.querySelector(".container");
  if (container && container.parentNode)
    container.parentNode.insertBefore(banner, container);
  else document.body.insertAdjacentElement("afterbegin", banner);

  document
    .getElementById("dismiss-simulated-banner")
    .addEventListener("click", () => {
      banner.remove();
    });
}

// Listen for layout change messages from parent and apply without reloading
window.addEventListener("message", function (e) {
  try {
    const msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
    if (!msg || msg.type !== "set-layout") return;
    const raw = String(msg.layout || "");
    const layout =
      raw === "stack" || raw === "single" || raw === "single-column"
        ? "single-column"
        : "side";
    const grid = document.querySelector(".grid");
    if (grid) {
      if (layout === "single-column") grid.classList.add("single-column");
      else grid.classList.remove("single-column");
    }
    // update our own query string so the new layout is reflected in location.search without reload
    try {
      const params = new URLSearchParams(window.location.search || "");
      if (layout === "single-column") params.set("layout", "stack");
      else params.delete("layout");
      const newUrl =
        window.location.pathname +
        (params.toString() ? "?" + params.toString() : "");
      history.replaceState(null, "", newUrl);
    } catch (err) {
      // ignore
    }
  } catch (err) {
    // ignore malformed messages
  }
});

function showErrorOverlay(err) {
  // Remove any existing overlay
  const existing = document.getElementById("error-overlay");
  if (existing) existing.remove();

  // Modal overlay
  const overlay = document.createElement("div");
  overlay.id = "error-overlay";
  overlay.className = "error-overlay";

  // Modal card wrapper (for stacking header above card)
  const modalWrapper = document.createElement("div");
  modalWrapper.className = "error-modal-wrapper";

  // Modal header/title bar (outside card)
  const modalHeader = document.createElement("div");
  modalHeader.className = "error-modal-header";
  modalHeader.textContent = "Error";

  // Modal card (content)
  const card = document.createElement("div");
  card.className = "error-modal-card";

  // User-friendly message
  const msg = document.createElement("div");
  msg.className = "error-msg";
  msg.textContent = "Sorry, something went wrong loading usage data.";

  // Collapsible error details
  const details = document.createElement("details");
  details.className = "error-details";
  const summary = document.createElement("summary");
  summary.textContent = "Show error details";
  details.appendChild(summary);
  const pre = document.createElement("pre");
  pre.className = "error-modal-pre";
  // Prefer error message, then stack, then stringified error
  if (err && err.message) {
    pre.textContent = err.message + (err.stack ? "\n" + err.stack : "");
  } else if (err && err.stack) {
    pre.textContent = err.stack;
  } else {
    pre.textContent = String(err);
  }
  details.appendChild(pre);

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.className = "btn";
  closeBtn.classList.add("error-close");
  closeBtn.onclick = () => overlay.remove();
  card.appendChild(msg);
  card.appendChild(details);
  card.appendChild(closeBtn);
  modalWrapper.appendChild(modalHeader);
  modalWrapper.appendChild(card);
  overlay.appendChild(modalWrapper);
  document.body.appendChild(overlay);
}

window.addEventListener("DOMContentLoaded", init);
// Special Classic Body Class Toggles
(function setupLegacyStyles() {
  const code = [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "b",
    "a",
    "Enter",
  ];
  let buffer = [];
  window.addEventListener("keydown", function onKey(e) {
    try {
      // ignore input elements so normal typing isn't disrupted
      const tag =
        e.target && e.target.tagName ? e.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || e.target.isContentEditable)
        return;
      buffer.push(e.key);
      if (buffer.length > code.length) buffer.shift();
      // debug: log the pressed key and current buffer
      console.debug("[legacyStyle] key:", e.key, "buffer:", buffer.join(","));
      if (
        buffer.length === code.length &&
        buffer.every((v, i) => v === code[i])
      ) {
        try {
          console.info("[legacyStyle] sequence matched — cycling retro themes");
          const hasWin = document.body.classList.contains("win31");
          const hasDos = document.body.classList.contains("dos");
          let msg = "";
          // cycle: none -> win31 -> dos -> none
          if (!hasWin && !hasDos) {
            // enable Win3.1-only theme (do NOT load monitor.css)
            document.body.classList.add("win31");
            msg = "Windows 3.1 theme enabled";
          } else if (hasWin && !hasDos) {
            // swap Win3.1 -> DOS and load monitor.css for DOS visuals
            document.body.classList.remove("win31");
            document.body.classList.add("dos");
            ensureMonitorCss();
            msg = "DOS theme enabled";
          } else {
            // was DOS (or both) -> clear retro themes and unload monitor.css
            document.body.classList.remove("win31");
            document.body.classList.remove("dos");
            removeMonitorCss();
            msg = "Retro themes disabled";
          }
          // After a successful theme toggle, scroll to top so users see the updated theme immediately
          try {
            window.scrollTo && window.scrollTo({top: 0, behavior: "smooth"});
          } catch (e) {
            /* ignore */
          }
          // show a small toast that auto-removes
          const id = "win31-toast";
          if (!document.getElementById(id)) {
            const t = document.createElement("div");
            t.id = id;
            t.textContent = msg;
            document.body.appendChild(t);
            setTimeout(() => {
              const el = document.getElementById(id);
              if (el) el.remove();
            }, 2600);
          }
          // clear buffer to avoid repeated toggles
          buffer = [];
        } catch (err) {
          console.error("[legacyStyle] theme cycle error", err);
        }
      }
    } catch (err) {
      console.error("[legacyStyle] handler error", err);
    }
  });
})();
/* === end easter-egg JS === */

// Global error handler for uncaught errors
window.addEventListener("error", function (event) {
  showErrorOverlay(event.error || event.message || event);
});

// Global handler for unhandled promise rejections
window.addEventListener("unhandledrejection", function (event) {
  showErrorOverlay(event.reason || event);
});

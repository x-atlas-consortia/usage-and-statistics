
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
  showLoadingOverlay("Loading usage data…");
  try {
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

    // Render `last_touch`
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

    // Lightweight parser: return {year, month} for strings like `YYYY-MM` or `YYYY-MM-02`.
    function parseMonthParts(s) {
      const m = String(s || "").trim();
      const ym = m.match(/^(\d{4})-(\d{2})(?:-02)?$/);
      if (!ym) return null;
      const year = Number(ym[1]);
      const month = Number(ym[2]);
      if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
      return { year, month };
    }

    // Sets day of month to avoid UTC timezone shifting issues
    function setRowDay(s) {
      return String(s).trim() + "-02";
    }
    const monthlyRaw = (data.monthly_transfer_totals || []).slice();
    monthlyRaw.forEach((m) => {
      if (m && m.month) m.month = setRowDay(m.month);
    });
    const monthly = monthlyRaw;
    const values = monthlyRaw.map((m) => m.bytes_downloaded || 0);
    const totalBytes = values.reduce((s, v) => s + (v || 0), 0);

    // Downloaded Data Table (with ACCUMULATED TOTAL row)
    const downloadedDataTable = document.getElementById("downloadedDataTable");
    if (downloadedDataTable && downloadedDataTable.querySelector) {
      const tbody = downloadedDataTable.querySelector("tbody");
      if (tbody) {
        // Compute TiB once and store processed downloaded entries in app state
        function computeTiBNumber(numBytes) {
          const v = Number(numBytes) || 0;
          // Rely solely on the `filesize` library available via CDN in index.html.
          
          if (typeof window === "undefined" || typeof window.filesize !== "function") {
            // Signal missing library by returning NaN rather than doing a fallback calculation.
            return NaN;
          }
          const out = String(
            window.filesize(v, { base: 2, round: 2, spacer: " ", exponent: 4 })
          ).replace(/\u00A0/g, " ").trim();
          const m = out.match(/^(-?[\d,]+(?:\.\d+)?)/);
          const n = m && m[1] ? Number(m[1].replace(/,/g, "")) : NaN;
          return Number.isFinite(n) ? Number(n.toFixed(2)) : NaN;
        }

        // Build array of processed downloaded rows with bytes + TiB numeric value
        const processedDownloaded = monthly.map((m) => ({
          month: m.month,
          bytes: Number(m.bytes_downloaded) || 0,
          TiB: computeTiBNumber(m.bytes_downloaded),
        }));
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
            const mp = parseMonthParts(d.month);
            let label;
            if (mp) {
              const month = new Date(mp.year, mp.month - 1, 1).toLocaleDateString(undefined, {
                month: "short",
              });
              label = `<span class="month-bold">${month}</span> <span class="year-muted">${mp.year}</span>`;
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
    // Use the oldest and newest available monthly entries from the dataset
    const firstEntry = monthly && monthly.length > 0 ? monthly[0] : null;
    const lastEntry = monthly && monthly.length > 0 ? monthly[monthly.length - 1] : null;
    function formatMonthLabel(s) {
      const mp = parseMonthParts(s);
      if (mp)
        return new Date(mp.year, mp.month - 1, 1).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
        });
      return String(s);
    }
    const startLabel = firstEntry ? formatMonthLabel(firstEntry.month) : "—";
    const endLabel = lastEntry ? formatMonthLabel(lastEntry.month) : "—";
    // Date range for the Downloaded Data tab: use first and last available months in the dataset
    const rangeStart =
      monthly && monthly.length > 0 ? formatMonthLabel(monthly[0].month) : "—";
    const rangeEnd =
      monthly && monthly.length > 0
        ? formatMonthLabel(monthly[monthly.length - 1].month)
        : "—";
    // `startDate` / `endDate` elements removed from HTML; range labels
    // are rendered into `downloadedRange` instead.
    // Populate the downloaded-data tab range label (e.g. "May 2020 - Jun 2026")
    const downloadedRangeEl = document.getElementById("downloadedRange");
    if (downloadedRangeEl)
      downloadedRangeEl.textContent = `${rangeStart} - ${rangeEnd}`;
    
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
  // Styling moved to `css/styles.css` under the `.simulated-data-banner` selector

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


// Global error handler for uncaught errors
window.addEventListener("error", function (event) {
  showErrorOverlay(event.error || event.message || event);
});

// Global handler for unhandled promise rejections
window.addEventListener("unhandledrejection", function (event) {
  showErrorOverlay(event.reason || event);
});

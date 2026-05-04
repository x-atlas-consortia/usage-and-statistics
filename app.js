// --- Navigation, iframe, and layout logic from index.html ---
window.addEventListener('DOMContentLoaded', function(){
  const links = document.querySelectorAll('.nav-link');
  const frame = document.getElementById('mainFrame');
  // remember per-src layout state ("side" or "stack")
  const layouts = {};

  function buildSrcUrl(src, layoutOverride) {
    const url = new URL(src, window.location.href);
    // forward any parent query params (e.g. ?v=...) to the iframe unless already present
    const parentParams = new URLSearchParams(window.location.search || '');
    parentParams.forEach((val, key) => {
      if (!url.searchParams.has(key)) url.searchParams.set(key, val);
    });
    // apply layout override if provided, otherwise use stored layout for this src
    const layoutToApply = layoutOverride || layouts[src];
    if (layoutToApply) url.searchParams.set('layout', layoutToApply === 'stack' ? 'stack' : 'side');
    return url.toString();
  }

  // regular tab navigation (no Ctrl/Cmd toggling here)
  function activateTab(src, options={push:true, layoutOverride:null}){
    const match = Array.from(links).find(x => x.getAttribute('data-src') === src);
    if (match) {
      links.forEach(x => x.classList.remove('active'));
      match.classList.add('active');
    }
    // load iframe with forwarded params + optional layout override
    frame.src = buildSrcUrl(src, options.layoutOverride);
    // update parent URL so active tab is reflected; preserve other params
    try {
      const params = new URLSearchParams(window.location.search || '');
      params.set('src', src);
      const newUrl = window.location.pathname + (params.toString() ? ('?' + params.toString()) : '');
      if (options.push) history.pushState({ src }, '', newUrl);
      else history.replaceState({ src }, '', newUrl);
    } catch (err) {
      // ignore history errors
    }
  }
  links.forEach(l => l.addEventListener('click', e => {
    e.preventDefault();
    const src = l.getAttribute('data-src');
    activateTab(src, { push: true });
  }));

  // Ctrl/Cmd + click on the brand toggles layout for the currently active tab
  const brand = document.querySelector('.brand');
  if (brand) {
    brand.addEventListener('click', e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // find the active tab (fallback to first link)
      const active = document.querySelector('.nav-link.active') || links[0];
      if (!active) return;
      const src = active.getAttribute('data-src');
      const current = layouts[src] || 'side';
      const next = current === 'side' ? 'stack' : 'side';
      layouts[src] = next;
      // If the iframe is currently showing that src, send a postMessage to ask the child to reapply layout
      try {
        const iframeWindow = frame && frame.contentWindow;
        const frameUrl = frame && frame.src ? String(frame.src) : '';
        const isSame = frameUrl && frameUrl.indexOf(src) !== -1;
        if (iframeWindow && isSame) {
          iframeWindow.postMessage({ type: 'set-layout', layout: next === 'stack' ? 'stack' : 'side' }, '*');
        } else {
          // fallback: navigate the iframe to the src with layout param
          frame.src = buildSrcUrl(src, next === 'stack' ? 'stack' : 'side');
        }
      } catch (err) {
        // fallback to reloading if messaging fails
        frame.src = buildSrcUrl(src, next === 'stack' ? 'stack' : 'side');
      }
      // ensure active styling
      links.forEach(x => x.classList.remove('active'));
      active.classList.add('active');
    });
  }
  // if the page was opened with a top-level ?src=... param, auto-open that link
  try {
    const qs = new URLSearchParams(window.location.search || '');
    const requested = qs.get('src');
    if (requested) {
      // use activateTab but don't push another history entry
      activateTab(requested, { push: false });
    }
    else {
      // otherwise ensure the initially-active tab is loaded with forwarded parent params
      const active = document.querySelector('.nav-link.active') || links[0];
      if (active) {
        const src = active.getAttribute('data-src');
        activateTab(src, { push: false });
      }
    }
  } catch (e) {
    // ignore
  }

  // respond to back/forward navigation — restore the src param as the active tab
  window.addEventListener('popstate', function(ev){
    try {
      const qs = new URLSearchParams(window.location.search || '');
      const requested = qs.get('src');
      if (requested) activateTab(requested, { push: false });
    } catch (err) {
      // ignore
    }
  });

  // accept layout change notifications from child frames so parent remembers user's choice
  window.addEventListener('message', function(e){
    try {
      const msg = (typeof e.data === 'string') ? JSON.parse(e.data) : e.data;
      if (!msg || msg.type !== 'layout-changed') return;
      const rawSrc = msg.src || '';
      // try to match a configured data-src by basename
      const basename = rawSrc.split('/').pop();
      let linkKey = null;
      for (const l of links) {
        const ds = l.getAttribute('data-src') || '';
        if (ds === rawSrc || ds.indexOf(basename) !== -1) { linkKey = ds; break; }
      }
      if (!linkKey) {
        const active = document.querySelector('.nav-link.active');
        linkKey = active ? active.getAttribute('data-src') : null;
      }
      if (linkKey) layouts[linkKey] = (msg.layout === 'stack' ? 'stack' : 'side');
    } catch (err) {
      // ignore malformed messages
    }
  });
});
// app.js — minimal static site behavior

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B','KB','MB','GB'];
  let i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i > 3) i = 3; // Cap at GB
  return `<span class=\"downloaded-bold monospace\">${parseFloat((bytes / Math.pow(k, i)).toFixed(2))}</span> <span class=\"monospace\">${sizes[i]}</span>`;
}

function generatePalette(n) {
  // Generate a gradient palette between two hex colors (default: #cfd3e2 -> #444a65)
  const startHex = '#cfd3e2';
  const endHex = '#444a65';
  function hexToRgb(hex) {
    const h = hex.replace('#','');
    const bigint = parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h, 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  }
  function rgbToHex(r,g,b){
    return '#' + [r,g,b].map(v=> Math.round(v).toString(16).padStart(2,'0')).join('');
  }
  const a = hexToRgb(startHex);
  const b = hexToRgb(endHex);
  if (!n || n <= 0) return [];
  if (n === 1) return [rgbToHex((a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2)];
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = a[0] + (b[0] - a[0]) * t;
    const g = a[1] + (b[1] - a[1]) * t;
    const bl = a[2] + (b[2] - a[2]) * t;
    out.push(rgbToHex(r,g,bl));
  }
  return out;
}

async function init(){
  // ...existing code...
  // Remove any existing overlays from previous attempts
  const existing = document.getElementById('error-overlay');
  if (existing) existing.remove();

  const API_URL = 'http://localhost:8484/publication-and-usage-stats';
  function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const signal = controller.signal;
    const timeout = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal }).finally(() => clearTimeout(timeout));
  }

  try{
    // apply layout param (allow parent to toggle between side-by-side and stacked)
    try {
      const params = new URLSearchParams(window.location.search || '');
      const layout = params.get('layout');
      const grid = document.querySelector('.grid');
      if (grid) {
        if (layout === 'stack' || layout === 'single' || layout === 'single-column') grid.classList.add('single-column');
        else grid.classList.remove('single-column');
      }
    } catch (e) {
      // ignore URL parsing errors
    }
    let data;
    try{
      const apiRes = await fetchWithTimeout(API_URL, 30000);
      if (!apiRes.ok) throw new Error('API returned ' + apiRes.status);
      data = await apiRes.json();
      console.info('Loaded data from ' + API_URL);
    } catch (apiErr) {
      console.warn('Failed to load from API, attempting fallback to sample data', apiErr);
      // Try fallback to bundled sample JSON so the UI can render in offline/dev scenarios
      try {
        const sampleRes = await fetch('sampleUsageResponse.json');
        if (!sampleRes.ok) throw new Error('Sample file returned ' + sampleRes.status);
        const text = await sampleRes.text();
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          // If the sample file contains multiple JSON objects concatenated together,
          // try to coerce into a JSON array and take the first object as a best-effort fallback.
          try {
            const coerced = '[' + text.replace(/}\s*\{/g, '},{') + ']';
            const arr = JSON.parse(coerced);
            if (Array.isArray(arr) && arr.length > 0) {
              data = arr[0];
              console.warn('Parsed concatenated JSON from sampleUsageResponse.json; using first object');
            } else {
              throw parseErr;
            }
          } catch (_) {
            throw parseErr;
          }
        }
        showSimulatedBanner(apiErr);
        console.info('Loaded sample data from sampleUsageResponse.json');
      } catch (sampleErr) {
        console.error('Failed to load sample data', sampleErr);
        // If loading the bundled sample also fails, show the modal error overlay.
        showErrorOverlay(sampleErr || apiErr);
        return; // nothing we can do
      }
    }

    // monthly (sorted) and totals
    const monthly = (data.monthly_transfer_totals||[]).slice().sort((a,b)=> {
      const da = new Date(a.month);
      const db = new Date(b.month);
      if (!isNaN(da) && !isNaN(db)) return da - db;
      return String(a.month).localeCompare(String(b.month));
    });

    const values = monthly.map(m=>m.bytes_downloaded || 0);
    const totalBytes = values.reduce((s,v)=> s + (v||0), 0);
    const parts = (function(){
      if(totalBytes===0) return {num:'0',unit:'B'};
      const k=1024; const sizes=['B','KB','MB','GB','TB'];
      const i=Math.floor(Math.log(totalBytes)/Math.log(k));
      const num=parseFloat((totalBytes/Math.pow(k,i)).toFixed(2));
      return {num:String(num), unit:sizes[i]};
    })();

    const totalValueEl = document.getElementById('totalValue');
    if (totalValueEl) {
      totalValueEl.innerHTML = `${parts.num} <sup class="sup">${parts.unit}</sup>`;
    }

    // Downloaded Data Table (with ACCUMULATED TOTAL row)
    const downloadedDataTable = document.getElementById('downloadedDataTable');
    if (downloadedDataTable && downloadedDataTable.querySelector) {
      const tbody = downloadedDataTable.querySelector('tbody');
      if (tbody) {
        let downloadedRows = [];
        downloadedRows.push(`<tr><td style=\"font-weight:600;\">ACCUMULATED TOTAL</td><td>${formatBytes(totalBytes)}</td></tr>`);
        downloadedRows = downloadedRows.concat(monthly.map(m => {
          const d = new Date(m.month);
          let label;
          if (!isNaN(d)) {
            const month = d.toLocaleDateString(undefined, { month: 'short' });
            const year = d.getFullYear();
            label = `<span class=\"month-bold\">${month}</span> <span class=\"year-muted\">${year}</span>`;
          } else {
            label = String(m.month);
          }
          return `<tr><td>${label}</td><td>${formatBytes(m.bytes_downloaded)}</td></tr>`;
        }));
        tbody.innerHTML = downloadedRows.join('');
      }
    }

    // chart — ensure monthly data is sorted chronologically (oldest -> newest)
    // reuse the already sorted 'monthly' variable above
    const chartMonthly = monthly; // or just use 'monthly' directly below
    const labels = chartMonthly.map(m => {
      const d = new Date(m.month);
      if (!isNaN(d)) return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      return String(m.month);
    });
    const chartValues = chartMonthly.map(m=>m.bytes_downloaded);
    // compute cumulative totals (running sum) so chart shows cumulative bytes over time
    let running = 0;
    const cumulativeValues = values.map(v => { running += (v||0); return running; });
    // set startDate and endDate based on earliest/latest monthly entries with a value
    const firstWithValue = monthly.find(m => m.bytes_downloaded && m.bytes_downloaded > 0) || null;
    let lastWithValue = null;
    for (let i = monthly.length - 1; i >= 0; i--) {
      const m = monthly[i];
      if (m && m.bytes_downloaded && m.bytes_downloaded > 0) { lastWithValue = m; break; }
    }
    function formatMonthLabel(s){ const d = new Date(s); if (!isNaN(d)) return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' }); return String(s); }
    const startLabel = firstWithValue ? formatMonthLabel(firstWithValue.month) : '—';
    const endLabel = lastWithValue ? formatMonthLabel(lastWithValue.month) : '—';
    const startEl = document.getElementById('startDate');
    const endEl = document.getElementById('endDate');
    if (startEl) startEl.textContent = startLabel;
    if (endEl) endEl.textContent = endLabel;
    // also populate any cap-specific date placeholders inside card caps
    document.querySelectorAll('.cap-start').forEach(el => { el.textContent = startLabel });
    document.querySelectorAll('.cap-end').forEach(el => { el.textContent = endLabel });
    // append the date range to the total label for context
    const totalLabelEl = document.getElementById('totalLabel');
    if (totalLabelEl) {
      totalLabelEl.innerHTML = `Total data consumed from the portal <small class="small">between ${startLabel} and ${endLabel}</small>`;
    }
    // Populate monthlyTable with month and bytes downloaded
    // const monthlyTable = document.getElementById('monthlyTable').querySelector('tbody');
    // monthlyTable.innerHTML = monthly.map(m => {
    //   const d = new Date(m.month);
    //   const label = !isNaN(d) ? d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) : String(m.month);
    //   return `<tr><td>${label}</td><td>${formatBytes(m.bytes_downloaded)}</td></tr>`;
    // }).join('');

    // datasets table (placed above organs)
    // Aggregate datasets by `dataset_type` so primary + component are combined
    const rawDatasets = (data.datasets || []);
    const agg = rawDatasets.reduce((m, d) => {
      const key = d.dataset_type || 'Unknown';
      m[key] = (m[key] || 0) + (d.ds_count || 0);
      return m;
    }, {});
    const datasets = Object.keys(agg).map(k => ({ dataset_type: k, ds_count: agg[k] }));
    datasets.sort((a, b) => b.ds_count - a.ds_count);
    const datasetsTable = document.getElementById('datasetsTable');
    datasetsTable.innerHTML = datasets.map(d => `<tr><td>${d.dataset_type}</td><td>${d.ds_count}</td></tr>`).join('');
    const totalDatasets = datasets.reduce((acc, d) => acc + d.ds_count, 0);
    // document.getElementById('datasetsSummary').innerHTML = `<strong>${datasets.length}</strong> dataset types registered totaling <strong>${totalDatasets}</strong> datasets`;

    // organs table
    const organs = (data.organ_types||[]).slice().sort((a,b)=>b.organ_count - a.organ_count);
    const organsTable = document.getElementById('organsTable');
    // Wrap (Left) and (Right) in a span for styling
    function formatOrganName(name) {
      return name.replace(/\s*\((Left|Right)\)/gi, function(match, p1) {
        return ` <span class="organ-side">(${p1})</span>`;
      });
    }
    organsTable.innerHTML = organs.map(o => `<tr><td>${formatOrganName(o.name)}</td><td>${o.organ_count}</td></tr>`).join('');
    const totalOrgans = organs.reduce((acc,o)=>acc+o.organ_count,0);
    // document.getElementById('organsSummary').innerHTML = `<strong>${organs.length}</strong> organ types have been registered across <strong>${totalOrgans}</strong> organs`;

  }catch(err){
    console.error('Failed to load usage data',err);
    showErrorOverlay(err);
  }
}

function showSimulatedBanner(originalError) {
  // Avoid duplicating the banner
  if (document.getElementById('simulated-data-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'simulated-data-banner';
  banner.className = 'simulated-data-banner';
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
  banner.style.background = '#fff7ed';
  banner.style.border = '1px solid #ffecd1';
  banner.style.padding = '10px 14px';
  banner.style.margin = '8px 12px';
  banner.style.borderRadius = '6px';
  banner.style.color = '#4a2e00';
  banner.style.fontFamily = 'Inter, system-ui, sans-serif';
  banner.style.fontSize = '0.95rem';

  // Insert above the main container if present, otherwise at top of body
  const container = document.querySelector('.container');
  if (container && container.parentNode) container.parentNode.insertBefore(banner, container);
  else document.body.insertAdjacentElement('afterbegin', banner);

  document.getElementById('dismiss-simulated-banner').addEventListener('click', () => {
    banner.remove();
  });
}

// Listen for layout change messages from parent and apply without reloading
window.addEventListener('message', function(e){
  try {
    const msg = (typeof e.data === 'string') ? JSON.parse(e.data) : e.data;
    if (!msg || msg.type !== 'set-layout') return;
    const raw = String(msg.layout || '');
    const layout = (raw === 'stack' || raw === 'single' || raw === 'single-column') ? 'single-column' : 'side';
    const grid = document.querySelector('.grid');
    if (grid) {
      if (layout === 'single-column') grid.classList.add('single-column');
      else grid.classList.remove('single-column');
    }
    // update our own query string so the new layout is reflected in location.search without reload
    try{
      const params = new URLSearchParams(window.location.search || '');
      if (layout === 'single-column') params.set('layout', 'stack');
      else params.delete('layout');
      const newUrl = window.location.pathname + (params.toString() ? ('?' + params.toString()) : '');
      history.replaceState(null, '', newUrl);
    } catch (err) {
      // ignore
    }
  } catch (err) {
    // ignore malformed messages
  }
});

function showErrorOverlay(err) {
  // Remove any existing overlay
  const existing = document.getElementById('error-overlay');
  if (existing) existing.remove();

  // Modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'error-overlay';
  overlay.className = 'error-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.background = 'rgba(0,0,0,0.18)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '9999';


  // Modal card wrapper (for stacking header above card)
  const modalWrapper = document.createElement('div');
  modalWrapper.style.display = 'flex';
  modalWrapper.style.flexDirection = 'column';
  modalWrapper.style.alignItems = 'stretch';
  modalWrapper.style.width = '100%';
  modalWrapper.style.maxWidth = '420px';

  // Modal header/title bar (outside card)
  const modalHeader = document.createElement('div');
  modalHeader.style.background = '#c1121f'; // solid red
  modalHeader.style.color = '#fff';
  modalHeader.style.fontWeight = '600';
  modalHeader.style.fontSize = '1.08em';
  modalHeader.style.padding = '10px 0 8px 20px';
  modalHeader.style.borderTopLeftRadius = '10px';
  modalHeader.style.borderTopRightRadius = '10px';
  modalHeader.style.textAlign = 'left';
  modalHeader.textContent = 'Error';

  // Modal card (content)
  const card = document.createElement('div');
  card.style.background = '#fff';
  card.style.borderBottomLeftRadius = '10px';
  card.style.borderBottomRightRadius = '10px';
  card.style.boxShadow = '0 6px 32px rgba(44,44,80,0.18)';
  card.style.padding = '28px 28px 18px 28px';
  card.style.width = '100%';
  card.style.position = 'relative';
  card.style.fontFamily = 'Inter, system-ui, sans-serif';


  // ...existing code...  

  // User-friendly message
  const msg = document.createElement('div');
  msg.style.fontSize = '1.13em';
  msg.style.fontWeight = '500';
  msg.style.marginBottom = '0.7em';
  msg.style.marginTop = '0.7em';
  msg.textContent = 'Sorry, something went wrong loading usage data.';

  // Collapsible error details
  const details = document.createElement('details');
  details.style.margin = '0.7em 0 0.5em 0';
  const summary = document.createElement('summary');
  summary.textContent = 'Show error details';
  summary.style.cursor = 'pointer';
  summary.style.fontSize = '0.98em';
  details.appendChild(summary);
  const pre = document.createElement('pre');
  pre.style.background = '#f6f8fa';
  pre.style.padding = '12px';
  pre.style.borderRadius = '6px';
  pre.style.fontSize = '0.93em';
  pre.style.marginTop = '8px';
  pre.style.whiteSpace = 'pre-wrap';
  // Prefer error message, then stack, then stringified error
  if (err && err.message) {
    pre.textContent = err.message + (err.stack ? ('\n' + err.stack) : '');
  } else if (err && err.stack) {
    pre.textContent = err.stack;
  } else {
    pre.textContent = String(err);
  }
  details.appendChild(pre);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.className = 'btn';
  closeBtn.style.marginTop = '1.2em';
  closeBtn.style.float = 'right';
  closeBtn.onclick = () => overlay.remove();

  card.appendChild(msg);
  card.appendChild(details);
  card.appendChild(closeBtn);
  modalWrapper.appendChild(modalHeader);
  modalWrapper.appendChild(card);
  overlay.appendChild(modalWrapper);
  document.body.appendChild(overlay);
}



window.addEventListener('DOMContentLoaded', init);

// Global error handler for uncaught errors
window.addEventListener('error', function(event) {
  showErrorOverlay(event.error || event.message || event);
});

// Global handler for unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
  showErrorOverlay(event.reason || event);
});

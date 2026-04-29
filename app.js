// app.js — minimal static site behavior

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B','KB','MB','GB','TB','PB','EB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
        // If loading the bundled sample also fails, surface that error in the overlay.
        // Avoid showing the original API 404 as the overlay source — prefer the sample error details.
        showErrorOverlay(sampleErr || apiErr);
        return; // nothing we can do
      }
    }

    // totals
    const totalBytes = data.monthly_transfer_totals.reduce((s,m)=>s + (m.bytes_downloaded||0),0);
    const parts = (function(){
      if(totalBytes===0) return {num:'0',unit:'B'};
      const k=1024; const sizes=['B','KB','MB','GB','TB'];
      const i=Math.floor(Math.log(totalBytes)/Math.log(k));
      const num=parseFloat((totalBytes/Math.pow(k,i)).toFixed(2));
      return {num:String(num), unit:sizes[i]};
    })();

    document.getElementById('totalValue').innerHTML = `${parts.num} <sup class="sup">${parts.unit}</sup>`;

    // chart — ensure monthly data is sorted chronologically (oldest -> newest)
    const monthly = (data.monthly_transfer_totals||[]).slice().sort((a,b)=> {
      // try ISO-like month strings first, fall back to string compare
      const da = new Date(a.month);
      const db = new Date(b.month);
      if (!isNaN(da) && !isNaN(db)) return da - db;
      return String(a.month).localeCompare(String(b.month));
    });
    const labels = monthly.map(m => {
      const d = new Date(m.month);
      if (!isNaN(d)) return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      return String(m.month);
    });
    const values = monthly.map(m=>m.bytes_downloaded);
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
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    const chart = new Chart(ctx, {
      type:'line',
        data:{
        labels: labels,
        datasets:[{
          label:'Cumulative bytes downloaded',
          data: cumulativeValues,
          borderColor: 'rgba(54, 144, 255, 0.9)',
          backgroundColor:'rgba(54,144,255,0.12)',
          fill:true,
          tension:0.2,
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio: false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=> formatBytes(ctx.raw)}}},
        scales:{
          y:{
            reverse: false,
            beginAtZero: false,
            ticks:{callback: v=> formatBytes(v)}
          }
        }
      }
    });

    // datasets chart (placed above organs)
    const datasets = (data.datasets||[]).slice().sort((a,b)=>a.ds_count - b.ds_count);
    const dsLabels = datasets.map(d=> `${d.dataset_type} (${d.dataset_provenance_level})`);
    const dsValues = datasets.map(d=> d.ds_count);
    const dsColors = generatePalette(dsLabels.length);
    const dsCtx = document.getElementById('datasetsChart').getContext('2d');
    new Chart(dsCtx, {
      type: 'bar',
      data: { labels: dsLabels, datasets: [{ data: dsValues, backgroundColor: dsColors }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { maxRotation: 40, minRotation: 20 } }, y: { beginAtZero: true, reverse: false } }
      }
    });
    const totalDatasets = datasets.reduce((acc,d)=>acc+d.ds_count,0);
    document.getElementById('datasetsSummary').innerHTML = `<strong>${datasets.length}</strong> dataset types registered totaling <strong>${totalDatasets}</strong> datasets`;

    // organs chart
    const organs = (data.organ_types||[]).slice().sort((a,b)=>a.organ_count - b.organ_count);
    const organLabels = organs.map(o=> o.name);
    const organValues = organs.map(o=> o.organ_count);
    const organColors = generatePalette(organLabels.length);
    const organsCtx = document.getElementById('organsChart').getContext('2d');
    new Chart(organsCtx, {
      type: 'bar',
      data: { labels: organLabels, datasets: [{ data: organValues, backgroundColor: organColors }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { maxRotation: 40, minRotation: 20 } }, y: { beginAtZero: true, reverse: false } }
      }
    });
    const totalOrgans = organs.reduce((acc,o)=>acc+o.organ_count,0);
    document.getElementById('organsSummary').innerHTML = `<strong>${organs.length}</strong> organ types have been registered across <strong>${totalOrgans}</strong> organs`;

  }catch(err){
    console.error('Failed to load usage data',err);
    document.body.insertAdjacentHTML('beforeend','<div class="card">Failed to load usage data — open the console for details.</div>') ;
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
  // dim the content
  document.body.classList.add('dimmed');

  const overlay = document.createElement('div');
  overlay.id = 'error-overlay';
  overlay.className = 'error-overlay';
  const detailsText = (err && err.stack) || (err && err.message) || String(err);

  // Provide structured source info so we can style the badge by severity
  function getSourceInfo(e) {
    if (!e) return { label: 'Unknown', type: 'unknown' };
    const msg = (e && e.message) || '';
    if (e.name === 'AbortError' || /aborted/i.test(msg) || /timeout/i.test(msg)) return { label: 'Timeout', type: 'timeout' };
    // fetch() will throw a TypeError for network-level failures in many browsers
    if (/Failed to fetch/i.test(msg) || e instanceof TypeError) return { label: 'Network', type: 'network' };
    const apiMatch = /API returned\s*(\d+)/i.exec(msg);
    if (apiMatch) {
      const code = Number(apiMatch[1]);
      if (code >= 500) return { label: `API ${code}`, type: 'api-5xx' };
      if (code >= 400) return { label: `API ${code}`, type: 'api-4xx' };
      return { label: `API ${code}`, type: 'api-error' };
    }
    return { label: 'Error', type: 'error' };
  }
  const sourceInfo = getSourceInfo(err);

  overlay.innerHTML = `
    <div class="error-card">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <h2>Unable to load usage data</h2>
        <div class="error-badge ${escapeHtml(sourceInfo.type)}" title="Source: ${escapeHtml(sourceInfo.label)}">${escapeHtml(sourceInfo.label)}</div>
      </div>
      <p style="margin-top:0.25rem;">We couldn't load live usage information from the local API at <strong>http://localhost:8484/publication-and-usage-stats</strong>. Please ensure the service is running and that your browser allows requests to it.</p>
      <p style="color:#444;font-size:0.95rem;margin-top:8px;">You can try again, or check the technical details below to debug.</p>
      <details style="margin-top:12px;">
        <summary style="cursor:pointer">Show technical details</summary>
        <pre style="white-space:pre-wrap;margin-top:8px;background:#f6f8fa;padding:12px;border-radius:6px;">${escapeHtml(detailsText)}</pre>
      </details>
      <div class="error-actions">
        <button id="retry-btn" class="btn primary">Retry</button>
        <button id="close-btn" class="btn">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('retry-btn').addEventListener('click', () => {
    overlay.remove();
    document.body.classList.remove('dimmed');
    // small delay before retrying to give UI feedback
    setTimeout(() => init(), 150);
  });
  document.getElementById('close-btn').addEventListener('click', () => {
    overlay.remove();
    document.body.classList.remove('dimmed');
  });
}

function escapeHtml(s){
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

window.addEventListener('DOMContentLoaded', init);

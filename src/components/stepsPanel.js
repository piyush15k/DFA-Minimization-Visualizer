/**
 * stepsPanel.js  — v3
 * Step-by-step panel:
 *  - Live animated DFA diagram (synced to fullscreen overlay)
 *  - Manual speed control
 *  - Merge visualization: shows which states are equivalent and merges
 */

window.StepsPanel = (function () {

  let _steps        = [];
  let _current      = 0;
  let _dfa          = null;
  let _autoTimer    = null;
  let _autoSpeedMs  = 2400;          // default 0.5× speed
  let _animFrame    = null;
  let _pulseTargets = [];
  let _pulseStart   = 0;
  let _lastStatus   = {};            // kept so fullscreen can mirror it

  // ── Init ────────────────────────────────────────────────────
  function init(steps, dfa) {
    _steps   = steps;
    _dfa     = dfa;
    _current = 0;

    const list = document.getElementById('step-list');
    list.innerHTML = '';
    steps.forEach((step, i) => {
      const item = document.createElement('div');
      item.className   = 'step-item';
      item.id          = `step-item-${i}`;
      item.textContent = step.title;
      item.addEventListener('click', () => goTo(i));
      list.appendChild(item);
    });

    buildLegend();
    renderStep(0);
    updateNavButtons();
  }

  // ── Speed control wiring ─────────────────────────────────────
  document.querySelectorAll('.btn-speed').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-speed').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _autoSpeedMs = parseInt(btn.dataset.ms, 10);
      // Restart auto-play at new speed if currently playing
      if (_autoTimer) {
        clearInterval(_autoTimer);
        _autoTimer = setInterval(_autoTick, _autoSpeedMs);
      }
    });
  });

  function _autoTick() {
    if (_current >= _steps.length - 1) {
      clearInterval(_autoTimer); _autoTimer = null;
      document.getElementById('btn-auto-play').textContent = '▶ Auto';
      return;
    }
    next();
  }

  // ── Legend ──────────────────────────────────────────────────
  function buildLegend() {
    document.getElementById('steps-dfa-legend').innerHTML = `
      <div class="legend-item"><div class="legend-dot" style="color:#00cfff;background:rgba(0,207,255,0.15)"></div><span>Start state</span></div>
      <div class="legend-item"><div class="legend-dot" style="color:#4fffb0;background:rgba(79,255,176,0.15)"></div><span>Accept / Equivalent</span></div>
      <div class="legend-item"><div class="legend-dot" style="color:#ff4f7b;background:rgba(255,79,123,0.15)"></div><span>Distinguishable</span></div>
      <div class="legend-item"><div class="legend-dot" style="color:#ffbb00;background:rgba(255,187,0,0.25)"></div><span>Newly marked</span></div>
    `;
  }

  // ── Render one step ─────────────────────────────────────────
  function renderStep(idx) {
    _current = idx;
    const step = _steps[idx];
    if (!step) return;

    document.getElementById('step-badge').textContent = `Step ${idx} of ${_steps.length - 1}`;
    document.getElementById('step-title').textContent = step.title;
    document.getElementById('step-desc').textContent  = step.description;

    document.querySelectorAll('.step-item').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
      el.classList.toggle('done',   i < idx);
    });

    renderDistTable(step);
    renderPartitions(step.partitions, step.phase === 'converged');
    renderMergeViz(step);
    renderLiveDFA(step);

    updateNavButtons();
  }

  // ── Compute state status from step ──────────────────────────
  function computeStatus(step) {
    const n = _dfa.states.length;
    const status = {};
    _dfa.states.forEach(s => { status[s] = 'normal'; });

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const si = _dfa.states[i], sj = _dfa.states[j];
        const isNew = step.newlyMarked.some(([a, b]) => a === i && b === j);
        if (isNew) {
          status[si] = 'new'; status[sj] = 'new';
        } else if (step.table[i][j]) {
          if (status[si] !== 'new') status[si] = 'marked';
          if (status[sj] !== 'new') status[sj] = 'marked';
        }
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!step.table[i][j]) {
          const si = _dfa.states[i], sj = _dfa.states[j];
          if (status[si] === 'normal') status[si] = 'equiv';
          if (status[sj] === 'normal') status[sj] = 'equiv';
        }
      }
    }
    return status;
  }

  // ── Live DFA diagram ─────────────────────────────────────────
  function renderLiveDFA(step) {
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }

    const canvas = document.getElementById('canvas-steps-dfa');
    if (!canvas || !_dfa) return;

    _lastStatus   = computeStatus(step);
    _pulseTargets = _dfa.states.filter(s => _lastStatus[s] === 'new');
    _pulseStart   = performance.now();

    DFARenderer.renderWithStatus(canvas, _dfa, _lastStatus);

    if (_pulseTargets.length > 0) {
      const dur = 1200;
      function animate(now) {
        const t     = Math.min((now - _pulseStart) / dur, 1);
        const pulse = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
        DFARenderer.renderWithStatus(canvas, _dfa, _lastStatus, _pulseTargets, pulse);
        // Mirror to fullscreen if open on this canvas
        _mirrorToFullscreen();
        if (t < 1) {
          _animFrame = requestAnimationFrame(animate);
        } else {
          _animFrame = null;
          DFARenderer.renderWithStatus(canvas, _dfa, _lastStatus);
          _mirrorToFullscreen();
        }
      }
      _animFrame = requestAnimationFrame(animate);
    } else {
      _mirrorToFullscreen();
    }
  }

  /** If fullscreen is open showing the steps diagram, redraw it too */
  function _mirrorToFullscreen() {
    const overlay = document.getElementById('fullscreen-overlay');
    if (overlay.classList.contains('hidden')) return;
    const fsCanvas = document.getElementById('canvas-fullscreen');
    if (!fsCanvas || !_dfa) return;
    const title = document.getElementById('fullscreen-title').textContent;
    if (title !== 'Live State Diagram') return;
    // Ensure canvas is sized before drawing
    if (!fsCanvas.width || !fsCanvas.height) {
      if (window._renderFSFrame) window._renderFSFrame();
      return;
    }
    DFARenderer.renderWithStatus(fsCanvas, _dfa, _lastStatus, _pulseTargets, 0);
  }

  // ── Merge Visualization ─────────────────────────────────────
  function renderMergeViz(step) {
    const card = document.getElementById('merge-viz-card');
    const wrap = document.getElementById('merge-viz-wrap');

    // Find equivalent pairs (unmarked)
    const n = _dfa.states.length;
    const equivPairs = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!step.table[i][j]) {
          equivPairs.push([_dfa.states[i], _dfa.states[j]]);
        }
      }
    }

    const partitionsCard = document.querySelector('.steps-partitions-card');

    if (equivPairs.length === 0) {
      card.style.display = 'none';
      if (partitionsCard) partitionsCard.style.gridColumn = '1 / -1';
      return;
    }

    card.style.display = '';
    card.style.flex = '1';
    card.style.minWidth = '0';
    if (partitionsCard) partitionsCard.style.gridColumn = '';

    // Build equivalence groups (union-find)
    const parent = {};
    _dfa.states.forEach(s => { parent[s] = s; });
    function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
    function union(x, y) { parent[find(x)] = find(y); }
    equivPairs.forEach(([a, b]) => union(a, b));

    // Group states by root
    const groups = {};
    _dfa.states.forEach(s => {
      const root = find(s);
      if (!groups[root]) groups[root] = [];
      groups[root].push(s);
    });

    const acceptSet = new Set(_dfa.acceptStates);
    const isFinal   = step.phase === 'converged';

    wrap.innerHTML = '';

    // Header row
    const header = document.createElement('div');
    header.className = 'merge-header';
    header.innerHTML = isFinal
      ? '<span class="merge-status final">✓ Final — ready to merge</span>'
      : '<span class="merge-status partial">⟳ Ongoing — more iterations may split these further</span>';
    wrap.appendChild(header);

    const groups_div = document.createElement('div');
    groups_div.className = 'merge-groups';

    Object.values(groups).forEach(group => {
      const gDiv = document.createElement('div');
      gDiv.className = 'merge-group' + (group.length > 1 ? ' will-merge' : '');

      group.forEach((s, si) => {
        const stateEl = document.createElement('div');
        stateEl.className = 'merge-state' + (acceptSet.has(s) ? ' accept' : '');
        stateEl.textContent = s;
        gDiv.appendChild(stateEl);

        if (si < group.length - 1) {
          const eq = document.createElement('span');
          eq.className = 'merge-eq-sign';
          eq.textContent = '≡';
          gDiv.appendChild(eq);
        }
      });

      if (group.length > 1) {
        const arrow = document.createElement('div');
        arrow.className = 'merge-arrow';
        arrow.innerHTML = `→ <span class="merge-result">{${group.join(',')}}</span>`;
        gDiv.appendChild(arrow);
      }

      groups_div.appendChild(gDiv);
    });

    wrap.appendChild(groups_div);
  }

  // ── Dist Table ──────────────────────────────────────────────
  function renderDistTable(step) {
    const wrap   = document.getElementById('dist-table-wrap');
    const states = _dfa.states;
    const n      = states.length;
    const table  = document.createElement('table');
    table.className = 'dist-table';

    const thead = document.createElement('thead');
    const hr    = document.createElement('tr');
    hr.appendChild(document.createElement('th'));
    for (let j = 0; j < n - 1; j++) {
      const th = document.createElement('th'); th.textContent = states[j]; hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody    = document.createElement('tbody');
    const newlySet = new Set(step.newlyMarked.map(([a, b]) => `${a},${b}`));

    for (let i = 1; i < n; i++) {
      const tr = document.createElement('tr');
      const th = document.createElement('th'); th.textContent = states[i]; tr.appendChild(th);
      for (let j = 0; j < n - 1; j++) {
        const td = document.createElement('td');
        if (j >= i) {
          td.className = 'cell-diag'; td.textContent = '·';
        } else {
          const marked = step.table[j][i];
          const isNew  = newlySet.has(`${j},${i}`);
          if (isNew)        { td.className = 'cell-new-mark'; td.textContent = '✕'; td.title = 'Newly marked'; }
          else if (marked)  { td.className = 'cell-marked';   td.textContent = '✕'; }
          else              { td.className = 'cell-equiv';    td.textContent = '—'; }
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    wrap.innerHTML = '';
    wrap.appendChild(table);

    const legend = document.createElement('div');
    legend.style.cssText = 'margin-top:12px;display:flex;gap:16px;font-size:12px;font-family:monospace;flex-wrap:wrap;';
    legend.innerHTML = `
      <span style="color:#ff4f7b">✕ Distinguishable</span>
      <span style="color:#ffbb00">✕ Newly Marked</span>
      <span style="color:#4fffb0">— Possibly Equivalent</span>
      <span style="color:#555e78">· Not applicable</span>`;
    wrap.appendChild(legend);
  }

  // ── Partitions ──────────────────────────────────────────────
  function renderPartitions(partitions, isFinal) {
    const wrap = document.getElementById('partitions-wrap');
    wrap.innerHTML = '';
    const acceptSet = new Set(_dfa.acceptStates);

    partitions.forEach((group, i) => {
      const div = document.createElement('div');
      div.className = `partition-group${isFinal ? ' final' : ''}`;
      const lbl = document.createElement('div');
      lbl.className = 'partition-label'; lbl.textContent = `Group ${i + 1}`;
      div.appendChild(lbl);
      const sd = document.createElement('div'); sd.className = 'partition-states';
      group.forEach(s => {
        const chip = document.createElement('span');
        chip.className   = `p-state${acceptSet.has(s) ? ' accept' : ''}`;
        chip.textContent = s;
        sd.appendChild(chip);
      });
      div.appendChild(sd);
      wrap.appendChild(div);
    });

    if (!partitions.length)
      wrap.innerHTML = '<p style="color:var(--text3);font-family:monospace;font-size:13px">No partitions yet.</p>';
  }

  // ── Nav ─────────────────────────────────────────────────────
  function updateNavButtons() {
    document.getElementById('btn-prev-step').disabled = _current === 0;
    document.getElementById('btn-next-step').disabled = _current >= _steps.length - 1;
  }
  function next() { if (_current < _steps.length - 1) renderStep(_current + 1); }
  function prev() { if (_current > 0) renderStep(_current - 1); }
  function goTo(idx) { renderStep(Math.max(0, Math.min(idx, _steps.length - 1))); }

  function autoPlay() {
    const btn = document.getElementById('btn-auto-play');
    if (_autoTimer) {
      clearInterval(_autoTimer); _autoTimer = null; btn.textContent = '▶ Auto'; return;
    }
    btn.textContent = '⏸ Pause';
    _autoTimer = setInterval(_autoTick, _autoSpeedMs);
  }

  document.getElementById('btn-next-step').addEventListener('click', next);
  document.getElementById('btn-prev-step').addEventListener('click', prev);
  document.getElementById('btn-auto-play').addEventListener('click', autoPlay);

  return { init, getLastStatus: () => _lastStatus, getDfa: () => _dfa };
})();

/**
 * stepsPanel.js  — v3
 * Step-by-step panel + animated live DFA state diagram
 *
 * Changes:
 *  - Uses DFARenderer.animateTransition() for smooth per-step animations
 *  - Tracks prevStatus so transitions animate from the correct prior state
 *  - Side-by-side layout (via CSS class on parent card)
 */

window.StepsPanel = (function () {

  let _steps     = [];
  let _current   = 0;
  let _dfa       = null;
  let _autoTimer = null;

  // Track the status map from the PREVIOUS step for animation
  let _prevStatusMap = {};
  let _currStatusMap = {};

  // ── Init ────────────────────────────────────────────────────
  function init(steps, dfa) {
    _steps   = steps;
    _dfa     = dfa;
    _current = 0;

    // Reset status history
    _prevStatusMap = {};
    _currStatusMap = {};
    if (dfa) dfa.states.forEach(s => { _prevStatusMap[s] = 'normal'; _currStatusMap[s] = 'normal'; });

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
    renderStep(0, false);   // first step: no animation
    updateNavButtons();
  }

  // ── Legend ──────────────────────────────────────────────────
  function buildLegend() {
    const el = document.getElementById('steps-dfa-legend');
    el.innerHTML = `
      <div class="legend-item">
        <div class="legend-dot" style="color:#ff8c00;background:rgba(255,140,0,0.15)"></div>
        <span>Start state</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="color:#ffd700;background:rgba(255,215,0,0.15)"></div>
        <span>Accept state</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="color:#4fffb0;background:rgba(79,255,176,0.15)"></div>
        <span>Equivalent (unmarked)</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="color:#ff4f7b;background:rgba(255,79,123,0.15)"></div>
        <span>Distinguishable (marked)</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="color:#ffbb00;background:rgba(255,187,0,0.25)"></div>
        <span>Newly marked this step</span>
      </div>
    `;
  }

  // ── Compute status map for a step ───────────────────────────
  function computeStatusMap(step) {
    const n = _dfa.states.length;
    const statusMap = {};
    _dfa.states.forEach(s => { statusMap[s] = 'normal'; });

    // Walk the marking table
    const newlySet = new Set(step.newlyMarked.map(([a, b]) => `${a},${b}`));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const si = _dfa.states[i], sj = _dfa.states[j];
        const isNew    = newlySet.has(`${i},${j}`);
        const isMarked = step.table[i][j];

        if (isNew) {
          statusMap[si] = 'new';
          statusMap[sj] = 'new';
        } else if (isMarked) {
          if (statusMap[si] !== 'new') statusMap[si] = 'marked';
          if (statusMap[sj] !== 'new') statusMap[sj] = 'marked';
        }
      }
    }

    // States that appear only in an equivalent (unmarked) pair get 'equiv'
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!step.table[i][j]) {
          const si = _dfa.states[i], sj = _dfa.states[j];
          if (statusMap[si] === 'normal') statusMap[si] = 'equiv';
          if (statusMap[sj] === 'normal') statusMap[sj] = 'equiv';
        }
      }
    }

    return statusMap;
  }

  // ── Render one step ─────────────────────────────────────────
  function renderStep(idx, animate) {
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

    // Scroll active step into view in sidebar
    const activeItem = document.getElementById(`step-item-${idx}`);
    if (activeItem) activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    renderDistTable(step);
    renderPartitions(step.partitions, step.phase === 'converged');
    renderLiveDFA(step, animate !== false);

    updateNavButtons();
  }

  // ── Live DFA diagram ─────────────────────────────────────────
  function renderLiveDFA(step, animate) {
    const canvas = document.getElementById('canvas-steps-dfa');
    if (!canvas || !_dfa) return;

    const nextStatusMap = computeStatusMap(step);

    // Collect newly marked state names (not indices)
    const newlyMarkedNames = step.newlyMarked.map(([a, b]) => [_dfa.states[a], _dfa.states[b]]).flat();

    if (animate && Object.keys(_prevStatusMap).length > 0) {
      DFARenderer.animateTransition(
        canvas,
        _dfa,
        _prevStatusMap,
        nextStatusMap,
        newlyMarkedNames,
        { duration: 900 }
      );
    } else {
      // Instant render (first step or jump)
      DFARenderer.renderWithStatus(canvas, _dfa, nextStatusMap);
    }

    // Update history for next transition
    _prevStatusMap = { ...nextStatusMap };
    _currStatusMap = nextStatusMap;
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
      const th = document.createElement('th');
      th.textContent = states[j];
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody    = document.createElement('tbody');
    const newlySet = new Set(step.newlyMarked.map(([a, b]) => `${a},${b}`));

    for (let i = 1; i < n; i++) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = states[i];
      tr.appendChild(th);

      for (let j = 0; j < n - 1; j++) {
        const td = document.createElement('td');
        if (j >= i) {
          td.className   = 'cell-diag';
          td.textContent = '·';
        } else {
          const marked = step.table[j][i];
          const isNew  = newlySet.has(`${j},${i}`);
          if (isNew) {
            td.className   = 'cell-new-mark';
            td.textContent = '✕';
            td.title       = 'Newly marked at this step';
          } else if (marked) {
            td.className   = 'cell-marked';
            td.textContent = '✕';
          } else {
            td.className   = 'cell-equiv';
            td.textContent = '—';
          }
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    wrap.innerHTML = '';
    wrap.appendChild(table);

    const legend = document.createElement('div');
    legend.className = 'dist-table-legend';
    legend.innerHTML = `
      <span style="color:#ff4f7b">✕ Distinguishable</span>
      <span style="color:#ffbb00">✕ Newly Marked</span>
      <span style="color:#4fffb0">— Possibly Equivalent</span>
      <span style="color:#555e78">· N/A</span>
    `;
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
      lbl.className   = 'partition-label';
      lbl.textContent = `Group ${i + 1}`;
      div.appendChild(lbl);
      const sd = document.createElement('div');
      sd.className = 'partition-states';
      group.forEach(s => {
        const chip = document.createElement('span');
        chip.className   = `p-state${acceptSet.has(s) ? ' accept' : ''}`;
        chip.textContent = s;
        sd.appendChild(chip);
      });
      div.appendChild(sd);
      wrap.appendChild(div);
    });

    if (!partitions.length) {
      wrap.innerHTML = '<p style="color:var(--text3);font-family:monospace;font-size:13px">No partitions yet.</p>';
    }
  }

  // ── Nav ──────────────────────────────────────────────────────
  function updateNavButtons() {
    document.getElementById('btn-prev-step').disabled = _current === 0;
    document.getElementById('btn-next-step').disabled = _current >= _steps.length - 1;
  }

  function next() { if (_current < _steps.length - 1) renderStep(_current + 1, true); }
  function prev() { if (_current > 0) renderStep(_current - 1, true); }
  function goTo(idx) {
    const clamped = Math.max(0, Math.min(idx, _steps.length - 1));
    // When jumping, recompute prev status from the step before
    if (clamped > 0) {
      _prevStatusMap = computeStatusMap(_steps[clamped - 1]);
    } else {
      _prevStatusMap = {};
      if (_dfa) _dfa.states.forEach(s => { _prevStatusMap[s] = 'normal'; });
    }
    renderStep(clamped, true);
  }

  function autoPlay() {
    const btn = document.getElementById('btn-auto-play');
    if (_autoTimer) {
      clearInterval(_autoTimer); _autoTimer = null; btn.textContent = '▶ Auto'; return;
    }
    btn.textContent = '⏸ Pause';
    _autoTimer = setInterval(() => {
      if (_current >= _steps.length - 1) {
        clearInterval(_autoTimer); _autoTimer = null; btn.textContent = '▶ Auto'; return;
      }
      next();
    }, 1800);  // slightly longer than animation duration
  }

  document.getElementById('btn-next-step').addEventListener('click', next);
  document.getElementById('btn-prev-step').addEventListener('click', prev);
  document.getElementById('btn-auto-play').addEventListener('click', autoPlay);

  return { init };
})();

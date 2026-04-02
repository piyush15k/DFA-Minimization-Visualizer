/**
 * stepsPanel.js  — v2
 * Step-by-step panel + live animated DFA state diagram
 */

window.StepsPanel = (function () {

  let _steps     = [];
  let _current   = 0;
  let _dfa       = null;
  let _autoTimer = null;

  // Animation state for the live DFA diagram
  let _animFrame    = null;
  let _pulseTargets = [];   // states to pulse this step
  let _pulseStart   = 0;

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
    renderLiveDFA(step);

    updateNavButtons();
  }

  // ── Live DFA diagram with per-step state coloring ───────────
  function renderLiveDFA(step) {
    // Cancel any running animation
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }

    const canvas = document.getElementById('canvas-steps-dfa');
    if (!canvas || !_dfa) return;

    // Determine per-state status from the marking table
    // States involved in newly marked pairs get a "warn" highlight
    // States that are still equivalent (not marked with anything) get "equiv"
    // States involved in already-marked pairs get "marked"

    const n = _dfa.states.length;
    const stateStatus = {}; // 'normal' | 'equiv' | 'marked' | 'new'

    _dfa.states.forEach(s => { stateStatus[s] = 'normal'; });

    // Walk the table and annotate
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const si = _dfa.states[i], sj = _dfa.states[j];
        const isNew = step.newlyMarked.some(([a, b]) => a === i && b === j);
        const isMarked = step.table[i][j];

        if (isNew) {
          stateStatus[si] = 'new';
          stateStatus[sj] = 'new';
        } else if (isMarked && stateStatus[si] !== 'new') {
          stateStatus[si] = 'marked';
          stateStatus[sj] = 'marked';
        }
      }
    }

    // States that appear in an equivalent (unmarked) pair
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!step.table[i][j]) {
          const si = _dfa.states[i], sj = _dfa.states[j];
          if (stateStatus[si] === 'normal') stateStatus[si] = 'equiv';
          if (stateStatus[sj] === 'normal') stateStatus[sj] = 'equiv';
        }
      }
    }

    // Collect newly-highlighted states for pulse animation
    _pulseTargets = _dfa.states.filter(s => stateStatus[s] === 'new');
    _pulseStart   = performance.now();

    // Static render with status colors
    DFARenderer.renderWithStatus(canvas, _dfa, stateStatus);

    // If there are newly marked states, run a brief pulse animation
    if (_pulseTargets.length > 0) {
      const pulseDuration = 1200; // ms
      function animate(now) {
        const elapsed = now - _pulseStart;
        const t = Math.min(elapsed / pulseDuration, 1);
        // Pulse intensity: quick rise, slow fade
        const pulse = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
        DFARenderer.renderWithStatus(canvas, _dfa, stateStatus, _pulseTargets, pulse);
        if (t < 1) {
          _animFrame = requestAnimationFrame(animate);
        } else {
          _animFrame = null;
          // Settle to final static state
          DFARenderer.renderWithStatus(canvas, _dfa, stateStatus);
        }
      }
      _animFrame = requestAnimationFrame(animate);
    }
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
            td.title = 'Newly marked at this step';
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
    legend.style.cssText = 'margin-top:12px;display:flex;gap:16px;font-size:12px;font-family:monospace;flex-wrap:wrap;';
    legend.innerHTML = `
      <span style="color:#ff4f7b">✕ Distinguishable</span>
      <span style="color:#ffbb00">✕ Newly Marked</span>
      <span style="color:#4fffb0">— Possibly Equivalent</span>
      <span style="color:#555e78">· Not applicable</span>
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

  // ── Nav helpers ─────────────────────────────────────────────
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
    _autoTimer = setInterval(() => {
      if (_current >= _steps.length - 1) {
        clearInterval(_autoTimer); _autoTimer = null; btn.textContent = '▶ Auto'; return;
      }
      next();
    }, 1600);
  }

  document.getElementById('btn-next-step').addEventListener('click', next);
  document.getElementById('btn-prev-step').addEventListener('click', prev);
  document.getElementById('btn-auto-play').addEventListener('click', autoPlay);

  return { init };
})();

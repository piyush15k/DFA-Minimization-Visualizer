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
  let _minDFA       = null;   // minimized DFA (for final step render)
  let _autoTimer    = null;
  let _autoSpeedMs  = 2400;
  let _animFrame    = null;
  let _pulseTargets = [];
  let _pulseStart   = 0;
  let _lastStatus   = {};
  let _transAnimT   = 1;     // 0..1 transition animation progress
  let _transStart   = 0;
  let _transDur     = 600;   // ms for merge/split transition

  // ── Init ────────────────────────────────────────────────────
  function init(steps, dfa, minimizedDFA) {
    _steps   = steps;
    _dfa     = dfa;
    _minDFA  = minimizedDFA || null;
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
      <div class="legend-item"><div class="legend-dot" style="color:#4fffb0;background:rgba(79,255,176,0.15)"></div><span>Merged equivalent group</span></div>
      <div class="legend-item"><div class="legend-dot" style="color:#ff4f7b;background:rgba(255,79,123,0.15)"></div><span>Newly split apart</span></div>
      <div class="legend-item"><div class="legend-dot" style="color:#e8ecf5;background:rgba(48,54,80,0.6)"></div><span>Individual state</span></div>
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
  // Uses renderIntermediate to show the DFA morphing at each step:
  // equivalence groups collapse into merged super-nodes, and as pairs
  // get marked the super-nodes split apart with a smooth animation.
  function renderLiveDFA(step) {
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }

    const canvas = document.getElementById('canvas-steps-dfa');
    if (!canvas || !_dfa) return;

    // Also keep status for fullscreen mirror (used when overlay is open)
    _lastStatus   = computeStatus(step);
    _pulseTargets = _dfa.states.filter(s => _lastStatus[s] === 'new');

    // Animate: start at t=0 (previous layout) and ease to t=1 (new layout)
    _transStart = performance.now();
    _transAnimT = 0;

    const hasNewlySplit = step.newlyMarked.length > 0;
    const dur = hasNewlySplit ? _transDur : 300; // faster if no split

    function animate(now) {
      const elapsed = now - _transStart;
      // Ease-out cubic
      const raw = Math.min(elapsed / dur, 1);
      _transAnimT = 1 - Math.pow(1 - raw, 3);

      DFARenderer.renderIntermediate(canvas, _dfa, step, _minDFA, _transAnimT);
      _mirrorToFullscreen();

      if (raw < 1) {
        _animFrame = requestAnimationFrame(animate);
      } else {
        _animFrame = null;
        _transAnimT = 1;
        DFARenderer.renderIntermediate(canvas, _dfa, step, _minDFA, 1);
        _mirrorToFullscreen();
      }
    }
    _animFrame = requestAnimationFrame(animate);
  }

  /** If fullscreen is open showing the steps diagram, redraw it too */
  function _mirrorToFullscreen() {
    const overlay = document.getElementById('fullscreen-overlay');
    if (overlay.classList.contains('hidden')) return;
    const fsCanvas = document.getElementById('canvas-fullscreen');
    if (!fsCanvas || !_dfa) return;
    const title = document.getElementById('fullscreen-title').textContent;
    if (title !== 'Live State Diagram') return;
    if (!fsCanvas.width || !fsCanvas.height) {
      if (window._renderFSFrame) window._renderFSFrame();
      return;
    }
    // Use the same intermediate render so fullscreen matches the inline canvas
    const step = _steps[_current];
    if (step) DFARenderer.renderIntermediate(fsCanvas, _dfa, step, _minDFA, _transAnimT);
  }

  // ── Merge Transition Table ───────────────────────────────────
  // Shows a proper transition table for the CURRENT merged DFA:
  // each row = one equivalence group (merged state), columns = alphabet,
  // cells = which group you transition into. Highlights newly-merged rows.
  function renderMergeViz(step) {
    const card = document.getElementById('merge-viz-card');
    const wrap = document.getElementById('merge-viz-wrap');

    const { states, alphabet, transitions, startState, acceptStates } = _dfa;
    const acceptSet = new Set(acceptStates);
    const n = states.length;
    const partitionsCard = document.querySelector('.steps-partitions-card');

    // ── Union-Find to build current equivalence groups ────────────
    const parent = {};
    states.forEach(s => { parent[s] = s; });
    function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
    function union(x, y) { parent[find(x)] = find(y); }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!step.table[i][j]) union(states[i], states[j]);
      }
    }

    // Group states by root, preserving original ordering
    const rootOrder = [];
    const groupMap  = {};
    states.forEach(s => {
      const r = find(s);
      if (!groupMap[r]) { groupMap[r] = []; rootOrder.push(r); }
      groupMap[r].push(s);
    });
    const groups = rootOrder.map(r => groupMap[r]);

    // Sort: start-state group first
    groups.sort((a, b) => {
      if (a.includes(startState)) return -1;
      if (b.includes(startState)) return 1;
      return 0;
    });

    // Always show the card (even when no merges yet — table just shows n individual states)
    card.style.display = '';
    card.style.minWidth = '0';
    if (partitionsCard) partitionsCard.style.gridColumn = '';

    const isFinal      = step.phase === 'converged';
    const numGroups    = groups.length;
    const hasMerges    = groups.some(g => g.length > 1);

    // Newly-split states (involved in newlyMarked this step)
    const newlySplitSet = new Set();
    step.newlyMarked.forEach(([ai, bi]) => {
      newlySplitSet.add(states[ai]);
      newlySplitSet.add(states[bi]);
    });

    // Helper: canonical name for a group
    function groupName(group) {
      if (group.length === 1) return group[0];
      return `{${group.join(',')}}`;
    }

    // Helper: which group does state s map to via symbol?
    function targetGroup(rep, sym) {
      const tgt  = transitions[rep]?.[sym];
      if (!tgt) return '—';
      const tRoot = find(tgt);
      const tGrp  = groups.find(g => g.includes(tgt));
      return tGrp ? groupName(tGrp) : tgt;
    }

    wrap.innerHTML = '';

    // ── Status badge ──────────────────────────────────────────────
    const badge = document.createElement('div');
    badge.className = 'merge-header';
    if (isFinal && hasMerges) {
      badge.innerHTML = `<span class="merge-status final">✓ Converged — ${n - numGroups} state(s) will be merged into ${numGroups} groups</span>`;
    } else if (isFinal) {
      badge.innerHTML = `<span class="merge-status final">✓ Converged — DFA is already minimal (${numGroups} states)</span>`;
    } else {
      badge.innerHTML = `<span class="merge-status partial">⟳ Iteration in progress — ${numGroups} group${numGroups !== 1 ? 's' : ''} of ${n} states</span>`;
    }
    wrap.appendChild(badge);

    // ── Transition Table ──────────────────────────────────────────
    const tableWrap = document.createElement('div');
    tableWrap.className = 'merge-trans-scroll';

    const table = document.createElement('table');
    table.className = 'merge-trans-table';

    // Header
    const thead = document.createElement('thead');
    const hRow  = document.createElement('tr');

    // Markers column
    const thMark = document.createElement('th'); thMark.textContent = ''; hRow.appendChild(thMark);
    // State/Group column
    const thState = document.createElement('th'); thState.textContent = 'State / Group'; hRow.appendChild(thState);
    // One column per symbol
    alphabet.forEach(sym => {
      const th = document.createElement('th'); th.textContent = sym; hRow.appendChild(th);
    });
    // Merged-into column (only when there are actual merges)
    if (hasMerges) {
      const thMerge = document.createElement('th');
      thMerge.textContent = isFinal ? 'Merged Into' : 'Current Group';
      thMerge.className = 'merge-col-header';
      hRow.appendChild(thMerge);
    }
    thead.appendChild(hRow);
    table.appendChild(thead);

    // Body — one row per ORIGINAL state
    const tbody = document.createElement('tbody');

    // Track which groups are newly split for row highlighting
    states.forEach(s => {
      const myGroup    = groups.find(g => g.includes(s));
      if (!myGroup) return;
      const grpName    = groupName(myGroup);
      const isStart    = s === startState;
      const isAccept   = acceptSet.has(s);
      const isMerged   = myGroup.length > 1;
      const isNewSplit = newlySplitSet.has(s) && !isMerged;

      const tr = document.createElement('tr');
      // Row class for coloring
      if (isNewSplit)  tr.className = 'merge-row-split';
      else if (isMerged) tr.className = 'merge-row-merged';

      // Markers cell
      const tdMark = document.createElement('td');
      tdMark.className = 'merge-marker-cell';
      const marks = [];
      if (isStart)  marks.push('<span class="row-mark start">→</span>');
      if (isAccept) marks.push('<span class="row-mark accept">*</span>');
      tdMark.innerHTML = marks.join('');
      tr.appendChild(tdMark);

      // State name cell
      const tdState = document.createElement('td');
      tdState.className = 'merge-state-cell';
      tdState.textContent = s;
      tr.appendChild(tdState);

      // Transition cells
      alphabet.forEach(sym => {
        const td  = document.createElement('td');
        const tgt = targetGroup(s, sym);
        td.textContent  = tgt;
        td.className    = 'merge-trans-cell';
        // Highlight if the target is a merged group
        if (tgt.startsWith('{')) td.classList.add('merge-trans-merged');
        tr.appendChild(td);
      });

      // Merged-into cell
      if (hasMerges) {
        const tdGrp = document.createElement('td');
        tdGrp.className = isMerged ? 'merge-group-cell will-merge' : 'merge-group-cell';
        tdGrp.textContent = isMerged ? grpName : s;
        tr.appendChild(tdGrp);
      }

      tbody.appendChild(tr);

      // If this is the last member of a merged group, add a separator row
      const myIdx = myGroup.indexOf(s);
      if (isMerged && myIdx === myGroup.length - 1) {
        const sepRow = document.createElement('tr');
        sepRow.className = 'merge-sep-row';
        const sepTd = document.createElement('td');
        sepTd.colSpan = alphabet.length + 2 + (hasMerges ? 1 : 0);
        sepRow.appendChild(sepTd);
        tbody.appendChild(sepRow);
      }
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);
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

  return { init, getLastStatus: () => _lastStatus, getDfa: () => _dfa, getStep: () => _steps[_current], getMinDfa: () => _minDFA, getAnimT: () => _transAnimT };
})();

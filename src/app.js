/**
 * app.js  — v5
 * Root cause fix: fullscreen expand was reading clientWidth=0 because
 * the overlay transitions from display:none → display:flex and layout
 * hasn't been computed yet at the time renderFSFrame runs.
 * Fix: use setTimeout(fn, 50) instead of double-rAF, plus store the
 * current input DFA in a dedicated _inputDFA variable (not _currentDFA
 * which only gets set after minimization).
 */

(function () {

  // ── Shared state ────────────────────────────────────────────
  let _inputMode = 'table';
  let _regexDFA  = null;
  let _inputDFA  = null;   // whichever DFA is currently shown in canvas-input
  let _fsCanvasId = null;

  // ── Tab Navigation ──────────────────────────────────────────
  document.querySelectorAll('.btn-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      switchTab(btn.dataset.tab);
    });
  });

  function switchTab(name) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.btn-nav').forEach(b => b.classList.remove('active'));
    document.getElementById(`panel-${name}`)?.classList.add('active');
    document.querySelector(`[data-tab="${name}"]`)?.classList.add('active');
  }

  // ── Input Mode Switch ───────────────────────────────────────
  document.querySelectorAll('.btn-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      _inputMode = btn.dataset.mode;
      document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('mode-table').classList.toggle('hidden', _inputMode !== 'table');
      document.getElementById('mode-regex').classList.toggle('hidden', _inputMode !== 'regex');
    });
  });

  // ── Regex Parsing ───────────────────────────────────────────
  document.getElementById('btn-regex-parse').addEventListener('click', parseRegex);
  document.getElementById('regex-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') parseRegex();
  });

  function parseRegex() {
    const raw       = document.getElementById('regex-input').value.trim();
    const errEl     = document.getElementById('regex-error');
    const previewEl = document.getElementById('regex-dfa-preview');
    const alphaRow  = document.getElementById('regex-alphabet-row');

    errEl.classList.add('hidden');
    previewEl.classList.add('hidden');
    alphaRow.classList.add('hidden');
    _regexDFA = null;
    _inputDFA = null;

    const result = RegexToDFA.convert(raw);
    if (result.error) {
      errEl.textContent = '⚠ ' + result.error;
      errEl.classList.remove('hidden');
      return;
    }

    _regexDFA = result.dfa;
    _inputDFA = _regexDFA;   // keep reference for fullscreen

    // Detected alphabet chips
    document.getElementById('regex-detected-alpha').innerHTML =
      result.alphabet.map(c => `<span class="alpha-chip">${c}</span>`).join('');
    alphaRow.classList.remove('hidden');

    // Stats
    document.getElementById('regex-dfa-stats').textContent =
      `${_regexDFA.states.length} states · ${result.alphabet.length} symbols · ${_regexDFA.acceptStates.length} accept`;

    // Generated DFA table
    buildRegexPreviewTable(_regexDFA);
    previewEl.classList.remove('hidden');

    // Draw into canvas-input
    document.getElementById('dfa-preview-wrap').classList.remove('hidden');
    renderInputCanvas(_regexDFA);
  }

  function buildRegexPreviewTable(dfa) {
    const wrap  = document.getElementById('regex-dfa-table');
    const table = document.createElement('table');
    table.className = 'dfa-table';
    const thead = document.createElement('thead');
    const hr    = document.createElement('tr');
    ['', 'State', ...dfa.alphabet].forEach(h => {
      const th = document.createElement('th'); th.textContent = h; hr.appendChild(th);
    });
    thead.appendChild(hr); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    const aSet  = new Set(dfa.acceptStates);
    dfa.states.forEach(s => {
      const tr = document.createElement('tr');
      const mk = document.createElement('td');
      const m  = [];
      if (s === dfa.startState) m.push('→');
      if (aSet.has(s)) m.push('*');
      mk.textContent = m.join(''); mk.style.color = '#4fffb0'; mk.style.fontFamily = 'monospace';
      tr.appendChild(mk);
      const sl = document.createElement('td'); sl.className = 'state-label'; sl.textContent = s; tr.appendChild(sl);
      dfa.alphabet.forEach(sym => {
        const td = document.createElement('td');
        td.textContent = dfa.transitions[s]?.[sym] || '—';
        td.style.fontFamily = 'monospace'; td.style.color = '#8b92ab';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.innerHTML = ''; wrap.appendChild(table);
  }

  document.getElementById('btn-regex-run').addEventListener('click', () => {
    if (!_regexDFA) return;
    runMinimization(_regexDFA);
  });

  // ── Table Mode ──────────────────────────────────────────────
  document.getElementById('btn-generate-table').addEventListener('click', () => {
    const n    = parseInt(document.getElementById('num-states').value, 10) || 3;
    const raw  = document.getElementById('alphabet').value.trim();
    const alph = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (!alph.length) { showError('Please enter at least one alphabet symbol.'); return; }
    const states = TransitionTableComponent.generateStates(Math.max(2, Math.min(12, n)));
    TransitionTableComponent.build(states, alph);
    document.getElementById('dfa-preview-wrap').classList.remove('hidden');
    refreshInputPreview();
  });

  // onChange fires on every table input change and accept-chip click
  TransitionTableComponent.onChange(refreshInputPreview);
  document.getElementById('transition-table').addEventListener('input', refreshInputPreview);

  /** Read table DFA, store in _inputDFA, render canvas-input */
  function refreshInputPreview() {
    const dfa = readTableDFA();
    if (!dfa) return;
    _inputDFA = dfa;
    renderInputCanvas(dfa);
  }

  // ── Load Example ────────────────────────────────────────────
  document.getElementById('btn-load-example').addEventListener('click', () => {
    TransitionTableComponent.load({
      states:      ['q0','q1','q2','q3','q4'],
      alphabet:    ['a','b'],
      transitions: {
        q0:{a:'q1',b:'q2'}, q1:{a:'q1',b:'q3'},
        q2:{a:'q1',b:'q2'}, q3:{a:'q1',b:'q4'},
        q4:{a:'q1',b:'q2'},
      },
      startState:   'q0',
      acceptStates: ['q4'],
    });
    document.getElementById('dfa-preview-wrap').classList.remove('hidden');
    refreshInputPreview();
  });

  // ── Run minimization (table mode) ───────────────────────────
  document.getElementById('btn-run').addEventListener('click', () => {
    const dfa = readTableDFA(true);
    if (!dfa) return;
    const check = DFAMinimizer.validate(dfa);
    if (!check.valid) { showError(check.error); return; }
    runMinimization(dfa);
  });

  // ── Core render into canvas-input ───────────────────────────
  /**
   * Draws `dfa` into canvas-input.
   * If the fullscreen overlay is currently showing canvas-input,
   * also redraws the fullscreen canvas.
   */
  function renderInputCanvas(dfa) {
    if (!dfa) return;
    const canvas = document.getElementById('canvas-input');
    DFARenderer.render(canvas, dfa);

    // Sync fullscreen if it is open on this canvas
    if (_fsCanvasId === 'canvas-input' &&
        !document.getElementById('fullscreen-overlay').classList.contains('hidden')) {
      drawIntoFullscreen(dfa);
    }
  }

  // ── Core minimization runner ─────────────────────────────────
  function runMinimization(dfa) {
    const { minimizedDFA, steps, mergedMap } = DFAMinimizer.minimize(dfa);
    document.getElementById('tab-steps').disabled  = false;
    document.getElementById('tab-result').disabled = false;
    window._currentDFA   = dfa;
    window._minimizedDFA = minimizedDFA;
    window._mergedMap    = mergedMap;
    StepsPanel.init(steps, dfa);
    switchTab('steps');
    ResultPanel.init(dfa, minimizedDFA, mergedMap);
  }

  // ── Fullscreen Expand ───────────────────────────────────────
  document.querySelectorAll('.btn-expand').forEach(btn => {
    btn.addEventListener('click', () => {
      openFullscreen(btn.dataset.canvas, btn.dataset.title || 'DFA Diagram');
    });
  });

  document.getElementById('btn-fullscreen-close').addEventListener('click', closeFullscreen);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFullscreen(); });
  document.getElementById('fullscreen-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeFullscreen();
  });
  window.addEventListener('resize', () => {
    if (_fsCanvasId && !document.getElementById('fullscreen-overlay').classList.contains('hidden')) {
      renderFSFrame();
    }
  });

  function openFullscreen(canvasId, title) {
    _fsCanvasId = canvasId;
    document.getElementById('fullscreen-title').textContent = title;
    document.getElementById('fullscreen-overlay').classList.remove('hidden');

    // Use setTimeout so the browser has time to do the display:none → display:flex
    // layout pass and clientWidth/clientHeight are non-zero when we read them.
    setTimeout(renderFSFrame, 60);
  }

  function renderFSFrame() {
    if (!_fsCanvasId) return;

    const body     = document.querySelector('.fullscreen-body');
    const fsCanvas = document.getElementById('canvas-fullscreen');

    // Guard: if layout hasn't happened yet, retry once more
    if (!body.clientWidth || !body.clientHeight) {
      setTimeout(renderFSFrame, 60);
      return;
    }

    const availW = body.clientWidth  - 48;
    const availH = body.clientHeight - 48;

    // Only resize the canvas if dimensions actually changed (avoids clearing during live mirror)
    if (fsCanvas.width !== availW || fsCanvas.height !== availH) {
      fsCanvas.width        = availW;
      fsCanvas.height       = availH;
      fsCanvas.style.width  = availW + 'px';
      fsCanvas.style.height = availH + 'px';
    }

    if (_fsCanvasId === 'canvas-steps-dfa') {
      const dfa    = StepsPanel.getDfa();
      const status = StepsPanel.getLastStatus();
      if (dfa && status && Object.keys(status).length) {
        DFARenderer.renderWithStatus(fsCanvas, dfa, status);
      } else if (dfa) {
        DFARenderer.render(fsCanvas, dfa);
      }
    } else {
      const dfa = getDFAForCanvas(_fsCanvasId);
      if (dfa) DFARenderer.render(fsCanvas, dfa);
    }
  }

  /** Draw a known DFA object into the fullscreen canvas (no resize) */
  function drawIntoFullscreen(dfa) {
    const fsCanvas = document.getElementById('canvas-fullscreen');
    if (!fsCanvas || !dfa) return;
    // Ensure canvas has been sized (may not be if fullscreen just opened)
    if (!fsCanvas.width || !fsCanvas.height) { renderFSFrame(); return; }
    DFARenderer.render(fsCanvas, dfa);
  }

  /** Resolve which DFA object belongs to a given canvas id */
  function getDFAForCanvas(canvasId) {
    switch (canvasId) {
      case 'canvas-input':
        // _inputDFA is updated every time the preview canvas is drawn —
        // it always reflects what's currently visible, regardless of mode.
        return _inputDFA || null;
      case 'canvas-original':
        return window._currentDFA   || null;
      case 'canvas-minimized':
        return window._minimizedDFA || null;
      default:
        return null;
    }
  }

  function closeFullscreen() {
    document.getElementById('fullscreen-overlay').classList.add('hidden');
    _fsCanvasId = null;
  }

  // ── Restart ─────────────────────────────────────────────────
  document.getElementById('btn-restart').addEventListener('click', () => {
    document.getElementById('tab-steps').disabled  = true;
    document.getElementById('tab-result').disabled = true;
    window._currentDFA = window._minimizedDFA = null;
    _regexDFA = null;
    _inputDFA = null;
    switchTab('input');
  });

  // ── Helpers ─────────────────────────────────────────────────
  function readTableDFA(showErrors = false) {
    const data = TransitionTableComponent.read();
    if (!data || !data.states.length) {
      if (showErrors) showError('Please generate the transition table first.');
      return null;
    }
    if (!data.allFilled) {
      if (showErrors) showError('Please fill in all transition cells.');
      return null;
    }
    return data;
  }

  function showError(msg) {
    document.getElementById('error-toast')?.remove();
    const toast = document.createElement('div');
    toast.id = 'error-toast';
    toast.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:rgba(255,61,0,0.15);border:1px solid #ff3d00;color:#ff3d00;
      padding:12px 24px;border-radius:8px;font-family:'Space Mono',monospace;
      font-size:13px;z-index:99999;`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  // Expose renderFSFrame so stepsPanel can call it to mirror live diagram
  window._renderFSFrame = renderFSFrame;

})();

/**
 * transitionTable.js  — v2
 * Builds and manages the interactive transition table UI.
 * Accept-state chip clicks now trigger a live preview refresh callback.
 */

window.TransitionTableComponent = (function () {

  let _states    = [];
  let _alphabet  = [];
  let _acceptSet = new Set();
  let _onChangeCallback = null;   // called whenever DFA definition changes

  function generateStates(n) {
    return Array.from({ length: n }, (_, i) => `q${i}`);
  }

  /** Register a callback fired on any DFA change (transitions, accept states, start) */
  function onChange(fn) { _onChangeCallback = fn; }

  function _fireChange() { if (_onChangeCallback) _onChangeCallback(); }

  function build(states, alphabet) {
    _states   = states;
    _alphabet = alphabet;

    const wrap = document.getElementById('transition-table');
    wrap.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'dfa-table';

    const thead = document.createElement('thead');
    const hr    = document.createElement('tr');
    ['State', ...alphabet].forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    states.forEach(s => {
      const tr = document.createElement('tr');
      const labelTd = document.createElement('td');
      labelTd.className   = 'state-label';
      labelTd.textContent = s;
      tr.appendChild(labelTd);

      alphabet.forEach(sym => {
        const td    = document.createElement('td');
        const input = document.createElement('input');
        input.type        = 'text';
        input.className   = 'input-sm';
        input.id          = `trans-${s}-${sym}`;
        input.placeholder = '—';
        input.maxLength   = 4;
        input.value       = '';
        input.addEventListener('input', _fireChange);
        td.appendChild(input);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);

    // Start state dropdown
    const sel = document.getElementById('start-state');
    sel.innerHTML = '';
    states.forEach(s => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = s;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', _fireChange);

    // Accept state chips — fire change on every toggle
    _acceptSet.clear();
    const chips = document.getElementById('accept-states');
    chips.innerHTML = '';
    states.forEach(s => {
      const chip = document.createElement('div');
      chip.className    = 'state-chip';
      chip.textContent  = s;
      chip.dataset.state = s;
      chip.addEventListener('click', () => {
        chip.classList.toggle('accept');
        if (chip.classList.contains('accept')) { _acceptSet.add(s); }
        else { _acceptSet.delete(s); }
        _fireChange();   // ← live preview update on accept toggle
      });
      chips.appendChild(chip);
    });

    document.getElementById('transition-table-wrap').classList.remove('hidden');
  }

  function read() {
    const transitions = {};
    let allFilled = true;

    _states.forEach(s => {
      transitions[s] = {};
      _alphabet.forEach(sym => {
        const val = document.getElementById(`trans-${s}-${sym}`)?.value?.trim();
        transitions[s][sym] = val || '';
        if (!val) allFilled = false;
      });
    });

    return {
      states:       _states,
      alphabet:     _alphabet,
      transitions,
      startState:   document.getElementById('start-state')?.value,
      acceptStates: [..._acceptSet],
      allFilled,
    };
  }

  function load(dfa) {
    build(dfa.states, dfa.alphabet);

    dfa.states.forEach(s => {
      dfa.alphabet.forEach(sym => {
        const el = document.getElementById(`trans-${s}-${sym}`);
        if (el) el.value = dfa.transitions[s][sym] || '';
      });
    });

    const sel = document.getElementById('start-state');
    if (sel) sel.value = dfa.startState;

    _acceptSet = new Set(dfa.acceptStates);
    document.querySelectorAll('.state-chip').forEach(chip => {
      chip.classList.toggle('accept', _acceptSet.has(chip.dataset.state));
    });

    document.getElementById('num-states').value = dfa.states.length;
    document.getElementById('alphabet').value    = dfa.alphabet.join(',');

    _fireChange();
  }

  return { generateStates, build, read, load, onChange };
})();

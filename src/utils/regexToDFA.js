/**
 * regexToDFA.js
 * Regular Expression → NFA (Thompson construction) → DFA (subset construction)
 * Produces a complete, minimizable DFA object.
 *
 * Supported syntax:
 *   literals: any single char that isn't an operator
 *   |  union
 *   concatenation (implicit)
 *   *  Kleene star
 *   +  one-or-more  (a+ = aa*)
 *   ?  optional     (a? = a|ε)
 *   () grouping
 */

window.RegexToDFA = (function () {

  // ── NFA node ────────────────────────────────────────────────
  let _nodeId = 0;
  function newNode() { return { id: _nodeId++, trans: {}, eps: [] }; }

  // ── Thompson NFA fragments ───────────────────────────────────
  // Each fragment = { start, accept }

  function nfaLiteral(ch) {
    const s = newNode(), a = newNode();
    s.trans[ch] = [a];
    return { start: s, accept: a };
  }

  function nfaConcat(f1, f2) {
    f1.accept.eps.push(f2.start);
    return { start: f1.start, accept: f2.accept };
  }

  function nfaUnion(f1, f2) {
    const s = newNode(), a = newNode();
    s.eps.push(f1.start, f2.start);
    f1.accept.eps.push(a);
    f2.accept.eps.push(a);
    return { start: s, accept: a };
  }

  function nfaStar(f) {
    const s = newNode(), a = newNode();
    s.eps.push(f.start, a);
    f.accept.eps.push(f.start, a);
    return { start: s, accept: a };
  }

  function nfaPlus(f) {
    // a+ = aa*  — one or more: loop back but must enter at least once
    const s = newNode(), a = newNode();
    s.eps.push(f.start);
    f.accept.eps.push(f.start, a);
    return { start: s, accept: a };
  }

  function nfaOptional(f) {
    const s = newNode(), a = newNode();
    s.eps.push(f.start, a);
    f.accept.eps.push(a);
    return { start: s, accept: a };
  }

  // ── Regex parser (recursive descent) ────────────────────────
  function parse(regex) {
    _nodeId = 0;
    const tokens = tokenize(regex);
    let pos = 0;

    function peek()    { return tokens[pos]; }
    function consume() { return tokens[pos++]; }

    // expr = term (| term)*
    function expr() {
      let left = term();
      while (peek() === '|') { consume(); left = nfaUnion(left, term()); }
      return left;
    }

    // term = factor+   (implicit concatenation)
    function term() {
      let left = factor();
      while (peek() && peek() !== ')' && peek() !== '|') {
        left = nfaConcat(left, factor());
      }
      return left;
    }

    // factor = atom (* | + | ?)*
    function factor() {
      let f = atom();
      while (peek() === '*' || peek() === '+' || peek() === '?') {
        const op = consume();
        if (op === '*') f = nfaStar(f);
        else if (op === '+') f = nfaPlus(f);
        else f = nfaOptional(f);
      }
      return f;
    }

    // atom = literal | ( expr )
    function atom() {
      const t = peek();
      if (t === '(') {
        consume();
        const f = expr();
        if (peek() !== ')') throw new Error('Missing closing )');
        consume();
        return f;
      }
      if (!t || t === ')' || t === '|' || t === '*' || t === '+' || t === '?') {
        throw new Error(`Unexpected token: "${t || 'end'}"`);
      }
      consume();
      return nfaLiteral(t);
    }

    const nfa = expr();
    if (pos < tokens.length) throw new Error(`Unexpected token: "${tokens[pos]}"`);
    return nfa;
  }

  function tokenize(regex) {
    // We treat every character as a token (operators are single chars)
    return regex.replace(/\s+/g, '').split('');
  }

  // ── Epsilon closure ──────────────────────────────────────────
  function epsClosure(nodes) {
    const visited = new Set(nodes.map(n => n.id));
    const stack   = [...nodes];
    while (stack.length) {
      const n = stack.pop();
      for (const e of n.eps) {
        if (!visited.has(e.id)) { visited.add(e.id); stack.push(e); }
      }
    }
    return [...visited].sort((a, b) => a - b); // sorted id list
  }

  function move(nodeIds, nodeMap, sym) {
    const result = new Set();
    for (const id of nodeIds) {
      const n = nodeMap[id];
      for (const target of (n.trans[sym] || [])) {
        result.add(target.id);
      }
    }
    return [...result];
  }

  // ── Subset construction NFA → DFA ───────────────────────────
  function subsetConstruct(nfa, alphabet) {
    // Build node map
    const nodeMap = {};
    function collectNodes(n) {
      if (nodeMap[n.id]) return;
      nodeMap[n.id] = n;
      for (const e of n.eps) collectNodes(e);
      for (const targets of Object.values(n.trans)) {
        for (const t of targets) collectNodes(t);
      }
    }
    collectNodes(nfa.start);

    const startClosure = epsClosure([nfa.start]);
    const startKey = startClosure.join(',');

    const dfaStates  = {};   // key → { ids, name, isAccept }
    const dfaTrans   = {};   // name → { sym → name }
    const queue      = [startClosure];
    let   stateCount = 0;

    const nameOf = (ids) => {
      const key = ids.join(',');
      if (!dfaStates[key]) {
        const name = `q${stateCount++}`;
        const isAccept = ids.includes(nfa.accept.id);
        dfaStates[key] = { ids, name, isAccept };
        dfaTrans[name] = {};
      }
      return dfaStates[key].name;
    };

    nameOf(startClosure); // register start

    while (queue.length) {
      const current = queue.shift();
      const curName = dfaStates[current.join(',')].name;

      for (const sym of alphabet) {
        const moved   = move(current, nodeMap, sym);
        if (!moved.length) {
          // Dead state
          if (!dfaStates['__dead__']) {
            dfaStates['__dead__'] = { ids: [], name: `q${stateCount++}`, isAccept: false };
            dfaTrans[dfaStates['__dead__'].name] = {};
          }
          dfaTrans[curName][sym] = dfaStates['__dead__'].name;
          continue;
        }
        const closure = epsClosure(moved.map(id => nodeMap[id]));
        const key     = closure.join(',');
        const isNew   = !dfaStates[key];
        const tgtName = nameOf(closure);
        dfaTrans[curName][sym] = tgtName;
        if (isNew) queue.push(closure);
      }
    }

    // Fill dead state self-loops
    for (const s of Object.values(dfaStates)) {
      for (const sym of alphabet) {
        if (!dfaTrans[s.name][sym]) {
          if (!dfaStates['__dead__']) {
            dfaStates['__dead__'] = { ids: [], name: `q${stateCount++}`, isAccept: false };
            dfaTrans[dfaStates['__dead__'].name] = {};
          }
          dfaTrans[s.name][sym] = dfaStates['__dead__'].name;
        }
      }
    }

    const allStates  = Object.values(dfaStates).map(s => s.name);
    const acceptStates = Object.values(dfaStates).filter(s => s.isAccept).map(s => s.name);
    const startName  = dfaStates[startKey].name;

    return {
      states:      allStates,
      alphabet,
      transitions: dfaTrans,
      startState:  startName,
      acceptStates,
    };
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Convert a regex string to a complete DFA object.
   * @param {string} regex
   * @returns {{ dfa, alphabet, error }}
   */
  function convert(regex) {
    try {
      if (!regex.trim()) return { error: 'Please enter a regular expression.' };

      // Detect alphabet: all literal chars (not operators)
      const ops = new Set(['|', '*', '+', '?', '(', ')']);
      const alphabet = [...new Set(
        regex.replace(/\s+/g, '').split('').filter(c => !ops.has(c))
      )].sort();

      if (!alphabet.length) return { error: 'No alphabet symbols found in expression.' };
      if (alphabet.length > 8) return { error: 'Too many distinct symbols (max 8). Simplify the expression.' };

      const nfa = parse(regex);
      const dfa = subsetConstruct(nfa, alphabet);

      if (dfa.states.length > 20) return { error: 'Generated DFA is too large (>20 states). Simplify the expression.' };

      return { dfa, alphabet };
    } catch (e) {
      return { error: e.message };
    }
  }

  return { convert };
})();

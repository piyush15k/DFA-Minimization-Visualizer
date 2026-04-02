/**
 * dfaRenderer.js  —  v3
 * Canvas-based DFA graph renderer
 * Colors: original cyberpunk dark theme (matches distinguishability table)
 * Fullscreen: clean logical-pixel rendering, no DPR scaling bug
 */

window.DFARenderer = (function () {

  // ── Original cyberpunk color theme (matches dist table) ─────
  const COLORS = {
    bg:          '#13161e',
    stateFill:   '#1a1e2a',
    stateBorder: '#303650',
    stateAccept: '#4fffb0',   // same green as cell-equiv
    stateStart:  '#00cfff',   // cyan
    stateText:   '#e8ecf5',
    arrow:       '#555e78',
    arrowLabel:  '#8b92ab',
    highlight:   '#ffbb00',
  };

  const STATE_R    = 30;
  const HEAD_LEN   = 11;
  const HEAD_ANGLE = 0.38;

  // ── Geometry helpers ─────────────────────────────────────────

  function unit(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  }

  function arrowhead(ctx, ex, ey, ux, uy, color) {
    const angle = Math.atan2(uy, ux);
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - HEAD_LEN * Math.cos(angle - HEAD_ANGLE), ey - HEAD_LEN * Math.sin(angle - HEAD_ANGLE));
    ctx.lineTo(ex - HEAD_LEN * Math.cos(angle + HEAD_ANGLE), ey - HEAD_LEN * Math.sin(angle + HEAD_ANGLE));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function layoutStates(states, cx, cy, radius) {
    const positions = {};
    const n = states.length;
    states.forEach((s, i) => {
      const angle = (2 * Math.PI * i / n) - Math.PI / 2;
      positions[s] = {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });
    return positions;
  }

  // ── Edge drawing ─────────────────────────────────────────────

  function drawEdge(ctx, x1, y1, x2, y2, label, color, curvature) {
    curvature = curvature || 0;
    const [ux, uy] = unit(x1, y1, x2, y2);
    const sx = x1 + ux * STATE_R, sy = y1 + uy * STATE_R;
    const ex = x2 - ux * STATE_R, ey = y2 - uy * STATE_R;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;

    if (curvature === 0) {
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      arrowhead(ctx, ex, ey, ux, uy, color);
      if (label) drawLabel(ctx, label, (sx+ex)/2 - uy*13, (sy+ey)/2 + ux*13);
    } else {
      const midx = (sx+ex)/2, midy = (sy+ey)/2;
      const cpx = midx - uy*curvature, cpy = midy + ux*curvature;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cpx, cpy, ex, ey); ctx.stroke();
      const [tx, ty] = unit(cpx, cpy, ex, ey);
      arrowhead(ctx, ex, ey, tx, ty, color);
      if (label) {
        const lx = 0.25*sx + 0.5*cpx + 0.25*ex;
        const ly = 0.25*sy + 0.5*cpy + 0.25*ey;
        const [nx, ny] = unit(midx, midy, cpx, cpy);
        drawLabel(ctx, label, lx + nx*14, ly + ny*14);
      }
    }
    ctx.restore();
  }

  function drawSelfLoop(ctx, sx, sy, cx, cy, label, color) {
    const [ox, oy] = unit(cx, cy, sx, sy);
    const outAngle = Math.atan2(oy, ox);
    const spread = 0.52;
    const loopR = 22;
    const loopDist = STATE_R + loopR + 6;
    const apx = sx + ox*loopDist, apy = sy + oy*loopDist;
    const a1 = outAngle - spread, a2 = outAngle + spread;
    const p1x = sx + STATE_R*Math.cos(a1), p1y = sy + STATE_R*Math.sin(a1);
    const p2x = sx + STATE_R*Math.cos(a2), p2y = sy + STATE_R*Math.sin(a2);

    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(p1x, p1y); ctx.quadraticCurveTo(apx, apy, p2x, p2y); ctx.stroke();
    const [tx, ty] = unit(apx, apy, p2x, p2y);
    arrowhead(ctx, p2x, p2y, tx, ty, color);
    if (label) drawLabel(ctx, label, apx + ox*15, apy + oy*15);
    ctx.restore();
  }

  function drawLabel(ctx, text, x, y) {
    ctx.save();
    ctx.font = 'bold 12px Space Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(13,15,20,0.85)';
    ctx.fillRect(x - w/2, y - 8, w, 16);
    ctx.fillStyle = COLORS.arrowLabel;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ── Core draw routine (shared by render + renderWithStatus) ──

  function drawDFA(ctx, w, h, dfa, stateColorFn) {
    const { states, alphabet, transitions, startState, acceptStates } = dfa;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    if (!states || !states.length) return;

    const cx = w / 2, cy = h / 2, n = states.length;
    const margin = STATE_R + 50;   // generous: accepts ring (6) + self-loop (28) + entry arrow (30) + pad
    const radius = n === 1 ? 0 : Math.min(cx, cy) - margin;
    const pos = layoutStates(states, cx, cy, radius);
    const acceptSet = new Set(acceptStates);

    // Group transitions
    const edgeMap = {};
    for (const s of states) {
      for (const sym of alphabet) {
        const t = transitions[s]?.[sym];
        if (!t) continue;
        const key = `${s}→${t}`;
        if (!edgeMap[key]) edgeMap[key] = { from: s, to: t, labels: [] };
        edgeMap[key].labels.push(sym);
      }
    }

    // Draw edges
    for (const key of Object.keys(edgeMap)) {
      const { from, to, labels } = edgeMap[key];
      const label = labels.join(',');
      const { x: x1, y: y1 } = pos[from];
      const { x: x2, y: y2 } = pos[to];

      if (from === to) {
        drawSelfLoop(ctx, x1, y1, cx, cy, label, COLORS.arrow);
        continue;
      }
      const hasBidi = !!edgeMap[`${to}→${from}`];
      let curv = 0;
      if (hasBidi) {
        const [ux, uy] = unit(x1, y1, x2, y2);
        const mx = (x1+x2)/2 - cx, my = (y1+y2)/2 - cy;
        curv = (-uy*mx + ux*my) >= 0 ? 38 : -38;
      }
      drawEdge(ctx, x1, y1, x2, y2, label, COLORS.arrow, curv);
    }

    // Start arrow
    if (pos[startState]) {
      const { x, y } = pos[startState];
      const [ox, oy] = n === 1 ? [-1, 0] : unit(cx, cy, x, y);
      const tipX = x + ox*STATE_R,       tipY = y + oy*STATE_R;
      const tailX = x + ox*(STATE_R+30), tailY = y + oy*(STATE_R+30);
      ctx.save();
      ctx.strokeStyle = COLORS.stateStart; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(tipX, tipY); ctx.stroke();
      arrowhead(ctx, tipX, tipY, ox, oy, COLORS.stateStart);
      ctx.restore();
    }

    // Draw states
    for (const s of states) {
      const { x, y } = pos[s];
      const isAccept = acceptSet.has(s);
      const isStart  = s === startState;
      const sc = stateColorFn(s, isAccept, isStart);

      ctx.save();
      if (sc.glow) { ctx.shadowColor = sc.glow; ctx.shadowBlur = sc.glowBlur || 14; }

      if (isAccept) {
        ctx.beginPath(); ctx.arc(x, y, STATE_R + 6, 0, Math.PI*2);
        ctx.strokeStyle = sc.ring || sc.stroke; ctx.lineWidth = 1.5; ctx.stroke();
      }
      const r = sc.pulseR || STATE_R;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fillStyle = sc.fill; ctx.fill();
      ctx.strokeStyle = isStart ? COLORS.stateStart : sc.stroke;
      ctx.lineWidth = isStart ? 2.2 : 1.5; ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.font = 'bold 13px Space Mono, monospace';
      ctx.fillStyle = sc.text;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.length > 6 ? s.slice(0,5)+'…' : s, x, y);
      ctx.restore();
    }
  }

  // ── Public: render (standard, no status) ─────────────────────

  function render(canvas, dfa) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');

    function stateColorFn(s, isAccept, isStart) {
      return {
        fill:   COLORS.stateFill,
        stroke: COLORS.stateBorder,
        text:   isAccept ? COLORS.stateAccept : COLORS.stateText,
        ring:   COLORS.stateAccept,
        glow:   isAccept ? COLORS.stateAccept : null,
        glowBlur: 10,
      };
    }
    drawDFA(ctx, w, h, dfa, stateColorFn);
  }

  // ── Public: renderWithStatus (steps live diagram) ─────────────

  function renderWithStatus(canvas, dfa, stateStatus, pulseStates, pulseIntensity) {
    pulseStates    = pulseStates    || [];
    pulseIntensity = pulseIntensity !== undefined ? pulseIntensity : 0;

    const STATUS = {
      normal: { fill: COLORS.stateFill,            stroke: COLORS.stateBorder, text: COLORS.stateText,  glow: null },
      equiv:  { fill: 'rgba(79,255,176,0.12)',      stroke: '#4fffb0',          text: '#4fffb0',          glow: 'rgba(79,255,176,0.5)' },
      marked: { fill: 'rgba(255,79,123,0.12)',      stroke: '#ff4f7b',          text: '#ff4f7b',          glow: null },
      new:    { fill: 'rgba(255,187,0,0.18)',       stroke: '#ffbb00',          text: '#ffbb00',          glow: 'rgba(255,187,0,0.8)' },
    };

    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');

    function stateColorFn(s, isAccept, isStart) {
      const status = stateStatus[s] || 'normal';
      const base   = STATUS[status];
      const isPulsing = pulseStates.includes(s) && pulseIntensity > 0;
      return {
        fill:     base.fill,
        stroke:   base.stroke,
        text:     base.text,
        ring:     base.stroke,
        glow:     isPulsing && base.glow ? base.glow : (isAccept ? 'rgba(79,255,176,0.3)' : null),
        glowBlur: isPulsing ? 22 * pulseIntensity : 10,
        pulseR:   isPulsing ? STATE_R + pulseIntensity * 4 : STATE_R,
      };
    }
    drawDFA(ctx, w, h, dfa, stateColorFn);
  }

  // ── Public: renderFullscreen ──────────────────────────────────
  // Renders into any canvas sized to fill the fullscreen body.
  // Uses LOGICAL pixel dimensions only (no DPR scaling bug).

  function renderFullscreen(canvas, dfa) {
    if (!dfa || !canvas) return;
    // canvas.width/height are already set to logical px by the caller
    render(canvas, dfa);
  }

  return { render, renderWithStatus, renderFullscreen };
})();

/**
 * dfaRenderer.js  —  v4
 * Canvas-based DFA graph renderer
 * NEW: Animated transitions between steps — states pulse/scale, arrows draw in sequentially
 */

window.DFARenderer = (function () {

  const COLORS = {
    bg:          '#13161e',
    stateFill:   '#1a1e2a',
    stateBorder: '#303650',
    stateAccept: '#4fffb0',
    stateStart:  '#00cfff',
    stateText:   '#e8ecf5',
    arrow:       '#555e78',
    arrowLabel:  '#8b92ab',
    highlight:   '#ffbb00',
  };

  const STATE_R    = 30;
  const HEAD_LEN   = 11;
  const HEAD_ANGLE = 0.38;

  // Running animations per canvas
  const _runningAnims = new WeakMap();

  // ── Math helpers ───────────────────────────────────────────────

  function unit(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }
  function easeOut(t)   { return 1 - Math.pow(1 - t, 3); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Parse any css color string to [r, g, b, a]
  function parseColor(c) {
    if (!c) return [128, 128, 128, 0];
    const m = c.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)/);
    if (m) return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1];
    const hx = c.replace('#', '');
    if (hx.length === 6) return [parseInt(hx.slice(0,2),16), parseInt(hx.slice(2,4),16), parseInt(hx.slice(4,6),16), 1];
    if (hx.length === 3) return [parseInt(hx[0]+hx[0],16), parseInt(hx[1]+hx[1],16), parseInt(hx[2]+hx[2],16), 1];
    return [128,128,128,1];
  }

  function lerpColor(c1, c2, t) {
    const a = parseColor(c1), b = parseColor(c2);
    return `rgba(${Math.round(lerp(a[0],b[0],t))},${Math.round(lerp(a[1],b[1],t))},${Math.round(lerp(a[2],b[2],t))},${lerp(a[3],b[3],t).toFixed(3)})`;
  }

  // ── Geometry: layout ──────────────────────────────────────────

  function layoutStates(states, cx, cy, radius) {
    const n = states.length;
    const positions = {};
    states.forEach((s, i) => {
      const angle = (2 * Math.PI * i / n) - Math.PI / 2;
      positions[s] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });
    return positions;
  }

  // ── Drawing primitives ────────────────────────────────────────

  function arrowhead(ctx, ex, ey, ux, uy, color, alpha) {
    const angle = Math.atan2(uy, ux);
    ctx.save();
    ctx.globalAlpha = clamp(alpha !== undefined ? alpha : 1, 0, 1);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - HEAD_LEN * Math.cos(angle - HEAD_ANGLE), ey - HEAD_LEN * Math.sin(angle - HEAD_ANGLE));
    ctx.lineTo(ex - HEAD_LEN * Math.cos(angle + HEAD_ANGLE), ey - HEAD_LEN * Math.sin(angle + HEAD_ANGLE));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawLabel(ctx, text, x, y, alpha) {
    alpha = clamp(alpha !== undefined ? alpha : 1, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
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

  // drawEdge with optional dash progress [0..1] for draw-in animation
  function drawEdge(ctx, x1, y1, x2, y2, label, color, curvature, alpha, dashProg) {
    curvature = curvature || 0;
    alpha = clamp(alpha !== undefined ? alpha : 1, 0, 1);
    if (alpha <= 0) return;

    const [ux, uy] = unit(x1, y1, x2, y2);
    const sx = x1 + ux * STATE_R, sy = y1 + uy * STATE_R;
    const ex = x2 - ux * STATE_R, ey = y2 - uy * STATE_R;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;

    if (curvature === 0) {
      if (dashProg !== undefined && dashProg < 1) {
        // Draw only dashProg fraction of the line
        const len = Math.hypot(ex - sx, ey - sy);
        const endX = sx + ux * len * dashProg;
        const endY = sy + uy * len * dashProg;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(endX, endY); ctx.stroke();
        if (dashProg > 0.85) {
          const headAlpha = clamp((dashProg - 0.85) / 0.15, 0, 1);
          arrowhead(ctx, endX, endY, ux, uy, color, alpha * headAlpha);
        }
        if (label && dashProg > 0.45) {
          drawLabel(ctx, label, (sx+endX)/2 - uy*13, (sy+endY)/2 + ux*13, alpha * clamp((dashProg-0.45)/0.3,0,1));
        }
      } else {
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        arrowhead(ctx, ex, ey, ux, uy, color, alpha);
        if (label) drawLabel(ctx, label, (sx+ex)/2 - uy*13, (sy+ey)/2 + ux*13, alpha);
      }
    } else {
      const midx = (sx+ex)/2, midy = (sy+ey)/2;
      const cpx = midx - uy*curvature, cpy = midy + ux*curvature;
      if (dashProg !== undefined && dashProg < 1) {
        // Approximate by drawing a partial polyline along the bezier
        const steps = 30;
        const drawSteps = Math.floor(steps * dashProg);
        ctx.beginPath();
        for (let i = 0; i <= drawSteps; i++) {
          const bt = i / steps;
          const bx = (1-bt)*(1-bt)*sx + 2*(1-bt)*bt*cpx + bt*bt*ex;
          const by = (1-bt)*(1-bt)*sy + 2*(1-bt)*bt*cpy + bt*bt*ey;
          i === 0 ? ctx.moveTo(bx, by) : ctx.lineTo(bx, by);
        }
        ctx.stroke();
        if (dashProg > 0.85) {
          const bt2 = drawSteps / steps;
          const [tx, ty] = unit(cpx, cpy, ex, ey);
          const bx2 = (1-bt2)*(1-bt2)*sx + 2*(1-bt2)*bt2*cpx + bt2*bt2*ex;
          const by2 = (1-bt2)*(1-bt2)*sy + 2*(1-bt2)*bt2*cpy + bt2*bt2*ey;
          arrowhead(ctx, bx2, by2, tx, ty, color, alpha * clamp((dashProg-0.85)/0.15,0,1));
        }
      } else {
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cpx, cpy, ex, ey); ctx.stroke();
        const [tx, ty] = unit(cpx, cpy, ex, ey);
        arrowhead(ctx, ex, ey, tx, ty, color, alpha);
        if (label) {
          const lx = 0.25*sx + 0.5*cpx + 0.25*ex;
          const ly = 0.25*sy + 0.5*cpy + 0.25*ey;
          const [nx, ny] = unit(midx, midy, cpx, cpy);
          drawLabel(ctx, label, lx + nx*14, ly + ny*14, alpha);
        }
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawSelfLoop(ctx, sx, sy, cx, cy, label, color, alpha, dashProg) {
    alpha = clamp(alpha !== undefined ? alpha : 1, 0, 1);
    if (alpha <= 0) return;
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
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(p1x, p1y); ctx.quadraticCurveTo(apx, apy, p2x, p2y); ctx.stroke();
    const [tx, ty] = unit(apx, apy, p2x, p2y);
    if (dashProg === undefined || dashProg > 0.8) arrowhead(ctx, p2x, p2y, tx, ty, color, alpha);
    if (label && (dashProg === undefined || dashProg > 0.5)) drawLabel(ctx, label, apx + ox*15, apy + oy*15, alpha);
    ctx.restore();
  }

  // ── Core draw ─────────────────────────────────────────────────
  // colorOverrides: { stateName: { fill, stroke, text, glow, glowBlur } }
  // geometryOverrides: { stateName: { r, alpha } }
  // edgeOverrides: { 'from→to': { alpha, dashProg } }

  function drawDFA(ctx, w, h, dfa, stateColorFn, geometryOverrides, edgeOverrides) {
    geometryOverrides = geometryOverrides || {};
    edgeOverrides     = edgeOverrides     || {};

    const { states, alphabet, transitions, startState, acceptStates } = dfa;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    if (!states || !states.length) return;

    const cx = w / 2, cy = h / 2, n = states.length;
    const margin = STATE_R + 50;
    const radius = n === 1 ? 0 : Math.min(cx, cy) - margin;
    const pos = layoutStates(states, cx, cy, radius);
    const acceptSet = new Set(acceptStates);

    // Merge geometry overrides into positions
    const finalPos = {};
    for (const s of states) {
      const ov = geometryOverrides[s] || {};
      finalPos[s] = {
        x: ov.x !== undefined ? ov.x : pos[s].x,
        y: ov.y !== undefined ? ov.y : pos[s].y,
      };
    }

    // Build edge map
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
      const { x: x1, y: y1 } = finalPos[from];
      const { x: x2, y: y2 } = finalPos[to];
      const ov = edgeOverrides[key] || {};
      const alpha = ov.alpha !== undefined ? ov.alpha : 1;

      if (from === to) {
        drawSelfLoop(ctx, x1, y1, cx, cy, label, COLORS.arrow, alpha, ov.dashProg);
        continue;
      }
      const hasBidi = !!edgeMap[`${to}→${from}`];
      let curv = 0;
      if (hasBidi) {
        const [ux, uy] = unit(x1, y1, x2, y2);
        const mx = (x1+x2)/2 - cx, my = (y1+y2)/2 - cy;
        curv = (-uy*mx + ux*my) >= 0 ? 38 : -38;
      }
      drawEdge(ctx, x1, y1, x2, y2, label, COLORS.arrow, curv, alpha, ov.dashProg);
    }

    // Start arrow
    if (finalPos[startState]) {
      const { x, y } = finalPos[startState];
      const [ox, oy] = n === 1 ? [-1, 0] : unit(cx, cy, x, y);
      const tipX = x + ox*STATE_R, tipY = y + oy*STATE_R;
      const tailX = x + ox*(STATE_R+30), tailY = y + oy*(STATE_R+30);
      const sa = (geometryOverrides[startState]?.alpha) ?? 1;
      ctx.save();
      ctx.globalAlpha = clamp(sa, 0, 1);
      ctx.strokeStyle = COLORS.stateStart; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(tipX, tipY); ctx.stroke();
      arrowhead(ctx, tipX, tipY, ox, oy, COLORS.stateStart);
      ctx.restore();
    }

    // Draw states
    for (const s of states) {
      const { x, y } = finalPos[s];
      const isAccept = acceptSet.has(s);
      const isStart  = s === startState;
      const sc = stateColorFn(s, isAccept, isStart);
      const gv = geometryOverrides[s] || {};
      const alpha = clamp(gv.alpha !== undefined ? gv.alpha : 1, 0, 1);
      const r = gv.r !== undefined ? gv.r : (sc.pulseR || STATE_R);

      if (alpha <= 0) continue;

      ctx.save();
      ctx.globalAlpha = alpha;
      if (sc.glow) { ctx.shadowColor = sc.glow; ctx.shadowBlur = (sc.glowBlur || 14); }

      if (isAccept) {
        ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI*2);
        ctx.strokeStyle = sc.ring || sc.stroke; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fillStyle = sc.fill; ctx.fill();
      ctx.strokeStyle = isStart ? COLORS.stateStart : sc.stroke;
      ctx.lineWidth = isStart ? 2.2 : 1.5; ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 13px Space Mono, monospace';
      ctx.fillStyle = sc.text;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.length > 6 ? s.slice(0,5)+'…' : s, x, y);
      ctx.restore();
    }
  }

  // ── Status color definitions ───────────────────────────────────

  const STATUS_COLORS = {
    normal: { fill: COLORS.stateFill,            stroke: COLORS.stateBorder, text: COLORS.stateText,  glow: null,                    glowBlur: 0  },
    equiv:  { fill: 'rgba(79,255,176,0.12)',      stroke: '#4fffb0',          text: '#4fffb0',          glow: 'rgba(79,255,176,0.5)',   glowBlur: 18 },
    marked: { fill: 'rgba(255,79,123,0.12)',      stroke: '#ff4f7b',          text: '#ff4f7b',          glow: null,                    glowBlur: 0  },
    new:    { fill: 'rgba(255,187,0,0.18)',       stroke: '#ffbb00',          text: '#ffbb00',          glow: 'rgba(255,187,0,0.8)',    glowBlur: 24 },
  };

  // ── Public: render (standard) ─────────────────────────────────

  function render(canvas, dfa) {
    cancelAnimation(canvas);
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    function stateColorFn(s, isAccept) {
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

  // ── Public: renderWithStatus (instant, no anim) ───────────────

  function renderWithStatus(canvas, dfa, stateStatus, pulseStates, pulseIntensity) {
    pulseStates    = pulseStates    || [];
    pulseIntensity = pulseIntensity !== undefined ? pulseIntensity : 0;

    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');

    function stateColorFn(s, isAccept) {
      const status = stateStatus[s] || 'normal';
      const base   = STATUS_COLORS[status];
      const isPulsing = pulseStates.includes(s) && pulseIntensity > 0;
      return {
        fill:     base.fill,
        stroke:   base.stroke,
        text:     base.text,
        ring:     base.stroke,
        glow:     isPulsing && base.glow ? base.glow : (isAccept ? 'rgba(79,255,176,0.3)' : null),
        glowBlur: isPulsing ? 22 * pulseIntensity : base.glowBlur,
        pulseR:   isPulsing ? STATE_R + pulseIntensity * 4 : STATE_R,
      };
    }
    drawDFA(ctx, w, h, dfa, stateColorFn);
  }

  // ── Public: animateTransition ─────────────────────────────────
  // Smoothly transitions from prevStatus → nextStatus with:
  //  - Scale bounce on newly marked states
  //  - Color cross-fade on changed states
  //  - Sequential draw-in animation on affected edges

  function animateTransition(canvas, dfa, prevStatus, nextStatus, newlyMarked, opts) {
    opts = opts || {};
    const duration   = opts.duration  || 950;
    const onComplete = opts.onComplete || null;

    cancelAnimation(canvas);

    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const newlyMarkedSet = new Set(newlyMarked || []);

    // Build edge map once
    const edgeMap = {};
    for (const s of dfa.states) {
      for (const sym of dfa.alphabet) {
        const t = dfa.transitions[s]?.[sym];
        if (!t) continue;
        const key = `${s}→${t}`;
        if (!edgeMap[key]) edgeMap[key] = { from: s, to: t, labels: [] };
        edgeMap[key].labels.push(sym);
      }
    }

    // Split edges into affected (touch a newly-marked state) and stable
    const edgeKeys      = Object.keys(edgeMap);
    const affectedEdges = edgeKeys.filter(k => {
      const { from, to } = edgeMap[k];
      return newlyMarkedSet.has(from) || newlyMarkedSet.has(to);
    });

    const startTime = performance.now();

    function frame(now) {
      const raw = clamp((now - startTime) / duration, 0, 1);
      const t   = easeInOut(raw);

      // Per-state interpolated colors
      const colorOverrides = {};
      const geomOverrides  = {};

      for (const s of dfa.states) {
        const ps  = prevStatus[s] || 'normal';
        const ns  = nextStatus[s] || 'normal';
        const isNew = newlyMarkedSet.has(s);
        const pc  = STATUS_COLORS[ps];
        const nc  = STATUS_COLORS[ns];

        let r = STATE_R;
        let fill, stroke, text, glow, glowBlur;

        if (ps !== ns) {
          // Three sub-phases: pop (0→0.35), cross-fade (0.35→0.7), settle (0.7→1)
          if (t <= 0.35) {
            const sub = t / 0.35;
            // Newly marked states: scale up (bounce), others: scale down slightly
            if (isNew) {
              r = STATE_R * (1 + 0.35 * Math.sin(sub * Math.PI));
            } else {
              r = STATE_R * (1 - 0.08 * Math.sin(sub * Math.PI));
            }
            fill     = lerpColor(pc.fill,   nc.fill,   sub * 0.4);
            stroke   = lerpColor(pc.stroke, nc.stroke, sub * 0.4);
            text     = lerpColor(pc.text,   nc.text,   sub * 0.4);
            glow     = nc.glow;
            glowBlur = lerp(pc.glowBlur, nc.glowBlur, sub * 0.4);
          } else if (t <= 0.7) {
            const sub = (t - 0.35) / 0.35;
            r        = STATE_R;
            fill     = lerpColor(pc.fill,   nc.fill,   0.4 + sub * 0.4);
            stroke   = lerpColor(pc.stroke, nc.stroke, 0.4 + sub * 0.4);
            text     = lerpColor(pc.text,   nc.text,   0.4 + sub * 0.4);
            glow     = nc.glow;
            glowBlur = lerp(pc.glowBlur, nc.glowBlur, 0.4 + sub * 0.4);
          } else {
            const sub = (t - 0.7) / 0.3;
            r        = STATE_R;
            fill     = lerpColor(pc.fill,   nc.fill,   0.8 + sub * 0.2);
            stroke   = lerpColor(pc.stroke, nc.stroke, 0.8 + sub * 0.2);
            text     = lerpColor(pc.text,   nc.text,   0.8 + sub * 0.2);
            glow     = nc.glow;
            glowBlur = lerp(pc.glowBlur, nc.glowBlur, 1);
          }
        } else {
          // No change — use final colors directly
          fill     = nc.fill;
          stroke   = nc.stroke;
          text     = nc.text;
          glow     = nc.glow;
          glowBlur = nc.glowBlur;
        }

        colorOverrides[s] = { fill, stroke, text, glow, glowBlur };
        geomOverrides[s]  = { r, alpha: 1 };
      }

      // Edge overrides: affected edges draw in sequentially
      const edgeOverrides = {};
      edgeKeys.forEach(k => {
        if (!affectedEdges.includes(k)) {
          edgeOverrides[k] = { alpha: 1 };
          return;
        }
        const idx   = affectedEdges.indexOf(k);
        const stagger = idx / Math.max(affectedEdges.length, 1) * 0.3;
        // Edges start appearing at t = 0.25, staggered, drawing in over 0.5s
        const edgeT = clamp((t - 0.25 - stagger) / 0.5, 0, 1);
        edgeOverrides[k] = {
          alpha:    0.35 + easeOut(edgeT) * 0.65,
          dashProg: edgeT < 1 ? easeOut(edgeT) : undefined,
        };
      });

      function stateColorFn(s) {
        const co = colorOverrides[s] || {};
        return {
          fill:     co.fill     || COLORS.stateFill,
          stroke:   co.stroke   || COLORS.stateBorder,
          text:     co.text     || COLORS.stateText,
          ring:     co.stroke   || COLORS.stateBorder,
          glow:     co.glow     || null,
          glowBlur: co.glowBlur || 0,
          pulseR:   (geomOverrides[s] || {}).r || STATE_R,
        };
      }

      drawDFA(ctx, w, h, dfa, stateColorFn, geomOverrides, edgeOverrides);

      if (raw < 1) {
        const raf = requestAnimationFrame(frame);
        _runningAnims.set(canvas, { raf });
      } else {
        _runningAnims.delete(canvas);
        // Settle to clean final frame
        renderWithStatus(canvas, dfa, nextStatus);
        if (onComplete) onComplete();
      }
    }

    const raf = requestAnimationFrame(frame);
    _runningAnims.set(canvas, { raf });
  }

  // ── Public: cancelAnimation ───────────────────────────────────

  function cancelAnimation(canvas) {
    const ex = _runningAnims.get(canvas);
    if (ex) { cancelAnimationFrame(ex.raf); _runningAnims.delete(canvas); }
  }

  // ── Public: renderFullscreen ──────────────────────────────────

  function renderFullscreen(canvas, dfa) {
    if (!dfa || !canvas) return;
    render(canvas, dfa);
  }

  return { render, renderWithStatus, animateTransition, cancelAnimation, renderFullscreen };
})();

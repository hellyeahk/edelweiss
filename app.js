(() => {
  const canvas = document.getElementById('edelweissCanvas');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  let width = 0;
  let height = 0;
  let dpr = 1;
  let sceneScale = 1;
  let ridgeBaseY = 0;

  // Offscreen cached canvases & sprites for locked 60 FPS performance
  let bgCanvas = null;
  let moonAuraSprite = null;
  let goldCoreSprite = null;
  let moteSprite = null;
  let pubescencePattern = null;

  // Spring-damped alpine breeze physics
  const breeze = {
    targetX: 0,
    targetY: 0,
    posX: 0,
    posY: 0,
    velX: 0,
    velY: 0,
    gustBoost: 0,
    lastX: null,
    lastY: null
  };

  const startTime = performance.now();
  let stems = [];
  let basalLeaves = [];
  let motes = [];
  let twinkleStars = [];

  // ============================================================================
  // MATH, EASING & C1-CONTINUOUS QUADRATIC MIDPOINT SPLINES
  // ============================================================================
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (edge0, edge1, x) => {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeInOutCubic = (t) => {
    const c = clamp(t, 0, 1);
    return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
  };

  function seededRandom(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function cubicBezier(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    const a = mt2 * mt;
    const b = 3 * mt2 * t;
    const c = 3 * mt * t2;
    const d = t2 * t;
    return {
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
    };
  }

  /**
   * Traces a C1-continuous quadratic midpoint spline through `points`.
   * Produces silky-smooth organic curvature with zero jagged polygon joints.
   */
  function traceSmoothSpline(targetCtx, points, moveFirst = true) {
    const len = points.length;
    if (len === 0) return;

    if (moveFirst) {
      targetCtx.moveTo(points[0].x, points[0].y);
    } else {
      targetCtx.lineTo(points[0].x, points[0].y);
    }

    if (len === 1) return;
    if (len === 2) {
      targetCtx.lineTo(points[1].x, points[1].y);
      return;
    }

    for (let i = 1; i < len - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) * 0.5;
      const midY = (points[i].y + points[i + 1].y) * 0.5;
      targetCtx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }

    const last = points[len - 1];
    targetCtx.lineTo(last.x, last.y);
  }

  // ============================================================================
  // 3D EULER ROTATION & PERSPECTIVE PROJECTION
  // ============================================================================
  function project3D(lx, ly, lz, originX, originY, yaw, pitch, roll, focalLength = 780) {
    // Roll around Z
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const x1 = lx * cr - ly * sr;
    const y1 = lx * sr + ly * cr;
    const z1 = lz;

    // Pitch around X (tilts the star head toward the viewer)
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x2 = x1;
    const y2 = y1 * cp - z1 * sp;
    const z2 = y1 * sp + z1 * cp;

    // Yaw around Y
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const x3 = x2 * cy + z2 * sy;
    const y3 = y2;
    const z3 = -x2 * sy + z2 * cy;

    const scale = focalLength / Math.max(220, focalLength - z3 * 0.65);
    return {
      x: originX + x3 * scale,
      y: originY + y3 * scale,
      z: z3,
      scale
    };
  }

  // ============================================================================
  // OFFSCREEN GLOW SPRITES & STARLIT ALPINE TWILIGHT BACKDROP CACHE
  // ============================================================================
  function buildGlowSprites() {
    // 1. Silvery-white moonlight flower aura (256x256)
    moonAuraSprite = document.createElement('canvas');
    moonAuraSprite.width = 256;
    moonAuraSprite.height = 256;
    const mCtx = moonAuraSprite.getContext('2d');
    const mGrad = mCtx.createRadialGradient(128, 128, 6, 128, 128, 128);
    mGrad.addColorStop(0.0, 'rgba(241, 245, 249, 0.34)');
    mGrad.addColorStop(0.36, 'rgba(186, 230, 253, 0.16)');
    mGrad.addColorStop(0.72, 'rgba(148, 163, 184, 0.05)');
    mGrad.addColorStop(1.0, 'rgba(148, 163, 184, 0)');
    mCtx.fillStyle = mGrad;
    mCtx.fillRect(0, 0, 256, 256);

    // 2. Warm golden-amber floret center glow (128x128)
    goldCoreSprite = document.createElement('canvas');
    goldCoreSprite.width = 128;
    goldCoreSprite.height = 128;
    const gCtx = goldCoreSprite.getContext('2d');
    const gGrad = gCtx.createRadialGradient(64, 64, 2, 64, 64, 64);
    gGrad.addColorStop(0.0, 'rgba(254, 249, 195, 0.85)');
    gGrad.addColorStop(0.32, 'rgba(250, 204, 21, 0.42)');
    gGrad.addColorStop(0.7, 'rgba(217, 119, 6, 0.10)');
    gGrad.addColorStop(1.0, 'rgba(217, 119, 6, 0)');
    gCtx.fillStyle = gGrad;
    gCtx.fillRect(0, 0, 128, 128);

    // 3. Drifting alpine snow / luminous pollen mote (64x64)
    moteSprite = document.createElement('canvas');
    moteSprite.width = 64;
    moteSprite.height = 64;
    const pCtx = moteSprite.getContext('2d');
    const pGrad = pCtx.createRadialGradient(32, 32, 1, 32, 32, 32);
    pGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.96)');
    pGrad.addColorStop(0.28, 'rgba(224, 242, 254, 0.52)');
    pGrad.addColorStop(0.68, 'rgba(253, 230, 138, 0.14)');
    pGrad.addColorStop(1.0, 'rgba(253, 230, 138, 0)');
    pCtx.fillStyle = pGrad;
    pCtx.fillRect(0, 0, 64, 64);

    // Fine woolly pubescence texture reused across bracts, stems, and leaves.
    const woolCanvas = document.createElement('canvas');
    woolCanvas.width = 64;
    woolCanvas.height = 64;
    const wCtx = woolCanvas.getContext('2d');
    const wRand = seededRandom(7719);
    wCtx.lineCap = 'round';
    for (let i = 0; i < 150; i++) {
      const fx = wRand() * 64;
      const fy = wRand() * 64;
      const ang = wRand() * Math.PI * 2;
      const fLen = 3.5 + wRand() * 5.5;
      wCtx.strokeStyle = wRand() > 0.45
        ? `rgba(255, 255, 255, ${0.09 + wRand() * 0.10})`
        : `rgba(148, 163, 184, ${0.07 + wRand() * 0.08})`;
      wCtx.lineWidth = 0.65;
      wCtx.beginPath();
      wCtx.moveTo(fx, fy);
      wCtx.quadraticCurveTo(
        fx + Math.cos(ang + 0.35) * fLen * 0.5,
        fy + Math.sin(ang + 0.35) * fLen * 0.5,
        fx + Math.cos(ang) * fLen,
        fy + Math.sin(ang) * fLen
      );
      wCtx.stroke();
    }
    pubescencePattern = wCtx.createPattern(woolCanvas, 'repeat');
  }

  function buildCachedBackground() {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = Math.max(1, Math.round(width));
    bgCanvas.height = Math.max(1, Math.round(height));
    const bCtx = bgCanvas.getContext('2d');

    ridgeBaseY = height * 0.89;

    // 1. Deep indigo-slate alpine twilight sky gradient
    const skyGrad = bCtx.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0.0, '#040712');
    skyGrad.addColorStop(0.36, '#0a1128');
    skyGrad.addColorStop(0.68, '#132042');
    skyGrad.addColorStop(0.88, '#1b2d52');
    skyGrad.addColorStop(1.0, '#0b101d');
    bCtx.fillStyle = skyGrad;
    bCtx.fillRect(0, 0, width, height);

    // Soft silver-cyan celestial glow behind the alpine peaks
    const glowX = width * 0.52;
    const glowY = height * 0.58;
    const glowR = Math.max(width, height) * 0.68;
    const celGrad = bCtx.createRadialGradient(glowX, glowY, 10, glowX, glowY, glowR);
    celGrad.addColorStop(0.0, 'rgba(165, 243, 252, 0.12)');
    celGrad.addColorStop(0.45, 'rgba(125, 211, 252, 0.05)');
    celGrad.addColorStop(1.0, 'rgba(10, 17, 40, 0)');
    bCtx.fillStyle = celGrad;
    bCtx.fillRect(0, 0, width, height);

    // 2. Crisp starlit alpine sky (static stars + seed list for live twinkling)
    const rand = seededRandom(4091);
    twinkleStars = [];
    const totalStars = clamp(Math.floor((width * height) / 5800), 65, 210);
    for (let i = 0; i < totalStars; i++) {
      const sx = rand() * width;
      const sy = rand() * (height * 0.66);
      const sr = 0.55 + rand() * 1.35;
      const alpha = 0.25 + rand() * 0.72;
      const isWarm = rand() > 0.78;

      bCtx.fillStyle = isWarm
        ? `rgba(254, 249, 195, ${alpha})`
        : `rgba(224, 242, 254, ${alpha})`;
      bCtx.beginPath();
      bCtx.arc(sx, sy, sr, 0, Math.PI * 2);
      bCtx.fill();

      if (i % 5 === 0) {
        twinkleStars.push({
          x: sx,
          y: sy,
          r: sr * 1.4,
          phase: rand() * Math.PI * 2,
          freq: 1.3 + rand() * 2.1
        });
      }
    }

    // 3. Distant jagged alpine mountain silhouettes (3 layered ridges + snow crests)
    drawAlpineMountainRange(bCtx, {
      baseY: height * 0.72,
      amp: height * 0.22,
      seed: 101,
      fillTop: '#0d1730',
      fillBot: '#091022',
      snowAlpha: 0.24
    });

    // Faint silver-cyan alpine valley mist between far and mid peaks
    const mist1 = bCtx.createLinearGradient(0, height * 0.54, 0, height * 0.78);
    mist1.addColorStop(0.0, 'rgba(186, 230, 253, 0)');
    mist1.addColorStop(0.55, 'rgba(186, 230, 253, 0.09)');
    mist1.addColorStop(1.0, 'rgba(15, 23, 42, 0)');
    bCtx.fillStyle = mist1;
    bCtx.fillRect(0, height * 0.54, width, height * 0.24);

    drawAlpineMountainRange(bCtx, {
      baseY: height * 0.80,
      amp: height * 0.16,
      seed: 207,
      fillTop: '#091124',
      fillBot: '#060c1a',
      snowAlpha: 0.14
    });

    // Lower silver-cyan alpine mist drifting behind the foreground limestone ridge
    const mist2 = bCtx.createLinearGradient(0, height * 0.68, 0, ridgeBaseY + 12);
    mist2.addColorStop(0.0, 'rgba(165, 243, 252, 0)');
    mist2.addColorStop(0.6, 'rgba(165, 243, 252, 0.08)');
    mist2.addColorStop(1.0, 'rgba(148, 163, 184, 0.14)');
    bCtx.fillStyle = mist2;
    bCtx.fillRect(0, height * 0.68, width, ridgeBaseY - height * 0.68 + 12);

    // 4. Dark alpine limestone rock ridge along the bottom edge
    drawLimestoneRidge(bCtx);
  }

  function drawAlpineMountainRange(targetCtx, opts) {
    const rand = seededRandom(opts.seed);
    const segments = 18;
    const pts = [];

    for (let i = 0; i <= segments; i++) {
      const frac = i / segments;
      const x = frac * width;
      // Dramatic alpine horn silhouette higher on sides/center-left
      const macro = Math.sin(frac * Math.PI * 1.15 + 0.3) * 0.55 + Math.cos(frac * Math.PI * 2.6) * 0.32;
      const jag = (rand() - 0.35) * 0.42;
      const peakH = Math.max(0.08, macro + jag) * opts.amp;
      pts.push({ x, y: opts.baseY - peakH });
    }

    const grad = targetCtx.createLinearGradient(0, opts.baseY - opts.amp, 0, height);
    grad.addColorStop(0, opts.fillTop);
    grad.addColorStop(1, opts.fillBot);

    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.moveTo(-10, height);
    targetCtx.lineTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      targetCtx.lineTo(pts[i].x, pts[i].y);
    }
    targetCtx.lineTo(width + 10, height);
    targetCtx.closePath();
    targetCtx.fillStyle = grad;
    targetCtx.fill();

    // Moonlit silver-cyan ridge crest line
    targetCtx.beginPath();
    targetCtx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      targetCtx.lineTo(pts[i].x, pts[i].y);
    }
    targetCtx.strokeStyle = `rgba(186, 230, 253, ${opts.snowAlpha})`;
    targetCtx.lineWidth = 1.2;
    targetCtx.stroke();
    targetCtx.restore();
  }

  function drawLimestoneRidge(targetCtx) {
    const rand = seededRandom(9931);
    const topPts = [];
    const steps = 24;

    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      const x = frac * width;
      // Slightly raised central rocky outcrop where the Edelweiss cushion anchors
      const mound = Math.exp(-Math.pow((frac - 0.5) / 0.28, 2)) * (26 * sceneScale);
      const crag = (rand() - 0.5) * 14 * sceneScale;
      topPts.push({
        x,
        y: ridgeBaseY - mound + crag
      });
    }

    targetCtx.save();

    // Main dark alpine limestone mass
    const rockGrad = targetCtx.createLinearGradient(0, ridgeBaseY - 35 * sceneScale, 0, height);
    rockGrad.addColorStop(0.0, '#1e293b');
    rockGrad.addColorStop(0.28, '#111827');
    rockGrad.addColorStop(0.75, '#090d16');
    rockGrad.addColorStop(1.0, '#04060b');

    targetCtx.beginPath();
    targetCtx.moveTo(-10, height + 5);
    for (let i = 0; i < topPts.length; i++) {
      targetCtx.lineTo(topPts[i].x, topPts[i].y);
    }
    targetCtx.lineTo(width + 10, height + 5);
    targetCtx.closePath();
    targetCtx.fillStyle = rockGrad;
    targetCtx.fill();

    // Angular limestone strata & mineral facets
    for (let i = 0; i < topPts.length - 1; i++) {
      const pA = topPts[i];
      const pB = topPts[i + 1];
      const midX = (pA.x + pB.x) * 0.5 + (rand() - 0.5) * 18;
      const midY = Math.max(pA.y, pB.y) + (16 + rand() * 26) * sceneScale;

      targetCtx.beginPath();
      targetCtx.moveTo(pA.x, pA.y);
      targetCtx.lineTo(pB.x, pB.y);
      targetCtx.lineTo(midX, midY);
      targetCtx.closePath();
      targetCtx.fillStyle = i % 2 === 0
        ? 'rgba(51, 65, 85, 0.28)'
        : 'rgba(15, 23, 42, 0.45)';
      targetCtx.fill();
    }

    // Moonlit silver-slate upper limestone rim highlight
    targetCtx.beginPath();
    targetCtx.moveTo(topPts[0].x, topPts[0].y);
    for (let i = 1; i < topPts.length; i++) {
      targetCtx.lineTo(topPts[i].x, topPts[i].y);
    }
    targetCtx.strokeStyle = 'rgba(203, 213, 225, 0.34)';
    targetCtx.lineWidth = 1.4;
    targetCtx.stroke();

    targetCtx.restore();
  }

  // ============================================================================
  // EDELWEISS DOUBLE-STAR BRACTS & CENTRAL CAPITULA CLUSTER (3D + SMOOTH SPLINES)
  // ============================================================================
  function createEdelweissHead(seed, radius, yaw, pitch, roll, isYoungBud = false) {
    const rand = seededRandom(seed);

    // Double-star formation of 10 to 14 unequal lance-shaped woolly bracts
    const primaryCount = 6 + Math.floor(rand() * 2);   // 6 or 7 longer primary rays
    const secondaryCount = 5 + Math.floor(rand() * 3); // 5 to 7 shorter alternating secondary rays
    const bracts = [];
    const baseAngle = rand() * Math.PI * 2;

    // Outer whorl: longer asymmetric primary rays
    for (let i = 0; i < primaryCount; i++) {
      const angle = baseAngle + (i / primaryCount) * Math.PI * 2 + (rand() - 0.5) * 0.22;
      const lenMult = 0.84 + rand() * 0.34; // unequal wild alpine star lengths
      const widMult = 0.25 + rand() * 0.06;
      const twist = (rand() - 0.5) * 0.22;
      const archOffset = (rand() - 0.5) * 0.14;
      bracts.push({
        whorl: 0,
        angle,
        lenMult,
        widMult,
        twist,
        archOffset,
        openSpread: 1.38 + rand() * 0.16,
        delayOffset: 0.0 + rand() * 0.08
      });
    }

    // Inner whorl: shorter secondary rays alternating in gaps
    for (let j = 0; j < secondaryCount; j++) {
      const angle = baseAngle + ((j + 0.5) / secondaryCount) * Math.PI * 2 + (rand() - 0.5) * 0.24;
      const lenMult = 0.54 + rand() * 0.26;
      const widMult = 0.23 + rand() * 0.05;
      const twist = (rand() - 0.5) * 0.20;
      const archOffset = (rand() - 0.5) * 0.12;
      bracts.push({
        whorl: 1,
        angle,
        lenMult,
        widMult,
        twist,
        archOffset,
        openSpread: 1.12 + rand() * 0.16,
        delayOffset: 0.12 + rand() * 0.08
      });
    }

    // Central corymbose cluster of 5 to 8 tiny golden-yellow floret heads (capitula)
    const capCount = 5 + Math.floor(rand() * 4); // 5 to 8 capitula
    const capitula = [
      // Central primary golden capitulum
      {
        lx: 0,
        ly: 0,
        lz: 0.11,
        rMult: 0.125,
        shadeShift: 0
      }
    ];

    const ringCount = capCount - 1;
    const capBaseAz = rand() * Math.PI * 2;
    for (let c = 0; c < ringCount; c++) {
      const az = capBaseAz + (c / ringCount) * Math.PI * 2 + (rand() - 0.5) * 0.28;
      const dist = 0.165 + rand() * 0.045;
      capitula.push({
        lx: Math.cos(az) * dist,
        ly: Math.sin(az) * dist,
        lz: 0.075 + rand() * 0.025,
        rMult: 0.088 + rand() * 0.022,
        shadeShift: rand()
      });
    }

    return {
      radius,
      yaw,
      pitch,
      roll,
      isYoungBud,
      bloomDelay: 0.85,
      bloomDuration: isYoungBud ? 11.5 : 2.8,
      maxOpen: isYoungBud ? 0.86 : 1.0,
      breathPhase: rand() * Math.PI * 2,
      bracts,
      capitula
    };
  }

  /**
   * Evaluates a 3D point on a velvety lance-shaped Edelweiss bract.
   * u in [0, 1] along bract length; v in [-1, 1] across bract width.
   */
  function evalEdelweissBract3D(bract, u, v, openAmount, R) {
    const len = R * bract.lenMult;
    const maxHalfW = R * bract.widMult;

    // Characteristic lance-shaped (lanceolate) profile: slender base, widest around u=0.45, tapered acute tip
    const lanceEnv = Math.sin(Math.pow(u, 0.72) * Math.PI);
    const tipTaper = u > 0.68 ? 1 - Math.pow((u - 0.68) / 0.32, 1.55) * 0.36 : 1.0;
    const budFold = lerp(0.32, 1.0, easeOutCubic(openAmount));
    const halfW = maxHalfW * lanceEnv * tipTaper * budFold;

    // Smooth opening from upright cupped bud (0.18 rad) to radiating alpine star
    const localOpen = clamp((openAmount - bract.delayOffset) / (1 - bract.delayOffset * 0.6), 0, 1);
    const easedOpen = easeInOutCubic(localOpen);
    const targetTilt = bract.openSpread + bract.archOffset;
    const tiltAngle = lerp(0.18, targetTilt, easedOpen);

    // Gentle S-arch along the bract spine so tips gracefully lift slightly at the end
    const spineAngle = tiltAngle * Math.pow(u, 0.85) - Math.pow(Math.max(0, u - 0.62) / 0.38, 2.0) * 0.16 * easedOpen;
    const radialDist = len * Math.sin(spineAngle) * (0.14 + 0.86 * u);
    const forwardZ = len * Math.cos(spineAngle) * u;

    // Subtle longitudinal crease & gentle lateral cupping
    const creaseDepth = (1 - Math.abs(v)) * halfW * 0.14 * (0.4 + 0.6 * easedOpen);
    const lateralCurve = (1 - v * v) * halfW * 0.12;

    const px = radialDist - lateralCurve * 0.3;
    const py = v * halfW;
    const pz = forwardZ - creaseDepth + lateralCurve;

    const angle = bract.angle + bract.twist * u * easedOpen;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    return {
      lx: px * cosA - py * sinA,
      ly: px * sinA + py * cosA,
      lz: pz
    };
  }

  function drawEdelweissFlower(originX, originY, stemLean, headCfg, bloomProg, timeSec, scaleMult) {
    if (bloomProg <= 0.02) return;

    const R = headCfg.radius * scaleMult * lerp(0.34, 1.0, easeOutCubic(clamp(bloomProg * 1.4, 0, 1)));
    const rawOpen = clamp((bloomProg - 0.1) / 0.9, 0, 1);
    const openAmount = easeInOutCubic(rawOpen) * headCfg.maxOpen;

    const breath = Math.sin(timeSec * 1.3 + headCfg.breathPhase) * 0.028 * openAmount;
    const curYaw = headCfg.yaw + breeze.posX * 0.0022;
    const curPitch = headCfg.pitch + breath;
    const curRoll = headCfg.roll + stemLean * 0.65;

    // 1. Silvery-white moonlight aura behind the Edelweiss star (screen-blended cached sprite)
    if (openAmount > 0.06) {
      const auraSize = R * (2.5 + openAmount * 0.85) * (0.94 + 0.06 * Math.sin(timeSec * 1.5 + headCfg.breathPhase));
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = clamp(openAmount * 0.92, 0, 1);
      ctx.drawImage(
        moonAuraSprite,
        originX - auraSize,
        originY - auraSize,
        auraSize * 2,
        auraSize * 2
      );
      ctx.restore();
    }

    // 2. Depth-sort all 3D woolly bracts + central cluster of golden capitula
    const renderQueue = [];
    const uSteps = 14;

    for (let bIdx = 0; bIdx < headCfg.bracts.length; bIdx++) {
      const bract = headCfg.bracts[bIdx];
      const leftPts = [];
      const rightPts = [];
      const midPts = [];
      let zSum = 0;

      for (let i = 0; i <= uSteps; i++) {
        const u = i / uSteps;
        const pL = evalEdelweissBract3D(bract, u, -1, openAmount, R);
        const pR = evalEdelweissBract3D(bract, u, 1, openAmount, R);
        const pM = evalEdelweissBract3D(bract, u, 0, openAmount, R);

        const sL = project3D(pL.lx, pL.ly, pL.lz, originX, originY, curYaw, curPitch, curRoll);
        const sR = project3D(pR.lx, pR.ly, pR.lz, originX, originY, curYaw, curPitch, curRoll);
        const sM = project3D(pM.lx, pM.ly, pM.lz, originX, originY, curYaw, curPitch, curRoll);

        leftPts.push(sL);
        rightPts.push(sR);
        midPts.push(sM);
        zSum += sM.z;
      }

      // Inner whorl sits slightly forward of outer whorl
      const avgZ = zSum / (uSteps + 1) + bract.whorl * 2.2;
      renderQueue.push({
        kind: 'bract',
        whorl: bract.whorl,
        leftPts,
        rightPts,
        midPts,
        z: avgZ
      });
    }

    // Add the central cluster of 5 to 8 golden-yellow floret heads
    const clusterCenterProj = project3D(0, 0, R * 0.14, originX, originY, curYaw, curPitch, curRoll);
    renderQueue.push({
      kind: 'capitulaCluster',
      z: clusterCenterProj.z + 3.5
    });

    renderQueue.sort((a, b) => a.z - b.z);

    // 3. Render sorted 3D elements
    ctx.save();
    for (let i = 0; i < renderQueue.length; i++) {
      const item = renderQueue[i];
      if (item.kind === 'bract') {
        drawSingleWoollyBract(item, scaleMult);
      } else if (openAmount > 0.16) {
        drawGoldenCapitulaCluster(originX, originY, headCfg.capitula, openAmount, R, curYaw, curPitch, curRoll, scaleMult);
      }
    }
    ctx.restore();
  }

  function drawSingleWoollyBract(item, scaleMult) {
    const { whorl, leftPts, rightPts, midPts } = item;
    const uSteps = midPts.length - 1;
    const basePt = midPts[0];
    const tipPt = midPts[uSteps];

    const traceBract = () => {
      ctx.beginPath();
      ctx.moveTo(basePt.x, basePt.y);
      traceSmoothSpline(ctx, leftPts.slice(1), false);
      const revRight = [];
      for (let i = uSteps - 1; i >= 1; i--) revRight.push(rightPts[i]);
      traceSmoothSpline(ctx, revRight, false);
      ctx.closePath();
    };

    // Subtle soft shadow cast onto underlying bract whorl
    ctx.save();
    ctx.translate(1.2 * scaleMult, 2.4 * scaleMult);
    traceBract();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.26)';
    ctx.fill();
    ctx.restore();

    // Velvety/felted pearlescent snow-white to cool silver-ivory gradient
    traceBract();
    const grad = ctx.createLinearGradient(basePt.x, basePt.y, tipPt.x, tipPt.y);
    if (whorl === 0) {
      grad.addColorStop(0.0, '#cbd5e1');
      grad.addColorStop(0.28, '#e2e8f0');
      grad.addColorStop(0.68, '#f8fafc');
      grad.addColorStop(1.0, '#ffffff');
    } else {
      grad.addColorStop(0.0, '#d6dee8');
      grad.addColorStop(0.32, '#eef2f6');
      grad.addColorStop(0.75, '#ffffff');
      grad.addColorStop(1.0, '#f8fafc');
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // Soft fuzzy outer woolly rim (felted tomentose texture halo)
    traceBract();
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.36)';
    ctx.lineWidth = Math.max(1.8, 2.8 * scaleMult);
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Crisp pearlescent moonlight inner edge highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = Math.max(0.75, 1.0 * scaleMult);
    ctx.stroke();

    // Subtle central longitudinal crease (midrib furrow)
    ctx.beginPath();
    traceSmoothSpline(ctx, midPts.slice(1, -1), true);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.34)';
    ctx.lineWidth = Math.max(0.8, 1.15 * scaleMult);
    ctx.stroke();
  }

  /**
   * Renders the central cluster of 5 to 8 tiny golden-yellow dome-shaped floret heads (capitula)
   */
  function drawGoldenCapitulaCluster(originX, originY, capitula, openAmount, R, yaw, pitch, roll, scaleMult) {
    const emerge = easeOutCubic(clamp((openAmount - 0.16) / 0.84, 0, 1));
    const centerProj = project3D(0, 0, R * 0.12, originX, originY, yaw, pitch, roll);

    // Warm golden core aura behind the capitula cluster
    const coreGlowSize = R * 0.78 * emerge;
    if (goldCoreSprite && coreGlowSize > 4) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.85 * emerge;
      ctx.drawImage(
        goldCoreSprite,
        centerProj.x - coreGlowSize,
        centerProj.y - coreGlowSize,
        coreGlowSize * 2,
        coreGlowSize * 2
      );
      ctx.restore();
    }

    // Project and depth-sort the 5..8 individual dome-shaped capitula
    const projectedCaps = [];
    for (let i = 0; i < capitula.length; i++) {
      const cap = capitula[i];
      const p = project3D(
        cap.lx * R * emerge,
        cap.ly * R * emerge,
        cap.lz * R * emerge,
        originX,
        originY,
        yaw,
        pitch,
        roll
      );
      projectedCaps.push({
        cap,
        proj: p,
        radius: R * cap.rMult * emerge * p.scale
      });
    }

    projectedCaps.sort((a, b) => a.proj.z - b.proj.z);

    for (let i = 0; i < projectedCaps.length; i++) {
      const { cap, proj, radius } = projectedCaps[i];
      if (radius <= 0.8) continue;

      // 1. Olive-green & silver woolly involucral cup nestled underneath each golden dome
      ctx.beginPath();
      ctx.arc(proj.x, proj.y + radius * 0.24, radius * 1.06, 0, Math.PI * 2);
      ctx.fillStyle = '#3f5a36';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(proj.x, proj.y + radius * 0.18, radius * 1.02, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
      ctx.lineWidth = Math.max(0.7, 0.95 * scaleMult);
      ctx.stroke();

      // 2. Dome-shaped golden-yellow floret head shaded with amber, ochre, and bright lemon-gold
      const domeGrad = ctx.createRadialGradient(
        proj.x - radius * 0.28,
        proj.y - radius * 0.32,
        radius * 0.1,
        proj.x,
        proj.y,
        radius
      );
      if (cap.shadeShift > 0.5) {
        domeGrad.addColorStop(0.0, '#fef08a');
        domeGrad.addColorStop(0.45, '#facc15');
        domeGrad.addColorStop(0.82, '#ca8a04');
        domeGrad.addColorStop(1.0, '#854d0e');
      } else {
        domeGrad.addColorStop(0.0, '#fef9c3');
        domeGrad.addColorStop(0.42, '#eab308');
        domeGrad.addColorStop(0.80, '#b45309');
        domeGrad.addColorStop(1.0, '#713f12');
      }

      ctx.beginPath();
      ctx.arc(proj.x, proj.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = domeGrad;
      ctx.fill();

      // Tiny tubular floret stipple highlights on the golden dome
      ctx.fillStyle = 'rgba(254, 249, 195, 0.72)';
      const dotR = Math.max(0.65, radius * 0.13);
      ctx.beginPath();
      ctx.arc(proj.x - radius * 0.25, proj.y - radius * 0.22, dotR, 0, Math.PI * 2);
      ctx.arc(proj.x + radius * 0.22, proj.y - radius * 0.18, dotR * 0.9, 0, Math.PI * 2);
      ctx.arc(proj.x, proj.y + radius * 0.15, dotR * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ============================================================================
  // WOOLLY SAGE-GREEN STEMS, CAULINE LEAVES & BASAL CUSHION ROSETTE
  // ============================================================================
  function createEdelweissStem(opts) {
    return {
      zOrder: opts.zOrder,
      p0: opts.p0,
      p1: opts.p1,
      p2: opts.p2,
      p3: opts.p3,
      thickness: opts.thickness,
      growDelay: opts.growDelay,
      growDuration: opts.growDuration,
      swayPhase: opts.swayPhase,
      swayAmp: opts.swayAmp,
      caulineLeaves: opts.caulineLeaves,
      head: opts.head
    };
  }

  function initAlpineMeadow() {
    const anchorX = width * 0.5;
    const anchorY = ridgeBaseY - 8 * sceneScale;

    // Hero cluster of 5 blooming Edelweiss stems of varying heights (including 1 young opening bud)
    stems = [
      // 1. Tall Central-Left Hero Edelweiss
      createEdelweissStem({
        zOrder: 3,
        p0: { x: -16, y: 12 },
        p1: { x: -58, y: -96 },
        p2: { x: -18, y: -215 },
        p3: { x: -46, y: -318 },
        thickness: 5.6,
        growDelay: 0.08,
        growDuration: 1.85,
        swayPhase: 0.5,
        swayAmp: 11.5,
        caulineLeaves: [
          { t: 0.28, side: -1, len: 52, wid: 8.5, angle: -0.45 },
          { t: 0.52, side: 1, len: 46, wid: 7.8, angle: 0.42 },
          { t: 0.74, side: -1, len: 36, wid: 6.5, angle: -0.35 }
        ],
        head: Object.assign(
          createEdelweissHead(1011, 56, 0.16, 0.34, -0.06, false),
          { bloomDelay: 0.95, bloomDuration: 2.6 }
        )
      }),

      // 2. Tall Right-Leaning Companion Edelweiss
      createEdelweissStem({
        zOrder: 2,
        p0: { x: 22, y: 12 },
        p1: { x: 64, y: -88 },
        p2: { x: 26, y: -195 },
        p3: { x: 56, y: -286 },
        thickness: 5.2,
        growDelay: 0.18,
        growDuration: 1.8,
        swayPhase: 2.0,
        swayAmp: 11.0,
        caulineLeaves: [
          { t: 0.30, side: 1, len: 50, wid: 8.2, angle: 0.46 },
          { t: 0.58, side: -1, len: 42, wid: 7.2, angle: -0.40 }
        ],
        head: Object.assign(
          createEdelweissHead(2022, 52, -0.22, 0.32, 0.08, false),
          { bloomDelay: 1.1, bloomDuration: 2.7 }
        )
      }),

      // 3. Mid-Height Foreground Center-Right Edelweiss (tilted toward viewer)
      createEdelweissStem({
        zOrder: 3,
        p0: { x: 6, y: 14 },
        p1: { x: -16, y: -64 },
        p2: { x: 34, y: -142 },
        p3: { x: 16, y: -214 },
        thickness: 5.4,
        growDelay: 0.28,
        growDuration: 1.7,
        swayPhase: 3.5,
        swayAmp: 9.5,
        caulineLeaves: [
          { t: 0.34, side: -1, len: 46, wid: 7.8, angle: -0.48 },
          { t: 0.64, side: 1, len: 38, wid: 6.8, angle: 0.44 }
        ],
        head: Object.assign(
          createEdelweissHead(3033, 54, -0.08, 0.44, 0.04, false),
          { bloomDelay: 1.2, bloomDuration: 2.5 }
        )
      }),

      // 4. Lower-Left Arching Foreground Edelweiss
      createEdelweissStem({
        zOrder: 3,
        p0: { x: -34, y: 14 },
        p1: { x: -38, y: -56 },
        p2: { x: -102, y: -118 },
        p3: { x: -94, y: -178 },
        thickness: 5.0,
        growDelay: 0.36,
        growDuration: 1.65,
        swayPhase: 4.8,
        swayAmp: 9.0,
        caulineLeaves: [
          { t: 0.35, side: 1, len: 44, wid: 7.4, angle: 0.42 },
          { t: 0.65, side: -1, len: 35, wid: 6.2, angle: -0.52 }
        ],
        head: Object.assign(
          createEdelweissHead(4044, 49, 0.28, 0.38, -0.14, false),
          { bloomDelay: 1.3, bloomDuration: 2.6 }
        )
      }),

      // 5. Young Emerging Edelweiss Bud (slowly unfurling its woolly star)
      createEdelweissStem({
        zOrder: 2,
        p0: { x: 42, y: 14 },
        p1: { x: 48, y: -48 },
        p2: { x: 96, y: -104 },
        p3: { x: 92, y: -156 },
        thickness: 4.6,
        growDelay: 0.44,
        growDuration: 1.6,
        swayPhase: 1.4,
        swayAmp: 8.5,
        caulineLeaves: [
          { t: 0.38, side: -1, len: 40, wid: 6.8, angle: -0.44 },
          { t: 0.68, side: 1, len: 32, wid: 5.8, angle: 0.46 }
        ],
        head: Object.assign(
          createEdelweissHead(5055, 44, -0.24, 0.26, 0.12, true),
          { bloomDelay: 1.0, bloomDuration: 12.5 }
        )
      })
    ];

    // Compact basal cushion rosette of narrow, lance-shaped silver-green leaves
    basalLeaves = [];
    const rand = seededRandom(6123);
    const rosetteCount = 34;
    for (let i = 0; i < rosetteCount; i++) {
      const spread = (i / (rosetteCount - 1)) * 2 - 1; // -1 to +1
      const baseOffsetX = spread * 96 + (rand() - 0.5) * 14;
      const angle = spread * 1.18 + (rand() - 0.5) * 0.22; // radiating outward from cushion
      const len = (42 + (1 - Math.abs(spread) * 0.45) * 38 + rand() * 14);
      const wid = 6.5 + rand() * 3.2;
      const curve = (spread >= 0 ? 1 : -1) * (0.28 + rand() * 0.24);
      const shadeIdx = i % 3;

      basalLeaves.push({
        anchorX,
        anchorY,
        baseOffsetX,
        angle,
        len,
        wid,
        curve,
        shadeIdx,
        phase: rand() * Math.PI * 2,
        delay: 0.05 + Math.abs(spread) * 0.25
      });
    }

    // Drifting glowing alpine snow / luminous pollen motes
    motes = [];
    const moteCount = clamp(Math.floor((width * height) / 36000), 18, 42);
    for (let i = 0; i < moteCount; i++) {
      motes.push({
        x: Math.random(),
        y: Math.random(),
        size: 9 + Math.random() * 14,
        speedY: 0.014 + Math.random() * 0.026,
        driftAmp: 18 + Math.random() * 34,
        driftFreq: 0.45 + Math.random() * 0.85,
        phase: Math.random() * Math.PI * 2,
        twinkleFreq: 1.2 + Math.random() * 2.0,
        alpha: 0.42 + Math.random() * 0.55
      });
    }
  }

  function sampleWaveStemPoints(stem, anchorX, anchorY, maxT, timeSec) {
    const steps = 28;
    const pts = [];
    const b0 = { x: anchorX + stem.p0.x * sceneScale, y: anchorY + stem.p0.y * sceneScale };
    const b1 = { x: anchorX + stem.p1.x * sceneScale, y: anchorY + stem.p1.y * sceneScale };
    const b2 = { x: anchorX + stem.p2.x * sceneScale, y: anchorY + stem.p2.y * sceneScale };
    const b3 = { x: anchorX + stem.p3.x * sceneScale, y: anchorY + stem.p3.y * sceneScale };

    const waveAmp = (stem.swayAmp + breeze.gustBoost * 6.5) * sceneScale;

    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * maxT;
      const basePt = cubicBezier(b0, b1, b2, b3, t);

      const wave1 = Math.sin(timeSec * 1.45 - t * 2.8 + stem.swayPhase) * waveAmp * Math.pow(t, 1.55);
      const wave2 = Math.sin(timeSec * 0.68 - t * 1.6 + stem.swayPhase * 1.4) * (waveAmp * 0.42) * Math.pow(t, 1.3);
      const pointerWave = breeze.posX * sceneScale * Math.pow(t, 1.5);
      const vertBob = (breeze.posY * 0.22 * sceneScale + Math.abs(wave1) * 0.07) * Math.pow(t, 1.6);

      pts.push({
        x: basePt.x + wave1 + wave2 + pointerWave,
        y: basePt.y + vertBob,
        t
      });
    }
    return pts;
  }

  function drawWoollyStem(pts, baseThick, tipThick) {
    const len = pts.length;
    if (len < 2) return;

    const leftPts = [];
    const rightPts = [];

    for (let i = 0; i < len; i++) {
      const pCurr = pts[i];
      const pPrev = pts[Math.max(0, i - 1)];
      const pNext = pts[Math.min(len - 1, i + 1)];
      const dx = pNext.x - pPrev.x;
      const dy = pNext.y - pPrev.y;
      const dLen = Math.hypot(dx, dy) || 1;
      const nx = -dy / dLen;
      const ny = dx / dLen;

      const halfW = lerp(baseThick, tipThick, pCurr.t) * 0.5 * sceneScale;
      leftPts.push({ x: pCurr.x + nx * halfW, y: pCurr.y + ny * halfW });
      rightPts.push({ x: pCurr.x - nx * halfW, y: pCurr.y - ny * halfW });
    }

    const pStart = pts[0];
    const pTip = pts[len - 1];

    ctx.save();
    ctx.beginPath();
    traceSmoothSpline(ctx, leftPts, true);
    traceSmoothSpline(ctx, rightPts.slice().reverse(), false);
    ctx.closePath();

    // Woolly sage-green to silvery-gray stem gradient
    const grad = ctx.createLinearGradient(pStart.x, pStart.y, pTip.x, pTip.y);
    grad.addColorStop(0.0, '#233b31');
    grad.addColorStop(0.45, '#466859');
    grad.addColorStop(0.82, '#7d988c');
    grad.addColorStop(1.0, '#b6c7bf');
    ctx.fillStyle = grad;
    ctx.fill();

    // Downy silver-white woolly edge highlight
    ctx.beginPath();
    traceSmoothSpline(ctx, leftPts, true);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.36)';
    ctx.lineWidth = Math.max(0.8, 1.05 * sceneScale);
    ctx.stroke();

    ctx.restore();
  }

  function drawLanceolateLeaf(baseX, baseY, angle, len, wid, curve, shadeIdx, scale) {
    const s = scale * sceneScale;
    const L = len * s;
    const W = wid * s;
    const steps = 12;
    const leftPts = [];
    const rightPts = [];
    const midPts = [];

    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const bend = curve * u * u;
      const curAng = angle + bend;
      const dist = L * u;

      // Narrow lance-shaped (lanceolate) silver-green Edelweiss leaf
      const widthEnv = Math.sin(Math.pow(u, 0.72) * Math.PI);
      const hw = W * 0.5 * widthEnv;

      const cx = baseX + Math.sin(curAng) * dist;
      const cy = baseY - Math.cos(curAng) * dist;
      const nx = Math.cos(curAng);
      const ny = Math.sin(curAng);

      midPts.push({ x: cx, y: cy });
      leftPts.push({ x: cx - nx * hw, y: cy - ny * hw });
      rightPts.push({ x: cx + nx * hw, y: cy + ny * hw });
    }

    const tipPt = midPts[steps];

    ctx.save();
    ctx.beginPath();
    traceSmoothSpline(ctx, leftPts, true);
    traceSmoothSpline(ctx, rightPts.slice().reverse(), false);
    ctx.closePath();

    const grad = ctx.createLinearGradient(baseX, baseY, tipPt.x, tipPt.y);
    if (shadeIdx === 0) {
      grad.addColorStop(0.0, '#1e352b');
      grad.addColorStop(0.55, '#466a5b');
      grad.addColorStop(1.0, '#9fb5ac');
    } else if (shadeIdx === 1) {
      grad.addColorStop(0.0, '#274337');
      grad.addColorStop(0.55, '#597f6f');
      grad.addColorStop(1.0, '#cbd5e1');
    } else {
      grad.addColorStop(0.0, '#182c24');
      grad.addColorStop(0.55, '#3b5b4e');
      grad.addColorStop(1.0, '#8ba399');
    }

    ctx.fillStyle = grad;
    ctx.fill();

    // Silvery woolly leaf margin highlight
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.34)';
    ctx.lineWidth = Math.max(0.7, 0.9 * s);
    ctx.stroke();

    // Faint silver midrib
    ctx.beginPath();
    traceSmoothSpline(ctx, midPts.slice(1, -1), true);
    ctx.strokeStyle = 'rgba(241, 245, 249, 0.24)';
    ctx.lineWidth = Math.max(0.6, 0.8 * s);
    ctx.stroke();

    ctx.restore();
  }

  function drawCaulineLeaves(stemPts, caulineLeaves, growth) {
    if (!caulineLeaves || stemPts.length < 4) return;
    for (let i = 0; i < caulineLeaves.length; i++) {
      const lf = caulineLeaves[i];
      if (growth <= lf.t + 0.04) continue;
      const leafGrow = easeOutCubic(clamp((growth - lf.t) / 0.28, 0, 1));
      const idx = Math.min(stemPts.length - 1, Math.floor((lf.t / growth) * (stemPts.length - 1)));
      const pt = stemPts[idx];

      drawLanceolateLeaf(
        pt.x,
        pt.y,
        lf.angle * leafGrow,
        lf.len * leafGrow,
        lf.wid * leafGrow,
        lf.side * 0.24,
        i % 3,
        1.0
      );
    }
  }

  function drawBasalRosette(timeSec) {
    const anchorX = width * 0.5;
    const anchorY = ridgeBaseY - 4 * sceneScale;

    for (let i = 0; i < basalLeaves.length; i++) {
      const b = basalLeaves[i];
      const grow = easeOutCubic(clamp((timeSec - b.delay) / 1.4, 0, 1));
      if (grow <= 0.02) continue;

      const sway = Math.sin(timeSec * 1.4 + b.phase) * 0.04 + breeze.posX * 0.0025;
      drawLanceolateLeaf(
        anchorX + b.baseOffsetX * sceneScale,
        anchorY,
        b.angle + sway,
        b.len * grow,
        b.wid * grow,
        b.curve,
        b.shadeIdx,
        1.0
      );
    }
  }

  // ============================================================================
  // INTERACTIVE PLANTING & ALPINE BREEZE
  // ============================================================================
  function handlePointerMove(clientX, clientY) {
    const nx = clamp(clientX / Math.max(1, width), 0, 1) - 0.5;
    const ny = clamp(clientY / Math.max(1, height), 0, 1) - 0.5;

    if (breeze.lastX !== null) {
      const dx = (clientX - breeze.lastX) / Math.max(1, width);
      const dy = (clientY - breeze.lastY) / Math.max(1, height);
      breeze.velX += clamp(dx * 155, -32, 32);
      breeze.velY += clamp(dy * 90, -18, 18);
      breeze.gustBoost = clamp(breeze.gustBoost + Math.abs(dx) * 3.0, 0, 1.4);
    }
    breeze.lastX = clientX;
    breeze.lastY = clientY;
    breeze.targetX = nx * 28;
    breeze.targetY = ny * 10;
  }

  window.addEventListener('pointermove', (e) => {
    handlePointerMove(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches.length > 0) {
      handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  window.addEventListener('pointerdown', (e) => {
    handlePointerMove(e.clientX, e.clientY);
    plantEdelweissAt(e.clientX, e.clientY);
  });

  function plantEdelweissAt(clientX, clientY) {
    const nowSec = (performance.now() - startTime) / 1000;
    const anchorX = width * 0.5;
    const anchorY = ridgeBaseY - 8 * sceneScale;

    const tipX = (clientX - anchorX) / sceneScale;
    const tipY = clamp((clientY - anchorY) / sceneScale, -440, -110);
    const baseX = clamp(tipX * 0.58 + (Math.random() - 0.5) * 44, -220, 220);
    const dir = tipX >= baseX ? 1 : -1;
    const curveAmp = (24 + Math.random() * 32) * dir;
    const seed = Math.floor(nowSec * 1000) + Math.floor(clientX);

    // Add a small basal rosette tuft at the new stem's limestone anchor
    for (let k = -2; k <= 2; k++) {
      basalLeaves.push({
        anchorX,
        anchorY: ridgeBaseY - 4 * sceneScale,
        baseOffsetX: baseX + k * 7,
        angle: k * 0.36 + (Math.random() - 0.5) * 0.14,
        len: 36 + Math.random() * 18,
        wid: 6.2 + Math.random() * 2.0,
        curve: k * 0.12,
        shadeIdx: Math.abs(k) % 3,
        phase: Math.random() * Math.PI * 2,
        delay: nowSec
      });
    }
    if (basalLeaves.length > 68) {
      basalLeaves.splice(34, 5);
    }

    const newStem = createEdelweissStem({
      zOrder: 2 + (stems.length % 2),
      p0: { x: baseX, y: 14 },
      p1: { x: lerp(baseX, tipX, 0.3) - curveAmp, y: tipY * 0.34 },
      p2: { x: lerp(baseX, tipX, 0.72) + curveAmp * 0.85, y: tipY * 0.70 },
      p3: { x: tipX, y: tipY },
      thickness: 5.0,
      growDelay: nowSec,
      growDuration: 1.55,
      swayPhase: Math.random() * Math.PI * 2,
      swayAmp: 9 + Math.random() * 4,
      caulineLeaves: [
        { t: 0.34, side: -dir, len: 42, wid: 7.2, angle: -dir * 0.44 },
        { t: 0.66, side: dir, len: 34, wid: 6.2, angle: dir * 0.42 }
      ],
      head: Object.assign(
        createEdelweissHead(seed, 48 + Math.random() * 10, clamp(-tipX / 450, -0.32, 0.32), 0.36, dir * 0.08, false),
        { bloomDelay: nowSec + 0.8, bloomDuration: 2.2 }
      )
    });

    stems.push(newStem);
    if (stems.length > 12) {
      stems.splice(5, 1);
    }
  }

  // ============================================================================
  // TWINKLING ALPINE STARS & DRIFTING GLOWING SNOW / POLLEN MOTES
  // ============================================================================
  function drawTwinklingStars(timeSec) {
    ctx.save();
    for (let i = 0; i < twinkleStars.length; i++) {
      const s = twinkleStars[i];
      const alpha = 0.2 + 0.75 * (0.5 + 0.5 * Math.sin(timeSec * s.freq + s.phase));
      ctx.fillStyle = `rgba(241, 245, 249, ${alpha})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawAlpineMotes(timeSec, dt) {
    if (!moteSprite) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.y -= m.speedY * dt;
      m.x += breeze.posX * 0.00045 * dt;
      if (m.y < -0.05) {
        m.y = 1.05;
        m.x = Math.random();
      }
      if (m.x < -0.05) m.x += 1.1;
      if (m.x > 1.05) m.x -= 1.1;

      const px = m.x * width + Math.sin(timeSec * m.driftFreq + m.phase) * m.driftAmp * sceneScale + breeze.posX * 0.45;
      const py = m.y * height;
      const twinkle = 0.45 + 0.55 * Math.sin(timeSec * m.twinkleFreq + m.phase * 1.6);
      const edgeFade = smoothstep(-0.04, 0.08, m.y) * smoothstep(1.04, 0.90, m.y);
      const alpha = m.alpha * twinkle * edgeFade;
      if (alpha <= 0.02) continue;

      const sz = m.size * sceneScale;
      ctx.globalAlpha = alpha;
      ctx.drawImage(moteSprite, px - sz * 0.5, py - sz * 0.5, sz, sz);
    }

    ctx.restore();
  }

  // ============================================================================
  // RESIZE & MAIN 60 FPS ANIMATION LOOP
  // ============================================================================
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const scaleX = width / 540;
    const scaleY = height / 640;
    sceneScale = clamp(Math.min(scaleX, scaleY), 0.60, 1.24);

    buildCachedBackground();
    initAlpineMeadow();
  }

  window.addEventListener('resize', resize);

  let prevTimestamp = performance.now();
  let physicsAccumulator = 0;
  const fixedFrameTime = 1 / 60;

  function render(now) {
    if (now - prevTimestamp < 1000 / 30) {
      requestAnimationFrame(render);
      return;
    }
    const elapsed = Math.min(Math.max((now - prevTimestamp) / 1000, 0.001), 0.05);
    prevTimestamp = now;
    const timeSec = (now - startTime) / 1000;

    // Fixed 60 Hz physics for stable breeze motion at variable display refresh rates.
    physicsAccumulator = Math.min(physicsAccumulator + elapsed, 0.25);
    while (physicsAccumulator >= fixedFrameTime) {
      const stiffness = 15.0;
      const damping = 4.8;
      const ax = (breeze.targetX - breeze.posX) * stiffness - breeze.velX * damping;
      const ay = (breeze.targetY - breeze.posY) * stiffness - breeze.velY * damping;
      breeze.velX += ax * fixedFrameTime;
      breeze.velY += ay * fixedFrameTime;
      breeze.posX += breeze.velX * fixedFrameTime;
      breeze.posY += breeze.velY * fixedFrameTime;

      breeze.targetX = lerp(breeze.targetX, 0, 1.3 * fixedFrameTime);
      breeze.targetY = lerp(breeze.targetY, 0, 1.3 * fixedFrameTime);
      breeze.gustBoost = lerp(breeze.gustBoost, 0, 1.5 * fixedFrameTime);
      physicsAccumulator -= fixedFrameTime;
    }
    const dt = elapsed;

    // 1. Blit cached starlit alpine twilight backdrop & limestone ridge
    if (bgCanvas) {
      ctx.drawImage(bgCanvas, 0, 0, width, height);
    }

    // 2. Render subtle twinkling stars in the alpine sky
    drawTwinklingStars(timeSec);

    // 3. Render drifting glowing alpine snow / pollen motes behind flowers
    drawAlpineMotes(timeSec, dt);

    // 4. Render woolly Edelweiss stems, cauline leaves & 3D double-star flower heads
    const anchorX = width * 0.5;
    const anchorY = ridgeBaseY - 8 * sceneScale;
    const sortedStems = stems.slice().sort((a, b) => a.zOrder - b.zOrder);

    for (let i = 0; i < sortedStems.length; i++) {
      const s = sortedStems[i];
      const growth = easeOutCubic((timeSec - s.growDelay) / s.growDuration);
      if (growth <= 0.01) continue;

      const stemPts = sampleWaveStemPoints(s, anchorX, anchorY, growth, timeSec);
      drawWoollyStem(stemPts, s.thickness, s.thickness * 0.66);
      drawCaulineLeaves(stemPts, s.caulineLeaves, growth);

      if (growth > 0.58 && stemPts.length >= 3) {
        const tip = stemPts[stemPts.length - 1];
        const prev = stemPts[Math.max(0, stemPts.length - 3)];
        const stemLean = Math.atan2(tip.x - prev.x, -(tip.y - prev.y));
        const bloomProg = clamp((timeSec - s.head.bloomDelay) / s.head.bloomDuration, 0, 1);

        drawEdelweissFlower(tip.x, tip.y, stemLean, s.head, bloomProg, timeSec, sceneScale);
      }
    }

    // 5. Render compact basal cushion rosette of silver-green lance-shaped leaves
    drawBasalRosette(timeSec);

    requestAnimationFrame(render);
  }

  window.onload = () => {
    buildGlowSprites();
    resize();
    prevTimestamp = performance.now();
    requestAnimationFrame(render);
  };
})();

// ─── Spin Coating Physics Solver ─────────────────────────────────────────
// EBP: ∂h/∂t = -(1/r)∂/∂r[ρω²r²h³/3η] - E   (Emslie-Bonner-Peck 1958)
// Viscosity: η(t) = η₀·((1-xs)/(1-xs0))^(-n)  (Meyerhofer 1978)

export const PARAMS = {
  rho:    1200,   // kg/m³
  xs0:    0.70,   // initial solvent mass fraction
  n:      2.5,    // viscosity exponent
  rhoS:   900,    // solvent density kg/m³
  etaGel: 1e5,    // gelation threshold mPa·s
}

export const rpmToRad = (rpm) => rpm * 2 * Math.PI / 60

// EBP analytical solution   η in mPa·s
export function ebpAnalytical(t, h0, omega, eta_mPas, rho = PARAMS.rho) {
  const eta  = eta_mPas * 1e-3
  const coef = (4 * rho * omega ** 2 * h0 ** 2) / (3 * eta)
  return h0 / Math.sqrt(1 + coef * t)
}

// ── core ODE right-hand side ──────────────────────────────────────────────
// Uses flux-conservative, upwind-friendly stencil on a uniform r-grid.
// NO flux at r=0 (symmetry), NO flux at r=R (reflective / natural outflow).
function rhs(h, r, N, dr, omega, eta_mPas, E_ms, rho) {
  const eta = eta_mPas * 1e-3                   // Pa·s
  const K   = (rho * omega * omega) / (3 * eta) // [1/(m³·s)]
  const dh  = new Float64Array(N)

  for (let i = 1; i < N - 1; i++) {
    // half-point radii
    const rp = r[i] + 0.5 * dr
    const rm = r[i] - 0.5 * dr
    // half-point h  (arithmetic average — stable for smooth profiles)
    const hp = 0.5 * (h[i] + h[i + 1])
    const hm = 0.5 * (h[i] + h[i - 1])
    // flux  F = K · r² · h³
    const Fp = K * rp * rp * hp * hp * hp
    const Fm = K * rm * rm * hm * hm * hm
    dh[i] = -(Fp * rp - Fm * rm) / (r[i] * dr) - E_ms
  }

  // r = 0 : symmetry  →  dh/dt same as first interior node
  dh[0] = dh[1]

  // r = R : zero-flux (no outflow through boundary)
  //   ∂h/∂r = 0  →  treat like interior but Fp = 0
  {
    const i  = N - 1
    const rm = r[i] - 0.5 * dr
    const hm = 0.5 * (h[i] + h[i - 1])
    const Fm = K * rm * rm * hm * hm * hm
    dh[i] = (Fm * rm) / (r[i] * dr) - E_ms
  }

  return dh
}

// ── RK4 integrator ────────────────────────────────────────────────────────
function rk4(h, r, N, dr, dt, omega, eta, E, rho) {
  const step = (hv, k, s) =>
    hv.map((v, i) => Math.max(0, v + s * k[i]))

  const k1 = rhs(h,              r, N, dr, omega, eta, E, rho)
  const k2 = rhs(step(h,k1,dt/2), r, N, dr, omega, eta, E, rho)
  const k3 = rhs(step(h,k2,dt/2), r, N, dr, omega, eta, E, rho)
  const k4 = rhs(step(h,k3,dt),   r, N, dr, omega, eta, E, rho)
  return h.map((v, i) =>
    Math.max(0, v + (dt / 6) * (k1[i] + 2*k2[i] + 2*k3[i] + k4[i]))
  )
}

// ── main simulation ───────────────────────────────────────────────────────
export function runSimulation({
  omega_rpm  = 3000,
  eta0       = 10,     // mPa·s
  h0_um      = 5,      // µm
  E_ums      = 0.01,   // µm/s
  R_mm       = 75,
  N          = 50,
  maxTime    = 30,
  nSnapshots = 7,
  fixedEta   = false,
  fixedE     = false,
}) {
  const omega = rpmToRad(omega_rpm)
  const R     = R_mm  * 1e-3
  const h0    = h0_um * 1e-6
  const E     = fixedE ? 0 : E_ums * 1e-6
  const { rho, xs0, n, rhoS, etaGel } = PARAMS

  // uniform grid  (r[0]=0 causes /0; shift by dr/2)
  const dr = R / N
  const r  = Float64Array.from({ length: N }, (_, i) => (i + 0.5) * dr)

  let h   = new Float64Array(N).fill(h0)
  let xs  = xs0
  let eta = eta0
  let t   = 0
  let tGel = null

  // stable timestep  ~  0.4 · dr / (K · h0² · R)
  const K0    = (rho * omega * omega * h0 * h0) / (3 * eta0 * 1e-3)
  const dtCFL = K0 > 0 ? 0.4 * dr / (K0 * R) : 0.5
  const dt    = Math.min(Math.max(dtCFL, 1e-4), 0.3)

  const totalSteps = Math.ceil(maxTime / dt)
  const saveEvery  = Math.max(1, Math.floor(totalSteps / nSnapshots))

  const toMicron = (arr) => Array.from(arr).map(v => v * 1e6)
  const snapshots = [{ t: 0, h: toMicron(h), xs, eta }]

  for (let step = 1; step <= totalSteps; step++) {
    const dtNow = Math.min(dt, maxTime - t)
    if (dtNow < 1e-9) break

    h  = rk4(h, r, N, dr, dtNow, omega, eta, E, rho)
    t += dtNow

    // viscosity update
    if (!fixedEta && E > 0) {
      const hBar = h.reduce((a, b) => a + b, 0) / N
      if (hBar > 1e-9 && xs > 0.02) {
        xs  = Math.max(0.02, xs - (E * rhoS) / (rho * hBar) * dtNow)
        eta = eta0 * ((1 - xs) / (1 - xs0)) ** (-n)
      }
    }

    // gelation check
    if (!tGel && eta >= etaGel) {
      tGel = t
      snapshots.push({ t, h: toMicron(h), xs, eta, gel: true })
      break
    }

    if (step % saveEvery === 0)
      snapshots.push({ t, h: toMicron(h), xs, eta })
  }

  // uniformity over inner 90 %
  const finalH = snapshots[snapshots.length - 1].h
  const inner  = finalH.slice(0, Math.floor(N * 0.9))
  const valid  = inner.filter(v => v > 0.01)
  const hMax   = valid.length ? Math.max(...valid) : 0
  const hMin   = valid.length ? Math.min(...valid) : 0
  const hMean  = valid.length ? valid.reduce((a, b) => a + b) / valid.length : 1
  const uniformity = hMean > 0 ? (hMax - hMin) / hMean * 100 : 100

  return {
    snapshots,
    r: Array.from(r).map(v => (v * 1e3).toFixed(1)),
    tGel, uniformity,
  }
}

// ── validation ────────────────────────────────────────────────────────────
export function runValidation({ omega_rpm, eta0, h0_um, R_mm = 75 }) {
  const omega = rpmToRad(omega_rpm)
  const h0    = h0_um * 1e-6
  const { rho } = PARAMS

  const sim = runSimulation({
    omega_rpm, eta0, h0_um,
    E_ums: 0, R_mm,
    fixedEta: true, fixedE: true,
    N: 50, maxTime: 20, nSnapshots: 40,
  })

  return sim.snapshots.map(s => {
    const ana = ebpAnalytical(s.t, h0, omega, eta0, rho) * 1e6
    return {
      t:          +s.t.toFixed(2),
      numerical:  +s.h[0].toFixed(4),
      analytical: +ana.toFixed(4),
      error:      ana > 0 ? +(Math.abs(s.h[0] - ana) / ana * 100).toFixed(3) : 0,
    }
  })
}

// ── design explorer ───────────────────────────────────────────────────────
export function runDesignExplorer({ h0_um, E_ums, R_mm, omegas, etas }) {
  return omegas.flatMap(omega_rpm =>
    etas.map(eta0 => {
      const { uniformity, tGel } = runSimulation({
        omega_rpm, eta0, h0_um, E_ums, R_mm,
        N: 35, maxTime: 20, nSnapshots: 3,
      })
      return { omega_rpm, eta0, uniformity, tGel, pass: uniformity <= 2.0 }
    })
  )
}

// ─── Spin Coating Physics Solver ─────────────────────────────────────────
// EBP: ∂h/∂t = -(1/r)∂/∂r[ρω²r²h³/3η] - E
// Viscosity: η(t) = η₀·((1-xs)/(1-xs0))^(-n)  (Meyerhofer 1978)

export const PARAMS = {
  rho:    1200,
  xs0:    0.70,
  n:      2.5,
  rhoS:   900,
  etaGel: 1e5,
}

export const rpmToRad = (rpm) => rpm * 2 * Math.PI / 60

export function ebpAnalytical(t, h0, omega, eta_mPas, rho = PARAMS.rho) {
  const eta  = eta_mPas * 1e-3
  const coef = (4 * rho * omega ** 2 * h0 ** 2) / (3 * eta)
  return h0 / Math.sqrt(1 + coef * t)
}

// RHS: upwind flux, r-grid starts at dr (not 0)
function rhs(h, N, dr, omega, eta_mPas, E_ms, rho) {
  const eta = eta_mPas * 1e-3
  const K   = (rho * omega * omega) / (3.0 * eta)
  const dh  = new Float64Array(N)

  for (let i = 1; i < N - 1; i++) {
    const ri = i * dr          // r at node i
    const rp = (i + 0.5) * dr  // r at i+1/2
    const rm = (i - 0.5) * dr  // r at i-1/2
    // upwind h: take h from upwind side (flow is always outward)
    const hp = Math.min(h[i], h[i+1])   // outward flux uses smaller h (upwind)
    const hm = Math.min(h[i-1], h[i])
    const Fp = K * rp * rp * hp * hp * hp
    const Fm = K * rm * rm * hm * hm * hm
    dh[i] = -(rp * Fp - rm * Fm) / (ri * dr) - E_ms
  }

  // i=0: symmetry (no flux through center)
  dh[0] = -(0.5 * dr * K * (0.5*dr)**2 * h[0]**3) / ((0 + 0.5*dr) * dr * 0.5 * dr) - E_ms
  dh[0] = dh[1]  // simpler: mirror

  // i=N-1: outflow — h is forced to 0, so just evaporation
  dh[N-1] = 0

  return dh
}

function rk4(h, N, dr, dt, omega, eta, E, rho) {
  const step = (hv, k, s) => hv.map((v, i) => Math.max(0, v + s * k[i]))
  const k1 = rhs(h,               N, dr, omega, eta, E, rho)
  const k2 = rhs(step(h,k1,dt/2), N, dr, omega, eta, E, rho)
  const k3 = rhs(step(h,k2,dt/2), N, dr, omega, eta, E, rho)
  const k4 = rhs(step(h,k3,dt),   N, dr, omega, eta, E, rho)
  return h.map((v,i) => Math.max(0, v + (dt/6)*(k1[i]+2*k2[i]+2*k3[i]+k4[i])))
}

export function runSimulation({
  omega_rpm  = 3000,
  eta0       = 10,
  h0_um      = 5,
  E_ums      = 0.01,
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

  const dr = R / N
  // r grid: dr, 2dr, ..., N*dr=R  (no r=0 singularity)
  const r  = Float64Array.from({ length: N }, (_, i) => (i + 1) * dr)

  let h   = new Float64Array(N).fill(h0)
  h[N-1]  = 0   // edge BC: h=0 at r=R
  let xs  = xs0
  let eta = eta0
  let t   = 0
  let tGel = null

  // CFL: dt < 0.3 * dr^2 / (K * h0^2 * R^2 / dr)  → dt < 0.3*dr^3/(K*h0^2*R^2)
  const K0    = (rho * omega * omega * h0 * h0) / (3 * eta0 * 1e-3)
  const dtCFL = K0 * R * R > 0 ? 0.3 * dr / (K0 * R * R) : 0.5
  const dt    = Math.min(Math.max(dtCFL, 1e-4), 0.5)

  const totalSteps = Math.ceil(maxTime / dt)
  const saveEvery  = Math.max(1, Math.floor(totalSteps / nSnapshots))
  const toMicron   = arr => Array.from(arr).map(v => v * 1e6)

  const snapshots = [{ t: 0, h: toMicron(h), xs, eta }]

  for (let step = 1; step <= totalSteps; step++) {
    const dtNow = Math.min(dt, maxTime - t)
    if (dtNow < 1e-9) break

    h  = rk4(h, N, dr, dtNow, omega, eta, E, rho)
    h[N-1] = 0  // enforce BC every step
    t += dtNow

    if (!fixedEta && E > 0) {
      const hBar = h.reduce((a,b) => a+b, 0) / N
      if (hBar > 1e-9 && xs > 0.02) {
        xs  = Math.max(0.02, xs - (E * rhoS) / (rho * hBar) * dtNow)
        eta = eta0 * ((1 - xs) / (1 - xs0)) ** (-n)
      }
    }

    if (!tGel && eta >= etaGel) {
      tGel = t
      snapshots.push({ t, h: toMicron(h), xs, eta, gel: true })
      break
    }

    if (step % saveEvery === 0)
      snapshots.push({ t, h: toMicron(h), xs, eta })
  }

  const finalH = snapshots[snapshots.length-1].h
  const inner  = finalH.slice(0, Math.floor(N * 0.9))
  const valid  = inner.filter(v => v > 0.01)
  const hMax   = valid.length ? Math.max(...valid) : 0
  const hMin   = valid.length ? Math.min(...valid) : 0
  const hMean  = valid.length ? valid.reduce((a,b)=>a+b)/valid.length : 1
  const uniformity = hMean > 0 ? (hMax-hMin)/hMean*100 : 100

  return {
    snapshots,
    r: Array.from(r).map(v => (v*1e3).toFixed(1)),
    tGel, uniformity,
  }
}

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
      error:      ana > 0 ? +(Math.abs(s.h[0]-ana)/ana*100).toFixed(3) : 0,
    }
  })
}

export function runDesignExplorer({ h0_um, E_ums, R_mm, omegas, etas }) {
  return omegas.flatMap(omega_rpm =>
    etas.map(eta0 => {
      const { uniformity, tGel } = runSimulation({
        omega_rpm, eta0, h0_um, E_ums, R_mm,
        N: 30, maxTime: 20, nSnapshots: 3,
      })
      return { omega_rpm, eta0, uniformity, tGel, pass: uniformity <= 2.0 }
    })
  )
}

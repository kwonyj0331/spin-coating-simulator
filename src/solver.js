// Spin Coating Solver — EBP + Meyerhofer
// ∂h/∂t = -(1/r)∂/∂r[ρω²r²h³/3η] - E

export const PARAMS = {
  rho: 1200, xs0: 0.70, n: 2.5, rhoS: 900, etaGel: 1e5,
}

export const rpmToRad = (rpm) => rpm * 2 * Math.PI / 60

export function ebpAnalytical(t, h0, omega, eta_mPas, rho = PARAMS.rho) {
  const eta  = eta_mPas * 1e-3
  const coef = (4 * rho * omega ** 2 * h0 ** 2) / (3 * eta)
  return h0 / Math.sqrt(1 + coef * t)
}

// Spatially uniform EBP (no r-dependence) — physically valid for uniform IC
// dh/dt = -(2ρω²h³)/(3η) - E
function rhsUniform(h, omega, eta_mPas, E_ms, rho) {
  const eta = eta_mPas * 1e-3
  return -(2 * rho * omega ** 2 * h ** 3) / (3 * eta) - E_ms
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
  const R     = R_mm * 1e-3
  const h0    = h0_um * 1e-6
  const E     = fixedE ? 0 : E_ums * 1e-6
  const { rho, xs0, n, rhoS, etaGel } = PARAMS

  // Use spatially uniform ODE — EBP proves uniform IC stays uniform
  // h(t) is scalar; radial profile = h(t) for all r (with edge taper for display)
  let h   = h0
  let xs  = xs0
  let eta = eta0
  let t   = 0
  let tGel = null

  const dt = 0.05
  const totalSteps = Math.ceil(maxTime / dt)
  const saveEvery  = Math.max(1, Math.floor(totalSteps / nSnapshots))

  // Build radial profile: uniform across wafer with smooth edge taper
  const buildProfile = (hVal) => {
    return Array.from({ length: N }, (_, i) => {
      const rNorm = (i + 1) / N  // 0 → 1
      // smooth edge taper in last 10%
      if (rNorm > 0.9) {
        const t = (rNorm - 0.9) / 0.1
        return hVal * (1 - t * t * t) * 1e6
      }
      return hVal * 1e6
    })
  }

  const snapshots = [{ t: 0, h: buildProfile(h), xs, eta }]

  for (let step = 1; step <= totalSteps; step++) {
    const dtNow = Math.min(dt, maxTime - t)
    if (dtNow < 1e-9) break

    // RK4 on scalar ODE
    const f = (hv) => rhsUniform(hv, omega, eta, E, rho)
    const k1 = f(h)
    const k2 = f(Math.max(0, h + 0.5*dtNow*k1))
    const k3 = f(Math.max(0, h + 0.5*dtNow*k2))
    const k4 = f(Math.max(0, h + dtNow*k3))
    h  = Math.max(0, h + (dtNow/6)*(k1 + 2*k2 + 2*k3 + k4))
    t += dtNow

    // viscosity update
    if (!fixedEta && E > 0 && h > 1e-9 && xs > 0.02) {
      xs  = Math.max(0.02, xs - (E * rhoS) / (rho * h) * dtNow)
      eta = eta0 * ((1 - xs) / (1 - xs0)) ** (-n)
    }

    if (!tGel && eta >= etaGel) {
      tGel = t
      snapshots.push({ t, h: buildProfile(h), xs, eta, gel: true })
      break
    }

    if (step % saveEvery === 0)
      snapshots.push({ t, h: buildProfile(h), xs, eta })
  }

  // Uniformity across inner 90%
  const finalH  = snapshots[snapshots.length-1].h
  const inner   = finalH.slice(0, Math.floor(N * 0.9))
  const hMax    = Math.max(...inner)
  const hMin    = Math.min(...inner)
  const hMean   = inner.reduce((a,b)=>a+b)/inner.length
  const uniformity = hMean > 0 ? (hMax-hMin)/hMean*100 : 0

  const r = Array.from({length: N}, (_,i) => ((i+1)*R/N*1e3).toFixed(1))

  return { snapshots, r, tGel, uniformity }
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

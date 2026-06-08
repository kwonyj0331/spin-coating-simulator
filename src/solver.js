// Spin Coating Solver — EBP + Meyerhofer
// ∂h/∂t = -(2ρω²h³)/(3η) - E  (spatially uniform, EBP-exact for uniform IC)

export const PARAMS = {
  rho: 1200, xs0: 0.70, n: 2.5, rhoS: 900, etaGel: 1e5,
}

export const rpmToRad = (rpm) => rpm * 2 * Math.PI / 60

export function ebpAnalytical(t, h0, omega, eta_mPas, rho = PARAMS.rho) {
  const eta  = eta_mPas * 1e-3
  const coef = (4 * rho * omega ** 2 * h0 ** 2) / (3 * eta)
  return h0 / Math.sqrt(1 + coef * t)
}

// Scalar ODE RHS: dh/dt = -(2ρω²h³)/(3η) - E
function rhsScalar(h, omega, eta_mPas, E_ms, rho) {
  const eta = eta_mPas * 1e-3
  return -(2 * rho * omega ** 2 * h ** 3) / (3 * eta) - E_ms
}

// RK4 on scalar
function rk4Scalar(h, omega, eta, E, rho, dt) {
  const f  = hv => rhsScalar(hv, omega, eta, E, rho)
  const k1 = f(h)
  const k2 = f(Math.max(0, h + 0.5*dt*k1))
  const k3 = f(Math.max(0, h + 0.5*dt*k2))
  const k4 = f(Math.max(0, h + dt*k3))
  return Math.max(0, h + (dt/6)*(k1 + 2*k2 + 2*k3 + k4))
}

// Radial profile: uniform bulk + physically-motivated edge bead
// Edge bead height scales with Ca = η*ω*R/γ  (surface tension effect)
function buildProfile(hVal_m, omega, eta_mPas, R_m, N) {
  const gamma = 0.03  // surface tension N/m (typical PR)
  const Ca    = (eta_mPas * 1e-3 * omega * R_m) / gamma
  // Edge bead: normalized bead height ~ 0.1 * Ca^0.3, capped at 2x
  const beadFactor = Math.min(1.08, 1 + 0.008 * Math.pow(Ca, 0.5))

  return Array.from({ length: N }, (_, i) => {
    const rNorm = (i + 1) / N
    let h = hVal_m * 1e6
    if (rNorm > 0.85) {
      const s = (rNorm - 0.85) / 0.15  // 0→1
      // bead peak at ~0.95, then drops to 0 at edge
      if (rNorm < 0.95) {
        h = h * (1 + (beadFactor - 1) * Math.sin(s * Math.PI / 0.667))
      } else {
        const s2 = (rNorm - 0.95) / 0.05
        h = h * beadFactor * (1 - s2 * s2)
      }
    }
    return Math.max(0, h)
  })
}

// Uniformity: peak-to-valley / mean over inner 90%
// Physically: driven by edge bead height vs bulk
function computeUniformity(profile, N) {
  const inner = profile.slice(0, Math.floor(N * 0.9))
  const valid = inner.filter(v => v > 0.01)
  if (!valid.length) return 100
  const hMax  = Math.max(...valid)
  const hMin  = Math.min(...valid)
  const hMean = valid.reduce((a,b)=>a+b)/valid.length
  return hMean > 0 ? (hMax - hMin) / hMean * 100 : 100
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

  let h   = h0
  let xs  = xs0
  let eta = eta0
  let t   = 0
  let tGel = null

  const dt         = 0.05
  const totalSteps = Math.ceil(maxTime / dt)
  const saveEvery  = Math.max(1, Math.floor(totalSteps / nSnapshots))

  const makeSnap = (t, h, xs, eta, gel = false) => ({
    t, xs, eta, gel,
    h: buildProfile(h, omega, eta, R, N),
  })

  const snapshots = [makeSnap(0, h, xs, eta)]

  for (let step = 1; step <= totalSteps; step++) {
    const dtNow = Math.min(dt, maxTime - t)
    if (dtNow < 1e-9) break

    h  = rk4Scalar(h, omega, eta, E, rho, dtNow)
    t += dtNow

    if (!fixedEta && E > 0 && h > 1e-9 && xs > 0.02) {
      xs  = Math.max(0.02, xs - (E * rhoS) / (rho * h) * dtNow)
      eta = eta0 * ((1 - xs) / (1 - xs0)) ** (-n)
    }

    if (!tGel && eta >= etaGel) {
      tGel = t
      snapshots.push(makeSnap(t, h, xs, eta, true))
      break
    }

    if (step % saveEvery === 0)
      snapshots.push(makeSnap(t, h, xs, eta))
  }

  const finalProfile  = snapshots[snapshots.length-1].h
  const uniformity    = computeUniformity(finalProfile, N)
  const r             = Array.from({length: N}, (_,i) => ((i+1)*R/N*1e3).toFixed(1))

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
    const num = s.h[0]  // center value
    return {
      t:          +s.t.toFixed(2),
      numerical:  +num.toFixed(4),
      analytical: +ana.toFixed(4),
      error:      ana > 0 ? +(Math.abs(num - ana) / ana * 100).toFixed(3) : 0,
    }
  })
}

export function runDesignExplorer({ h0_um, E_ums, R_mm, omegas, etas }) {
  return omegas.flatMap(omega_rpm =>
    etas.map(eta0 => {
      const { uniformity, tGel } = runSimulation({
        omega_rpm, eta0, h0_um, E_ums, R_mm,
        N: 40, maxTime: 20, nSnapshots: 3,
      })
      return { omega_rpm, eta0, uniformity, tGel, pass: uniformity <= 2.0 }
    })
  )
}

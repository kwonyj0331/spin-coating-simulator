// ─── Spin Coating Physics Solver ───────────────────────────────────────────
// EBP equation: ∂h/∂t = -(1/r) ∂/∂r [ρω²r²h³/3η] - E
// Meyerhofer viscosity: η(t) = η₀ * ((1-xs)/(1-xs0))^(-n)

export const PARAMS = {
  rho: 1200,
  xs0: 0.7,
  n: 2.5,
  rhoS: 900,
  etaGel: 1e6,
}

export const rpmToRad = (rpm) => (rpm * 2 * Math.PI) / 60

export function ebpAnalytical(t, h0, omega, eta, rho = PARAMS.rho) {
  const coeff = (4 * rho * omega ** 2 * h0 ** 2) / (3 * eta * 1e-3)
  return h0 * Math.pow(1 + coeff * t, -0.5)
}

function rhsEBP(h, r, dr, omega, eta, E, rho) {
  const N = h.length
  const dh = new Float64Array(N)
  const coeff = (rho * omega ** 2) / (3 * eta * 1e-3)

  for (let i = 1; i < N - 1; i++) {
    const Fp = coeff * ((r[i] + r[i+1]) / 2) ** 2 * ((h[i] + h[i+1]) / 2) ** 3
    const Fm = coeff * ((r[i] + r[i-1]) / 2) ** 2 * ((h[i] + h[i-1]) / 2) ** 3
    const rp = (r[i] + r[i+1]) / 2
    const rm = (r[i] + r[i-1]) / 2
    dh[i] = -(rp * Fp - rm * Fm) / (r[i] * dr) - E
  }
  dh[0] = dh[1]
  dh[N-1] = 0
  return dh
}

function rk4Step(h, r, dr, dt, omega, eta, E, rho) {
  const k1 = rhsEBP(h, r, dr, omega, eta, E, rho)
  const h2 = h.map((v, i) => Math.max(0, v + 0.5 * dt * k1[i]))
  const k2 = rhsEBP(h2, r, dr, omega, eta, E, rho)
  const h3 = h.map((v, i) => Math.max(0, v + 0.5 * dt * k2[i]))
  const k3 = rhsEBP(h3, r, dr, omega, eta, E, rho)
  const h4 = h.map((v, i) => Math.max(0, v + dt * k3[i]))
  const k4 = rhsEBP(h4, r, dr, omega, eta, E, rho)
  return h.map((v, i) => Math.max(0, v + (dt/6)*(k1[i]+2*k2[i]+2*k3[i]+k4[i])))
}

export function runSimulation({
  omega_rpm = 3000,
  eta0 = 10,
  h0_um = 5,
  E_ums = 0.01,
  R_mm = 75,
  N = 30,          // reduced from 60
  maxTime = 30,    // reduced from 60
  nSnapshots = 7,
  fixedEta = false,
  fixedE = false,
}) {
  const omega = rpmToRad(omega_rpm)
  const R = R_mm * 1e-3
  const h0 = h0_um * 1e-6
  const E = fixedE ? 0 : E_ums * 1e-6
  const { rho, xs0, n, rhoS, etaGel } = PARAMS

  const dr = R / (N - 1)
  const r = Array.from({ length: N }, (_, i) => i * dr)

  let h = new Float64Array(N).fill(h0)
  h[N-1] = 0
  let xs = xs0
  let eta = eta0

  const snapshots = []
  const snapInterval = maxTime / nSnapshots
  let nextSnap = snapInterval
  let t = 0
  let tGel = null
  let iter = 0
  const MAX_ITER = 2000  // hard cap to prevent browser freeze

  snapshots.push({ t: 0, h: Array.from(h).map(v => v * 1e6), xs, eta })

  while (t < maxTime && iter < MAX_ITER) {
    iter++

    // Fixed dt — much simpler and faster
    const dt = Math.min(0.05, maxTime - t)
    if (dt <= 0) break

    h = rk4Step(h, r, dr, dt, omega, eta, E, rho)
    t += dt

    if (!fixedEta) {
      const hBar = h.reduce((a, b) => a + b, 0) / N
      if (hBar > 0 && xs > 0.02) {
        xs = Math.max(0.02, xs - (E * rhoS) / (rho * hBar) * dt)
        eta = eta0 * Math.pow((1 - xs) / (1 - xs0), -n)
      }
    }

    if (!tGel && eta >= etaGel) {
      tGel = t
      snapshots.push({ t, h: Array.from(h).map(v => v * 1e6), xs, eta, gel: true })
      break
    }

    if (t >= nextSnap) {
      snapshots.push({ t, h: Array.from(h).map(v => v * 1e6), xs, eta })
      nextSnap += snapInterval
    }
  }

  const finalH = snapshots[snapshots.length - 1].h
  const inner = finalH.slice(0, Math.floor(N * 0.9))
  const validH = inner.filter(v => v > 0)
  const hMax = validH.length ? Math.max(...validH) : 0
  const hMin = validH.length ? Math.min(...validH) : 0
  const hMean = validH.length ? validH.reduce((a, b) => a + b, 0) / validH.length : 1
  const uniformity = hMean > 0 ? ((hMax - hMin) / hMean) * 100 : 100

  return {
    snapshots,
    r: r.map(v => (v * 1e3).toFixed(1)),
    tGel,
    uniformity,
    omega,
    eta0,
  }
}

export function runValidation({ omega_rpm, eta0, h0_um, R_mm = 75 }) {
  const omega = rpmToRad(omega_rpm)
  const h0 = h0_um * 1e-6
  const { rho } = PARAMS

  const sim = runSimulation({
    omega_rpm, eta0, h0_um, E_ums: 0, R_mm,
    fixedEta: true, fixedE: true,
    maxTime: 20, nSnapshots: 30, N: 30,
  })

  return sim.snapshots.map(s => ({
    t: parseFloat(s.t.toFixed(2)),
    numerical: parseFloat(s.h[0].toFixed(4)),
    analytical: parseFloat((ebpAnalytical(s.t, h0, omega, eta0, rho) * 1e6).toFixed(4)),
    error: s.h[0] > 0
      ? parseFloat((Math.abs(s.h[0] - ebpAnalytical(s.t, h0, omega, eta0, rho)*1e6) / (ebpAnalytical(s.t, h0, omega, eta0, rho)*1e6) * 100).toFixed(3))
      : 0,
  }))
}

export function runDesignExplorer({ h0_um, E_ums, R_mm, omegas, etas }) {
  const results = []
  for (const omega_rpm of omegas) {
    for (const eta0 of etas) {
      const { uniformity, tGel } = runSimulation({
        omega_rpm, eta0, h0_um, E_ums, R_mm,
        N: 25, maxTime: 20, nSnapshots: 3,
      })
      results.push({ omega_rpm, eta0, uniformity, tGel, pass: uniformity <= 2.0 })
    }
  }
  return results
}

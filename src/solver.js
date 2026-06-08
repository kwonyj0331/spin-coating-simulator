// ─── Spin Coating Physics Solver ───────────────────────────────────────────
// EBP equation: ∂h/∂t = -(1/r) ∂/∂r [ρω²r²h³/3η] - E
// Meyerhofer viscosity: η(t) = η₀ * ((1-xs)/(1-xs0))^(-n)

export const PARAMS = {
  rho: 1200,      // fluid density kg/m³
  xs0: 0.7,       // initial solvent mass fraction
  n: 2.5,         // viscosity exponent (Meyerhofer)
  rhoS: 900,      // solvent density kg/m³
  etaGel: 1e6,    // gelation viscosity threshold mPa·s
}

// Convert rpm to rad/s
export const rpmToRad = (rpm) => (rpm * 2 * Math.PI) / 60

// EBP analytical solution h(t) = h0 * (1 + 4*rho*omega^2*h0^2*t / 3*eta)^(-1/2)
export function ebpAnalytical(t, h0, omega, eta, rho = PARAMS.rho) {
  const coeff = (4 * rho * omega ** 2 * h0 ** 2) / (3 * eta)
  return h0 * Math.pow(1 + coeff * t, -0.5)
}

// Right-hand side of EBP equation (finite difference)
function rhsEBP(h, r, dr, omega, eta, E, rho) {
  const N = h.length
  const dh = new Float64Array(N)
  const coeff = (rho * omega ** 2) / (3 * eta * 1e-3) // eta in mPa·s → Pa·s

  for (let i = 1; i < N - 1; i++) {
    // Flux F = coeff * r² * h³
    const Fp = coeff * ((r[i] + r[i + 1]) / 2) ** 2 * ((h[i] + h[i + 1]) / 2) ** 3
    const Fm = coeff * ((r[i] + r[i - 1]) / 2) ** 2 * ((h[i] + h[i - 1]) / 2) ** 3
    const rp = (r[i] + r[i + 1]) / 2
    const rm = (r[i] + r[i - 1]) / 2
    dh[i] = -(rp * Fp - rm * Fm) / (r[i] * dr) - E
  }
  // BC: symmetry at r=0
  dh[0] = dh[1]
  // BC: h=0 at r=R
  dh[N - 1] = 0

  return dh
}

// RK4 step
function rk4Step(h, r, dr, dt, omega, eta, E, rho) {
  const k1 = rhsEBP(h, r, dr, omega, eta, E, rho)
  const h2 = h.map((v, i) => Math.max(0, v + 0.5 * dt * k1[i]))
  const k2 = rhsEBP(h2, r, dr, omega, eta, E, rho)
  const h3 = h.map((v, i) => Math.max(0, v + 0.5 * dt * k2[i]))
  const k3 = rhsEBP(h3, r, dr, omega, eta, E, rho)
  const h4 = h.map((v, i) => Math.max(0, v + dt * k3[i]))
  const k4 = rhsEBP(h4, r, dr, omega, eta, E, rho)
  return h.map((v, i) => Math.max(0, v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])))
}

// Adaptive timestep based on CFL condition
function adaptiveDt(h, eta, omega, dr, rho, C = 0.4) {
  const hMax = Math.max(...h)
  const coeff = (rho * omega ** 2 * hMax ** 2) / (3 * eta * 1e-3)
  if (coeff === 0) return 0.1
  return C * (dr ** 2) / (coeff * 1e6) // scale factor
}

// Main simulation function
// Returns array of snapshots: [{t, h[], xs, eta}]
export function runSimulation({
  omega_rpm = 3000,
  eta0 = 10,       // mPa·s
  h0_um = 5,       // μm
  E_ums = 0.01,    // μm/s
  R_mm = 75,       // mm
  N = 60,
  maxTime = 60,    // s
  nSnapshots = 8,
  fixedEta = false,
  fixedE = false,
}) {
  const omega = rpmToRad(omega_rpm)
  const R = R_mm * 1e-3          // m
  const h0 = h0_um * 1e-6        // m
  const E = fixedE ? 0 : E_ums * 1e-6  // m/s
  const { rho, xs0, n, rhoS, etaGel } = PARAMS

  // Grid
  const dr = R / (N - 1)
  const r = Array.from({ length: N }, (_, i) => i * dr)

  // Initial conditions
  let h = new Float64Array(N).fill(h0)
  h[N - 1] = 0
  let xs = xs0
  let eta = fixedEta ? eta0 : eta0  // mPa·s

  const snapshots = []
  const snapInterval = maxTime / nSnapshots
  let nextSnap = 0
  let t = 0

  // Save initial snapshot
  snapshots.push({ t: 0, h: Array.from(h).map(v => v * 1e6), xs, eta })
  nextSnap = snapInterval

  let tGel = null

  while (t < maxTime) {
    // Adaptive timestep
    let dt = adaptiveDt(h, eta, omega, dr, rho)
    dt = Math.min(dt, 0.05, maxTime - t)
    if (dt <= 0) break

    // RK4 step
    h = rk4Step(h, r, dr, dt, omega, eta, E, rho)
    t += dt

    // Update solvent and viscosity
    if (!fixedEta) {
      const hBar = h.reduce((a, b) => a + b, 0) / N
      if (hBar > 0 && xs > 0.01) {
        xs = Math.max(0.01, xs - (E * rhoS) / (rho * hBar) * dt)
        eta = eta0 * Math.pow((1 - xs) / (1 - xs0), -n)
      }
    }

    // Gelation check
    if (!tGel && eta >= etaGel) {
      tGel = t
      snapshots.push({ t, h: Array.from(h).map(v => v * 1e6), xs, eta, gel: true })
      break
    }

    // Save snapshot
    if (t >= nextSnap) {
      snapshots.push({ t, h: Array.from(h).map(v => v * 1e6), xs, eta })
      nextSnap += snapInterval
    }
  }

  // Compute uniformity: peak-to-valley across inner 90%
  const finalH = snapshots[snapshots.length - 1].h
  const inner = finalH.slice(0, Math.floor(N * 0.9))
  const hMax = Math.max(...inner)
  const hMin = Math.min(...inner.filter(v => v > 0))
  const hMean = inner.reduce((a, b) => a + b, 0) / inner.length
  const uniformity = hMean > 0 ? ((hMax - hMin) / hMean) * 100 : 100

  const rArr = r.map(v => (v * 1e3).toFixed(1)) // mm

  return { snapshots, r: rArr, tGel, uniformity, omega, eta0 }
}

// Validation: EBP analytical vs numerical (E=0, fixed eta)
export function runValidation({ omega_rpm, eta0, h0_um, R_mm = 75 }) {
  const omega = rpmToRad(omega_rpm)
  const h0 = h0_um * 1e-6
  const { rho } = PARAMS

  const sim = runSimulation({
    omega_rpm, eta0, h0_um, E_ums: 0, R_mm,
    fixedEta: true, fixedE: true,
    maxTime: 30, nSnapshots: 50,
  })

  const analyticalPoints = sim.snapshots.map(s => ({
    t: parseFloat(s.t.toFixed(2)),
    numerical: s.h[0],
    analytical: ebpAnalytical(s.t, h0, omega, eta0, rho) * 1e6,
  }))

  analyticalPoints.forEach(p => {
    p.error = p.analytical > 0
      ? Math.abs((p.numerical - p.analytical) / p.analytical) * 100
      : 0
  })

  return analyticalPoints
}

// Design explorer: sweep (omega, eta0) grid
export function runDesignExplorer({ h0_um, E_ums, R_mm, omegas, etas }) {
  const results = []
  for (const omega_rpm of omegas) {
    for (const eta0 of etas) {
      const { uniformity, tGel } = runSimulation({
        omega_rpm, eta0, h0_um, E_ums, R_mm,
        N: 40, maxTime: 40, nSnapshots: 4,
      })
      results.push({ omega_rpm, eta0, uniformity, tGel, pass: uniformity <= 2.0 })
    }
  }
  return results
}

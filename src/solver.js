// ─── Spin Coating Physics Solver ───────────────────────────────────────────
// EBP equation: ∂h/∂t = -(1/r) ∂/∂r [ρω²r²h³/3η] - E
// Meyerhofer viscosity: η(t) = η₀ * ((1-xs)/(1-xs0))^(-n)

export const PARAMS = {
  rho: 1200,
  xs0: 0.7,
  n: 2.5,
  rhoS: 900,
  etaGel: 1e5,
}

export const rpmToRad = (rpm) => (rpm * 2 * Math.PI) / 60

// EBP analytical solution (eta in mPa·s)
export function ebpAnalytical(t, h0, omega, eta_mPas, rho = PARAMS.rho) {
  const eta = eta_mPas * 1e-3
  const coeff = (4 * rho * omega ** 2 * h0 ** 2) / (3 * eta)
  return h0 * Math.pow(1 + coeff * t, -0.5)
}

// RHS of EBP — returns dh/dt at each grid point
function rhsEBP(h, r, N, dr, omega, eta_mPas, E_ms, rho) {
  const dh = new Float64Array(N)
  const eta = eta_mPas * 1e-3
  const C = (rho * omega * omega) / (3.0 * eta)

  for (let i = 1; i < N - 1; i++) {
    const rp = 0.5 * (r[i] + r[i+1])
    const rm = 0.5 * (r[i] + r[i-1])
    const hp = 0.5 * (h[i] + h[i+1])
    const hm = 0.5 * (h[i] + h[i-1])
    const Fp = C * rp * rp * hp * hp * hp
    const Fm = C * rm * rm * hm * hm * hm
    dh[i] = -(rp * Fp - rm * Fm) / (r[i] * dr) - E_ms
  }
  dh[0] = dh[1]           // symmetry
  dh[N-1] = -E_ms         // edge: evaporation only, no drainage
  return dh
}

// Single RK4 step
function rk4(h, r, N, dr, dt, omega, eta, E, rho) {
  const add = (a, k, s) => a.map((v, i) => Math.max(0, v + s * k[i]))
  const k1 = rhsEBP(h,            r, N, dr, omega, eta, E, rho)
  const k2 = rhsEBP(add(h,k1,.5*dt), r, N, dr, omega, eta, E, rho)
  const k3 = rhsEBP(add(h,k2,.5*dt), r, N, dr, omega, eta, E, rho)
  const k4 = rhsEBP(add(h,k3,   dt), r, N, dr, omega, eta, E, rho)
  return h.map((v, i) => Math.max(0, v + (dt/6)*(k1[i]+2*k2[i]+2*k3[i]+k4[i])))
}

export function runSimulation({
  omega_rpm = 3000,
  eta0 = 10,
  h0_um = 5,
  E_ums = 0.01,
  R_mm = 75,
  N = 40,
  maxTime = 30,
  nSnapshots = 7,
  fixedEta = false,
  fixedE = false,
}) {
  const omega  = rpmToRad(omega_rpm)
  const R      = R_mm  * 1e-3
  const h0     = h0_um * 1e-6
  const E      = fixedE ? 0 : E_ums * 1e-6
  const { rho, xs0, n, rhoS, etaGel } = PARAMS

  const dr = R / (N - 1)
  const r  = Float64Array.from({ length: N }, (_, i) => i * dr)

  let h   = new Float64Array(N).fill(h0)
  let xs  = xs0
  let eta = eta0   // mPa·s
  let t   = 0
  let tGel = null

  // Use a fixed, physically safe dt
  // CFL-like: dt < dr / (C * h0^2 * R)
  const C0  = (rho * omega * omega * h0 * h0) / (3 * eta0 * 1e-3)
  const dtSafe = Math.min(0.5 * dr / (C0 * R + 1e-12), 0.2)
  const dt  = Math.max(dtSafe, 1e-4)

  // Total steps
  const totalSteps = Math.ceil(maxTime / dt)
  const saveEvery  = Math.max(1, Math.floor(totalSteps / nSnapshots))

  const snapshots = []
  snapshots.push({ t: 0, h: Array.from(h).map(v => v * 1e6), xs, eta })

  for (let step = 1; step <= totalSteps; step++) {
    const dtNow = Math.min(dt, maxTime - t)
    if (dtNow <= 0) break

    h = rk4(h, r, N, dr, dtNow, omega, eta, E, rho)
    t += dtNow

    // Update viscosity
    if (!fixedEta && E > 0) {
      const hBar = h.reduce((a,b)=>a+b,0) / N
      if (hBar > 1e-9 && xs > 0.02) {
        xs  = Math.max(0.02, xs - (E * rhoS) / (rho * hBar) * dtNow)
        eta = eta0 * Math.pow((1 - xs) / (1 - xs0), -n)
      }
    }

    // Gelation
    if (!tGel && eta >= etaGel) {
      tGel = t
      snapshots.push({ t, h: Array.from(h).map(v=>v*1e6), xs, eta, gel: true })
      break
    }

    // Snapshot
    if (step % saveEvery === 0) {
      snapshots.push({ t, h: Array.from(h).map(v=>v*1e6), xs, eta })
    }
  }

  // Ensure final snapshot
  const last = snapshots[snapshots.length-1]
  if (Math.abs(last.t - t) > dt) {
    snapshots.push({ t, h: Array.from(h).map(v=>v*1e6), xs, eta })
  }

  // Uniformity over inner 90%
  const finalH = snapshots[snapshots.length-1].h
  const inner  = finalH.slice(0, Math.floor(N * 0.9))
  const valid  = inner.filter(v => v > 0.01)
  const hMax   = valid.length ? Math.max(...valid) : 0
  const hMin   = valid.length ? Math.min(...valid) : 0
  const hMean  = valid.length ? valid.reduce((a,b)=>a+b,0)/valid.length : 1
  const uniformity = hMean > 0 ? ((hMax - hMin) / hMean) * 100 : 100

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
    maxTime: 20, nSnapshots: 40, N: 40,
  })

  return sim.snapshots.map(s => {
    const ana = ebpAnalytical(s.t, h0, omega, eta0, rho) * 1e6
    return {
      t:          parseFloat(s.t.toFixed(2)),
      numerical:  parseFloat(s.h[0].toFixed(4)),
      analytical: parseFloat(ana.toFixed(4)),
      error:      ana > 0 ? parseFloat((Math.abs(s.h[0]-ana)/ana*100).toFixed(3)) : 0,
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

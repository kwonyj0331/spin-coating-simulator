import React, { useState, useEffect, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import Slider from './Slider'
import { runSimulation } from '../solver'

const COLORS = ['#00d4ff', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16']

export default function InteractiveTab() {
  const [params, setParams] = useState({
    omega_rpm: 3000,
    eta0: 10,
    h0_um: 5,
    E_ums: 0.01,
    R_mm: 75,
  })
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)

  const set = (key) => (val) => setParams(p => ({ ...p, [key]: val }))

  const runSim = useCallback(() => {
    setRunning(true)
    setTimeout(() => {
      const res = runSimulation({ ...params, N: 60, maxTime: 60, nSnapshots: 7 })
      setResult(res)
      setRunning(false)
    }, 20)
  }, [params])

  useEffect(() => { runSim() }, [params])

  // Build chart data: each r point as a row with h values at each snapshot time
  const chartData = result
    ? result.r.map((rVal, ri) => {
        const row = { r: parseFloat(rVal) }
        result.snapshots.forEach((snap, si) => {
          row[`t${si}`] = snap.h[ri]
        })
        return row
      })
    : []

  const uniformity = result?.uniformity ?? 0
  const specPass = uniformity <= 2.0
  const tGel = result?.tGel

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: 'var(--mono)', fontSize: 18, color: 'var(--text)', marginBottom: 4 }}>
          Interactive Simulation
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>
          Adjust parameters to see how h(r, t) evolves from t = 0 to gelation.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
        {/* Controls */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24,
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', letterSpacing: 2, marginBottom: 20, textTransform: 'uppercase' }}>
            Process Parameters
          </div>

          <Slider label="Rotation Speed" symbol="ω" value={params.omega_rpm} min={500} max={6000} step={100} unit="rpm" onChange={set('omega_rpm')} color="var(--accent)" />
          <Slider label="Initial Viscosity" symbol="η₀" value={params.eta0} min={1} max={100} step={1} unit="mPa·s" onChange={set('eta0')} color="#7c3aed" />
          <Slider label="Initial Thickness" symbol="h₀" value={params.h0_um} min={1} max={20} step={0.5} unit="μm" onChange={set('h0_um')} color="#10b981" />
          <Slider label="Evaporation Rate" symbol="E" value={params.E_ums} min={0} max={0.1} step={0.001} unit="μm/s" onChange={set('E_ums')} color="#f59e0b" />
          <Slider label="Wafer Radius" symbol="R" value={params.R_mm} min={50} max={150} step={5} unit="mm" onChange={set('R_mm')} color="#ec4899" />

          {/* Metrics */}
          <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', letterSpacing: 2, marginBottom: 14, textTransform: 'uppercase' }}>
              Results
            </div>

            <div style={{
              background: specPass ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${specPass ? 'var(--green)' : 'var(--red)'}`,
              borderRadius: 8, padding: '12px 16px', marginBottom: 12,
            }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 4 }}>
                UNIFORMITY (±2% SPEC)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 22, color: specPass ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                  {uniformity.toFixed(2)}%
                </span>
                <span style={{
                  fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700,
                  color: specPass ? 'var(--green)' : 'var(--red)',
                  background: specPass ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                  padding: '3px 8px', borderRadius: 4,
                }}>
                  {specPass ? '✓ PASS' : '✗ FAIL'}
                </span>
              </div>
            </div>

            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 4 }}>GELATION TIME</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 20, color: 'var(--yellow)', fontWeight: 700 }}>
                {tGel ? `${tGel.toFixed(1)} s` : '> 60 s'}
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>
                h(r, t) — Film Thickness Profile
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                Each curve = one time snapshot from t=0 to t_gel
              </div>
            </div>
            {running && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', animation: 'pulse 1s infinite' }}>
                COMPUTING...
              </div>
            )}
          </div>

          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="r"
                label={{ value: 'Radial position r (mm)', position: 'bottom', fill: 'var(--text2)', fontSize: 12 }}
                tick={{ fill: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 10 }}
              />
              <YAxis
                label={{ value: 'h (μm)', angle: -90, position: 'insideLeft', fill: 'var(--text2)', fontSize: 12 }}
                tick={{ fill: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 11 }}
                labelStyle={{ color: 'var(--text2)' }}
                formatter={(val) => [`${parseFloat(val).toFixed(3)} μm`]}
              />
              {result?.snapshots.map((snap, si) => (
                <Line
                  key={si}
                  type="monotone"
                  dataKey={`t${si}`}
                  name={`t = ${snap.t.toFixed(1)}s${snap.gel ? ' (gel)' : ''}`}
                  stroke={COLORS[si % COLORS.length]}
                  strokeWidth={si === 0 ? 2 : si === (result.snapshots.length - 1) ? 2.5 : 1.5}
                  dot={false}
                  strokeDasharray={si === 0 ? '6 3' : 'none'}
                />
              ))}
              <Legend
                wrapperStyle={{ fontFamily: 'var(--mono)', fontSize: 10, paddingTop: 12 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

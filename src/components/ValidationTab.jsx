import React, { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ComposedChart, Bar
} from 'recharts'
import Slider from './Slider'
import { runValidation } from '../solver'

export default function ValidationTab() {
  const [params, setParams] = useState({ omega_rpm: 3000, eta0: 10, h0_um: 5 })
  const [data, setData] = useState([])
  const [maxError, setMaxError] = useState(0)

  const set = (key) => (val) => setParams(p => ({ ...p, [key]: val }))

  useEffect(() => {
    setTimeout(() => {
      const pts = runValidation(params)
      setData(pts)
      setMaxError(Math.max(...pts.map(p => p.error)))
    }, 20)
  }, [params])

  // Log-log data for slope check
  const logData = data
    .filter(p => p.t > 0.1 && p.analytical > 0)
    .map(p => ({
      logT: parseFloat(Math.log10(p.t).toFixed(3)),
      logH_num: parseFloat(Math.log10(Math.max(p.numerical, 0.001)).toFixed(3)),
      logH_ana: parseFloat(Math.log10(p.analytical).toFixed(3)),
    }))

  // Estimate slope from log-log (last half of data)
  let fittedSlope = null
  if (logData.length > 4) {
    const half = logData.slice(Math.floor(logData.length / 2))
    const n = half.length
    const sumX = half.reduce((a, p) => a + p.logT, 0)
    const sumY = half.reduce((a, p) => a + p.logH_num, 0)
    const sumXY = half.reduce((a, p) => a + p.logT * p.logH_num, 0)
    const sumX2 = half.reduce((a, p) => a + p.logT ** 2, 0)
    fittedSlope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX ** 2)
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: 'var(--mono)', fontSize: 18, color: 'var(--text)', marginBottom: 4 }}>
          Validation
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>
          Comparing numerical solver against the EBP analytical solution with E = 0 and constant η.
        </p>
      </div>

      {/* Controls */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 24, marginBottom: 24,
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24,
      }}>
        <Slider label="Rotation Speed" symbol="ω" value={params.omega_rpm} min={500} max={6000} step={100} unit="rpm" onChange={set('omega_rpm')} />
        <Slider label="Initial Viscosity" symbol="η₀" value={params.eta0} min={1} max={100} step={1} unit="mPa·s" onChange={set('eta0')} color="#7c3aed" />
        <Slider label="Initial Thickness" symbol="h₀" value={params.h0_um} min={1} max={20} step={0.5} unit="μm" onChange={set('h0_um')} color="#10b981" />
      </div>

      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Max Relative Error', value: `${maxError.toFixed(3)}%`, color: maxError < 1 ? 'var(--green)' : 'var(--yellow)', pass: maxError < 1, badge: maxError < 1 ? '✓ < 1%' : '⚠ > 1%' },
          { label: 'Late-time Slope', value: fittedSlope ? fittedSlope.toFixed(3) : '—', color: fittedSlope && Math.abs(fittedSlope + 0.5) < 0.05 ? 'var(--green)' : 'var(--yellow)', pass: fittedSlope && Math.abs(fittedSlope + 0.5) < 0.05, badge: 'Expected −0.5' },
          { label: 'Evaporation', value: 'E = 0', color: 'var(--accent)', badge: 'Fixed η' },
        ].map(m => (
          <div key={m.label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '16px 20px',
          }}>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{m.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 22, color: m.color, fontWeight: 700 }}>{m.value}</span>
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: m.color, background: `${m.color}22`, padding: '2px 8px', borderRadius: 4 }}>{m.badge}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* h(t) comparison */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>h(t) at r = 0</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>Numerical vs. EBP analytical</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="t" label={{ value: 'Time (s)', position: 'bottom', fill: 'var(--text2)', fontSize: 12 }} tick={{ fill: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 10 }} />
              <YAxis label={{ value: 'h (μm)', angle: -90, position: 'insideLeft', fill: 'var(--text2)', fontSize: 12 }} tick={{ fill: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 11 }} formatter={(val) => [`${parseFloat(val).toFixed(4)} μm`]} />
              <Legend wrapperStyle={{ fontFamily: 'var(--mono)', fontSize: 10, paddingTop: 8 }} />
              <Line type="monotone" dataKey="numerical" name="Numerical (RK4)" stroke="var(--accent)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="analytical" name="EBP Analytical" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="6 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Log-log plot */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>log h vs log t</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
            Expected late-time slope: −0.5 &nbsp;
            {fittedSlope && (
              <span style={{ color: Math.abs(fittedSlope + 0.5) < 0.05 ? 'var(--green)' : 'var(--yellow)', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                Fitted: {fittedSlope.toFixed(3)}
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={logData} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="logT" label={{ value: 'log₁₀(t)', position: 'bottom', fill: 'var(--text2)', fontSize: 12 }} tick={{ fill: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 10 }} />
              <YAxis label={{ value: 'log₁₀(h)', angle: -90, position: 'insideLeft', fill: 'var(--text2)', fontSize: 12 }} tick={{ fill: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 11 }} />
              <Legend wrapperStyle={{ fontFamily: 'var(--mono)', fontSize: 10, paddingTop: 8 }} />
              <Line type="monotone" dataKey="logH_num" name="Numerical" stroke="var(--accent)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="logH_ana" name="Analytical" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="6 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

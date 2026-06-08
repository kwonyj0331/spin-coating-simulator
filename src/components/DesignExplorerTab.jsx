import React, { useState, useCallback } from 'react'
import Slider from './Slider'
import { runDesignExplorer } from '../solver'

const OMEGA_STEPS = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000]
const ETA_STEPS = [2, 5, 8, 12, 16, 20, 25, 30, 40, 50]

function getColor(uniformity) {
  if (uniformity <= 2.0) {
    const t = uniformity / 2.0
    return `rgb(${Math.round(16 + t * 50)}, ${Math.round(185 - t * 60)}, ${Math.round(129 - t * 40)})`
  }
  const t = Math.min((uniformity - 2.0) / 8.0, 1)
  const r = Math.round(245 + t * 10)
  const g = Math.round(158 - t * 120)
  const b = Math.round(11 - t * 11)
  return `rgb(${r},${g},${b})`
}

export default function DesignExplorerTab() {
  const [params, setParams] = useState({ h0_um: 5, E_ums: 0.01, R_mm: 75 })
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [hovered, setHovered] = useState(null)

  const set = (key) => (val) => setParams(p => ({ ...p, [key]: val }))

  const runSweep = useCallback(() => {
    setLoading(true)
    setTimeout(() => {
      const res = runDesignExplorer({
        ...params,
        omegas: OMEGA_STEPS,
        etas: ETA_STEPS,
      })
      setResults(res)
      setLoading(false)
    }, 50)
  }, [params])

  const passCount = results ? results.filter(r => r.pass).length : 0
  const totalCount = OMEGA_STEPS.length * ETA_STEPS.length

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: 'var(--mono)', fontSize: 18, color: 'var(--text)', marginBottom: 4 }}>
          Design Explorer
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>
          Parametric sweep over (ω, η₀) space. Green = ±2% spec met. Adjust h₀, E, R and re-run.
        </p>
      </div>

      {/* Controls */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 24, marginBottom: 24,
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 24, alignItems: 'end',
      }}>
        <Slider label="Initial Thickness" symbol="h₀" value={params.h0_um} min={1} max={20} step={0.5} unit="μm" onChange={set('h0_um')} color="#10b981" />
        <Slider label="Evaporation Rate" symbol="E" value={params.E_ums} min={0} max={0.1} step={0.001} unit="μm/s" onChange={set('E_ums')} color="#f59e0b" />
        <Slider label="Wafer Radius" symbol="R" value={params.R_mm} min={50} max={150} step={5} unit="mm" onChange={set('R_mm')} color="#ec4899" />
        <button
          onClick={runSweep}
          disabled={loading}
          style={{
            padding: '10px 24px',
            background: loading ? 'var(--surface2)' : 'var(--accent)',
            color: loading ? 'var(--text3)' : '#0a0e1a',
            border: 'none', borderRadius: 8,
            fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            letterSpacing: 1, textTransform: 'uppercase',
            whiteSpace: 'nowrap', height: 40,
            transition: 'all 0.15s',
          }}
        >
          {loading ? 'Running...' : 'Run Sweep'}
        </button>
      </div>

      {results && (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Process Window</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 22, color: 'var(--green)', fontWeight: 700 }}>
                {passCount}/{totalCount}
                <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 400, marginLeft: 8 }}>combinations</span>
              </div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Best Uniformity</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 22, color: 'var(--accent)', fontWeight: 700 }}>
                {Math.min(...results.map(r => r.uniformity)).toFixed(2)}%
              </div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Hovered Cell</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>
                {hovered ? (
                  <>
                    <span style={{ color: 'var(--accent)' }}>ω={hovered.omega_rpm}</span> rpm,{' '}
                    <span style={{ color: '#7c3aed' }}>η₀={hovered.eta0}</span> mPa·s
                    <div style={{ color: hovered.pass ? 'var(--green)' : 'var(--red)', marginTop: 2 }}>
                      {hovered.uniformity.toFixed(2)}% {hovered.pass ? '✓' : '✗'}
                    </div>
                  </>
                ) : <span style={{ color: 'var(--text3)' }}>hover a cell</span>}
              </div>
            </div>
          </div>

          {/* Heatmap */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              Uniformity Heatmap — (ω, η₀) Space
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 20 }}>
              Green = ±2% spec met &nbsp;·&nbsp; Yellow/Red = out of spec &nbsp;·&nbsp; Hover for details
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              {/* Y-axis label */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24 }}>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)',
                  transform: 'rotate(-90deg)', whiteSpace: 'nowrap', letterSpacing: 1,
                }}>
                  η₀ (mPa·s)
                </span>
              </div>

              <div style={{ flex: 1 }}>
                {/* Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${OMEGA_STEPS.length}, 1fr)`, gap: 3 }}>
                  {ETA_STEPS.slice().reverse().map(eta => (
                    OMEGA_STEPS.map(omega => {
                      const cell = results.find(r => r.omega_rpm === omega && r.eta0 === eta)
                      if (!cell) return null
                      return (
                        <div
                          key={`${omega}-${eta}`}
                          onMouseEnter={() => setHovered(cell)}
                          onMouseLeave={() => setHovered(null)}
                          style={{
                            height: 44,
                            background: getColor(cell.uniformity),
                            borderRadius: 4,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'transform 0.1s, box-shadow 0.1s',
                            border: hovered?.omega_rpm === omega && hovered?.eta0 === eta
                              ? '2px solid white' : '2px solid transparent',
                          }}
                          title={`ω=${omega}rpm, η₀=${eta}mPa·s → ${cell.uniformity.toFixed(2)}%`}
                        >
                          <span style={{
                            fontFamily: 'var(--mono)', fontSize: 9,
                            color: 'rgba(0,0,0,0.7)', fontWeight: 700,
                          }}>
                            {cell.uniformity.toFixed(1)}
                          </span>
                        </div>
                      )
                    })
                  ))}
                </div>

                {/* X-axis labels */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${OMEGA_STEPS.length}, 1fr)`,
                  gap: 3, marginTop: 6,
                }}>
                  {OMEGA_STEPS.map(omega => (
                    <div key={omega} style={{
                      textAlign: 'center', fontFamily: 'var(--mono)',
                      fontSize: 9, color: 'var(--text3)',
                    }}>
                      {omega}
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginTop: 4, letterSpacing: 1 }}>
                  ω (rpm)
                </div>
              </div>

              {/* Y-axis tick labels */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingBottom: 28 }}>
                {ETA_STEPS.slice().reverse().map(eta => (
                  <div key={eta} style={{
                    fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
                    height: 44, display: 'flex', alignItems: 'center',
                  }}>
                    {eta}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>Uniformity:</span>
              {[0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 8.0].map(v => (
                <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 16, height: 16, background: getColor(v), borderRadius: 3 }} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{v}%</span>
                </div>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 12, height: 12, background: 'var(--green)', borderRadius: 2 }} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)' }}>≤ 2% PASS</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 12, height: 12, background: 'var(--red)', borderRadius: 2 }} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>&gt; 2% FAIL</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {!results && !loading && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 48, textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--text3)', marginBottom: 8 }}>
            Set parameters and click Run Sweep
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            Sweeps {OMEGA_STEPS.length} × {ETA_STEPS.length} = {OMEGA_STEPS.length * ETA_STEPS.length} combinations
          </div>
        </div>
      )}

      {loading && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 48, textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--accent)' }}>
            Running {OMEGA_STEPS.length * ETA_STEPS.length} simulations...
          </div>
        </div>
      )}
    </div>
  )
}

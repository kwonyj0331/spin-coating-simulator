import React from 'react'

export default function Slider({ label, symbol, value, min, max, step, unit, onChange, color = 'var(--accent)' }) {
  const pct = ((value - min) / (max - min)) * 100

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text2)' }}>
          {label}
          {symbol && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginLeft: 6 }}>{symbol}</span>}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color, fontWeight: 700 }}>
          {typeof value === 'number' && value < 1 ? value.toFixed(3) : value} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>{unit}</span>
        </span>
      </div>
      <div style={{ position: 'relative', height: 4, background: 'var(--border)', borderRadius: 2 }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${pct}%`, background: color, borderRadius: 2,
          transition: 'width 0.05s',
        }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{
            position: 'absolute', top: '50%', left: 0, width: '100%',
            transform: 'translateY(-50%)', opacity: 0, cursor: 'pointer',
            height: 20, margin: 0,
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{min}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{max}</span>
      </div>
    </div>
  )
}

import React, { useState } from 'react'
import InteractiveTab from './components/InteractiveTab'
import ValidationTab from './components/ValidationTab'
import DesignExplorerTab from './components/DesignExplorerTab'

const TABS = ['Interactive', 'Validation', 'Design Explorer']

export default function App() {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        padding: '0 32px',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 32, height: 64 }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent)', letterSpacing: 2, textTransform: 'uppercase' }}>
              EBP Theory
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>
              Spin Coating Simulator
            </div>
          </div>

          <nav style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {TABS.map((tab, i) => (
              <button
                key={tab}
                onClick={() => setActiveTab(i)}
                style={{
                  padding: '8px 20px',
                  background: activeTab === i ? 'var(--accent)' : 'transparent',
                  color: activeTab === i ? '#0a0e1a' : 'var(--text2)',
                  border: '1px solid',
                  borderColor: activeTab === i ? 'var(--accent)' : 'var(--border)',
                  borderRadius: 6,
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: activeTab === i ? 700 : 400,
                  transition: 'all 0.15s',
                  letterSpacing: 0.5,
                }}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Tab Content */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 32px' }}>
        {activeTab === 0 && <InteractiveTab />}
        {activeTab === 1 && <ValidationTab />}
        {activeTab === 2 && <DesignExplorerTab />}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '16px 32px',
        textAlign: 'center',
        fontFamily: 'var(--mono)',
        fontSize: 11,
        color: 'var(--text3)',
        marginTop: 48,
      }}>
        Fluid Mechanics Term Paper · 권영재 2022314461 · SKKU Chemical Engineering 2026
      </footer>
    </div>
  )
}

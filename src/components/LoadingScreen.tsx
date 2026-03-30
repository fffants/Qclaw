import { useEffect, useState } from 'react'
import logoSrc from '@/assets/logo.png'

interface LoadingScreenProps {
  /** 状态文字，如 "正在检查环境..." */
  status?: string
  /** 进度 0-100，不传则为不确定模式（indeterminate） */
  progress?: number
  /** 循环展示的小提示数组 */
  tips?: string[]
  /** 提示切换间隔 ms，默认 4000 */
  tipInterval?: number
  /** 是否显示 logo，默认 true */
  showLogo?: boolean
}

export default function LoadingScreen({
  status,
  progress,
  tips,
  tipInterval = 4000,
  showLogo = true,
}: LoadingScreenProps) {
  const [tipIndex, setTipIndex] = useState(0)
  const [tipVisible, setTipVisible] = useState(true)

  useEffect(() => {
    if (!tips?.length) return
    const fade = setInterval(() => {
      setTipVisible(false)
      setTimeout(() => {
        setTipIndex(prev => (prev + 1) % tips.length)
        setTipVisible(true)
      }, 300)
    }, tipInterval)
    return () => clearInterval(fade)
  }, [tips, tipInterval])

  const indeterminate = progress === undefined

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center app-bg-primary">
      {/* Logo with gentle bounce */}
      {showLogo && (
        <img
          src={logoSrc}
          alt="Qclaw"
          className="ls-logo"
          style={{ width: 64, height: 64, userSelect: 'none', pointerEvents: 'none' }}
        />
      )}

      {/* Brand name */}
      <div className="ls-brand-name app-text-primary" style={{ fontSize: 14, letterSpacing: '0.15em', fontWeight: 300, marginTop: 16 }}>
        Qclaw
      </div>

      {/* Status text */}
      {status && (
        <div
          key={status}
          className="ls-fade-in app-text-muted"
          style={{ fontSize: 13, marginTop: 20 }}
        >
          {status}
        </div>
      )}

      {/* Progress bar */}
      <div
        className="ls-progress-track"
        style={{ width: 240, height: 3, borderRadius: 2, marginTop: 16, overflow: 'hidden' }}
      >
        {indeterminate ? (
          <div className="ls-progress-indeterminate" />
        ) : (
          <div
            className="ls-progress-bar"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        )}
      </div>

      {/* Tips */}
      {tips?.length ? (
        <div
          className="app-text-faint"
          style={{
            fontSize: 12,
            marginTop: 24,
            height: 20,
            textAlign: 'center',
            maxWidth: 320,
          }}
        >
          <span
            style={{
              opacity: tipVisible ? 1 : 0,
              transform: tipVisible ? 'translateY(0)' : 'translateY(4px)',
              transition: 'opacity 0.3s ease, transform 0.3s ease',
              display: 'inline-block',
            }}
          >
            {tips[tipIndex]}
          </span>
        </div>
      ) : null}

      <style>{`
        .ls-logo {
          animation: ls-bounce 2s ease-in-out infinite;
        }
        @keyframes ls-bounce {
          0%, 100% { transform: translateY(0) scale(1); filter: drop-shadow(0 0 0 transparent); }
          50% { transform: translateY(-6px) scale(1.03); filter: drop-shadow(0 4px 12px rgba(247, 103, 7, 0.25)); }
        }

        .ls-brand-name {
          animation: ls-fade-up 0.6s ease-out both;
          animation-delay: 0.2s;
        }
        @keyframes ls-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .ls-fade-in {
          animation: ls-fade-up 0.3s ease-out both;
        }

        .ls-progress-track {
          background: var(--app-bg-tertiary);
        }
        .ls-progress-bar {
          height: 100%;
          border-radius: 2px;
          background: var(--mantine-color-brand-6);
          box-shadow: 0 0 8px rgba(247, 103, 7, 0.4);
          transition: width 0.4s ease;
        }
        .ls-progress-indeterminate {
          height: 100%;
          border-radius: 2px;
          background: var(--mantine-color-brand-6);
          box-shadow: 0 0 8px rgba(247, 103, 7, 0.4);
          animation: ls-slide 2s ease-in-out infinite;
        }
        @keyframes ls-slide {
          0% { width: 10%; margin-left: 0; }
          50% { width: 40%; margin-left: 30%; }
          100% { width: 10%; margin-left: 90%; }
        }
      `}</style>
    </div>
  )
}

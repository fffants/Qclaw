import { Box, Text } from '@mantine/core'
import { useEffect, useRef } from 'react'

interface LogViewerProps {
  content: string
  isRunning?: boolean
  maxHeight?: string
}

export default function LogViewer({ content, isRunning = false, maxHeight = '300px' }: LogViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [content])

  return (
    <Box
      ref={scrollRef}
      style={{
        maxHeight,
        overflowY: 'auto',
        backgroundColor: 'var(--app-surface-secondary)',
        border: '1px solid var(--app-border)',
        borderRadius: '8px',
        padding: '12px',
        fontFamily: 'var(--mantine-font-family-monospace)',
        fontSize: '13px',
        lineHeight: '1.6',
        color: 'var(--app-text-secondary)',
      }}
    >
      <Text
        component="pre"
        style={{
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {content}
        {isRunning && (
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '14px',
              backgroundColor: 'var(--mantine-color-brand-6)',
              marginLeft: '4px',
              animation: 'blink 1s infinite',
            }}
          />
        )}
      </Text>
    </Box>
  )
}

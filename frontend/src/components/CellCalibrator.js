import { useState, useRef, useCallback, useEffect } from 'react'
import { Typography, Box } from '@mui/material'
import OpenWithIcon from '@mui/icons-material/OpenWith'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'

export default function CellCalibrator({ scale = 1, onClose }) {
  // Position of the floating window
  const [position, setPosition] = useState({ x: 80, y: 80 })
  // Radius of the circle in screen pixels
  const [radius, setRadius] = useState(40)

  const windowRef = useRef(null)
  const isDraggingWindow = useRef(false)
  const isDraggingCircle = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const positionRef = useRef(position)
  const radiusRef = useRef(radius)

  useEffect(() => { positionRef.current = position }, [position])
  useEffect(() => { radiusRef.current = radius }, [radius])

  // Diameter in image-space pixels (divide screen pixels by scale)
  const realDiameter = scale > 0 ? Math.round((radius * 2) / scale) : 0

  // ── Window drag ──────────────────────────────────────────────
  const handleWindowMouseDown = useCallback((e) => {
    if (e.target.closest('[data-resize]')) return
    e.preventDefault()
    isDraggingWindow.current = true
    dragStart.current = {
      x: e.clientX - positionRef.current.x,
      y: e.clientY - positionRef.current.y,
    }
  }, [])

  // ── Circle resize drag ────────────────────────────────────────
  const handleResizeMouseDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    isDraggingCircle.current = true
    dragStart.current = { x: e.clientX, y: e.clientY, r: radiusRef.current }
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      if (isDraggingWindow.current) {
        setPosition({
          x: e.clientX - dragStart.current.x,
          y: e.clientY - dragStart.current.y,
        })
      }
      if (isDraggingCircle.current) {
        const dx = e.clientX - dragStart.current.x
        const newRadius = Math.max(10, dragStart.current.r + dx)
        setRadius(newRadius)
      }
    }
    const onUp = () => {
      isDraggingWindow.current = false
      isDraggingCircle.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const MIN_WINDOW_SIZE = 160
  const windowSize = Math.max(MIN_WINDOW_SIZE, radius * 2 + 48)

  return (
    <Box
      ref={windowRef}
      onMouseDown={handleWindowMouseDown}
      sx={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: windowSize,
        border: 'none',
        borderRadius: 2,
        boxShadow: 'none',
        backdropFilter: 'blur(4px)',
        userSelect: 'none',
        zIndex: 1300,
        cursor: 'grab',
        '&:active': { cursor: 'grabbing' },
        overflow: 'hidden',
      }}
    >
      {/* Title bar */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.5,
        py: 0.75,
        borderBottom: '1px solid rgba(255,255,255,0.15)',
        bgcolor: 'rgba(18, 18, 24, 0.92)',
      }}>
        <OpenWithIcon sx={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }} />
        <Typography sx={{
          fontSize: 11,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.6)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          flexGrow: 1,
        }}>
          Cell Calibrator
        </Typography>
        <Box
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onClose}
          sx={{
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 14,
            lineHeight: 1,
            '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.15)' },
          }}
        >
          ✕
        </Box>
      </Box>

      {/* Circle area */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        width: '100%',
        height: windowSize - 36, // subtract title bar height
        p: 0,
      }}>
        {/* The circle */}
        <Box sx={{
          width: radius * 2,
          height: radius * 2,
          borderRadius: '50%',
          border: '2px solid #00e5ff',
          boxShadow: '0 0 12px rgba(0,229,255,0.4), inset 0 0 12px rgba(0,229,255,0.06)',
          position: 'relative',
          flexShrink: 0,
        }}>
          {/* Center dot */}
          <Box sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 4,
            height: 4,
            borderRadius: '50%',
            bgcolor: '#00e5ff',
            opacity: 0.7,
          }} />

          {/* Diameter line */}
          <Box sx={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: '1px',
            bgcolor: 'rgba(0,229,255,0.3)',
            transform: 'translateY(-50%)',
          }} />

          {/* Resize handle on the right edge */}
          <Box
            data-resize="true"
            onMouseDown={handleResizeMouseDown}
            sx={{
              position: 'absolute',
              right: -6,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 12,
              height: 12,
              borderRadius: '50%',
              bgcolor: '#00e5ff',
              border: '2px solid rgba(0,0,0,0.5)',
              cursor: 'ew-resize',
              zIndex: 1,
              '&:hover': {
                bgcolor: '#fff',
                boxShadow: '0 0 8px rgba(0,229,255,0.8)',
              },
            }}
          />
        </Box>
      </Box>

      {/* Diameter readout */}
      <Box sx={{
        borderTop: '1px solid rgba(255,255,255,0.15)',
        px: 1.5,
        py: 0.75,
        display: 'flex',
        alignItems: 'baseline',
        gap: 0.5,
        bgcolor: 'rgba(18, 18, 24, 0.92)',
      }}>
        <RadioButtonUncheckedIcon sx={{ fontSize: 12, color: '#00e5ff', opacity: 0.7 }} />
        <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
          ⌀
        </Typography>
        <Typography sx={{
          fontSize: 15,
          fontWeight: 700,
          color: '#00e5ff',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.02em',
        }}>
          {realDiameter}
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>
          px (image)
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.04em' }}>
          ×{scale.toFixed(2)}
        </Typography>
      </Box>
    </Box>
  )
}
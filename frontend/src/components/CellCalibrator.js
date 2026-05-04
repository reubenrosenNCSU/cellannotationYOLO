import { useState, useRef, useCallback, useEffect } from 'react'
import { Typography, Box } from '@mui/material'
import OpenWithIcon from '@mui/icons-material/OpenWith'
import SquareFootIcon from '@mui/icons-material/SquareFoot' // Icon representing measurement

export default function CellCalibrator({ scale = 1, onClose }) {
  const [position, setPosition] = useState({ x: 80, y: 80 })
  const [size, setSize] = useState(80) 

  const windowRef = useRef(null)
  const isDraggingWindow = useRef(false)
  const isResizing = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const positionRef = useRef(position)
  const sizeRef = useRef(size)

  useEffect(() => { positionRef.current = position }, [position])
  useEffect(() => { sizeRef.current = size }, [size])

  // MATCHING YOUR APP MATH: 
  // App uses: Math.sqrt(ann.w ** 2 + ann.h ** 2)
  // Since this is a square, w and h are both 'size'
  const imageSpaceSize = size / scale
  const diagonalDiameter = scale > 0 
    ? Math.round(imageSpaceSize)
    : 0

  const handleWindowMouseDown = useCallback((e) => {
    if (e.target.closest('[data-resize]')) return
    e.preventDefault()
    isDraggingWindow.current = true
    dragStart.current = {
      x: e.clientX - positionRef.current.x,
      y: e.clientY - positionRef.current.y,
    }
  }, [])

  const handleResizeMouseDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    isResizing.current = true
    dragStart.current = { x: e.clientX, s: sizeRef.current }
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      if (isDraggingWindow.current) {
        setPosition({
          x: e.clientX - dragStart.current.x,
          y: e.clientY - dragStart.current.y,
        })
      }
      if (isResizing.current) {
        const dx = e.clientX - dragStart.current.x
        const newSize = Math.max(24, dragStart.current.s + dx)
        setSize(newSize)
      }
    }
    const onUp = () => {
      isDraggingWindow.current = false
      isResizing.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const windowSize = Math.max(160, size + 64)

  return (
    <Box
      ref={windowRef}
      onMouseDown={handleWindowMouseDown}
      sx={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: windowSize,
        borderRadius: 2,
        backdropFilter: 'blur(1px)',
        zIndex: 1300,
        cursor: 'grab',
        '&:active': { cursor: 'grabbing' },
        overflow: 'hidden',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.1)'
      }}
    >
      {/* Title bar */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 1,
        bgcolor: 'rgba(20, 20, 25, 0.95)',
      }}>
        <OpenWithIcon sx={{ fontSize: 14, color: '#00e5ff' }} />
        <Typography sx={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase', flexGrow: 1 }}>
          Diagonal Calibrator
        </Typography>
        <Box onClick={onClose} sx={{ cursor: 'pointer', color: 'rgba(255,255,255,0.3)', '&:hover': { color: '#fff' } }}>✕</Box>
      </Box>

      {/* Drawing Area */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: windowSize - 40, p: 3 }}>
        <Box sx={{
          width: size,
          height: size,
          border: '2px solid #00e5ff',
          position: 'relative',
          boxShadow: 'inset 0 0 20px rgba(0,229,255,0.1)'
        }}>
          {/* VISUAL DIAGONAL LINE - Shows what is being measured */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <line 
                x1="0" y1="100%" x2="100%" y2="0" 
                stroke="#00e5ff" 
                strokeWidth="1" 
                strokeDasharray="4 2"
                opacity="0.5"
            />
          </svg>

          {/* Resize Handle */}
          <Box
            data-resize="true"
            onMouseDown={handleResizeMouseDown}
            sx={{
              position: 'absolute',
              right: -5,
              bottom: -5,
              width: 12,
              height: 12,
              bgcolor: '#00e5ff',
              cursor: 'nwse-resize',
              clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' // Triangle handle
            }}
          />
        </Box>
      </Box>

      {/* Result Display */}
      <Box sx={{
        px: 1.5,
        py: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        bgcolor: 'rgba(20, 20, 25, 0.95)',
        borderTop: '1px solid rgba(0, 229, 255, 0.2)'
      }}>
        <SquareFootIcon sx={{ fontSize: 16, color: '#00e5ff' }} />
        <Box>
            <Typography sx={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', lineHeight: 1, mb: 0.5, fontWeight: 700 }}>
                CALCULATED DIA (PYTHAGOREAN)
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                <Typography sx={{ fontSize: 18, fontWeight: 900, color: '#00e5ff', fontVariantNumeric: 'tabular-nums' }}>
                    {diagonalDiameter}
                </Typography>
                <Typography sx={{ fontSize: 10, color: '#00e5ff', opacity: 0.8 }}>px</Typography>
            </Box>
        </Box>
      </Box>
    </Box>
  )
}
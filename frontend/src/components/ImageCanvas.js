import { rgbToHex } from '@mui/material'
import { useRef, useState, useEffect } from 'react'

export default function ImageCanvas({ src, boxes, onAddBox, onRemoveBox, isCropping,
    onCrop, currentClass, classes, imageSize, brightness, contrast, scale, onScaleChange }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)

  // pan + zoom state
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [lastPan, setLastPan] = useState({ x: 0, y: 0 })

  const [boundaries, setboundaries] = useState({
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0
  })

  const [isNewImage, setIsNewImage] = useState(true)

  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  })

  // box drawing state
  const [currentBox, setCurrentBox] = useState(null)
  const [canDraw, setCanDraw] = useState(false)

  // load image
  useEffect(() => {
    console.log("oh boy what a day")
    const img = new Image()
    img.src = src
    img.onload = () => {
      imgRef.current = img
      if (isNewImage) {
        setboundaries({xMin: 0, xMax: img.width, yMin: 0, yMax: img.height})
      }
      setIsNewImage(true)
      draw()
    }
  }, [src])

  // Track window size for rendering
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // draw loop
  useEffect(() => {
    draw()
  }, [scale, offset, boxes, currentBox, classes, brightness, contrast, windowSize])

  const draw = () => {
    console.log(boundaries)
    const canvas = canvasRef.current
    if (!canvas || !imgRef.current) return
    const ctx = canvas.getContext('2d')

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // apply pan + zoom
    ctx.save()
    ctx.translate(offset.x, offset.y)
    ctx.scale(scale, scale)

    // apply filters
    ctx.filter = `brightness(${100 + +brightness}%) contrast(${100 + +contrast}%)`

    // draw image
    ctx.drawImage(imgRef.current, 0, 0)

    ctx.filter = 'none'
    // draw existing boxes
    ctx.lineWidth = 2 / scale // scale-independent line width

    boxes.forEach((b) => {
      ctx.strokeStyle = classes[b.class].color
      ctx.strokeRect(b.x, b.y, b.w, b.h)
    })

    // draw box while dragging
    if (currentBox) {
      ctx.strokeStyle = classes[currentClass].color
      ctx.strokeRect(currentBox.x, currentBox.y, currentBox.w, currentBox.h)
    }

    ctx.restore()
  }

  // convert screen coords → image coords
  const screenToImage = (x, y) => {
    return {
      x: (x - offset.x) / scale,
      y: (y - offset.y) / scale,
    }
  }

  const handleMouseDown = (e) => {
    if (e.button === 1 || e.button === 2) {
      // middle or right-click → pan
      setIsPanning(true)
      setLastPan({ x: e.clientX, y: e.clientY })
      return
    }

    // left click → draw box
    const rect = canvasRef.current.getBoundingClientRect()
    const { x, y } = screenToImage(
      e.clientX - rect.left,
      e.clientY - rect.top
    )

    if (!canDraw) return

		if (e.shiftKey) {
			const hit = boxes.find(b =>
   			x >= b.x &&
				x <= b.x + b.w &&
				y >= b.y &&
				y <= b.y + b.h
			)
			if (hit) {
				onRemoveBox(hit)
			}

			return
		}

    setCurrentBox({ x, y, w: 0, h: 0 })
  }

  const handleMouseMove = (e) => {
    if (isPanning) {
      const dx = e.clientX - lastPan.x
      const dy = e.clientY - lastPan.y

      setOffset((o) => ({ x: o.x + dx, y: o.y + dy }))
      setLastPan({ x: e.clientX, y: e.clientY })
      return
    }

    const rect = canvasRef.current.getBoundingClientRect()
    let x, y
    ({ x, y } = screenToImage(
      e.clientX - rect.left,
      e.clientY - rect.top
    ));

    if (x < boundaries.xMin || x > boundaries.xMax || y < boundaries.yMin || y > boundaries.yMax) {
      setCanDraw(false)
    } else {
      setCanDraw(true)
    }

    if (currentBox) {
      // Don't allow user to draw outside of the image
      if (x < boundaries.xMin) {
        x = boundaries.xMin
      } else if (x > boundaries.xMax) {
        x = boundaries.xMax
      }

      if (y < boundaries.yMin) {
        y = boundaries.yMin
      } else if (y > boundaries.yMax) {
        y = boundaries.yMax
      }

      setCurrentBox((b) => ({
        ...b,
        w: x - b.x,
        h: y - b.y,
      }))
    }
  }

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false)
      return
    }
    if (currentBox) {
      if (currentBox.w < 0) {
        currentBox.w = currentBox.w * -1
        currentBox.x = currentBox.x - currentBox.w
      }
      if (currentBox.h < 0) {
        currentBox.h = currentBox.h * -1
        currentBox.y = currentBox.y - currentBox.h
      }
      currentBox.class = currentClass
      if (isCropping) {
        onCrop(currentBox)
        console.log(currentBox)
        setboundaries({
          xMin: currentBox.x,
          xMax: currentBox.x + currentBox.w,
          yMin: currentBox.y,
          yMax: currentBox.y + currentBox.h
        })
        console.log(boundaries)
        setIsNewImage(false)
        setCurrentBox(null)
        return
      }
      onAddBox(currentBox)
      setCurrentBox(null)
    }
  }

  const handleWheel = (e) => {
    e.preventDefault()
    
    const delta = e.deltaY < 0 ? 1.1 : 0.9

    const rect = canvasRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const newScale = scale * delta;

    const newOffsetX = mouseX - (mouseX - offset.x) * delta
    const newOffsetY = mouseY - (mouseY - offset.y) * delta

    onScaleChange(newScale)
    setOffset({ x: newOffsetX, y: newOffsetY })
  }

  return (
    <canvas
      ref={canvasRef}
      width={window.innerWidth}
      height={window.innerHeight}
      style={{
        cursor: isPanning ? 'grabbing': canDraw ? 'crosshair': 'not-allowed',
        background: 'rgba(0, 0, 0, 1)',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
			onContextMenu={(e) => e.preventDefault()}
    />
  )
}

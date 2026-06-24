import { useState, useEffect, Fragment } from 'react'
import { Box, Button, Typography, Modal, IconButton, Checkbox, Popover, Paper, Select, FormControl, InputLabel, OutlinedInput, Chip } from '@mui/material'
import PopupState, { bindTrigger, bindMenu } from 'material-ui-popup-state'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import DownloadIcon from '@mui/icons-material/Download'
import SettingsIcon from '@mui/icons-material/Settings'
import Tooltip from '@mui/material/Tooltip'
import CircularProgress from '@mui/material/CircularProgress'
import AppBar from '@mui/material/AppBar'

import SideMenu from '../components/SideMenu'
import ImageCanvas from '../components/ImageCanvas'
import TabMenu from '../components/TabMenu'
import ColorMenu from '../components/ColorMenu'
import AdjustableSlider from '../components/AdjustableSlider'
import MetricsChart from '../components/MetricsChart'
import CellCalibrator from '../components/CellCalibrator'
import GalleryMenu from '../components/GalleryMenu'
import RowMenu from '../components/RowMenu'

export default function CellAnnotationTool() {
  // Base URL for the backend API
  const API_BASE_URL = 'http://10.80.24.12:5002'

  const [isLoading, setIsLoading] = useState(false)

  // User state
  const [user, setUser] = useState(null)
  const [username, setUsername] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isAuthReady, setIsAuthReady] = useState(false)

  // State for image operations
  const [imageList, setImageList] = useState([])
  const [imageID, setImageID] = useState('')
  const [imageURL, setImageURL] = useState('')
  const [imageName, setImageName] = useState('')
  const [imageSize, setImageSize] = useState({width: 0, height: 0})
  const [scale, setScale] = useState(1)
  const [isCropping, setIsCropping] = useState(false)
  const [brightness, setBrightness] = useState(0)
  const [bMin, setBMin] = useState(-100)
  const [bMax, setBMax] = useState(100)
  const [contrast, setContrast] = useState(0)
  const [cMin, setCMin] = useState(-100)
  const [cMax, setCMax] = useState(100)

  // State for annotations
  const [annotations_old, setAnnotations_old] = useState([])
  const [annotations, setAnnotations] = useState([])
  const [boxes, setBoxes] = useState([])
  const [classes, setClasses] = useState([])
  const [colors, setColors] = useState([])
  const [currentClass, setCurrentClass] = useState(0)
  const [classes_old, setClasses_old] = useState([
    { name: 'Neuron', color: '#60A5FA' },  // index 0 = MADM class 0
    { name: 'Glia',   color: '#F59E0B' },  // index 1 = MADM class 1
    { name: 'SGN',    color: '#CA00BC' },  // index 2 = SGN model
    { name: 'CD3',    color: '#600089' },  // index 3 = CD3 model
  ])
  const [currentClass_old, setCurrentClass_old] = useState(0)
  const [undoStack, setUndoStack] = useState([])

  // State for model selection and detection settings
  const [models, setModels] = useState([])
  const [currentModel, setCurrentModel] = useState(0)
  const [models_old] = useState(['SGN', 'CD3', 'MADM', 'Custom'])
  const [currentModel_old, setCurrentModel_old] = useState(0)
  const [threshold, setThreshold] = useState(.5)
  const [cellDiameter, setCellDiameter] = useState(34)
  const [detectedDiameter, setDetectedDiameter] = useState(0)
  // State for custom model upload
  const [customModel, setCustomModel] = useState()
  const [modelTypes] = useState(['MADM', 'SGN', 'Other'])
  const [customModelType, setCustomModelType] = useState('')
  const [customModelName, setCustomModelName] = useState('')
  const [customModelFilename, setCustomModelFilename] = useState('')

  // State for batch detection
  const [selectedFiles, setSelectedFiles] = useState([])
  const [batchThumbnails, setBatchThumbnails] = useState({})
  const [annotationsOnly, setAnnotationsOnly] = useState(false)
  const [showLabels, setShowLabels] = useState(true)

  const fileKey = (file) => `${file.name}-${file.size}-${file.lastModified}`
  // State for fine tuning
  const [fineTuneModels] = useState(['SGN', 'MADM'])
  const [currentFineTuneModel, setCurrentFineTuneModel] = useState(0)
  const [preTrainImages, setPreTrainImages] = useState(0)
  const [maxImages, setMaxImages] = useState(7)
  const [epochs, setEpochs] = useState(10)
  const [kFoldResults, setKFoldResults] = useState()
  const [fineTuneModelURL, setFineTuneModelURL] = useState()
  const [metricsData, setMetricsData] = useState()
  const [trainingData, setTrainingData] = useState([])
  const [savedAnnotationCount, setSavedAnnotationCount] = useState(0)

  useEffect(() => {
    initializeSession()
  }, [])

  useEffect(() => {
    if (!isAuthReady) return

    loadImages()
    loadModels()
  }, [isAuthReady])

  useEffect(() => {
    if (!isAuthReady) return

    fetch(`${API_BASE_URL}/get-all-training-data`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        // data is the array of objects from Python
        setTrainingData(data);
      })
      .catch(err => console.error("Error loading gallery:", err))
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isZ = e.key.toLowerCase() === 'z'
      const isModifierPressed = e.ctrlKey || e.metaKey

      if (isZ && isModifierPressed && undoStack.length > 0) {
        handleRemoveBox(undoStack[undoStack.length - 1])
      }

      if (/^\d$/.test(e.key)) {
        const num = parseInt(e.key, 10)
        // Map 0 to index 9, otherwise map x to x - 1
        const targetClassIndex = num === 0 ? 9 : num - 1

        if (targetClassIndex < classes[currentModel].length) {
          setCurrentClass(targetClassIndex)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  // *----------* Helper Functions *----------* \\
  async function initializeSession() {
    try {
      const res = await fetch(`${API_BASE_URL}/me`, {
        method: 'GET',
        credentials: 'include',
      })
      const data = await res.json();
      if (res.ok) {
        setUser(data.user)
        setIsLoggedIn(data.logged_in)
      }
    } catch (err) {
      console.error("Session initialization failed", err)
    } finally {
      // Unlock the rest of the application
      setIsAuthReady(true);
    }
  }
  
  async function loadImages() {
    fetch(`${API_BASE_URL}/user-images`, { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      const formattedData = data.map(item => ({
        ...item,
        // Prepend the base URL
        url: `${API_BASE_URL}${item.url}`
      }));

      setImageList(formattedData)
    })
  }

  async function loadModels() {
    fetch(`${API_BASE_URL}/user-weights`, { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      setModels(data)
      setCurrentModel(0)
      const allLabels = data.map(item => item.label_set.labels)
      setClasses(allLabels)
      setCurrentClass(0)
      setAnnotations([])
      const defaultLabels = data[0]?.label_set?.labels
      ? data[0].label_set.labels.map(label => label.name) // Extracts ['neuron', 'glia']
      : []
      setDetectionSettings([
        {
          id: generateId(),
          selectedModelId: data[0]?.id,
          selectedClasses: defaultLabels,
          rowThreshold: 0.5,
          rowDiameter: 34
        }
      ])
    })
  }

  // *----------* User Operations *----------* \\

  async function handleRegister() {
    if (!username || username.trim() === '') return
    
    try {
      const res = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim() }),
        credentials: 'include', // Keeps the current temporary session cookie
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Registration failed')

      initializeSession()
      
    } catch (err) {
      console.error('Registration failed:', err.message)
      // Optional: Set an error state to display to the user
    }
  }

  async function handleLogin() {
    if (!username || username.trim() === '') return

    try {
      const res = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim() }),
        credentials: 'include', // Updates the browser cookie to the existing user's UUID
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      
      initializeSession()
      loadImages()
      loadModels()
      
    } catch (err) {
      console.error('Login failed:', err.message)
    }
  }

  
  // *----------* Image Operations *----------* \\

  // Uploads the users chosen image to the server and renders it to the canvas
  async function handleUpload(e) {
    const file = e.target.files[0]
    e.target.value = null
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.tiff') && !file.name.toLowerCase().endsWith('.tif')) {
        alert('Only .tiff and .tif files are accepted.')
        e.target.value = ''
        return
    }

    setImageName(file.name)

    const formData = new FormData()
    formData.append('file', file)

    setIsLoading(true)
    try {
        const res = await fetch(`${API_BASE_URL}/upload`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        })

        if (!res.ok) throw new Error('Upload failed')
        const data = await res.json()
        setImageID(data.image_id)
        setImageURL(`${API_BASE_URL}${data.converted_url}`)
        setImageSize({width: data.dimensions[0], height: data.dimensions[1]})
        setAnnotations([])
    } catch(e) {
      alert('Upload failed: ' + (e.response?.data?.error || e.message))
    } finally {
      loadImages()
      setIsLoading(false)
    }
  }

  // Adds images selected by the user to the group to be used for batch detection
  async function addToBatch(e) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const newFiles = Array.from(files)
    setSelectedFiles(prev => [...prev, ...newFiles])
    e.target.value = ''

    // for (const file of newFiles) {
    //   const formData = new FormData()
    //   formData.append('file', file)
    //   try {
    //     const res = await fetch(`${API_BASE_URL}/preview-tiff`, {
    //       method: 'POST',
    //       body: formData,
    //       credentials: 'include',
    //     })
    //     if (!res.ok) throw new Error('Preview failed')
    //     const blob = await res.blob()
    //     const url = URL.createObjectURL(blob)
    //     setBatchThumbnails(prev => ({ ...prev, [fileKey(file)]: url }))
    //   } catch (err) {
    //     console.error(`Failed to generate preview for ${file.name}:`, err)
    //   }
    // }
  }

  function handleSave() {
    const img = new Image()
    img.src = imageURL

    img.onload = () => {
      const tempCanvas = document.createElement('canvas');
      const ctx = tempCanvas.getContext('2d');

      tempCanvas.width = imageSize.width
      tempCanvas.height = imageSize.height

      ctx.filter = `brightness(${100 + +brightness}%) contrast(${100 + +contrast}%)`

      ctx.drawImage(img, 0, 0)

      ctx.lineWidth = 2

      annotations_old.forEach((a) => {
        ctx.strokeStyle = classes_old[a.class].color
        ctx.strokeRect(a.x, a.y, a.w, a.h)
      })

      const link = document.createElement('a');
      link.download = `annotated_${imageName.substring(0, imageName.lastIndexOf('.')) || imageName}.png`;
      link.href = tempCanvas.toDataURL('image/png');
      link.click();
    }
  }

  function toggleCrop() {
    if (isCropping) {
      setIsCropping(false)
    } else {
      setIsCropping(true)
    }
  }

  async function handleCrop(box) {
    const formData = new FormData()
    formData.append('image_id', `${imageID}`)
    formData.append('x', Math.round(box.x))
    formData.append('y', Math.round(box.y))
    formData.append('width', Math.round(box.w))
    formData.append('height', Math.round(box.h))

    try {
        const res = await fetch(`${API_BASE_URL}/upload-cropped`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        })

        if (!res.ok) throw new Error('Crop failed')
        const data = await res.json()

        const newAnnotations = (prevAnnotations) => {
          // Map over each model's sub-array of annotations
          return prevAnnotations.map((modelObj) => {
            const innerBoxes = modelObj.annotations || []
              // A box is "inside" if its boundaries are within the crop box boundaries
            const filteredBoxes = innerBoxes.filter((anno) => {
              const isInside =
                anno.x >= box.x &&
                anno.y >= box.y &&
                (anno.x + anno.w) <= (box.x + box.w) &&
                (anno.y + anno.h) <= (box.y + box.h)

              return isInside
            })
            return {
              ...modelObj,
              annotations: filteredBoxes
            }
          })
        }

        console.log(newAnnotations)
        setAnnotations(newAnnotations)

        const newBoxes = (prevBoxes) => {
          return prevBoxes.filter((anno) => {
            const isInside =
              anno.x >= box.x &&
              anno.y >= box.y &&
              (anno.x + anno.w) <= (box.x + box.w) &&
              (anno.y + anno.h) <= (box.y + box.h)

            return isInside
          })
        }
        console.log(newBoxes)
        setBoxes(newBoxes)

        // Add a timestamp as a query parameter (?t=123456789)
        setImageURL(`${API_BASE_URL}${data.converted_url}?t=${new Date().getTime()}`)
        //setImageSize({width: box.width, height: box.height})
    } catch(e) {
      alert('Crop failed: ' + (e.response?.data?.error || e.message))
    }

    setIsCropping(false)
  }

  // Handler for clicking a specific image
  async function handleLoadImage(image)  {
    setImageURL(image.url)
    setImageID(image.id)
    setImageName(image.name)
    setImageSize({width: image.dimensions[0], height: image.dimensions[1]})

    try {
      const res = await fetch(`${API_BASE_URL}/load-annotations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image_id: image.id }),
        credentials: 'include', // Updates the browser cookie to the existing user's UUID
      })

      if (!res.ok) throw new Error('Load failed')
      const data = await res.json()
      console.log(data)
      setAnnotations(data.annotations)

      const annoList = data.annotations || []
      const boxList = annoList.flatMap((modelObj) => {
        const annotationId = modelObj.id
        const labels = modelObj.labels.labels

        const detectedBoxes = (modelObj.annotations_detected || []).map((box) => ({
          ...box,
          annotation_id: annotationId,
          is_detected: true,
          name: labels[box.class].name,
          color: labels[box.class].color,
        }))

        const drawnBoxes = (modelObj.annotations_drawn || []).map((box) => ({
          ...box,
          annotation_id: annotationId,
          is_detected: false,
          name: labels[box.class].name,
          color: labels[box.class].color,
        }))

        return [...detectedBoxes, ...drawnBoxes]
      })

      setBoxes(boxList)

      if (annoList.length > 0) {
        const loadedRows = annoList.map((modelObj) => {
          const annotationId = modelObj.id
          const labels = modelObj.labels?.labels || []
          return {
            id: annotationId,  // real annotation id as row id
            selectedModelId: modelObj.weights_id,
            selectedClasses: labels.map(l => l.name),
            rowThreshold: modelObj.threshold ?? 0.5,
            rowDiameter: modelObj.cell_diameter ?? 34,
            rowSublabel: modelObj.sublabel ?? ''
          }
        })
        setDetectionSettings(loadedRows)
        setSelectedRowId(loadedRows[0].id)
      }

    } catch (e) {
      console.error('Annotation load failed:', e.message)
    }
    // TODO: Handle annotations

    if (galleryMenuOpen) {
      setGalleryMenuOpen(false)
    }
  }

  async function handleDeleteImage(image_id) {
    try {
      const res = await fetch(`${API_BASE_URL}/delete-image`, {
        method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ image_id: image_id }),
          credentials: 'include'
      })
      if (!res.ok) throw new Error('Delete failed')
      if (image_id = imageID) {
        setImageID('')
        setImageName('')
        setImageURL('')
        setImageSize({width: 0, height: 0})
        setAnnotations([])
        setBoxes([])
      }
    } catch (e) {
      console.error('Image deletion failed:', e.message)
    } finally {
      loadImages()
    }
  }

  // const handleBrightnessChange = (event, newValue) => {
  //   setBrightness(newValue)
  // }

  // const handleContrastChange = (event, newValue) => {
  //   setContrast(newValue)
  // }

  // *----------* Annotation Operations *----------* \\

  const handleAddBox = (box) => {
    if (!imageURL || !selectedRowId) return

    // Find the selected row to get model info
    const selectedRow = detectionSettings.find(r => r.id === selectedRowId)
    if (!selectedRow) return

    const model = models.find(m => m.id === selectedRow.selectedModelId)
    if (!model) return

    const labels = model.label_set?.labels || []
    const classLabel = labels[box.class] || { name: 'Unknown', color: '#ffffff' }

    const enrichedBox = {
      ...box,
      annotation_id: selectedRowId,
      is_detected: false,
      name: classLabel.name,
      color: classLabel.color,
      sublabel: selectedRow.sublabel
    }

    // Add to boxes for canvas rendering
    setBoxes(prev => [...prev, enrichedBox])

    // Add to the correct annotation group's annotations_drawn
    setAnnotations(prev => {
      const exists = prev.some(
        modelObj => (modelObj.id ?? modelObj.annotation_id) === selectedRowId
      )

      if (exists) {
        return prev.map(modelObj => {
          const id = modelObj.id ?? modelObj.annotation_id
          if (id !== selectedRowId) return modelObj
          return {
            ...modelObj,
            annotations_drawn: [...(modelObj.annotations_drawn || []), box]
          }
        })
      } else {
        // No annotation group yet for this row — create one
        return [
          ...prev,
          {
            annotation_id: selectedRowId,
            annotations_detected: [],
            annotations_drawn: [box],
            labels: model.label_set,
          }
        ]
      }
    })

    setUndoStack(prev => [...prev, enrichedBox])
  }

  const handleRemoveBox = (targetBox) => {
    setAnnotations((prevAnnotations) => {
      return prevAnnotations.map((modelObj) => {
        const modelId = modelObj.id || modelObj.annotation_id
        
        if (modelId === targetBox.annotation_id) {
          const innerBoxes = modelObj.annotations || [];
          return {
            ...modelObj,
            annotations: innerBoxes.filter(
              (b) => !(b.x === targetBox.x && b.y === targetBox.y && b.w === targetBox.w && b.h === targetBox.h)
            )
          };
        }
        return modelObj
      })
    })

    setBoxes((prevBoxes) => {
      return prevBoxes.filter((b) => b !== targetBox)
    })

    setUndoStack((prev) => prev.slice(0, -1))
  }

  async function handleColorUpdate(index, newColor) {
    const res = await fetch(`${API_BASE_URL}/save-color`, {
      method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          model_id: models[currentModel].id,
          index: index,
          color: newColor 
        }),
        credentials: 'include'
    })
    if (!res.ok) throw new Error('Color update failed')
    setClasses((prevClasses) => {
      // Deeply copy the outer array and the target inner array to maintain immutability
      const updated = [...prevClasses]
      updated[currentModel] = [...updated[currentModel]]
      
      // Update the color property of the specific class object
      updated[currentModel][index] = { 
        ...updated[currentModel][index], 
        color: newColor 
      }
      return updated
    })
  }

  function clearAnnotations() { //TODO: Update
    const confirm = window.confirm('Are you sure you want to delete all annotations? This cannot be undone!')
      if (!confirm) return
    
    setAnnotations_old([])
  }

  async function saveAnnotations() {
    setIsLoading(true)

    try {
      for (const modelObj of annotations) {
        const annotationsDetected = modelObj.annotations_detected || []
        const annotationsDrawn = modelObj.annotations_drawn || []

        if (annotationsDetected.length === 0 && annotationsDrawn.length === 0) continue

        const modelId = modelObj.id ?? modelObj.annotation_id
        const model = models.find(m => m.id === modelId) // look up by id, not index

        if (!model) {
          console.warn(`No model found for annotation group ${modelId}, skipping`)
          continue
        }

        const res = await fetch(`${API_BASE_URL}/save-annotations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_id: imageID,
            annotations_detected: annotationsDetected,
            annotations_drawn: annotationsDrawn,
            model: model,
          }),
          credentials: 'include',
        })

        if (!res.ok) throw new Error(`Save failed for annotation group ${modelId}`)

        console.log(`Saved annotation group ${modelId} successfully`)
      }
    } catch(e) {
      alert('Save failed: ' + (e.response?.data?.error || e.message))
    } finally {
      setIsLoading(false)
    }
  }

  async function exportAnnotations() { //TODO: Update
    setIsLoading(true)

    try {
      const res = await fetch(`${API_BASE_URL}/export-annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_id: imageID,
        }),
        credentials: 'include',
      })

      if (!res.ok) throw new Error(`Annotation export failed`)

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'annotations.zip'
      document.body.appendChild(a)
      a.click()

      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      //const data = await res.json()
    } catch(e) {
      alert('Export failed: ' + (e.res?.data?.error || e.message))
    } finally {
      setIsLoading(false)
    }
  }

  function importAnnotations(e) {
    const file = e.target.files[0]
    e.target.value = null
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.txt')) {
      alert('Only .txt files are accepted.')
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    
    reader.onload = e => {

      const yoloData = e.target.result
      const lines = yoloData.split('\n')

      setAnnotations_old([])
      let importedCount = 0
      const imageWidth = imageSize.width
      const imageHeight = imageSize.height

      lines.forEach(line => {
        if (!line.trim()) return
        const parts = line.trim().split(/\s+/)
        
        // Handle both formats: with and without confidence score
        if (parts.length !== 5 && parts.length !== 6) return
        
        const classId = parseInt(parts[0])
        const centerX = parseFloat(parts[1]) * imageWidth
        const centerY = parseFloat(parts[2]) * imageHeight
        const width = parseFloat(parts[3]) * imageWidth
        const height = parseFloat(parts[4]) * imageHeight
        
        // Convert to top-left coordinates
        const x = centerX - width / 2
        const y = centerY - height / 2

        handleAddBox({x: x, y: y, w: width, h: height, class: classId}) //TODO add isDetected

        importedCount++
      })

      alert(`Imported ${importedCount} annotations!`)
    }

    reader.readAsText(file)
  }

  function detectCellDiameter() { //TODO: Update
    // if (annotations.length == 0) {
    //   setDetectedDiameter(0)
    //   return
    // }

    let total = 0
    annotations_old.forEach(ann => {
      total += (ann.w + ann.h) / 2
    })

    const avgDiameter = Math.round(total / annotations_old.length)
    setDetectedDiameter(avgDiameter)
  }

  // *----------* Detection Operations *----------* \\

  async function detect() {
    if (!imageURL || !models[currentModel]) {
      alert('Please select both an image and a model before running detection.')
      return
    }

    setIsLoading(true)

    for (const row of detectionSettings) {
      const tempRowId = row.id  
      const payload = {
        image_id: imageID,
        model_id: row.selectedModelId,
        threshold: row.rowThreshold,
        cell_diameter: row.rowDiameter,
        sublabel: row.rowSublabel
      }

      try {
        const res = await fetch(`${API_BASE_URL}/detect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          credentials: 'include',
        })

        if (!res.ok) throw new Error(`${models[currentModel].name} detection failed`)
        const data = await res.json()
        
        const newAnnotations = data.annotations
        console.log(data)
        const targetId = data.annotation_id
        const newBoxes = newAnnotations.map(box => ({
          ...box,
          annotation_id: targetId,
          is_detected: true,
          name: data.labels.labels[box.class].name,
          color: data.labels.labels[box.class].color
        }))
        setAnnotations((prevAnnotations) => {
          const exists = prevAnnotations.some(
            (modelObj) => modelObj.id === targetId || modelObj.annotation_id === targetId
          )

          if (exists) {
            return prevAnnotations.map((modelObj) => {
              const id = modelObj.id || modelObj.annotation_id
              return id === targetId
                ? { ...modelObj, annotations_detected: newAnnotations }
                : modelObj
            })
          } else {
            // First detection for this model — append a new entry
            return [
              ...prevAnnotations,
              {
                annotation_id: targetId,
                annotations_detected: newAnnotations,
                labels: data.labels,
              }
            ]
          }
        })
        setBoxes((prevBoxes) => {
          const filteredBoxes = prevBoxes.filter(box => box.annotation_id != targetId)
          return [...filteredBoxes, ...newBoxes]
        })
        setDetectionSettings((prevRows) =>
          prevRows.map((r) => r.id === tempRowId ? { ...r, id: targetId } : r)
        )
      } catch (e) {
        alert('Detection failed: ' + (e.response?.data?.error || e.message))
      } finally {
        setIsLoading(false)
      }
    }
  }

  async function handleBatchDetect() {
    if (selectedFiles.length === 0) return alert('Please select images!');

    const formData = new FormData();

    if (currentModel_old === 0) {
      formData.append('detection_type', 'SGN')
    } else if (currentModel_old === 1) {
      formData.append('detection_type', 'CD3')
    } else if (currentModel_old === 2) {
      formData.append('detection_type', 'MADM')
    } else if (currentModel_old === 3) {
      if (!customModel) {
        alert('Please upload a custom model (.pt)')
        return
      }
      formData.append('detection_type', 'custom')
      formData.append('custom_model', customModel)
      formData.append('model_type', customModelType)
    } else {
      console.log('Invalid Model Selection')
      return
    }

    formData.append('threshold', threshold)
    formData.append('cell_diameter', cellDiameter)
    selectedFiles.forEach(file => formData.append('images', file));
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/batch-detect`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) throw new Error(`${models_old[currentModel_old]} batch detection failed`)
      
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'batch_results.zip'
      document.body.appendChild(a)
      a.click()

      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      setSelectedFiles([])

    } catch (error) {
      console.error(error);
      alert(`Error: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  // *----------* Model Operations *----------* \\

  function handleChooseCustomModel(e) {
    const file = e.target.files[0]
    e.target.value = null
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pt')) {
        alert('Only .pt files are accepted.')
        e.target.value = ''
        return
    }
    
    setCustomModel(file)
    setCustomModelFilename(file.name)
  }

  async function handleUploadCustomModel() {
    if (!customModel) {
      alert('Please choose a model to upload')
      return
    }

    if (customModelType === '') {
      alert('Please choose a model type')
      return
    }

    if (customModelName === '') {
      alert('Please choose a model name')
      return
    }
    
    const formData = new FormData()
    formData.append('model', customModel)
    formData.append('name', customModelName)
    formData.append('type', customModelType)

    setIsLoading(true)
    try {
        const res = await fetch(`${API_BASE_URL}/upload-custom-model`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        })
        console.log(res)
        if (!res.ok) throw new Error('Model upload failed')
        const data = await res.json()
        console.log(data)
    } catch(e) {
      alert('Model upload failed: ' + (e.response?.data?.error || e.message))
    } finally {
      setIsLoading(false)
    }

    handleCloseCustomUploadModal()
  }

  function cancelCustom() {
    setCustomModelName('')
    setCustomModelType('')
    setCustomModelFilename('')

    handleCloseCustomUploadModal()
  }

  async function handleFineTuneDetect() { //TODO: Phase Out
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/detect-finetuned`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', 
        body: JSON.stringify({
          model_type: fineTuneModels[currentFineTuneModel],
          threshold: threshold
        })
      })

      if (!res.ok) throw new Error(`${fineTuneModels[currentFineTuneModel]} detection failed`)

      const data = await res.json()

      const yoloTxt = data.annotations
      const imgWidth = data.image_width
      const imgHeight = data.image_height

      setAnnotations_old([])
      let importedCount = 0

      yoloTxt.split('\n').forEach(line => {
        if (!line.trim()) return
        const parts = line.trim().split(' ')
        const cls = parseInt(parts[0])
        const cx = parseFloat(parts[1]) * imgWidth
        const cy = parseFloat(parts[2]) * imgHeight
        const w = parseFloat(parts[3]) * imgWidth
        const h = parseFloat(parts[4]) * imgHeight
        const x1 = cx - w / 2
        const y1 = cy - h / 2
        const confidence = parts[5] ? parseFloat(parts[5]) : null

        handleAddBox({x: x1, y: y1, w: w, h: h, class: cls, confidence})

        importedCount++
      })

      alert(`Detected ${importedCount} ${models_old[currentModel_old]} objects!`)
    } catch (e) {
      alert('Fine tuned detection failed: ' + (e.response?.data?.error || e.message))
    } finally {
      setIsLoading(false)
    }
  }

  // *----------* Training Operations *----------* \\

  async function saveTrainingData() { //TODO: Rework
    // Normalize annotations
    console.log(imageSize)
    const normalizedAnnotations = annotations_old.map(ann => {
      const x_center = parseFloat(((ann.x + ann.w / 2) / imageSize.width).toFixed(6));
      const y_center = parseFloat(((ann.y + ann.h / 2) / imageSize.height).toFixed(6));
      const width_norm = parseFloat((ann.w / imageSize.width).toFixed(6));
      const height_norm = parseFloat((ann.h / imageSize.height).toFixed(6));
      let class_name = classes_old[ann.class].name
      if (ann.class < 2) {
        class_name = class_name.toLowerCase()
      }
      console.log(class_name)
      return {
        x_center,
        y_center,
        width_norm,
        height_norm,
        class_name
      }
    })

    try {
      const res = await fetch(`${API_BASE_URL}/save-training-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          original_filename: imageName,
          annotations: normalizedAnnotations,
          brightness: brightness,
          contrast: contrast,
        }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      console.log('Success from Server:', data)
      setSavedAnnotationCount(savedAnnotationCount + annotations_old.length)
      const newEntry = {
        imageName: data.image_file,
        annotationName: data.annotation_file,
        thumbnailUrl: `/api/preview/${data.thumbnail_file}`,
        count: data.annotation_count
      }
      setTrainingData((prevData) => [...prevData, newEntry])
      alert('Training data saved!')
    } catch (error) {
      console.error('Save failed:', error)
      alert(`Save failed: ${error.message}`)
    }
  }

  async function fineTune() { //TODO: Update
    if (!epochs || epochs < 1) {
      alert('Please enter valid number of epochs!')
      return
    }

    if (currentFineTuneModel === 0 && (preTrainImages > 7 || preTrainImages < 0)) {
      alert('SGN pre-train images must be between 0 and 7')
      return
    }
    if (currentFineTuneModel === 1 && (preTrainImages > 278 || preTrainImages < 0)) {
      alert('MADM pre-train images must be between 0 and 278')
      return
    }

    const formData = new FormData()
    formData.append('model_type', fineTuneModels[currentFineTuneModel])
    formData.append('epochs', epochs)
    formData.append('num_images', preTrainImages)

    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/train-saved`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`)
      }
      const resJson = await res.json()
      setKFoldResults(resJson.kfold_results)
      setFineTuneModelURL(resJson.model_url)
      alert('Model fine tuned with saved data.')
      handleOpenFineTuneDownloadModal()
      handleCloseFineTuneModal()
    } catch (err) {
      console.error(err)
      alert('Training failed')
    } finally {
      setIsLoading(false)
    }
  }

  async function clearTrainingData() { //TODO: Rework
    const confirm = window.confirm('Are you sure you want to delete all training data? This cannot be undone!')
    if (!confirm) return

    try {
      const res = await fetch(`${API_BASE_URL}/clear-training-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`)
      }
      alert('All training data has been cleared!')
      setSavedAnnotationCount(0)
      setTrainingData([])
    } catch (error) {
      console.error(error)
      alert(`Clear failed: ${error.message}`)
    }
  }

  const removeFromBatch = (index) => {
    const file = selectedFiles[index]
    const key = fileKey(file)
    setBatchThumbnails(prev => {
      const updated = { ...prev }
      if (updated[key]) {
        URL.revokeObjectURL(updated[key])
        delete updated[key]
      }
      return updated
    })
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const deleteTrainingDataEntry = async (uniqueId) => { //TODO: Rework
    if (!window.confirm("Are you sure you want to delete this training sample?")) return

    try {
      const res = await fetch(`${API_BASE_URL}/delete-training-data/${uniqueId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setSavedAnnotationCount(savedAnnotationCount - data.deleted_annotations)
        setTrainingData(prev => prev.filter(item => !item.annotationName.includes(uniqueId)))
      } else {
        alert("Failed to delete from server.")
      }
    } catch (err) {
      console.error("Delete error:", err)
    }
  }

  const loadSavedEntry = async (item) => { //TODO: Depricate
      const confirmLoad = window.confirm("Loading this will clear your current work. Continue?")
      if (!confirmLoad) return

      try {
          // 1. IMPORTANT: Use the original image, not the thumbnail!
          const imageLink = `${item.thumbnailUrl}`
          
          // 2. Fetch annotations
          const response = await fetch(`${API_BASE_URL}/api/annotations/${item.annotationName}`, { credentials: 'include' })
          if (!response.ok) throw new Error('Failed to fetch annotations')
          const yoloText = await response.text()

          // 3. GET IMAGE DIMENSIONS (Wait for it to load)
          const dimensions = await new Promise((resolve, reject) => {
              const img = new Image()
              img.onload = () => resolve({ width: img.width, height: img.height })
              img.onerror = () => reject(new Error("Could not load image to determine size"))
              img.src = imageLink;
          });

        const { width, height } = dimensions

          const lines = yoloText.trim().split('\n')
          const parsedAnnotations = lines.filter(line => line.trim()).map(line => {
              const [classId, x_norm, y_norm, w_norm, h_norm] = line.split(' ').map(Number)
              
              // YOLO (center_x, center_y, width, height) -> Canvas (top_left_x, top_left_y, width, height)
              const w = w_norm * width
              const h = h_norm * height
              const x = (x_norm * width) - (w / 2)
              const y = (y_norm * height) - (h / 2)
              
              let annotationClass = classId
              if (currentModel_old === 0) annotationClass = 2 //TODO: Find better way to check model of saved entry, current model may not be the same as the entry
              return {
                  id: Math.random().toString(36).substr(2, 9),
                  class: annotationClass,
                  x: x,
                  y: y,
                  w: w,
                  h: h
              };
          });

          // 4. Update states
          setImageName(item.imageName)
          setImageURL(`${API_BASE_URL}${imageLink}`)
          setAnnotations_old(parsedAnnotations)
          
      } catch (error) {
          console.error("Load failed:", error)
          alert('Load failed: ' + error.message)
      }
  };

  const handleModelDownload = async () => { //TODO: Update
    try {
      // 1. Prepare the URL
      // If fineTuneModelURL is "/snapshots/my_model.pt", this prepends the backend host
      const downloadUrl = `${API_BASE_URL}${fineTuneModelURL}`
      const res = await fetch(downloadUrl, {
        method: 'GET',
        credentials: 'include',
      })

      if (!res.ok) {
        throw new Error(`Download failed: ${res.statusText}`)
      }

      // 2. Convert response to Blob
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)

      // 3. Create invisible link and click
      const a = document.createElement('a')
      a.href = url
      
      // Extract filename from the URL path (e.g. "my_model.pt")
      const filename = fineTuneModelURL.split('/').pop() || 'model.pt'
      a.download = filename
      
      document.body.appendChild(a)
      a.click()
      
      // 4. Cleanup
      a.remove()
      window.URL.revokeObjectURL(url)

    } catch (error) {
      console.error('Download error:', error)
      alert('Failed to download model. Please try again.')
    }
  }

  const handleTrainingDataDownload = async () => { //TODO: Update
    try {
      const res = await fetch(`${API_BASE_URL}/download-training-data`, {
        method: 'GET',
        credentials: 'include', 
      })

      if (!res.ok) {
        throw new Error(`Download failed: ${res.statusText}`)
      }

      // 2. Convert response to Blob
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)

      // 3. Create invisible link and click
      const a = document.createElement('a')
      a.href = url
      
      const filename = 'training_data.zip'
      a.download = filename
      
      document.body.appendChild(a)
      a.click()
      
      // 4. Cleanup
      a.remove()
      window.URL.revokeObjectURL(url)

    } catch (error) {
      console.error('Download error:', error)
      alert('Failed to download training data. Please try again.')
    }
  }

  async function getMetrics() { //TODO: Rework
    try {
      const res = await fetch(`${API_BASE_URL}/events-data`, {
        method: 'GET',
        credentials: 'include',
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`)
      }
      const resJson = await res.json()
      setMetricsData(resJson)
    } catch (error) {
      console.error(error)
    }
  }

  // *----------* Tab Menu Contents *----------* \\


  // Custom model upload modal state
  const [customUploadModalOpen, setCustomUploadModalOpen] = useState(false)
  const handleOpenCustomUploadModal = () => {
    setCustomUploadModalOpen(true)
  }
  const handleCloseCustomUploadModal = () => {
    setCustomUploadModalOpen(false)
  }

  // Fine tuning modal state
  const [fineTuneModalOpen, setFineTuneModalOpen] = useState(false)
  const handleOpenFineTuneModal = () => {
    setFineTuneModalOpen(true)
  }
  const handleCloseFineTuneModal = () => {
    setFineTuneModalOpen(false)
  }

  // Fine tune download modal state
  const [fineTuneDownloadModalOpen, setFineTuneDownloadModalOpen] = useState(false)
  const handleOpenFineTuneDownloadModal = () => {
    setFineTuneDownloadModalOpen(true)
  }
  const handleCloseFineTuneDownloadModal = () => {
    setFineTuneDownloadModalOpen(false)
  }

  // Training metrics modal
  const [trainingMetricsModalOpen, setTrainingMetricsModalOpen] = useState(false)
  const handleOpenTrainingMetricsModal = () => {
    getMetrics()
    setTrainingMetricsModalOpen(true)
  }
  const handleCloseTrainingMetricsModal = () => {
    setTrainingMetricsModalOpen(false)
  }

  // Detection settings modal state
  const [detectionSettingsModalOpen, setDetectionSettingsModalOpen] = useState(false)
  const handleOpenDetectionSettingsModal = () => {
    setDetectionSettingsModalOpen(true)
  }
  const handleCloseDetectionSettingsModal = () => {
    setDetectionSettingsModalOpen(false)
  }

  const [selectedRowId, setSelectedRowId] = useState(null)
  const [settingsAnchor, setSettingsAnchor] = useState(null)
  const [settingsRowIndex, setSettingsRowIndex] = useState(null)
  const [editingSublabelIndex, setEditingSublabelIndex] = useState(null)
  const [sublabelDraft, setSublabelDraft] = useState('')
  const [modelDropdownIndex, setModelDropdownIndex] = useState(null)

  // Calibrator
  const [calibratorOpen, setCalibratorOpen] = useState(false)

  const [galleryMenuOpen, setGalleryMenuOpen] = useState(false)

  const [annotationModalOpen, setAnnotationModalOpen] = useState(false)
  // const [images] = useState([
  //   { url: 'https://picsum.photos/200/300?random=1', id: 1 },
  //   { url: 'https://picsum.photos/200/300?random=2', id: 2 },
  //   { url: 'https://picsum.photos/200/300?random=3', id: 3 },
  //   { url: 'https://picsum.photos/200/300?random=4', id: 4 },
  // ]);

  const modal_style = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 400,
    bgcolor: 'background.paper',
    border: '2px solid #000',
    boxShadow: 24,
    pt: 2,
    px: 4,
    pb: 3,
  };

  const button_style_span = {
    width: '100%',
    mb: 1
  }

  // *----------* Row Menu Helpers *----------* \\

  const generateId = () => {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID()
    }
    // Fallback string generator if crypto isn't available (e.g. non-HTTPS)
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  const createEmptyRow = () => {
    const defaultModel = models[0]
    return {
      id: generateId(),
      selectedModelId: defaultModel ? defaultModel.id : '',
      selectedClasses: [],
      rowThreshold: 0.5,
      rowDiameter: 34,
      rowSublabel: ''
    }
  }

  const [detectionSettings, setDetectionSettings] = useState([createEmptyRow()])

  const handleRowChange = (index, fieldName, value) => {
    setDetectionSettings((prevRows) => {
      const updatedRows = [...prevRows]
      
      // Special Case: If the model changes, reset the selected classes 
      // because the old classes won't exist in the new model.
      if (fieldName === 'selectedModelId') {
        updatedRows[index] = {
          ...updatedRows[index],
          [fieldName]: value,
          selectedClasses: [] 
        }
      } else {
        updatedRows[index] = {
          ...updatedRows[index],
          [fieldName]: value,
        }
      }
      return updatedRows
    })
  }

  const handleAddRow = () => setDetectionSettings((prevRows) => [...prevRows, createEmptyRow()])
  const handleDeleteRow = (indexToRemove) => setDetectionSettings((prevRows) => prevRows.filter((_, i) => i !== indexToRemove))
  const handleSelectRow = (id) => {
    setSelectedRowId(id)
    setCurrentClass(0)
  }

  const selectedRow = detectionSettings.find(r => r.id === selectedRowId)
  const selectedRowModel = models.find(m => m.id === selectedRow?.selectedModelId)
  const selectedRowClasses = selectedRowModel?.label_set?.labels || []
  const tabs = [
		{
			label: 'Annotate',
			content: (
        <Box>
          <Typography variant='body1' sx={{ pt: 1, fontWeight: 'bold' }}>
            Annotate Image
          </Typography>
          <PopupState variant='popover' popupId='class-popup-menu'>
            {(popupState) => (
              <Fragment>
                <Button variant='contained' {...bindTrigger(popupState)} 
                  endIcon={<KeyboardArrowDownIcon />} 
                  sx={{...button_style_span, mt: 1}}
                  disabled={selectedRowClasses.length === 0}
                >
                  {selectedRowClasses.length > 0 ? selectedRowClasses[currentClass]?.name : "No Classes Available"}
                </Button>
                <Menu {...bindMenu(popupState)}>
                  {selectedRowClasses.map((item, index) => (
                    <Box 
                      key={index}
                      display="flex" 
                      alignItems="center" 
                      gap={2}
                      onClick={() => { setCurrentClass(index); popupState.close() }}
                      sx={{ px: 2, py: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                    >
                      <input
                        type="color"
                        value={item.color}
                        onChange={(e) => handleColorUpdate(index, e.target.value)}
                        onClick={(e) => e.stopPropagation()} // Prevents menu closing on click
                        style={{
                          width: '24px',
                          height: '24px',
                          padding: 0,
                          border: 'none',
                          borderRadius: '4px', // Optional: rounded corners
                          cursor: 'pointer',
                          backgroundColor: 'transparent',
                        }}
                      />
                      <Typography variant="body1">{item.name}</Typography>
                    </Box>
                  ))}
                </Menu>
              </Fragment>
            )}
          </PopupState>
          <Box sx={{pt: 1, borderTop: 1, borderColor: 'grey.500'}}>
            <RowMenu
              rows={detectionSettings}
              onAdd={handleAddRow}
              onDelete={handleDeleteRow}
              onChange={handleRowChange}
              selectedRowId={selectedRowId}
              onSelect={handleSelectRow}
              renderRowTemplate={(row, index, handleFieldChange) => {
                const currentModelData = models.find(m => m.id === row.selectedModelId)
                const availableLabels = currentModelData?.label_set?.labels || []

                return (
                  <Box display="flex" flexDirection="row" alignItems="center" gap={1} width="100%">
                    
                    <Box display="flex" flexDirection="column" sx={{ flexGrow: 1 }}>
                      {/* Model name — double-click to open dropdown */}
                      {modelDropdownIndex === index ? (
                        <FormControl size="small" sx={{ minWidth: 100 }} onClick={e => e.stopPropagation()}>
                          <Select
                            open
                            value={row.selectedModelId}
                            onChange={(e) => {
                              handleFieldChange('selectedModelId', e.target.value)
                              setModelDropdownIndex(null)
                            }}
                            onClose={() => setModelDropdownIndex(null)}
                            variant="standard"
                            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                          >
                            {models.map((model) => (
                              <MenuItem key={model.id} value={model.id}>
                                {model.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      ) : (
                        <Typography
                          variant="body2"
                          fontWeight={500}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            setModelDropdownIndex(index)
                          }}
                          sx={{ minWidth: 60, cursor: 'text', px: 0.5, borderRadius: 0.5, '&:hover': { bgcolor: 'action.focus' } }}
                        >
                          {currentModelData?.name || 'No model'}
                        </Typography>
                      )}

                      {/* Sublabel — double-click to edit inline */}
                      {editingSublabelIndex === index ? (
                        <TextField
                          autoFocus
                          size="small"
                          variant="standard"
                          value={sublabelDraft}
                          onChange={(e) => setSublabelDraft(e.target.value)}
                          onBlur={() => {
                            handleFieldChange('rowSublabel', sublabelDraft)
                            setEditingSublabelIndex(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleFieldChange('rowSublabel', sublabelDraft)
                              setEditingSublabelIndex(null)
                            }
                            if (e.key === 'Escape') setEditingSublabelIndex(null)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          sx={{ maxWidth: 120 }}
                        />
                      ) : (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            setEditingSublabelIndex(index)
                            setSublabelDraft(row.rowSublabel || '')
                          }}
                          sx={{ flexGrow: 1, cursor: 'text', px: 0.5, borderRadius: 0.5, '&:hover': { bgcolor: 'action.focus' } }}
                        >
                          {row.rowSublabel || 'sublabel...'}
                        </Typography>
                      )}
                    </Box>
                    {/* Settings button */}
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSettingsRowIndex(index)
                        setSettingsAnchor(e.currentTarget)
                      }}
                    >
                      <SettingsIcon fontSize="small" />
                    </IconButton>

                    {/* Settings popover */}
                    {settingsRowIndex === index && (
                      <Popover
                        open={Boolean(settingsAnchor) && settingsRowIndex === index}
                        anchorEl={settingsAnchor}
                        onClose={() => { setSettingsAnchor(null); setSettingsRowIndex(null) }}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 280 }}>
                          <FormControl fullWidth size="small">
                            <InputLabel>Model</InputLabel>
                            <Select
                              value={row.selectedModelId}
                              label="Model"
                              onChange={(e) => handleFieldChange('selectedModelId', e.target.value)}
                            >
                              {models.map((model) => (
                                <MenuItem key={model.id} value={model.id}>
                                  {model.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <FormControl fullWidth size="small" disabled={!row.selectedModelId}>
                            <InputLabel>Classes</InputLabel>
                            <Select
                              multiple
                              value={row.selectedClasses}
                              label="Classes"
                              onChange={(e) => handleFieldChange('selectedClasses', e.target.value)}
                              input={<OutlinedInput label="Classes" />}
                              renderValue={(selected) => (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                  {selected.map((value) => {
                                    const labelObj = availableLabels.find(l => l.name === value)
                                    return (
                                      <Chip
                                        key={value}
                                        label={value}
                                        size="small"
                                        style={{ backgroundColor: labelObj?.color, color: '#fff', fontWeight: 'bold' }}
                                      />
                                    )
                                  })}
                                </Box>
                              )}
                            >
                              {availableLabels.map((label) => (
                                <MenuItem key={label.name} value={label.name}>
                                  {label.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <TextField
                            label="Sublabel"
                            size="small"
                            value={row.rowSublabel || ''}
                            onChange={(e) => handleFieldChange('rowSublabel', e.target.value)}
                          />
                          <TextField
                            label="Threshold (0-1)"
                            type="number"
                            size="small"
                            inputProps={{ step: '0.1', min: '0', max: '1' }}
                            value={row.rowThreshold}
                            onChange={(e) => {
                              let val = parseFloat(e.target.value)
                              if (val > 1) val = 1
                              if (val < 0) val = 0
                              handleFieldChange('rowThreshold', isNaN(val) ? '' : val)
                            }}
                          />
                          <TextField
                            label="Cell Diameter"
                            type="number"
                            size="small"
                            inputProps={{ step: '1' }}
                            value={row.rowDiameter}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10)
                              handleFieldChange('rowDiameter', isNaN(val) ? '' : val)
                            }}
                          />
                        </Box>
                      </Popover>
                    )}
                  </Box>
                )
              }}
            />
            <Typography gutterBottom variant='body1' sx={{ fontWeight: 'bold' }}>
              Manage Annotations
            </Typography>
            <Button variant='contained' component='label' onClick={saveAnnotations} sx={{...button_style_span}}>
              Save Annotations
            </Button>
            <Button variant='contained' component='label' onClick={exportAnnotations} sx={{...button_style_span}}>
              Export Annotations
            </Button>
            <Tooltip title="Check to export only the annotation .txt file. Leave unchecked to export the image as well." arrow placement="top">
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                <Checkbox
                  checked={annotationsOnly}
                  onChange={(e) => setAnnotationsOnly(e.target.checked)}
                  size='small'
                  sx={{ p: 0, mr: 0.5 }}
                />
                <Typography variant='body2'>Annotations only</Typography>
              </Box>
            </Tooltip>
            <Button variant='contained' component='label' sx={{...button_style_span}}>
              Import Annotations
              <input hidden type='file' accept='txt' onChange={importAnnotations}/>
            </Button>
            <Button variant='contained' component='label' onClick={() => setAnnotationModalOpen(true)} sx={{...button_style_span, bgcolor: 'error.dark', '&:hover': { bgcolor: 'error.light' }}}>
              Clear Annotations
            </Button>
            <SideMenu 
              anchorSide='left'
              open={annotationModalOpen} 
              onClose={() => setAnnotationModalOpen(false)}
            >
              <p></p>
              <Button onClick={() => setAnnotationModalOpen(false)}>
                Close!
              </Button>
            </SideMenu>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <Checkbox
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                size='small'
                sx={{ p: 0, mr: 0.5 }}
              />
              <Typography variant='body2'>Show labels</Typography>
            </Box>
            <Typography gutterBottom variant='body2' sx={{ fontWeight: 'bold' }}>
              Current Cells: {annotations_old.length}
            </Typography>
          </Box>
          <Box sx={{pt: 1, borderTop: 1, borderColor: 'grey.500'}}>
            <Typography gutterBottom variant='body1' sx={{ fontWeight: 'bold' }}>
              Train / Fine Tune
            </Typography>
            <Button variant='contained' component='label' onClick={saveTrainingData} sx={{...button_style_span}}>
              Save Training Data
            </Button>
            <Button variant='contained' component='label' onClick={clearTrainingData} sx={{...button_style_span, bgcolor: 'error.dark', '&:hover': { bgcolor: 'error.light' }}}>
              Clear Training Data
            </Button>
            <Button variant='contained' component='label' onClick={handleOpenFineTuneModal} sx={{...button_style_span}}>
              Fine Tune
            </Button>
            <Modal
              open={fineTuneModalOpen}
              onClose={handleCloseFineTuneModal}
            >
              <Box sx={{...modal_style}}>
                <Typography>Train with Saved Data</Typography>
                <Box display='flex' flexDirection='row'>
                  <Box sx={{width: '50%', display: 'flex', flexDirection: 'column', mr: 1, mb: 'auto'}}>
                    <TextField
                      value={preTrainImages}
                      onChange={(e) => setPreTrainImages(Number(e.target.value))}
                      type='number'
                      variant='outlined'
                      size='small'
                      slotProps={{ 
                        htmlInput: {
                          step: 1,
                          min: 0,
                          max: maxImages
                        }
                      }}
                      sx={{...button_style_span}}
                    />
                    <Typography gutterBottom variant='body2' sx={{ fontWeight: 'bold' }}>
                      Pre-train images (0-7 for SGN, 0-278 for MADM)
                    </Typography>
                  </Box>
                  <Box sx={{width: '50%', display: 'flex', flexDirection: 'column', mr: 1, mb: 'auto'}}>
                    <TextField
                      value={epochs}
                      onChange={(e) => setEpochs(Number(e.target.value))}
                      type='number'
                      variant='outlined'
                      size='small'
                      slotProps={{ 
                        htmlInput: {
                          step: 1,
                          min: 0
                        }
                      }}
                      sx={{...button_style_span}}
                    />
                    <Typography gutterBottom variant='body2' sx={{ fontWeight: 'bold' }}>
                      Epochs
                    </Typography>
                  </Box>
                </Box>
                <PopupState variant='popover' popupId='model-popup-menu'>
                  {(popupState) => (
                    <Fragment>
                      <Button variant='contained' {...bindTrigger(popupState)} endIcon={<KeyboardArrowDownIcon />} sx={{...button_style_span, mt: 1}}>
                        {fineTuneModels[currentFineTuneModel]}
                      </Button>
                      <Menu {...bindMenu(popupState)}>
                        {fineTuneModels.map((item, index) => (
                          <MenuItem 
                            key={index}
                            onClick={() => {setCurrentFineTuneModel(index); if (index === 0) {setMaxImages(7)} else{setMaxImages(278)}}}
                          >
                              <Typography variant='body1'>{item}</Typography>
                          </MenuItem>
                        ))}
                      </Menu>
                    </Fragment>
                  )}
                </PopupState>
                <Button onClick={fineTune}>Start Training</Button>
                <Button onClick={handleCloseFineTuneModal}>Cancel</Button>
              </Box>
            </Modal>
            <Modal
              open={fineTuneDownloadModalOpen}
              onClose={handleCloseFineTuneDownloadModal}
            >
              <Box sx={{...modal_style}}>
                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{kFoldResults}</Typography>
                {fineTuneModelURL && (
                  <Button 
                    variant="contained" 
                    color="primary"
                    onClick={handleModelDownload}
                    sx={{ mt: 2 }} // 'mt: 2' is MUI shorthand for marginTop: 16px
                    startIcon={<DownloadIcon />} // Optional: adds a nice download icon
                  >
                    Download Trained Model (.pt)
                  </Button>
                )}
                <Button onClick={handleCloseFineTuneDownloadModal}>
                  Close
                </Button>
              </Box>
            </Modal>
            <Button variant='contained' component='label' onClick={handleOpenTrainingMetricsModal} sx={{...button_style_span}}>
              Training Metrics
            </Button>
            <Modal
              open={trainingMetricsModalOpen}
              onClose={handleCloseTrainingMetricsModal}
            >
              <Box sx={{...modal_style}}>
                {metricsData && Object.keys(metricsData).length > 0 ? (
                  <MetricsChart data={metricsData} />
                ) : (
                  <Typography>No training metrics available yet.</Typography>
                )}
                <Button onClick={handleCloseTrainingMetricsModal}>
                  Close
                </Button>
              </Box>
            </Modal>
          </Box>
        </Box>
			),
		},
		{
			label: 'Detect',
			content: (
        <Box>
          {/* <Typography gutterBottom variant='body2' sx={{ fontWeight: 'bold' }}>
            Selected Model: {customModelFilename}
          </Typography>
          <Typography gutterBottom variant='body2' sx={{ fontWeight: 'bold' }}>
            Model Type: {lastCustomModelType}
          </Typography> */}
          <Box sx={{pt: 1}}>
            <Typography gutterBottom variant='body1' sx={{ fontWeight: 'bold' }}>
              Detection Settings
            </Typography>
            <Button variant='contained' component='label' onClick={handleOpenDetectionSettingsModal} sx={{...button_style_span}}>
              Edit Settings
            </Button>
            <Modal
              open={detectionSettingsModalOpen}
              onClose={handleCloseDetectionSettingsModal}
            >
              <Box sx={{...modal_style, width: 800,}}>
                <Typography variant="h5" gutterBottom>Detection Settings</Typography>
                <Paper variant="outlined" sx={{ p: 3, mb: 4 }}>
                </Paper>
              </Box>
            </Modal>
            
            <Button variant='contained' component='label' onClick={() => setCalibratorOpen(true)} sx={{...button_style_span}}>
              Calibrate Cell Size
            </Button>
          </Box>
          <Button variant='contained' component='label' onClick={detect} sx={{...button_style_span}}>
            Single Detect
          </Button>
          <Box sx={{pt: 1, borderTop: 1, borderColor: 'grey.500'}}>
            <Typography variant='body1' sx={{ fontWeight: 'bold' }}>
              Fine Tuned Detection
            </Typography>
            <PopupState variant='popover' popupId='model-popup-menu'>
              {(popupState) => (
                <Fragment>
                  <Button variant='contained' {...bindTrigger(popupState)} endIcon={<KeyboardArrowDownIcon />} sx={{...button_style_span, mt: 1}}>
                    {fineTuneModels[currentFineTuneModel]}
                  </Button>
                  <Menu {...bindMenu(popupState)}>
                    {fineTuneModels.map((item, index) => (
                      <MenuItem 
                        key={index}
                        onClick={() => {setCurrentFineTuneModel(index)}}
                      >
                          <Typography variant='body1'>{item}</Typography>
                      </MenuItem>
                    ))}
                  </Menu>
                </Fragment>
              )}
            </PopupState>
            <Button variant='contained' component='label' onClick={handleFineTuneDetect} sx={{...button_style_span}}>
              Fine Tuned Detect
            </Button>
          </Box>
        </Box>
      )
		}
	]

  const dataTabs = [
    {
      label: 'Training',
      content: (
        <Box>
          <Typography>Saved Training Data</Typography>
          <Typography gutterBottom variant='body2' sx={{ fontWeight: 'bold' }}>
            Current Saved Cells: {savedAnnotationCount}
          </Typography>
          <Button 
            variant="contained" 
            color="primary"
            onClick={handleTrainingDataDownload}
            sx={{ mt: 2 }} // 'mt: 2' is MUI shorthand for marginTop: 16px
            startIcon={<DownloadIcon />} // Optional: adds a nice download icon
          >
            Download Training Data (.zip)
          </Button>
          {trainingData.map((item, index) => {
            const uniqueId = item.annotationName.replace('.txt', '')

            return (
              <Box key={index} sx={{ textAlign: 'center' }}>
                <Box
                  component="img"
                  src={`${API_BASE_URL}${item.thumbnailUrl}`} // Matches your newEntry key
                  alt="preview"
                  onClick={() => loadSavedEntry(item)}
                  sx={{
                    width: 150,
                    height: 150,
                    border: '1px solid black',
                    cursor: 'pointer', 
                    '&:hover': { opacity: 0.8, border: '1px solid #1976d2' },
                    mb: 2,
                    p: 1,
                    borderRadius: 1
                  }}
                />
                <Typography variant="caption" sx={{ display: 'block' }}>
                  {/* Use imageName instead of name, and add a check */}
                  {item.imageName ? item.imageName.substring(0, 10) : 'N/A'}...
                </Typography>
                {/* Quick Delete Button */}
                <button 
                  onClick={() => deleteTrainingDataEntry(uniqueId)}
                  style={{ color: 'red', cursor: 'pointer', fontSize: '10px' }}
                >
                  Delete
                </button>
              </Box>
            )
          })}
        </Box>
      )
    },
    {
      label: 'Batch Images',
      content: (
        <Box>
          <PopupState variant='popover' popupId='batch-model-popup-menu'>
            {(popupState) => (
              <Fragment>
                <Button variant='contained' {...bindTrigger(popupState)} endIcon={<KeyboardArrowDownIcon />} sx={{ ...button_style_span, mt: 1 }}>
                  {models_old[currentModel_old]}
                </Button>
                <Menu {...bindMenu(popupState)}>
                  {models_old.map((item, index) => (
                    <MenuItem key={index} onClick={() => setCurrentModel_old(index)}>
                      <Typography variant='body1'>{item}</Typography>
                    </MenuItem>
                  ))}
                </Menu>
              </Fragment>
            )}
          </PopupState>
          <Button variant='contained' component='label' sx={{ ...button_style_span, mt: 1 }}>
            Add Images
            <input hidden type='file' multiple accept='image/tiff' onChange={addToBatch} />
          </Button>
          <Button
            variant='contained'
            onClick={handleBatchDetect}
            disabled={selectedFiles.length === 0}
            sx={{ ...button_style_span }}
          >
            Process Batch ({selectedFiles.length})
          </Button>
          {selectedFiles.map((file, index) => (
            <Box key={index} sx={{ textAlign: 'center' }}>
              {batchThumbnails[fileKey(file)] ? (
                <Box
                  component="img"
                  src={batchThumbnails[fileKey(file)]}
                  alt="preview"
                  sx={{
                    width: 150,
                    height: 150,
                    border: '1px solid black',
                    mb: 2,
                    p: 1,
                    borderRadius: 1,
                    objectFit: 'contain',
                  }}
                />
              ) : (
                <Box sx={{
                  width: 150,
                  height: 150,
                  border: '1px solid black',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 2,
                  borderRadius: 1,
                }}>
                  <Typography variant="caption">Loading...</Typography>
                </Box>
              )}
              <Typography variant="caption" sx={{ display: 'block' }}>
                {file.name.length > 20 ? `${file.name.substring(0, 20)}...` : file.name}
              </Typography>
              <button
                onClick={() => removeFromBatch(index)}
                style={{ color: 'red', cursor: 'pointer', fontSize: '10px' }}
              >
                Remove
              </button>
            </Box>
          ))}
        </Box>
      )
    }
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      
      {/* Loading Overlay */}
      {isLoading && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <CircularProgress size={52} thickness={4} sx={{ color: 'white' }} />
          <p style={{ color: 'white', marginTop: 12, fontSize: 14 }}>Processing...</p>
        </div>
      )}

      {/* Login Bar */}
      {!isLoggedIn && (
        <AppBar
          position="sticky" 
          sx={{ 
            height: '64px', 
            display: 'flex', 
            flexDirection: 'row', 
            alignItems: 'center', 
            gap: 2, 
            px: 2,
            zIndex: (theme) => theme.zIndex.drawer + 1 
          }}
        >
          <TextField
            label="Username"
            variant="outlined"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          {/* Note: Removed component='label' from buttons unless you are uploading files */}
          <Button variant='contained' onClick={handleLogin}>
            Login
          </Button>
          <Button variant='contained' onClick={handleRegister}>
            Register
          </Button>
        </AppBar>
      )}
      
      {/* Work Space Container */}
      <Box 
        sx={{ 
          display: 'flex',
          flexDirection: 'row',
          flexGrow: 1,
          height: '100%',
          width: '100%',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <SideMenu anchorSide='left'>
          <Typography gutterBottom variant='h6' fontWeight={'bold'}>
              Cell Annotation Tool (CAT🐱)
          </Typography>
          <Button variant='contained' component='label' sx={{...button_style_span}}>
            Upload Image
            <input hidden type='file' accept='image/tiff' onChange={handleUpload}/>
          </Button>
          <Button variant='contained' component='label' onClick={() => setGalleryMenuOpen(true)} sx={{...button_style_span}}>
            Open Image
          </Button>
          <GalleryMenu 
            open={galleryMenuOpen}
            handleClose={() => setGalleryMenuOpen(false)}
            images={imageList}
            onImageClick={handleLoadImage}
            onButtonClick={handleDeleteImage}
          />
          <Button variant='contained' component='label' onClick={handleSave} sx={{...button_style_span}}>
            Save Image
          </Button>
          <Button variant='contained' component='label' onClick={toggleCrop}  sx={{...button_style_span, bgcolor: isCropping ? 'primary.dark' : 'containedPrimary',}}>
            Crop Image
          </Button>

          <Stack spacing={2} sx={{ width: '100%' }}>
            <AdjustableSlider
              label='Brightness'
              value={brightness}
              onChange={(e, val) => setBrightness(val)}
              min={bMin}
              setMin={setBMin}
              max={bMax}
              setMax={setBMax}
            />
            <AdjustableSlider
              label='Contrast'
              value={contrast}
              onChange={(e, val) => setContrast(val)}
              min={cMin}
              setMin={setCMin}
              max={cMax}
              setMax={setCMax}
            />
          </Stack>
          
          <Typography variant='body1' sx={{ pt: 1, fontWeight: 'bold' }}>
            Select Model
          </Typography>
          <PopupState variant='popover' popupId='model-popup-menu'>
            {(popupState) => (
              <Fragment>
                <Button 
                  variant='contained' 
                  {...bindTrigger(popupState)} 
                  disabled={models.length === 0} // Disable if no models yet
                  endIcon={<KeyboardArrowDownIcon />} 
                  sx={{ ...button_style_span, mt: 1 }}
                >
                  {models.length > 0 ? models[currentModel].name : "No Models Available"}
                </Button>
                <Menu {...bindMenu(popupState)}>
                  {models.map((item, index) => (
                    <MenuItem key={index} onClick={() => {setCurrentModel(index); setCurrentClass(0)}}>
                      <Typography variant='body1'>{item.name}</Typography>
                    </MenuItem>
                  ))}
                </Menu>
              </Fragment>
            )}
          </PopupState>
          
          <Button variant='contained' component='label' onClick={handleOpenCustomUploadModal} sx={{...button_style_span}}>
            Load Custom
          </Button>
          <Modal
            open={customUploadModalOpen}
            onClose={cancelCustom}
          >
            <Box sx={{...modal_style}}>
              <Typography>Load Custom Model</Typography>
              <TextField
                label="Model Name"
                variant="outlined"
                fullWidth
                value={customModelName}
                onChange={(e) => setCustomModelName(e.target.value)}
              />
              <Button variant='contained' component='label'>
                Select File
                <input hidden type='file' accept='.pt' onChange={handleChooseCustomModel} />
              </Button>
              <PopupState variant='popover' popupId='model-popup-menu'>
                {(popupState) => (
                  <Fragment>
                    <Button variant='contained' {...bindTrigger(popupState)} endIcon={<KeyboardArrowDownIcon />}>
                      {customModelType || 'Select Type'}
                    </Button>
                    <Menu {...bindMenu(popupState)}>
                      {modelTypes.map((item, index) => (
                        <MenuItem 
                          key={index}
                          onClick={() => {setCustomModelType(item)}}
                        >
                            <Typography variant='body1'>{item}</Typography>
                        </MenuItem>
                      ))}
                    </Menu>
                  </Fragment>
                )}
              </PopupState>
              <Typography>Selected: {customModelFilename}</Typography>
              <Button onClick={handleUploadCustomModel}>Confirm</Button>
              <Button onClick={cancelCustom}>Cancel</Button>
            </Box>
          </Modal>
          
          <TabMenu items={tabs}></TabMenu>
        </SideMenu>

        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: '#1e1e1e',
            borderBottom: '1px solid #333',
            px: 2,
            py: 0.75,
            minHeight: 36,
          }}>
            <Typography variant='body2' sx={{ color: '#ccc', fontFamily: 'monospace' }}>
              {imageName || 'No image loaded'}
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', bgcolor: '#111' }}>
            <ImageCanvas src={imageURL} boxes={boxes} onAddBox={handleAddBox}
              onRemoveBox={handleRemoveBox} isCropping={isCropping} onCrop={handleCrop}
              currentClass={currentClass} classes={classes} imageSize={imageSize}
              brightness={brightness} contrast={contrast}
              scale={scale} onScaleChange={setScale} showLabels={showLabels} currentSet={currentModel}/>
          </Box>
        </Box>
        {calibratorOpen && (
          <CellCalibrator scale={scale} onClose={() => setCalibratorOpen(false)} />
        )}
        <SideMenu anchorSide={'right'}>
          <TabMenu items={dataTabs}></TabMenu>
        </SideMenu>
      </Box>
    </Box>
  )
}

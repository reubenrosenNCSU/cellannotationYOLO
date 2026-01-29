import { useState, Fragment } from 'react'
import { Box, Button, Typography, Modal } from '@mui/material'
import PopupState, { bindTrigger, bindMenu } from 'material-ui-popup-state'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField';
import DownloadIcon from '@mui/icons-material/Download'

import SideMenu from '../components/SideMenu'
import ImageCanvas from '../components/ImageCanvas'
import TabMenu from '../components/TabMenu'
import ColorMenu from '../components/ColorMenu'
import AdjustableSlider from '../components/AdjustableSlider'
import MetricsChart from '../components/MetricsChart'

export default function CellAnnotationTool() {
  // Base URL for the backend API
  const API_BASE_URL = 'http://10.80.24.12:5001'

  // State for image operations
  const [imageURL, setImageURL] = useState('')
  const [imageName, setImageName] = useState('')
  const [imageSize, setImageSize] = useState({width: 0, height: 0})
  const [isCropping, setIsCropping] = useState(false)
  const [brightness, setBrightness] = useState(0)
  const [bMin, setBMin] = useState(-100)
  const [bMax, setBMax] = useState(100)
  const [contrast, setContrast] = useState(0)
  const [cMin, setCMin] = useState(-100)
  const [cMax, setCMax] = useState(100)

  // Steate for annotations
  const [annotations, setAnnotations] = useState([])
  const [classes, setClasses] = useState([
    { name: 'SGN', color: '#CA00BC' },
    { name: 'Yellow Neuron', color: '#FAF38F' },
    { name: 'Yellow Astrocyte', color: '#FFBB00' },
    { name: 'Green Neuron', color: '#B3FFD2' },
    { name: 'Green Astrocyte', color: '#066A30' },
    { name: 'Red Neuron', color: '#FAABA2' },
    { name: 'Red Astrocyte', color: '#B03022' },
    { name: 'CD3', color: '#600089' },
  ])
  const [currentClass, setCurrentClass] = useState(0)

  // State for model selection and detection settings
  const [models] = useState(['SGN', 'CD3', 'MADM', 'Custom'])
  const [currentModel, setCurrentModel] = useState(0)
  const [threshold, setThreshold] = useState(.5)
  const [cellDiameter, setCellDiameter] = useState(34)
  // State for custom model upload
  const [customModel, setCustomModel] = useState()
  const [modelTypes] = useState(['SGN', 'CD3', 'MADM'])
  const [customModelType, setCustomModelType] = useState('')
  const [customModelName, setCustomModelName] = useState('')
  const [lastCustomModel, setLastCustomModel] = useState()
  const [lastCustomModelType, setLastCustomModelType] = useState('')
  const [lastCustomModelName, setLastCustomModelName] = useState('')
  // State for batch detection
  const [selectedFiles, setSelectedFiles] = useState([])
  // State for fine tuning
  const [fineTuneModels] = useState(['SGN', 'MADM'])
  const [currentFineTuneModel, setCurrentFineTuneModel] = useState(0)
  const [preTrainImages, setPreTrainImages] = useState(0)
  const [maxImages, setMaxImages] = useState(7)
  const [epochs, setEpochs] = useState(10)
  const [kFoldResults, setKFoldResults] = useState()
  const [fineTuneModelURL, setFineTuneModelURL] = useState()
  const [metricsData, setMetricsData] = useState()
  
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

    try {
        const res = await fetch('/upload', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) throw new Error('Upload failed')
        const data = await res.json()
        setImageURL(data.converted_url)
        setImageSize({width: data.dimensions[0], height: data.dimensions[1]})
        setAnnotations([])
    } catch(e) {
      alert('Upload failed: ' + (e.response?.data?.error || e.message))
    }
  }

  // Adds images selected by the user to the group to be used for batch detection
  function addToBatch(e) {
    const files = e.target.files;

    if (files && files.length > 0) {
      const newFiles = Array.from(files);
      setSelectedFiles((prevFiles) => [...prevFiles, ...newFiles]);
    }

    e.target.value = '';
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

      annotations.forEach((a) => {
        ctx.strokeStyle = classes[a.class].color
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
    formData.append('original_filename', `${imageName}`)
    formData.append('x', Math.round(box.x))
    formData.append('y', Math.round(box.y))
    formData.append('width', Math.round(box.w))
    formData.append('height', Math.round(box.h))

    try {
        const res = await fetch('/upload-cropped', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        })

        if (!res.ok) throw new Error('Crop failed')
        const data = await res.json()
        setImageURL(data.converted_url)
        
    } catch(e) {
      alert('Crop failed: ' + (e.response?.data?.error || e.message))
    }

    setIsCropping(false)
  }

  // const handleBrightnessChange = (event, newValue) => {
  //   setBrightness(newValue)
  // }

  // const handleContrastChange = (event, newValue) => {
  //   setContrast(newValue)
  // }

  // *----------* Annotation Operations *----------* \\

  const handleAddBox = (box) => {
    if (!box.class) {
      box.class = currentClass
    }
    if (imageURL) {
      setAnnotations(prev => [...prev, box])
    }
  }

  const handleRemoveBox = (box) => {
    setAnnotations(prev => prev.filter(b => b !== box))
  }

  const handleColorUpdate = (index, newColor) => {
    setClasses((prevClasses) => {
      // Create a copy of the array to maintain immutability
      const updated = [...prevClasses]
      updated[index] = { ...updated[index], color: newColor }
      return updated
    })
  }

  function clearAnnotations() {
    const confirm = window.confirm('Are you sure you want to delete all annotations? This cannot be undone!')
      if (!confirm) return
    
    setAnnotations([])
  }

  async function exportAnnotations() {
    const filename = imageName
    const imageWidth = imageSize.width
    const imageHeight = imageSize.height
    const yoloData = annotations.map(ann => {
      // Convert to normalized center coordinates
      const centerX = (ann.x + ann.w / 2) / imageWidth
      const centerY = (ann.y + ann.h / 2) / imageHeight
      const width = ann.w / imageWidth
      const height = ann.h / imageHeight
        
      return `${ann.class} ${centerX.toFixed(6)} ${centerY.toFixed(6)} ${width.toFixed(6)} ${height.toFixed(6)}`
    }).join('\n')

    fetch('/export-annotations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', 
      body: JSON.stringify({
        yolo_data: yoloData,
        original_filename: filename,
      }),
    })
    .then(async (res) => {
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`)
      }
      return res.blob() // Convert the response stream to a Blob
    })
    .then((blob) => {
      // Ensure the blob has the correct type
      const zipBlob = new Blob([blob], { type: 'application/zip' })
      
      // Create download link
      const downloadUrl = window.URL.createObjectURL(zipBlob)
      const link = document.createElement('a')

      link.href = downloadUrl
      link.setAttribute('download', `${imageName}_export.zip`)
      document.body.appendChild(link)
      link.click()

      // Cleanup
      window.URL.revokeObjectURL(downloadUrl)
      link.remove()
    })
    .catch((error) => {
      console.error('Export error:', error)
      alert(`Export failed: ${error.message}`)
    })
  }

  function importAnnotations(e) {
    const file = e.target.files[0]
    e.target.value = null
    console.log(file)
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

      setAnnotations([])
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

  // *----------* Detection Operations *----------* \\

  async function detect() {
    const formData = new FormData()

    let endpoint = ''
    let payload = null
    let headers = {}

    if (currentModel === 0) {
      endpoint = '/detect-sgn'
    } else if (currentModel === 1) {
      endpoint = '/detect-cd3'
    } else if (currentModel === 2) {
      endpoint = '/detect-madm'
    } else if (currentModel === 3) {
      if (!customModel) {
        alert('Please upload a custom model (.pt)')
        return
      }
      endpoint = '/detect-custom'
      formData.append('pt_file', customModel)
      formData.append('model_type', customModelType)
      formData.append('threshold', threshold)

      payload = formData
    } else {
      console.log('Invalid Model Selection')
      return
    }

    if (!payload) {
      payload = JSON.stringify({
        threshold: threshold
      })

      headers['Content-Type'] = 'application/json'
    }

    
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: payload,
        credentials: 'include',
      })
      console.log(res)
      if (!res.ok) throw new Error(`${models[currentModel]} detection failed`)
      const data = await res.json()
      
      const yoloTxt = data.annotations
      const imgWidth = data.image_width
      const imgHeight = data.image_height

      setAnnotations([])
      let importedCount = 0

      yoloTxt.split('\n').forEach(line => {
        if (!line.trim()) return
        const [clsStr, cxStr, cyStr, wStr, hStr] = line.trim().split(' ')
        const cls = parseInt(clsStr)
        const cx = parseFloat(cxStr) * imgWidth
        const cy = parseFloat(cyStr) * imgHeight
        const w = parseFloat(wStr) * imgWidth
        const h = parseFloat(hStr) * imgHeight
        const x1 = cx - w / 2
        const y1 = cy - h / 2

        handleAddBox({x: x1, y: y1, w: w, h: h, class: cls}) //TODO add isDetected

        importedCount++
      })

      alert(`Detected ${importedCount} ${models[currentModel]} objects!`)
    } catch (e) {
      alert('Detection failed: ' + (e.response?.data?.error || e.message))
    }
  }

  async function handleBatchDetect() {
    if (selectedFiles.length === 0) return alert('Please select images!');

    const formData = new FormData();

    if (currentModel === 0) {
      formData.append('detection_type', 'SGN')
    } else if (currentModel === 1) {
      formData.append('detection_type', 'CD3')
    } else if (currentModel === 2) {
      formData.append('detection_type', 'MADM')
    } else if (currentModel === 3) {
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
    try {
      const res = await fetch('/batch-detect', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error(`${models[currentModel]} batch detection failed`)
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'batch_results.zip';
      document.body.appendChild(a);
      a.click();

      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      handleCloseBatchModal()
      setSelectedFiles([])

    } catch (error) {
      console.error(error);
      alert(`Error: ${error.message}`)
    }
  }

  function handleLoadCustomModel(e) {
    const file = e.target.files[0]
    e.target.value = null
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pt')) {
        alert('Only .pt files are accepted.')
        e.target.value = ''
        return
    }
    
    setCustomModel(file)
    setCustomModelName(file.name)
    console.log(customModel)
  }

  function confirmCustom() {
    if (!customModel) {
      alert('Please upload a custom model (.pt)')
      return
    }

    if (customModelType === '') {
      alert('Please choose a model type')
      return
    }
    
    setLastCustomModel(customModel)
    setLastCustomModelName(customModelName)
    setLastCustomModelType(customModelType)

    handleCloseCustomUploadModal()
  }

  function cancelCustom() {
    setCustomModel(lastCustomModel)
    setCustomModelName(lastCustomModelName)
    setCustomModelType(lastCustomModelType)

    handleCloseCustomUploadModal()
  }

  async function handleFineTuneDetect() {
    try {
      const res = await fetch('/detect-finetuned', {
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

      setAnnotations([])
      let importedCount = 0

      yoloTxt.split('\n').forEach(line => {
        if (!line.trim()) return
        const [clsStr, cxStr, cyStr, wStr, hStr] = line.trim().split(' ')
        const cls = parseInt(clsStr)
        const cx = parseFloat(cxStr) * imgWidth
        const cy = parseFloat(cyStr) * imgHeight
        const w = parseFloat(wStr) * imgWidth
        const h = parseFloat(hStr) * imgHeight
        const x1 = cx - w / 2
        const y1 = cy - h / 2

        handleAddBox({x: x1, y: y1, w: w, h: h, class: cls}) //TODO add isDetected

        importedCount++
      })

      alert(`Detected ${importedCount} ${models[currentModel]} objects!`)
    } catch (e) {
      alert('Fine tuned detection failed: ' + (e.response?.data?.error || e.message))
    }
  }

  // *----------* Training Operations *----------* \\

  function saveTrainingData() {
    // Normalize annotations
    const normalizedAnnotations = annotations.map(ann => {
      const x_center = parseFloat(((ann.x + ann.w / 2) / imageSize.width).toFixed(6));
      const y_center = parseFloat(((ann.y + ann.h / 2) / imageSize.height).toFixed(6));
      const width_norm = parseFloat((ann.w / imageSize.width).toFixed(6));
      const height_norm = parseFloat((ann.h / imageSize.height).toFixed(6));
      let class_name = classes[ann.class].name
      if (ann.class !== 0 && ann.class !== 7) {
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
    
    fetch('/save-training-data', {
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
    .then(async (res) => {
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`)
      }
    })
    .then(alert('Training data saved!'))
  }

  function fineTune() {
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

    fetch('/train-saved', {
      method: 'POST',
      credentials: 'include', 
      body: formData
    })
    .then(async (res) => {
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`)
      }

      const resJson = await res.json()
      console.log(resJson.kfold_results)
      console.log(resJson.model_url)
      setKFoldResults(resJson.kfold_results)
      setFineTuneModelURL(resJson.model_url)
    })
    .then(() => {
      alert('Model fine tuned with saved data.');
      handleOpenFineTuneDownloadModal()
      handleCloseFineTuneModal()
  })
  .catch((err) => {
      console.error(err);
      alert('Training failed');
  });
  }

  function clearTrainingData() {
    const confirm = window.confirm('Are you sure you want to delete all training data? This cannot be undone!')
      if (!confirm) return

    fetch('/clear-training-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', 
    })
    .then(async (res) => {
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`)
      }
    })
    .then(alert('All training data has been cleared!'))
  }

  const handleModelDownload = async () => {
    try {
      // 1. Prepare the URL
      // If fineTuneModelURL is "/snapshots/my_model.pt", this prepends the backend host
      const downloadUrl = fineTuneModelURL
      console.log(downloadUrl)
      const res = await fetch(downloadUrl, {
        method: 'GET',
        credentials: 'include', // ⚠️ CRITICAL: Must be here to send cookies/session!
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

  function getMetrics() {
    fetch('/events-data', {
      method: 'GET'
    })
    .then(async (res) => {
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`)
      }

      const resJson = await res.json()
      console.log(resJson)
      setMetricsData(resJson)
    })
  }

  // *----------* Tab Menu Contents *----------* \\

  // Batch detect modal state
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const handleOpenBatchModal = () => {
    setBatchModalOpen(true)
  }
  const handleCloseBatchModal = () => {
    setBatchModalOpen(false)
  }

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
                <Button variant='contained' {...bindTrigger(popupState)} endIcon={<KeyboardArrowDownIcon />} sx={{...button_style_span, mt: 1}}>
                  {classes[currentClass].name}
                </Button>
                <Menu {...bindMenu(popupState)}>
                  {classes.map((item, index) => (
                    <MenuItem 
                      key={index}
                      onClick={() => {setCurrentClass(index)}}
                    >
                        <Typography variant='body1'>{item.name}</Typography>
                    </MenuItem>
                  ))}
                </Menu>
              </Fragment>
            )}
          </PopupState>
          <ColorMenu 
            items={classes} 
            onChange={handleColorUpdate} 
          />
          <Box sx={{pt: 1, borderTop: 1, borderColor: 'grey.500'}}>
            <Typography gutterBottom variant='body1' sx={{ fontWeight: 'bold' }}>
              Manage Annotations
            </Typography>
            <Button variant='contained' component='label' onClick={exportAnnotations} sx={{...button_style_span}}>
              Export Annotations
            </Button>
            <Button variant='contained' component='label' sx={{...button_style_span}}>
              Import Annotations
              <input hidden type='file' accept='txt' onChange={importAnnotations}/>
            </Button>
            <Button variant='contained' component='label' onClick={clearAnnotations} sx={{...button_style_span, bgcolor: 'error.dark'}}>
              Clear Annotations
            </Button>
            <Typography gutterBottom variant='body2' sx={{ fontWeight: 'bold' }}>
              Current Cells: {annotations.length}
            </Typography>
          </Box>
          <Box sx={{pt: 1, borderTop: 1, borderColor: 'grey.500'}}>
            <Typography gutterBottom variant='body1' sx={{ fontWeight: 'bold' }}>
              Train / Fine Tune
            </Typography>
            <Button variant='contained' component='label' onClick={saveTrainingData} sx={{...button_style_span}}>
              Save Training Data
            </Button>
            <Button variant='contained' component='label' onClick={clearTrainingData} sx={{...button_style_span, bgcolor: 'error.dark'}}>
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
          <Typography variant='body1' sx={{ pt: 1, fontWeight: 'bold' }}>
            Select Model
          </Typography>
          <PopupState variant='popover' popupId='model-popup-menu'>
            {(popupState) => (
              <Fragment>
                <Button variant='contained' {...bindTrigger(popupState)} endIcon={<KeyboardArrowDownIcon />} sx={{...button_style_span, mt: 1}}>
                  {models[currentModel]}
                </Button>
                <Menu {...bindMenu(popupState)}>
                  {models.map((item, index) => (
                    <MenuItem 
                      key={index}
                      onClick={() => {setCurrentModel(index)}}
                    >
                        <Typography variant='body1'>{item}</Typography>
                    </MenuItem>
                  ))}
                </Menu>
              </Fragment>
            )}
          </PopupState>
          <Button variant='contained' component='label' onClick={handleOpenCustomUploadModal} sx={{...button_style_span}}>
            Load Custom
          </Button>
          <Typography gutterBottom variant='body2' sx={{ fontWeight: 'bold' }}>
            Selected Model: {lastCustomModelName}
          </Typography>
          <Typography gutterBottom variant='body2' sx={{ fontWeight: 'bold' }}>
            Model Type: {lastCustomModelType}
          </Typography>
          <Modal
            open={customUploadModalOpen}
            onClose={cancelCustom}
          >
            <Box sx={{...modal_style}}>
              <Typography>Load Custom Model</Typography>
              <Button variant='contained' component='label'>
                Select File
                <input hidden type='file' accept='.pt' onChange={handleLoadCustomModel} />
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
              <Typography>Selected: {customModelName}</Typography>
              <Button onClick={confirmCustom}>Confirm</Button>
              <Button onClick={cancelCustom}>Cancel</Button>
            </Box>
          </Modal>
          <Box sx={{pt: 1, borderTop: 1, borderColor: 'grey.500'}}>
            <Typography gutterBottom variant='body1' sx={{ fontWeight: 'bold' }}>
              Detection Settings
            </Typography>
            <Box display='flex' flexDirection='row'>
              <Box sx={{width: '50%', display: 'flex', flexDirection: 'column', mr: 1}}>
                <TextField
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  type='number'
                  variant='outlined'
                  size='small'
                  slotProps={{ 
                    htmlInput: {
                      step: 0.1,
                      min: 0,
                      max: 1
                    }
                  }}
                  sx={{...button_style_span, mt: 'auto', mb: 0}}
                />
                <Typography gutterBottom variant='body2' sx={{ fontWeight: 'bold' }}>
                  Threshold <br /> (0-1)
                </Typography>
              </Box>
              <Box  sx={{width: '50%', display: 'flex', flexDirection: 'column', ml: 1}}>
                <TextField
                  value={cellDiameter}
                  onChange={(e) => setCellDiameter(Number(e.target.value))}
                  type='number'
                  variant='outlined'
                  size='small'
                  slotProps={{ 
                    htmlInput: {
                      step: 1,
                      min: 0
                    },
                  }}
                  sx={{...button_style_span, mt: 'auto', mb: 0}}
                />
                <Typography gutterBottom variant='body2' sx={{ fontWeight: 'bold' }}>
                  Average Cell Diameter
                </Typography>
              </Box>
            </Box>
          </Box>
          <Box display='flex' flexDirection='row'>
            <Button variant='contained' component='label' onClick={detect} sx={{...button_style_span, mr: 1}}>
              Single Detect
            </Button>
            <Button variant='contained' component='label' onClick={handleOpenBatchModal} sx={{...button_style_span, ml: 1}}>
              Batch Detect
            </Button>
            <Modal
              open={batchModalOpen}
              onClose={handleCloseBatchModal}
            >
              <Box sx={{...modal_style}}>
                <Typography>Batch Detect</Typography>
                <PopupState variant='popover' popupId='model-popup-menu'>
                  {(popupState) => (
                    <Fragment>
                      <Button variant='contained' {...bindTrigger(popupState)} endIcon={<KeyboardArrowDownIcon />}>
                        {models[currentModel]}
                      </Button>
                      <Menu {...bindMenu(popupState)}>
                        {models.map((item, index) => (
                          <MenuItem 
                            key={index}
                            onClick={() => {setCurrentModel(index)}}
                          >
                              <Typography variant='body1'>{item}</Typography>
                          </MenuItem>
                        ))}
                      </Menu>
                    </Fragment>
                  )}
                </PopupState>
                <Button variant='contained' component='label'>
                  Load Images
                  <input hidden type='file' multiple accept='image/tiff' onChange={addToBatch} />
                </Button>
                <Typography>{selectedFiles.length} files selected</Typography>
                <Button onClick={handleBatchDetect}>Process</Button>
                <Button onClick={handleCloseBatchModal}>Cancel</Button>
              </Box>
            </Modal>
          </Box>
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

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <SideMenu>
        <Typography gutterBottom variant='h6' fontWeight={'bold'}>
            Cell Annotation Tool (CAT🐱)
        </Typography>
        <Button variant='contained' component='label' sx={{...button_style_span}}>
          Load Image
          <input hidden type='file' accept='image/tiff' onChange={handleUpload}/>
        </Button>
        <Button variant='contained' component='label' onClick={handleSave} sx={{...button_style_span}}>
          Save Image
        </Button>
        <Button variant='contained' component='label' onClick={toggleCrop}  sx={{...button_style_span, bgcolor: isCropping ? 'primary.light' : 'primary.main',}}>
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

        <TabMenu items={tabs}></TabMenu>
      </SideMenu>

      <Box
				sx={{
					flexGrow: 1,
					display: 'flex',
					justifyContent: 'center',
					bgcolor: '#111',
				}}
			>
        <ImageCanvas src={imageURL} boxes={annotations} onAddBox={handleAddBox} 
          onRemoveBox={handleRemoveBox} isCropping={isCropping} onCrop={handleCrop}
          currentClass={currentClass} classes={classes} imageSize={imageSize}
          brightness={brightness} contrast={contrast}/>
      </Box>
    </Box>
  )
}

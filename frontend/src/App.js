import { Box } from '@mui/material'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import CellAnnotationTool from './pages/CellAnnotationTool'
import ErrorBoundary from './components/ErrorBoundary'

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00e5ff',
      light: '#6effff',
      dark: '#00b2cc',
      contrastText: '#000000',
    },
    secondary: {
      main: '#00e5ff',
    },
    background: {
      default: '#0a0a0f',
      paper: 'rgba(18, 18, 24, 0.92)',
    },
    text: {
      primary: 'rgba(255,255,255,0.87)',
      secondary: 'rgba(255,255,255,0.5)',
      disabled: 'rgba(255,255,255,0.3)',
    },
    divider: 'rgba(255,255,255,0.08)',
    error: {
      main: '#b04e4e',
      dark: '#6a3939',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          textTransform: 'none',
          fontWeight: 600,
          letterSpacing: '0.03em',
        },
        containedPrimary: {
          background: 'rgba(55, 83, 86, 0.15)',
          color: '#00e5ff',
          border: '1px solid rgba(0, 229, 255, 0.3)',
          boxShadow: 'none',
          '&:hover': {
            background: 'rgba(0, 229, 255, 0.25)',
            boxShadow: '0 0 12px rgba(0, 229, 255, 0.2)',
            border: '1px solid rgba(0, 229, 255, 0.6)',
          },
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: { color: '#00e5ff' },
        track: { border: 'none' },
        thumb: {
          '&:hover, &.Mui-focusVisible': {
            boxShadow: '0 0 0 8px rgba(0, 229, 255, 0.16)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
            '&:hover fieldset': { borderColor: 'rgba(0, 229, 255, 0.4)' },
            '&.Mui-focused fieldset': { borderColor: '#00e5ff' },
          },
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          background: 'rgba(18, 18, 24, 0.98)',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(8px)',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          '&:hover': { background: 'rgba(0, 229, 255, 0.08)' },
          '&.Mui-selected': { background: 'rgba(0, 229, 255, 0.15)' },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          background: 'rgba(18, 18, 24, 0.98)',
          border: '1px solid rgba(255,255,255,0.08)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          background: 'rgba(25, 25, 25, 0.92)',
        },
      },
    },
  },
  typography: {
    fontFamily: '"IBM Plex Mono", "Courier New", monospace',
    button: {
      fontFamily: '"IBM Plex Mono", "Courier New", monospace',
    },
  },
})

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <CellAnnotationTool />
      </ErrorBoundary>
    </ThemeProvider>
  )
}

export default App
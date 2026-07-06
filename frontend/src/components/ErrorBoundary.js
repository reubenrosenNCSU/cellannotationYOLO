import { Component } from 'react'
import { Box, Typography, Button } from '@mui/material'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    // Surface the full stack in the console so a screenshot/copy-paste of
    // devtools is enough to diagnose a crash without a dev build.
    console.error('Uncaught error in component tree:', error, errorInfo.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <Box sx={{
          height: '100vh',
          width: '100vw',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          p: 4,
          textAlign: 'center',
          bgcolor: 'background.default',
          color: 'text.primary',
        }}>
          <Typography variant="h6">Something went wrong.</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 500 }}>
            {this.state.error.message || String(this.state.error)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Check the browser console (F12) for the full error, then reload.
          </Typography>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </Box>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary

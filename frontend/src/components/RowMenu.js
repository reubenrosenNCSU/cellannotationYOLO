import { Box, Button, IconButton, Stack, Typography } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'

const RowMenu = ({ rows, onChange, onDelete, onAdd, onSelect, selectedRowId, renderRowTemplate, headers, gridTemplateColumns }) => {
  return (
    <Box>
      {headers && headers.length > 0 && (
        <Box 
          display="grid" 
          gridTemplateColumns={gridTemplateColumns || `repeat(${headers.length}, 1fr)`} 
          gap={2} 
          sx={{ 
            mb: 1,
            pr: '40px'
          }} 
        >
          {headers.map((header, idx) => (
            <Typography 
              key={idx} 
              variant="subtitle2" 
              color="text.secondary" 
              sx={{ fontWeight: 'bold' }}
            >
              {header}
            </Typography>
          ))}
        </Box>
      )}

      <Stack spacing={1} sx={{ width: '100%', mt: 1 }}>
        {rows.map((row, index) => {
          const isSelected = row.id === selectedRowId
          return (
            <Box 
              key={row.id}
              display='flex'
              flexDirection="row"
              alignItems="center"
              onClick={() => onSelect?.(row.id)}
              sx={{
                position: 'relative',
                borderRadius: 1,
                border: '2px solid',
                borderColor: isSelected ? 'primary.main' : 'transparent',
                bgcolor: isSelected ? 'action.selected' : 'action.hover',
                cursor: 'pointer',
                px: 1,
                py: 0.5,
                transition: 'border-color 0.15s, background-color 0.15s',
                '&:hover': {
                  borderColor: isSelected ? 'primary.main' : 'primary.light',
                  bgcolor: isSelected ? 'action.selected' : 'action.hover',
                }
              }}
            >
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                {renderRowTemplate(row, index, (fieldName, value) => onChange(index, fieldName, value))}
              </Box>

              <IconButton 
                color="error" 
                onClick={(e) => {
                  e.stopPropagation() // Prevent row selection when deleting
                  onDelete(index)
                }}
              >
                <DeleteIcon />
              </IconButton>
            </Box>
          )
        })}

        <Button 
          variant="contained" 
          startIcon={<AddIcon />} 
          onClick={onAdd}
          sx={{ alignSelf: 'flex-start' }}
        >
          Add Row
        </Button>
      </Stack>
    </Box>
  )
}

export default RowMenu
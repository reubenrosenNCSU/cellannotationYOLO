import { Box, Button, IconButton, Stack, Typography } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'

const RowMenu = ({ rows, onChange, onDelete, onAdd, renderRowTemplate, headers, gridTemplateColumns }) => {
  return (
    <Box>
      {headers && headers.length > 0 && (
        <Box 
          display="grid" 
          // Uses the exact grid layout passed by the parent, or defaults to an equal split
          gridTemplateColumns={gridTemplateColumns || `repeat(${headers.length}, 1fr)`} 
          gap={2} 
          sx={{ 
            mb: 1,
            pr: '40px' // Masks out the space occupied by the delete icon below
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

      <Stack spacing={2} sx={{ width: '100%', mt: 1 }}>
        {rows.map((row, index) => (
          <Box 
            key={row.id}
            display='flex'
            flexDirection="row"
            sx={{
              position: 'relative',
            }}
          >
            {/* Dynamically render whatever the parent passed as a template */}
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              {renderRowTemplate(row, index, (fieldName, value) => onChange(index, fieldName, value))}
            </Box>

            {/* Delete Button */}
            <IconButton color="error" onClick={() => onDelete(index)}>
                <DeleteIcon />
            </IconButton>
          </Box>
        ))}

        {/* Add Row Button */}
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
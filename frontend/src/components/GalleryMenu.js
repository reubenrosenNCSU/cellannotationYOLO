import React from 'react';
import { 
  Dialog, 
  DialogContent, 
  Box, 
  Button, 
  ImageList, 
  ImageListItem, 
  DialogTitle,
  IconButton
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const  GalleryMenu = ({ open, handleClose, images, onImageClick, onButtonClick }) => {
  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      fullWidth 
      maxWidth="md" // Adjust size as needed (xs, sm, md, lg, xl)
    >
      <DialogTitle sx={{ m: 0, p: 2 }}>
        Select an Image
        <IconButton
          onClick={handleClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <ImageList cols={3} gap={8}>
          {images.map((img, index) => (
            <Box>
              <ImageListItem 
                key={index} 
                onClick={() => onImageClick(img)}
                sx={{ cursor: 'pointer', '&:hover': { opacity: 0.8 } }}
              >
                <img
                  src={img.url}
                  alt={img.title || `image-${index}`}
                  loading="lazy"
                  style={{ borderRadius: '4px' }}
                />
              </ImageListItem>
              <Button 
                variant="contained" 
                onClick={onButtonClick}
              >
                Delete
              </Button>
            </Box>
          ))}
        </ImageList>
      </DialogContent>
    </Dialog>
  );
};

export default GalleryMenu;
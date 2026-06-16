import React, { useState } from "react";
import { Drawer, Box, IconButton } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

export default function SideMenu({ 
    children, 
    anchorSide = "left", 
    open: controlledOpen, 
    onClose,
    zIndex = 1200 // Added prop to handle stacking depth
}) {
    const [internalOpen, setInternalOpen] = useState(true);
    
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;

    const drawerWidth = 280;
    const isLeft = anchorSide === "left";

    const handleToggle = () => {
        if (isControlled) {
            if (onClose) onClose();
        } else {
            setInternalOpen(!internalOpen);
        }
    };

    const getIcon = () => {
        if (isLeft) {
            return open ? <ChevronLeftIcon /> : <ChevronRightIcon />;
        } else {
            return open ? <ChevronRightIcon /> : <ChevronLeftIcon />;
        }
    };

    // Hide tab button completely if it's controlled (modal mode) AND closed
    const shouldShowTabButton = !isControlled

    return (
        <Box 
            sx={{ 
                display: "flex",
                position: isControlled ? "absolute" : "relative",
                top: isControlled ? 0 : "auto",
                [anchorSide]: isControlled ? 0 : "auto",
                height: isControlled ? "100%" : "auto",
                zIndex: zIndex,
            }}
        >
            <Drawer
                variant="permanent"
                anchor={anchorSide}
                sx={{
                    width: open ? drawerWidth : 0,
                    flexShrink: 0,
                    zIndex: zIndex, // Apply zIndex here to stack entire drawers
                    transition: (theme) => theme.transitions.create("width", {
                        easing: theme.transitions.easing.sharp,
                        duration: theme.transitions.duration.shorter,
                    }),
                    "& .MuiDrawer-paper": {
                        width: drawerWidth,
                        boxSizing: "border-box",
                        p: 0, 
                        top: 'auto', 
                        height: '100%',
                        transform: open ? "none" : `translateX(${isLeft ? '-100%' : '100%'})`,
                        transition: (theme) => theme.transitions.create("transform", {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.shorter,
                        }),
                        overflow: "visible", 
                        borderLeft: isLeft ? "none" : "1px solid rgba(0, 0, 0, 0.12)",
                        borderRight: isLeft ? "1px solid rgba(0, 0, 0, 0.12)" : "none",
                        zIndex: zIndex, // Also apply to the paper element
                        bgcolor: "background.paper", // Ensures underlying drawers are completely blocked out
                    },
                }}
            >
                {/* The Floating Tab Button */}
                {shouldShowTabButton && (
                    <IconButton
                        onClick={handleToggle}
                        sx={{
                            position: "absolute",
                            top: 24,
                            [isLeft ? "right" : "left"]: -40, 
                            bgcolor: "primary.main", 
                            color: "white",
                            borderRadius: isLeft ? "0 8px 8px 0" : "8px 0 0 8px",
                            border: 1,
                            borderColor: "primary.main",
                            zIndex: zIndex + 1, // Stay slightly above the drawer
                            width: 40,
                            height: 40,
                            boxShadow: 4,
                            "&:hover": { bgcolor: "primary.dark" },
                        }}
                    >
                        {getIcon()}
                    </IconButton>
                )}

                {/* Scrollable Content Container */}
                <Box 
                    sx={{ 
                        height: "100%",
                        overflowY: "auto", 
                        overflowX: "hidden",
                        p: 2, 
                        opacity: open ? 1 : 0, 
                        transition: 'opacity 0.2s',
                        '&::-webkit-scrollbar': { width: '6px' },
                        '&::-webkit-scrollbar-thumb': {
                            backgroundColor: 'rgba(0,0,0,0.1)',
                            borderRadius: '10px',
                        },
                    }}
                >
                    {children}
                </Box>
            </Drawer>
        </Box>
    );
}
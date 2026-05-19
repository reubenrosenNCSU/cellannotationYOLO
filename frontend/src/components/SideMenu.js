import React, { useState } from "react";
import { Drawer, Box, IconButton } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

export default function SideMenu({ children, anchorSide = "left" }) {
    const [open, setOpen] = useState(true);
    const drawerWidth = 280;
    const isLeft = anchorSide === "left";

    const getIcon = () => {
        if (isLeft) {
            return open ? <ChevronLeftIcon /> : <ChevronRightIcon />;
        } else {
            return open ? <ChevronRightIcon /> : <ChevronLeftIcon />;
        }
    };

    return (
        <Box sx={{ display: "flex" }}>
            <Drawer
                variant="permanent"
                anchor={anchorSide}
                sx={{
                    width: open ? drawerWidth : 0,
                    flexShrink: 0,
                    transition: (theme) => theme.transitions.create("width", {
                        easing: theme.transitions.easing.sharp,
                        duration: theme.transitions.duration.shorter,
                    }),
                    "& .MuiDrawer-paper": {
                        width: drawerWidth,
                        boxSizing: "border-box",
                        // Remove padding so it doesn't affect the scrollbar track
                        p: 0, 
                        top: '64px', 
                        height: 'calc(100vh - 64px)',
                        transform: open ? "none" : `translateX(${isLeft ? '-100%' : '100%'})`,
                        transition: (theme) => theme.transitions.create("transform", {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.shorter,
                        }),
                        // Ensure the drawer itself doesn't scroll so the button stays put
                        overflow: "visible", 
                        borderLeft: isLeft ? "none" : "1px solid rgba(0, 0, 0, 0.12)",
                        borderRight: isLeft ? "1px solid rgba(0, 0, 0, 0.12)" : "none",
                    },
                }}
            >
                {/* The Floating Tab Button */}
                <IconButton
                    onClick={() => setOpen(!open)}
                    sx={{
                        position: "absolute",
                        top: 24,
                        [isLeft ? "right" : "left"]: -40, 
                        bgcolor: "primary.main", // Changed to a standard MUI color for visibility
                        color: "white",
                        borderRadius: isLeft ? "0 8px 8px 0" : "8px 0 0 8px",
                        border: 1,
                        borderColor: "primary.main",
                        zIndex: 1201,
                        width: 40,
                        height: 40,
                        boxShadow: 4,
                        "&:hover": { bgcolor: "primary.dark" },
                    }}
                >
                    {getIcon()}
                </IconButton>

                {/* Scrollable Content Container */}
                <Box 
                    sx={{ 
                        height: "100%",
                        overflowY: "auto", 
                        overflowX: "hidden",
                        p: 2, // Re-apply padding here for the content
                        opacity: open ? 1 : 0, 
                        transition: 'opacity 0.2s',
                        /* Custom Scrollbar Styling (Optional) */
                        '&::-webkit-scrollbar': {
                            width: '6px',
                        },
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
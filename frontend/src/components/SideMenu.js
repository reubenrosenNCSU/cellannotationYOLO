import React, { useState } from "react";
import { Drawer, Box, IconButton, Tooltip } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

export default function SideMenu({ children, anchorSide = "left" }) {
    const [open, setOpen] = useState(true);
    const drawerWidth = 280;
    const isLeft = anchorSide === "left";

    // Helper: Determine which icon to show
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
                        p: 2,
                        // Slide off-screen based on side
                        transform: open ? "none" : `translateX(${isLeft ? '-100%' : '100%'})`,
                        transition: (theme) => theme.transitions.create("transform", {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.shorter,
                        }),
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
                        // Position tab on the "inside" edge (facing the content)
                        [isLeft ? "right" : "left"]: -40, 
                        bgcolor: "primary.main",
                        color: "white",
                        // Round the corners that face the main content
                        borderRadius: isLeft ? "0 8px 8px 0" : "8px 0 0 8px",
                        zIndex: 1201,
                        width: 40,
                        height: 40,
                        boxShadow: 4,
                        "&:hover": { bgcolor: "primary.dark" },
                    }}
                >
                    {getIcon()}
                </IconButton>

                <Box sx={{ opacity: open ? 1 : 0, transition: 'opacity 0.2s' }}>
                    {children}
                </Box>
            </Drawer>
        </Box>
    );
}
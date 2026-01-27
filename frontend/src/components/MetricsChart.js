import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Box, Paper, Typography, useTheme } from '@mui/material';

// Register the specific Chart.js components we need
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const MetricsChart = ({ data }) => {
  const theme = useTheme();

  // Your specific color palette
  const COLORS = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', 
    '#9966FF', '#FF9F40', '#8AC926', '#1982C4'
  ];

  // Transform backend data into Chart.js format
  const chartData = useMemo(() => {
    // Return empty shell if data is missing
    if (!data || Object.keys(data).length === 0) {
      return { labels: [], datasets: [] };
    }

    // 1. Get x-axis labels (steps) from the first metric found
    const firstMetricKey = Object.keys(data)[0];
    const steps = data[firstMetricKey].map(point => point.step);

    // 2. Build datasets
    // We use a simple counter to cycle through colors
    let colorIndex = 0;

    const datasets = Object.entries(data).map(([metricName, points]) => {
      const color = COLORS[colorIndex % COLORS.length];
      colorIndex++;

      return {
        label: metricName,
        data: points.map(p => p.value),
        borderColor: color,
        backgroundColor: color,
        pointBackgroundColor: color,
        fill: false,
        tension: 0.2, // Adds that slight curve to the lines
        pointRadius: 3, // Size of dots
        pointHoverRadius: 6
      };
    });

    return { labels: steps, datasets };
  }, [data]);

  // Chart Configuration Options
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
            usePointStyle: true,
            boxWidth: 8
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Epoch / Step' },
        grid: { display: false } // Cleaner look
      },
      y: {
        title: { display: true, text: 'Metric Value' },
        border: { dash: [4, 4] } // Dotted grid lines
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  };

  return (
    <Paper 
      elevation={3} 
      sx={{ 
        p: 3, 
        mt: 4, 
        borderRadius: 2,
        width: '100%', 
        height: '500px', // Fixed height container
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Typography variant="h6" gutterBottom component="div" sx={{ fontWeight: 'bold' }}>
        Training Metrics
      </Typography>
      
      <Box sx={{ flexGrow: 1, position: 'relative', minHeight: 0 }}>
        {/* The Line component will automatically fill this Box */}
        <Line options={options} data={chartData} />
      </Box>
    </Paper>
  );
};

export default MetricsChart;
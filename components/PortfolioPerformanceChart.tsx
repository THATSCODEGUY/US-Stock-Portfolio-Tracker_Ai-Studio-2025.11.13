import React, { useEffect, useRef } from 'react';
import { type HistoricalDataPoint } from '../types';

declare global {
    interface Window {
        Chart: any;
    }
}

interface PortfolioPerformanceChartProps {
    data: HistoricalDataPoint[];
}

export const PortfolioPerformanceChart: React.FC<PortfolioPerformanceChartProps> = ({ data }) => {
    const chartRef = useRef<HTMLCanvasElement | null>(null);
    const chartInstance = useRef<any>(null);

    useEffect(() => {
        if (!chartRef.current || !window.Chart) return;
        
        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');

        const chartData = {
            labels: data.map(d => d.date),
            datasets: [{
                label: 'Portfolio Value',
                data: data.map(d => d.value),
                borderColor: '#10b981', // green-accent
                backgroundColor: gradient,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointBackgroundColor: '#10b981',
                tension: 0.1,
                fill: true,
            }]
        };
        
        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: {
                        color: '#9ca3af', // gray-400
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 7,
                    },
                    grid: {
                        color: 'rgba(156, 163, 175, 0.1)' // gray-400 with opacity
                    }
                },
                y: {
                    ticks: {
                        color: '#9ca3af', // gray-400
                        callback: function(value: number) {
                             if (value >= 1000000) return '$' + (value / 1000000) + 'M';
                             if (value >= 1000) return '$' + (value / 1000) + 'K';
                             return '$' + value;
                        }
                    },
                    grid: {
                        color: 'rgba(156, 163, 175, 0.1)' // gray-400 with opacity
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context: any) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            interaction: {
                mode: 'index',
                intersect: false,
            },
        };

        if (chartInstance.current) {
            chartInstance.current.data = chartData;
            chartInstance.current.options = chartOptions;
            chartInstance.current.update();
        } else {
            chartInstance.current = new window.Chart(ctx, {
                type: 'line',
                data: chartData,
                options: chartOptions
            });
        }

    }, [data]);
    
    if (data.length === 0) {
        return (
             <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400 shadow-lg h-80 flex items-center justify-center">
                <div>
                    <h3 className="text-xl font-semibold mb-2">No Performance Data</h3>
                    <p>Add transactions to see your portfolio's performance over time.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg p-4 h-80">
            <canvas ref={chartRef}></canvas>
        </div>
    );
};

// scripts/components/data-chart.js — I7 引入
//
// Chart.js 包装。解决两个常见问题：
//   1. 同一 canvas 多次 new Chart() → 内存泄漏
//   2. 实时追加数据 → 不能重画,要静默 update
//
// 依赖：window.Chart (通过 index.html CDN 加载)
//
// 用法：
//   renderChart(canvas, { labels, values }, { label: '温度' });
//   appendPoint(canvas, { label: '12:00:00', value: 25.3 });

const instances = new WeakMap();   // canvas → Chart 实例

/**
 * 在 canvas 上渲染折线图。
 * 如果已有旧实例，先 destroy。
 */
export function renderChart(canvas, data, options = {}) {
    if (typeof window.Chart === 'undefined') {
        console.error('[chart] Chart.js 未加载,请检查 index.html 的 CDN 引入');
        return null;
    }
    // 清理旧实例
    if (instances.has(canvas)) {
        instances.get(canvas).destroy();
    }

    const chart = new window.Chart(canvas, {
        type: 'line',
        data: {
            labels: data.labels || [],
            datasets: [{
                label: options.label || '数值',
                data: data.values || [],
                borderColor: options.color || '#3498db',
                backgroundColor: options.bgColor || 'rgba(52, 152, 219, 0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: 2,
                pointHoverRadius: 4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 200 },
            scales: {
                y: { beginAtZero: options.beginAtZero !== false },
            },
            plugins: {
                legend: { display: !!options.label },
            },
        },
    });

    instances.set(canvas, chart);
    return chart;
}

/**
 * 追加一个数据点。静默 update,不闪。
 * 自动限长 maxPoints（默认 200）。
 */
export function appendPoint(canvas, point, maxPoints = 200) {
    const chart = instances.get(canvas);
    if (!chart) return;

    const label = point.label || new Date().toLocaleTimeString();
    const value = Number(point.value ?? 0);

    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(value);

    if (chart.data.labels.length > maxPoints) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
    chart.update('none');
}

/**
 * 清空图表数据。
 */
export function clearChart(canvas) {
    const chart = instances.get(canvas);
    if (!chart) return;
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update('none');
}

/**
 * 销毁图表（页面切走时调）。
 */
export function destroyChart(canvas) {
    if (instances.has(canvas)) {
        instances.get(canvas).destroy();
        instances.delete(canvas);
    }
}

/**
 * charts.js – Chart.js wrappers for Calorite
 */

const Charts = (() => {
  let weeklyChart = null;
  let macroChart  = null;

  const COLORS = {
    calories: '#f97316',
    protein:  '#22d3ee',
    carbs:    '#a78bfa',
    fat:      '#fb7185',
    water:    '#38bdf8',
    grid:     'rgba(255,255,255,0.06)',
    text:     '#8892aa',
  };

  Chart.defaults.color = COLORS.text;
  Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";

  // ---- Weekly calorie bar chart ----
  function renderWeekly(canvasId, weekData, calorieGoal) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const labels = weekData.map(d => {
      const [, , dd] = d.dateStr.split('-');
      const date = new Date(d.dateStr + 'T00:00:00');
      return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
    });

    const values   = weekData.map(d => d.totals.calories);
    const bgColors = values.map(v =>
      v >= calorieGoal ? 'rgba(74,222,128,0.75)' : 'rgba(249,115,22,0.75)'
    );
    const borderColors = values.map(v =>
      v >= calorieGoal ? '#4ade80' : '#f97316'
    );

    if (weeklyChart) weeklyChart.destroy();

    weeklyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Calories',
            data: values,
            backgroundColor: bgColors,
            borderColor: borderColors,
            borderWidth: 1,
            borderRadius: 6,
          },
          {
            label: 'Goal',
            data: new Array(weekData.length).fill(calorieGoal),
            type: 'line',
            borderColor: 'rgba(249,115,22,0.4)',
            borderDash: [5, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        animation: { duration: 300 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y} kcal`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: COLORS.grid },
            ticks: { maxRotation: 0, font: { size: 11 } },
          },
          y: {
            grid: { color: COLORS.grid },
            beginAtZero: true,
            ticks: {
              font: { size: 11 },
              callback: v => v.toLocaleString(),
            },
          },
        },
      },
    });
  }

  // ---- Macro donut chart ----
  function renderMacros(canvasId, totals) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const protein = totals.protein || 0;
    const carbs   = totals.carbs   || 0;
    const fat     = totals.fat     || 0;
    const total   = protein + carbs + fat;

    if (macroChart) macroChart.destroy();

    if (total === 0) {
      macroChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['No data'],
          datasets: [{ data: [1], backgroundColor: ['rgba(255,255,255,0.07)'], borderWidth: 0 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          animation: { duration: 300 },
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
          cutout: '72%',
        },
      });
      return;
    }

    macroChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Protein', 'Carbs', 'Fat'],
        datasets: [{
          data: [protein, carbs, fat],
          backgroundColor: [COLORS.protein, COLORS.carbs, COLORS.fat],
          borderColor: 'transparent',
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        animation: { duration: 300 },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 12,
              boxWidth: 10,
              font: { size: 11 },
              generateLabels: (chart) => {
                const data = chart.data;
                return data.labels.map((label, i) => {
                  const val = data.datasets[0].data[i];
                  const pct = total > 0 ? Math.round(val / total * 100) : 0;
                  return {
                    text: `${label} ${val}g (${pct}%)`,
                    fillStyle: data.datasets[0].backgroundColor[i],
                    hidden: false,
                    index: i,
                  };
                });
              },
            },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.parsed}g`,
            },
          },
        },
        cutout: '72%',
      },
    });
  }

  return { renderWeekly, renderMacros };
})();

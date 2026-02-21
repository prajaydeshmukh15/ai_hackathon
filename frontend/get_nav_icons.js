
const fs = require('fs');

const icons = [
    'Home01',
    'LineChartUp01',
    'PieChart01',
    'AlertCircle',
    'BarChart01',
    'LayoutGrid01',
    'TrendUp01'
];

try {
    const base = 'node_modules/@untitledui/icons/dist';
    icons.forEach(icon => {
        try {
            const p = `${base}/${icon}.js`;
            if (fs.existsSync(p)) {
                const c = fs.readFileSync(p, 'utf8');
                const match = c.match(/d: "([^"]+)"/);
                if (match) {
                    console.log(`${icon}: ${match[1]}`);
                } else {
                    console.log(`${icon}: NO_PATH_FOUND`);
                }
            } else {
                console.log(`${icon}: FILE_NOT_FOUND`);
            }
        } catch (e) {
            console.log(`${icon}: ERROR ${e.message}`);
        }
    });
} catch (err) {
    console.error("Critical error", err);
}

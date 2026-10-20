import {
    type BenchmarkChange,
    type BenchmarkChangeStatus,
    type BenchmarkComparison,
    formatSignedPercent,
} from './benchmark-regression.ts';
import { formatInteger } from './benchmark-results.ts';
import { svgRect, svgText, svgTextLines, wrapWords } from './svg.ts';

const SVG_WIDTH = 1120;
const MAX_CHANGES_PER_DIRECTION = 12;
const SVG_THEMES = {
    light: {
        background: '#FFFFFF',
        surface: '#F6F8FA',
        foreground: '#1F2328',
        muted: '#59636E',
        rule: '#D1D9E0',
        grid: '#E7ECF0',
        regression: '#CF222E',
        improvement: '#1A7F37',
        jitter: '#FFF8C5',
        jitterEdge: '#D4A72C',
        neutral: '#68727D',
    },
    dark: {
        background: '#0D1117',
        surface: '#161B22',
        foreground: '#E6EDF3',
        muted: '#8B949E',
        rule: '#30363D',
        grid: '#252C34',
        regression: '#FF7B72',
        improvement: '#3FB950',
        jitter: '#3D2E00',
        jitterEdge: '#9E6A03',
        neutral: '#8B949E',
    },
} as const;

type SvgThemeName = keyof typeof SVG_THEMES;

/** Renders light- and dark-theme SVG charts from the same benchmark comparison. */
export function formatBenchmarkChangeSvgs(comparison: BenchmarkComparison): { dark: string; light: string } {
    return {
        dark: renderBenchmarkSvg(comparison, 'dark'),
        light: renderBenchmarkSvg(comparison, 'light'),
    };
}

function renderBenchmarkSvg(comparison: BenchmarkComparison, themeName: SvgThemeName): string {
    const theme = SVG_THEMES[themeName];
    const regressions = comparison.regressions.slice(0, MAX_CHANGES_PER_DIRECTION);
    const improvements = comparison.improvements.slice(0, MAX_CHANGES_PER_DIRECTION);
    const visibleChanges = [...regressions, ...improvements];
    const withinJitterCount = comparison.changes.filter(({ status }) => status === 'within-jitter').length;
    const skippedCount = comparison.skippedWorkloads.length;
    const medianChange =
        comparison.medianChangePercent === null ? 'n/a' : formatSignedPercent(comparison.medianChangePercent);
    const sizeColumns = 3;
    const sizeCardWidth = 344;
    const sizeCardHeight = 62;
    const sizeCardGap = 10;
    const sizeRows = Math.ceil(comparison.engineSizes.length / sizeColumns);
    const sizeSectionTop = 184;
    const sizeCardsTop = sizeSectionTop + 24;
    const sizeSectionBottom = sizeCardsTop + sizeRows * (sizeCardHeight + sizeCardGap);
    const timingHeadingTop = Math.max(sizeSectionBottom + 20, sizeCardsTop + 16);
    const maximumChange = Math.max(
        25,
        comparison.thresholdPercent * 1.5,
        ...visibleChanges.map(({ changePercent }) => Math.abs(changePercent)),
    );
    const axisMaximum = Math.ceil(maximumChange * 1.08);
    const plotX = 480;
    const plotWidth = 520;
    const zeroX = plotX + plotWidth / 2;
    const changeColumnX = 1012;
    const plotScale = plotWidth / 2 / axisMaximum;
    const rowLayouts: {
        change: BenchmarkChange;
        top: number;
        height: number;
        areaLines: string[];
        engineLines: string[];
        contextLines: string[];
    }[] = [];
    let cursorY = timingHeadingTop + 62;

    for (const changes of [regressions, improvements]) {
        if (changes.length === 0) continue;
        cursorY += 22;
        for (const change of changes) {
            const areaLines = wrapWords(change.workloadArea, 48);
            const engineLines = wrapWords(`${change.workload} · ${change.engineLabel}`, 72);
            const contextLines = wrapWords(
                `${change.workloadProvenance} · ${formatInputsPerSample(change.operationsPerSample)} · median ${formatMilliseconds(change.baselineMedianMs)} → ${formatMilliseconds(change.currentMedianMs)} ms`,
                72,
            );
            const contentHeight = areaLines.length * 15 + engineLines.length * 12 + contextLines.length * 12;
            const height = Math.max(46, contentHeight + 6);
            rowLayouts.push({ change, top: cursorY, height, areaLines, engineLines, contextLines });
            cursorY += height;
        }
    }

    const plotTop = timingHeadingTop + 64;
    const plotBottom = Math.max(plotTop + 62, cursorY + 2);
    const chartHeight = plotBottom + 58;
    const parts: string[] = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${chartHeight}" viewBox="0 0 ${SVG_WIDTH} ${chartHeight}" role="img" aria-labelledby="chart-title chart-description">`,
        `<title id="chart-title">Runtime benchmark changes, ${themeName} theme</title>`,
        '<desc id="chart-description">Benchmark timing medians, engine component sizes, and workload changes outside the jitter threshold.</desc>',
        `<rect width="${SVG_WIDTH}" height="${chartHeight}" fill="${theme.background}"/>`,
        svgText(32, 42, 'Runtime benchmark changes', theme.foreground, 25, 700),
        svgText(
            32,
            66,
            `Lower time is better · bars show median change · jitter threshold ±${comparison.thresholdPercent}%`,
            theme.muted,
            13,
        ),
    ];

    const regressionCount = comparison.regressions.length;
    const improvementCount = comparison.improvements.length;
    const summaryCards = [
        { label: 'PAIRS', value: formatInteger(comparison.changes.length), color: theme.foreground },
        { label: 'REGRESSIONS', value: formatInteger(regressionCount), color: theme.regression },
        { label: 'IMPROVEMENTS', value: formatInteger(improvementCount), color: theme.improvement },
        { label: 'WITHIN JITTER', value: formatInteger(withinJitterCount), color: theme.jitterEdge },
        { label: 'MEDIAN CHANGE', value: medianChange, color: theme.foreground },
        { label: 'SKIPPED', value: formatInteger(skippedCount), color: theme.muted },
    ];
    const summaryTop = 82;
    const summaryCardWidth = 168;
    const summaryCardHeight = 70;
    const summaryGap = 8;
    for (const [index, card] of summaryCards.entries()) {
        const x = 32 + index * (summaryCardWidth + summaryGap);
        parts.push(
            svgRect(x, summaryTop, summaryCardWidth, summaryCardHeight, 8, theme.surface, theme.rule),
            svgText(x + 12, summaryTop + 24, card.label, theme.muted, 10, 700),
            svgText(x + 12, summaryTop + 52, card.value, card.color, 21, 700, 'mono'),
        );
    }

    parts.push(
        svgText(32, sizeSectionTop, 'COMPONENT SIZE BY ENGINE', theme.foreground, 12, 700),
        svgText(1088, sizeSectionTop, 'Current build · change vs QuickJS', theme.muted, 11, 400, 'ui', 'end'),
    );
    const quickjsSize = comparison.engineSizes.find(({ engineId }) => engineId === 'quickjs')?.binarySizeBytes;
    if (comparison.engineSizes.length === 0) {
        parts.push(svgText(32, sizeCardsTop + 20, 'Component size data unavailable', theme.muted, 12));
    }
    for (const [index, engine] of comparison.engineSizes.entries()) {
        const column = index % sizeColumns;
        const row = Math.floor(index / sizeColumns);
        const x = 32 + column * (sizeCardWidth + sizeCardGap);
        const y = sizeCardsTop + row * (sizeCardHeight + sizeCardGap);
        const delta = sizeDelta(engine.binarySizeBytes, quickjsSize, engine.engineId === 'quickjs');
        parts.push(
            svgRect(x, y, sizeCardWidth, sizeCardHeight, 8, theme.surface, theme.rule),
            svgText(x + 12, y + 21, engine.engineLabel, theme.foreground, 12, 600),
            svgText(x + 12, y + 45, delta, theme.muted, 10.5, 400),
            svgText(
                x + sizeCardWidth - 12,
                y + 44,
                formatBytes(engine.binarySizeBytes),
                theme.foreground,
                14,
                650,
                'mono',
                'end',
            ),
        );
    }

    const displayNote = [
        regressionCount > MAX_CHANGES_PER_DIRECTION
            ? `top ${MAX_CHANGES_PER_DIRECTION} of ${regressionCount} regressions`
            : countLabel(regressionCount, 'regression', 'regressions'),
        improvementCount > MAX_CHANGES_PER_DIRECTION
            ? `top ${MAX_CHANGES_PER_DIRECTION} of ${improvementCount} improvements`
            : countLabel(improvementCount, 'improvement', 'improvements'),
    ].join(' · ');
    parts.push(
        svgText(32, timingHeadingTop, 'TIMING CHANGES OUTSIDE JITTER', theme.foreground, 12, 700),
        svgText(1088, timingHeadingTop, displayNote, theme.muted, 10.5, 400, 'ui', 'end'),
        svgText(
            32,
            timingHeadingTop + 21,
            'Workload and engine context · baseline → current median · lower is better',
            theme.muted,
            11,
        ),
        svgText(changeColumnX, timingHeadingTop + 38, 'CHANGE', theme.muted, 10, 700, 'ui', 'start'),
    );

    if (visibleChanges.length === 0) {
        const message =
            comparison.changes.length === 0
                ? 'No comparable workload timings in this run.'
                : `All ${formatInteger(comparison.changes.length)} comparable pairs are within the jitter threshold.`;
        parts.push(svgText(32, plotTop + 34, message, theme.muted, 13));
    } else {
        for (const [index, layout] of rowLayouts.entries()) {
            if (index % 2 === 0) parts.push(svgRect(32, layout.top, 1056, layout.height, 4, theme.surface, 'none'));
        }
        const jitterWidth = comparison.thresholdPercent * plotScale;
        parts.push(
            svgRect(
                zeroX - jitterWidth,
                plotTop,
                jitterWidth * 2,
                plotBottom - plotTop,
                0,
                theme.jitter,
                theme.jitterEdge,
            ),
        );
        for (const tickValue of [-axisMaximum, -axisMaximum / 2, 0, axisMaximum / 2, axisMaximum]) {
            const x = zeroX + tickValue * plotScale;
            const isZero = tickValue === 0;
            parts.push(
                `<line x1="${x}" y1="${plotTop}" x2="${x}" y2="${plotBottom}" stroke="${isZero ? theme.neutral : theme.grid}" stroke-width="${isZero ? 1.5 : 1}"/>`,
                svgText(x, timingHeadingTop + 50, formatAxisPercent(tickValue), theme.muted, 10, 400, 'mono', 'middle'),
            );
        }

        let previousStatus: BenchmarkChangeStatus | undefined;
        for (const layout of rowLayouts) {
            if (layout.change.status !== previousStatus) {
                previousStatus = layout.change.status;
                const groupName = previousStatus === 'regression' ? 'SLOWER' : 'FASTER';
                const groupColor = previousStatus === 'regression' ? theme.regression : theme.improvement;
                parts.push(svgText(32, layout.top - 8, groupName, groupColor, 10, 700));
            }

            const statusColor = layout.change.status === 'regression' ? theme.regression : theme.improvement;
            const centerY = layout.top + layout.height / 2;
            const barLength = Math.abs(layout.change.changePercent) * plotScale;
            const barX = layout.change.changePercent >= 0 ? zeroX : zeroX - barLength;
            const areaStartY = layout.top + 15;
            parts.push(
                svgTextLines(44, areaStartY, layout.areaLines, theme.foreground, 13, 650, 'ui', 15),
                svgTextLines(
                    44,
                    areaStartY + layout.areaLines.length * 15,
                    layout.engineLines,
                    theme.muted,
                    10.5,
                    500,
                    'mono',
                    12,
                ),
                svgTextLines(
                    44,
                    areaStartY + layout.areaLines.length * 15 + layout.engineLines.length * 12,
                    layout.contextLines,
                    theme.muted,
                    10,
                    400,
                    'ui',
                    12,
                ),
                svgRect(barX, centerY - 5, Math.max(barLength, 2), 10, 5, statusColor, 'none'),
                svgText(
                    changeColumnX,
                    centerY + 5,
                    formatSignedPercent(layout.change.changePercent),
                    statusColor,
                    12,
                    700,
                    'mono',
                ),
            );
        }
        parts.push(
            svgText(
                32,
                plotBottom + 24,
                `Amber band = ±${comparison.thresholdPercent}% jitter · full matrix report contains all workload comparisons and sample ranges`,
                theme.muted,
                10.5,
            ),
        );
    }

    parts.push('</svg>');
    return parts.join('');
}

function formatInputsPerSample(value: number): string {
    return `${formatInteger(value)} ${value === 1 ? 'input' : 'inputs'}/sample`;
}

function countLabel(value: number, singular: string, plural: string): string {
    return `${formatInteger(value)} ${value === 1 ? singular : plural}`;
}

function formatMilliseconds(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatAxisPercent(value: number): string {
    const magnitude = Math.round(Math.abs(value));
    if (value === 0) return '0%';
    return `${value < 0 ? '−' : '+'}${magnitude}%`;
}

function formatBytes(value: number): string {
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
    return `${formatInteger(value)} B`;
}

function sizeDelta(currentBytes: number, quickjsBytes: number | undefined, isQuickjs: boolean): string {
    if (isQuickjs) return 'QuickJS reference size';
    if (quickjsBytes === undefined || quickjsBytes === 0) return 'QuickJS size unavailable';
    const deltaBytes = currentBytes - quickjsBytes;
    const deltaPercent = (deltaBytes / quickjsBytes) * 100;
    const direction = deltaBytes < 0 ? '−' : deltaBytes > 0 ? '+' : '';
    return `${direction}${formatBytes(Math.abs(deltaBytes))} · ${formatSignedPercent(deltaPercent)} vs QuickJS`;
}

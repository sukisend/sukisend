// Web version: uses HTML <input type="date">
import dayjs from 'dayjs';
import { useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';

interface DateRangePickerProps {
    startDate: string;
    endDate: string;
    onChange: (next: { start: string; end: string }) => void;
}

function WebDateInput({
    value,
    max,
    onDateChange,
}: {
    value: string;
    max: string;
    onDateChange: (date: string) => void;
}) {
    const { theme } = useTheme();
    const inputRef = useRef<HTMLInputElement | null>(null);

    return (
        <input
            ref={inputRef}
            type="date"
            value={value}
            max={max}
            onChange={(e) => onDateChange(e.target.value)}
            style={{
                backgroundColor: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 10,
                color: theme.colors.text,
                fontSize: 13,
                fontWeight: '600',
                padding: '10px',
                width: '100%',
                boxSizing: 'border-box' as const,
                outline: 'none',
            }}
        />
    );
}

export function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
    const { theme } = useTheme();
    const todayStr = useMemo(() => dayjs().format('YYYY-MM-DD'), []);

    return (
        <View style={styles.container}>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>Custom Date Range</Text>
            <View style={styles.row}>
                <View style={styles.inputWrap}>
                    <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>Start</Text>
                    <WebDateInput
                        value={startDate}
                        max={todayStr}
                        onDateChange={(val) => onChange({ start: val, end: endDate })}
                    />
                </View>
                <View style={styles.inputWrap}>
                    <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>End</Text>
                    <WebDateInput
                        value={endDate}
                        max={todayStr}
                        onDateChange={(val) => onChange({ start: startDate, end: val })}
                    />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: 6,
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
    },
    row: {
        flexDirection: 'row',
        gap: 8,
    },
    inputWrap: {
        flex: 1,
        gap: 4,
    },
    inputLabel: {
        fontSize: 11,
        fontWeight: '600',
    },
});

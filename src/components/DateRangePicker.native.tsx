// Native version: uses @react-native-community/datetimepicker
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';

interface DateRangePickerProps {
    startDate: string;
    endDate: string;
    onChange: (next: { start: string; end: string }) => void;
}

type PickerTarget = 'start' | 'end' | null;

export function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
    const { theme } = useTheme();
    const [target, setTarget] = useState<PickerTarget>(null);

    const start = useMemo(() => dayjs(startDate, 'YYYY-MM-DD').toDate(), [startDate]);
    const end = useMemo(() => dayjs(endDate, 'YYYY-MM-DD').toDate(), [endDate]);

    const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
        if (event.type === 'dismissed' || !selectedDate) {
            setTarget(null);
            return;
        }

        const value = dayjs(selectedDate).format('YYYY-MM-DD');
        if (target === 'start') {
            onChange({ start: value, end: endDate });
        }
        if (target === 'end') {
            onChange({ start: startDate, end: value });
        }

        if (Platform.OS === 'android') {
            setTarget(null);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>Custom Date Range</Text>
            <View style={styles.row}>
                <Pressable
                    style={[styles.dateButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                    onPress={() => setTarget('start')}
                >
                    <Text style={[styles.dateText, { color: theme.colors.text }]}>Start: {startDate}</Text>
                </Pressable>
                <Pressable
                    style={[styles.dateButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                    onPress={() => setTarget('end')}
                >
                    <Text style={[styles.dateText, { color: theme.colors.text }]}>End: {endDate}</Text>
                </Pressable>
            </View>

            {target ? (
                <DateTimePicker
                    mode="date"
                    display="default"
                    value={target === 'start' ? start : end}
                    onChange={onDateChange}
                    maximumDate={new Date()}
                />
            ) : null}
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
    dateButton: {
        borderRadius: 10,
        borderWidth: 1,
        flex: 1,
        paddingHorizontal: 10,
        paddingVertical: 10,
    },
    dateText: {
        fontSize: 13,
        fontWeight: '600',
    },
});

import { Platform } from 'react-native';
import type { ReactElement } from 'react';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (next: { start: string; end: string }) => void;
}

const DateRangePickerImpl =
  Platform.OS === 'web'
    ? (require('./DateRangePicker.web').DateRangePicker as (props: DateRangePickerProps) => ReactElement)
    : (require('./DateRangePicker.native').DateRangePicker as (props: DateRangePickerProps) => ReactElement);

export function DateRangePicker(props: DateRangePickerProps) {
  return <DateRangePickerImpl {...props} />;
}

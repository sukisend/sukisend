import dayjs from 'dayjs';

import { DateRange, SalesRangePreset } from '../types/models';

export function buildDateRange(preset: SalesRangePreset, customRange?: DateRange): DateRange {
  const now = dayjs();

  switch (preset) {
    case 'today':
      return {
        start: now.startOf('day').toISOString(),
        end: now.endOf('day').toISOString(),
      };
    case 'yesterday': {
      const yesterday = now.subtract(1, 'day');
      return {
        start: yesterday.startOf('day').toISOString(),
        end: yesterday.endOf('day').toISOString(),
      };
    }
    case 'week':
      return {
        start: now.startOf('week').toISOString(),
        end: now.endOf('day').toISOString(),
      };
    case 'month':
      return {
        start: now.startOf('month').toISOString(),
        end: now.endOf('day').toISOString(),
      };
    case '3months':
      return {
        start: now.subtract(3, 'month').startOf('day').toISOString(),
        end: now.endOf('day').toISOString(),
      };
    case '6months':
      return {
        start: now.subtract(6, 'month').startOf('day').toISOString(),
        end: now.endOf('day').toISOString(),
      };
    case 'year':
      return {
        start: now.startOf('year').toISOString(),
        end: now.endOf('day').toISOString(),
      };
    case 'custom':
      return (
        customRange ?? {
          start: now.startOf('month').toISOString(),
          end: now.endOf('day').toISOString(),
        }
      );
    default:
      return {
        start: now.startOf('month').toISOString(),
        end: now.endOf('day').toISOString(),
      };
  }
}

export function formatDateTime(value: string) {
  return dayjs(value).format('MMM DD, YYYY hh:mm A');
}

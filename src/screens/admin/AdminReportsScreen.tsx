import dayjs from 'dayjs';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { DateRangePicker } from '../../components/DateRangePicker';
import { EmptyState } from '../../components/EmptyState';
import { MetricCard } from '../../components/MetricCard';
import { RangeChips } from '../../components/RangeChips';
import { SectionHeader } from '../../components/SectionHeader';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { fetchDashboardSnapshot } from '../../services/adminService';
import { exportSalesReportCSV, exportSalesReportPDF } from '../../services/reportService';
import { DashboardSnapshot, DateRange, SalesRangePreset } from '../../types/models';
import { formatPHP } from '../../utils/currency';

const RANGE_LABELS: Record<SalesRangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'This Week',
  month: 'This Month',
  '3months': 'Last 3 Months',
  '6months': 'Last 6 Months',
  year: 'This Year',
  custom: 'Custom Date Range',
};

export function AdminReportsScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const { profile } = useAuth();
  const [rangePreset, setRangePreset] = useState<SalesRangePreset>('month');
  const [customRange, setCustomRange] = useState({
    start: dayjs().startOf('month').format('YYYY-MM-DD'),
    end: dayjs().format('YYYY-MM-DD'),
  });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);

  const rangeIso: DateRange = useMemo(
    () => ({
      start: dayjs(customRange.start, 'YYYY-MM-DD').startOf('day').toISOString(),
      end: dayjs(customRange.end, 'YYYY-MM-DD').endOf('day').toISOString(),
    }),
    [customRange],
  );

  const rangeLabel =
    rangePreset === 'custom' ? `${customRange.start} to ${customRange.end}` : RANGE_LABELS[rangePreset] ?? 'Custom Date Range';

  const loadReport = async () => {
    setLoading(true);
    try {
      const report = await fetchDashboardSnapshot(rangePreset, rangePreset === 'custom' ? rangeIso : undefined);
      setSnapshot(report);
    } catch {
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [rangePreset, rangeIso.start, rangeIso.end]);

  const runExport = async (type: 'csv' | 'pdf') => {
    if (!snapshot) {
      showAlert({
        title: 'No data',
        message: 'Load report data first.',
        tone: 'info',
      });
      return;
    }

    setExporting(type);
    try {
      const payload = {
        rangeLabel,
        generatedBy: profile?.fullName ?? 'Admin User',
        metrics: snapshot.metrics,
        categorySales: snapshot.categorySales,
        transactions: snapshot.recentTransactions.filter(
          (order) => order.paymentStatus === 'paid' && ['delivered', 'completed'].includes(order.status),
        ),
      };

      if (type === 'csv') {
        await exportSalesReportCSV(payload);
      } else {
        await exportSalesReportPDF(payload);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed.';
      showAlert({
        title: 'Export failed',
        message,
        tone: 'error',
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 22 }]}
    >
      <SectionHeader title="Analytics & Reports" subtitle="Review performance and export professional reports." />

      <RangeChips value={rangePreset} onChange={setRangePreset} />

      {rangePreset === 'custom' ? (
        <DateRangePicker startDate={customRange.start} endDate={customRange.end} onChange={setCustomRange} />
      ) : null}

      {loading ? <Text style={[styles.helper, { color: theme.colors.textMuted }]}>Building analytics report...</Text> : null}

      {snapshot ? (
        <>
          <View style={styles.metricsGrid}>
            <MetricCard label="Gross Sales" value={formatPHP(snapshot.metrics.grossSales)} />
            <MetricCard label="Paid Orders" value={`${snapshot.metrics.totalOrders}`} />
            <MetricCard label="Avg Order Value" value={formatPHP(snapshot.metrics.averageOrderValue)} />
            <MetricCard label="Top Product" value={snapshot.metrics.topSellingProduct} />
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Export Options</Text>
            <Text style={[styles.cardSub, { color: theme.colors.textMuted }]}>
              Swipe across cards and pick your preferred output format.
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exportCardsRow}>
              <Pressable
                style={[styles.exportCard, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
                onPress={() => runExport('pdf')}
                disabled={Boolean(exporting)}
              >
                <Text style={[styles.exportTitle, { color: theme.colors.text }]}>PDF Report</Text>
                <Text style={[styles.exportSub, { color: theme.colors.textMuted }]}>
                  Professional layout for management and printable reports.
                </Text>
                <Text style={[styles.exportAction, { color: theme.colors.primary }]}>
                  {exporting === 'pdf' ? 'Exporting...' : 'Export as PDF'}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.exportCard, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
                onPress={() => runExport('csv')}
                disabled={Boolean(exporting)}
              >
                <Text style={[styles.exportTitle, { color: theme.colors.text }]}>Excel / CSV</Text>
                <Text style={[styles.exportSub, { color: theme.colors.textMuted }]}>
                  Spreadsheet-friendly file for deeper review and accounting.
                </Text>
                <Text style={[styles.exportAction, { color: theme.colors.primary }]}>
                  {exporting === 'csv' ? 'Exporting...' : 'Export as CSV'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Category Breakdown</Text>
            {snapshot.categorySales.length ? (
              snapshot.categorySales.map((entry) => (
                <View key={entry.category} style={styles.entryRow}>
                  <Text style={[styles.entryLabel, { color: theme.colors.text }]}>{entry.category}</Text>
                  <Text style={[styles.entryValue, { color: theme.colors.primary }]}>{formatPHP(entry.sales)}</Text>
                </View>
              ))
            ) : (
              <Text style={[styles.helper, { color: theme.colors.textMuted }]}>No category sales data for this range.</Text>
            )}
          </View>
        </>
      ) : (
        !loading && <EmptyState title="No analytics data" subtitle="Run with a different date range or check Supabase records." />
      )}

      <Pressable
        style={[styles.refreshButton, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
        onPress={loadReport}
      >
        <Text style={[styles.refreshText, { color: theme.colors.text }]}>Refresh Report</Text>
      </Pressable>

      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: 10,
    padding: 14,
  },
  helper: {
    fontSize: 13,
    fontWeight: '500',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  cardSub: {
    fontSize: 12,
    fontWeight: '500',
  },
  exportCardsRow: {
    gap: 10,
    paddingVertical: 2,
  },
  exportCard: {
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 130,
    padding: 12,
    width: 240,
  },
  exportTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  exportSub: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  exportAction: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 10,
  },
  entryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  entryLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  entryValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  refreshButton: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 11,
  },
  refreshText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});

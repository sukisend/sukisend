import dayjs from 'dayjs';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateRangePicker } from '../../components/DateRangePicker';
import { EmptyState } from '../../components/EmptyState';
import { LogoHeader } from '../../components/LogoHeader';
import { MetricCard } from '../../components/MetricCard';
import { RangeChips } from '../../components/RangeChips';
import { SectionHeader } from '../../components/SectionHeader';
import { useTheme } from '../../providers/ThemeProvider';
import { fetchDashboardSnapshot } from '../../services/adminService';
import { DashboardSnapshot, DateRange, SalesRangePreset } from '../../types/models';
import { formatPHP } from '../../utils/currency';

const DEFAULT_CUSTOM_RANGE = {
  start: dayjs().startOf('month').format('YYYY-MM-DD'),
  end: dayjs().format('YYYY-MM-DD'),
};

export function AdminDashboardScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const [rangePreset, setRangePreset] = useState<SalesRangePreset>('today');
  const [customRange, setCustomRange] = useState(DEFAULT_CUSTOM_RANGE);
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);

  const customRangeIso: DateRange = useMemo(
    () => ({
      start: dayjs(customRange.start, 'YYYY-MM-DD').startOf('day').toISOString(),
      end: dayjs(customRange.end, 'YYYY-MM-DD').endOf('day').toISOString(),
    }),
    [customRange],
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchDashboardSnapshot(rangePreset, rangePreset === 'custom' ? customRangeIso : undefined);
      setSnapshot(data);
    } catch {
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [rangePreset, customRangeIso.start, customRangeIso.end]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 22 }]}
    >
      <LogoHeader />
      <SectionHeader title="Admin Dashboard" subtitle="Inventory, sales, and COD performance in one view." />

      <RangeChips value={rangePreset} onChange={setRangePreset} />

      {rangePreset === 'custom' ? (
        <DateRangePicker startDate={customRange.start} endDate={customRange.end} onChange={setCustomRange} />
      ) : null}

      {loading ? <Text style={[styles.helper, { color: theme.colors.textMuted }]}>Loading dashboard...</Text> : null}

      {snapshot ? (
        <>
          <View style={styles.metricsGrid}>
            <MetricCard label="Gross Sales" value={formatPHP(snapshot.metrics.grossSales)} />
            <MetricCard label="Paid Orders" value={`${snapshot.metrics.totalOrders}`} />
            <MetricCard label="Profit" value={formatPHP(snapshot.metrics.profit)} />
            <MetricCard label="Low Stock Items" value={`${snapshot.metrics.lowStockCount}`} />
            <MetricCard label="Pending" value={`${snapshot.metrics.pendingOrders ?? 0}`} />
            <MetricCard label="Outgoing" value={`${snapshot.metrics.outgoingOrders ?? 0}`} />
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Top Selling Products</Text>
            {snapshot.topProducts.length ? (
              snapshot.topProducts.map((item) => (
                <View key={item.productId} style={styles.listRow}>
                  <Text style={[styles.listLabel, { color: theme.colors.text }]}>{item.name}</Text>
                  <Text style={[styles.listValue, { color: theme.colors.primary }]}>
                    {item.qty} sold | {formatPHP(item.sales)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.helper, { color: theme.colors.textMuted }]}>No sales yet for this range.</Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Sales by Category</Text>
            {snapshot.categorySales.length ? (
              snapshot.categorySales.map((entry) => (
                <View key={entry.category} style={styles.listRow}>
                  <Text style={[styles.listLabel, { color: theme.colors.text }]}>{entry.category}</Text>
                  <Text style={[styles.listValue, { color: theme.colors.primary }]}>{formatPHP(entry.sales)}</Text>
                </View>
              ))
            ) : (
              <Text style={[styles.helper, { color: theme.colors.textMuted }]}>No category data in selected range.</Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Low / Out of Stock Alerts</Text>
            {snapshot.lowStockItems.length ? (
              snapshot.lowStockItems.map((item) => (
                <View key={item.id} style={styles.listRow}>
                  <Text style={[styles.listLabel, { color: theme.colors.text }]}>{item.name}</Text>
                  <Text style={[styles.listValue, { color: item.stock <= 0 ? theme.colors.danger : theme.colors.warning }]}>
                    {item.stock <= 0 ? 'Out of stock' : `${item.stock} left`}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.helper, { color: theme.colors.textMuted }]}>All inventory levels are healthy.</Text>
            )}
          </View>
        </>
      ) : (
        !loading && <EmptyState title="Dashboard unavailable" subtitle="Check your Supabase setup then refresh." />
      )}

      <Pressable
        style={[styles.refreshButton, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
        onPress={loadData}
      >
        <Text style={[styles.refreshText, { color: theme.colors.text }]}>Refresh Dashboard</Text>
      </Pressable>
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
    padding: 12,
    rowGap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  listRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  listLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    paddingRight: 10,
  },
  listValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  refreshButton: {
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
    paddingVertical: 12,
  },
  refreshText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});

import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { DateRangePicker } from '../../components/DateRangePicker';
import { BrandedLoader } from '../../components/BrandedLoader';
import { EmptyState } from '../../components/EmptyState';
import { LogoHeader } from '../../components/LogoHeader';
import { MetricCard } from '../../components/MetricCard';
import { RangeChips } from '../../components/RangeChips';
import { SectionHeader } from '../../components/SectionHeader';
import { useMinimumLoader } from '../../hooks/useMinimumLoader';
import { useTheme } from '../../providers/ThemeProvider';
import { fetchDashboardSnapshot } from '../../services/adminService';
import { DashboardSnapshot, DateRange, SalesRangePreset } from '../../types/models';
import { formatPHP } from '../../utils/currency';

const DEFAULT_CUSTOM_RANGE = {
  start: dayjs().startOf('month').format('YYYY-MM-DD'),
  end: dayjs().format('YYYY-MM-DD'),
};

export function AdminDashboardScreen() {
  const { theme } = useTheme();
  const [rangePreset, setRangePreset] = useState<SalesRangePreset>('today');
  const [customRange, setCustomRange] = useState(DEFAULT_CUSTOM_RANGE);
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const showLoader = useMinimumLoader(loading, 500);

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
      contentContainerStyle={[styles.content, { paddingBottom: 8 }]}
    >
      <LogoHeader />
      <SectionHeader title="Admin Dashboard" subtitle="Inventory, sales, and COD performance in one view." />

      <RangeChips value={rangePreset} onChange={setRangePreset} />

      {rangePreset === 'custom' ? (
        <DateRangePicker startDate={customRange.start} endDate={customRange.end} onChange={setCustomRange} />
      ) : null}

      {showLoader ? <BrandedLoader compact label="Loading dashboard..." /> : null}

      {snapshot ? (
        <>
          <View style={styles.metricsGrid}>
            <MetricCard
              label="Gross Sales"
              value={formatPHP(snapshot.metrics.grossSales)}
              accentColor="#22C55E"
              tintColor={theme.isDark ? 'rgba(34, 197, 94, 0.16)' : 'rgba(34, 197, 94, 0.12)'}
            />
            <MetricCard
              label="Paid Orders"
              value={`${snapshot.metrics.totalOrders}`}
              accentColor="#3B82F6"
              tintColor={theme.isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)'}
            />
            <MetricCard
              label="Profit"
              value={formatPHP(snapshot.metrics.profit)}
              accentColor="#14B8A6"
              tintColor={theme.isDark ? 'rgba(20, 184, 166, 0.16)' : 'rgba(20, 184, 166, 0.11)'}
            />
            <MetricCard
              label="Low Stock Items"
              value={`${snapshot.metrics.lowStockCount}`}
              accentColor="#F59E0B"
              tintColor={theme.isDark ? 'rgba(245, 158, 11, 0.18)' : 'rgba(245, 158, 11, 0.12)'}
            />
            <MetricCard
              label="Pending"
              value={`${snapshot.metrics.pendingOrders ?? 0}`}
              accentColor="#F97316"
              tintColor={theme.isDark ? 'rgba(249, 115, 22, 0.16)' : 'rgba(249, 115, 22, 0.11)'}
            />
            <MetricCard
              label="Outgoing"
              value={`${snapshot.metrics.outgoingOrders ?? 0}`}
              accentColor="#A855F7"
              tintColor={theme.isDark ? 'rgba(168, 85, 247, 0.15)' : 'rgba(168, 85, 247, 0.1)'}
            />
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Top Selling Products</Text>
            {snapshot.topProducts.length ? (
              snapshot.topProducts.map((item) => (
                <View
                  key={item.productId}
                  style={[styles.topProductRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                >
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.topProductImage} />
                  ) : (
                    <View style={[styles.topProductFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
                      <Ionicons name="cube-outline" size={16} color={theme.colors.textMuted} />
                    </View>
                  )}
                  <View style={styles.topProductInfo}>
                    <Text style={[styles.listLabel, { color: theme.colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.topProductMeta, { color: theme.colors.textMuted }]}>{item.qty} sold</Text>
                  </View>
                  <Text style={[styles.listValue, { color: theme.colors.primary }]}>{formatPHP(item.sales)}</Text>
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
                <View
                  key={entry.category}
                  style={[styles.listRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                >
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
                <View
                  key={item.id}
                  style={[styles.listRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                >
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
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  topProductRow: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  topProductImage: {
    borderRadius: 8,
    height: 42,
    width: 42,
  },
  topProductFallback: {
    alignItems: 'center',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  topProductInfo: {
    flex: 1,
    minWidth: 0,
  },
  topProductMeta: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
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

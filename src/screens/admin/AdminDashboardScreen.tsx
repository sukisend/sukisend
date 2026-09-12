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
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <LogoHeader />

      <View style={[styles.greetingCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Text style={[styles.greetingTitle, { color: theme.colors.text }]}>Admin Dashboard</Text>
        <Text style={[styles.greetingSub, { color: theme.colors.textMuted }]}>
          Inventory, sales, and COD performance at a glance.
        </Text>
      </View>

      <RangeChips value={rangePreset} onChange={setRangePreset} />

      {rangePreset === 'custom' ? (
        <DateRangePicker startDate={customRange.start} endDate={customRange.end} onChange={setCustomRange} />
      ) : null}

      {showLoader ? <BrandedLoader compact label="Loading dashboard..." /> : null}

      {snapshot ? (
        <>
          {/* ─── KPI Cards ─── */}
          <View style={styles.metricsGrid}>
            <MetricCard
              label="Gross Sales"
              value={formatPHP(snapshot.metrics.grossSales)}
              accentColor="#E06D3B"
            />
            <MetricCard
              label="Paid Orders"
              value={`${snapshot.metrics.totalOrders}`}
              accentColor="#E06D3B"
            />
            <MetricCard
              label="Profit"
              value={formatPHP(snapshot.metrics.profit)}
              accentColor="#E06D3B"
            />
            <MetricCard
              label="Low Stock"
              value={`${snapshot.metrics.lowStockCount}`}
              accentColor="#E06D3B"
            />
            <MetricCard
              label="Pending"
              value={`${snapshot.metrics.pendingOrders ?? 0}`}
              accentColor="#E06D3B"
            />
            <MetricCard
              label="Outgoing"
              value={`${snapshot.metrics.outgoingOrders ?? 0}`}
              accentColor="#E06D3B"
            />
          </View>

          {/* ─── Top Selling Products ─── */}
          <View style={[styles.card, { backgroundColor: theme.colors.card }, theme.shadow.card]}>
            <View style={styles.cardHeader}>
              <Ionicons name="trophy-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Top Selling Products</Text>
            </View>
            {snapshot.topProducts.length ? (
              snapshot.topProducts.map((item, idx) => (
                <View
                  key={item.productId}
                  style={[styles.topProductRow, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
                >
                  <View style={[styles.rankBadge, { backgroundColor: idx < 3 ? theme.colors.primary : theme.colors.surfaceAlt }]}>
                    <Text style={[styles.rankText, { color: idx < 3 ? theme.colors.primaryContrast : theme.colors.textMuted }]}>
                      #{idx + 1}
                    </Text>
                  </View>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.topProductImage} />
                  ) : (
                    <View style={[styles.topProductFallback, { backgroundColor: theme.colors.surface }]}>
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

          {/* ─── Sales by Category ─── */}
          <View style={[styles.card, { backgroundColor: theme.colors.card }, theme.shadow.card]}>
            <View style={styles.cardHeader}>
              <Ionicons name="pricetag-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Sales by Category</Text>
            </View>
            {snapshot.categorySales.length ? (
              snapshot.categorySales.map((entry) => {
                const maxSale = Math.max(...snapshot.categorySales.map((e) => e.sales));
                const barWidth = maxSale > 0 ? (entry.sales / maxSale) * 100 : 0;
                return (
                  <View key={entry.category} style={styles.categoryEntry}>
                    <View style={styles.categoryLabelRow}>
                      <Text style={[styles.listLabel, { color: theme.colors.text }]}>{entry.category}</Text>
                      <Text style={[styles.listValue, { color: theme.colors.primary }]}>{formatPHP(entry.sales)}</Text>
                    </View>
                    <View style={[styles.barTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
                      <View style={[styles.barFill, { backgroundColor: theme.colors.primary, width: `${barWidth}%` }]} />
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.helper, { color: theme.colors.textMuted }]}>No category data in selected range.</Text>
            )}
          </View>

          {/* ─── Low / Out of Stock Alerts ─── */}
          <View style={[styles.card, { backgroundColor: theme.colors.card }, theme.shadow.card]}>
            <View style={styles.cardHeader}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.colors.danger} />
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Stock Alerts</Text>
            </View>
            {snapshot.lowStockItems.length ? (
              snapshot.lowStockItems.map((item) => (
                <View
                  key={item.id}
                  style={[styles.alertRow, { backgroundColor: item.stock <= 0 ? theme.colors.dangerBg : theme.colors.warningBg, borderColor: theme.colors.border }]}
                >
                  <Ionicons
                    name={item.stock <= 0 ? 'close-circle-outline' : 'warning-outline'}
                    size={15}
                    color={item.stock <= 0 ? theme.colors.danger : theme.colors.warning}
                  />
                  <Text style={[styles.listLabel, { color: theme.colors.text }]}>{item.name}</Text>
                  <View style={[styles.stockPill, { backgroundColor: item.stock <= 0 ? theme.colors.danger : theme.colors.warning }]}>
                    <Text style={[styles.stockPillText, { color: '#FFFFFF' }]}>
                      {item.stock <= 0 ? 'Out' : `${item.stock} left`}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={[styles.healthyRow, { backgroundColor: theme.colors.successBg }]}>
                <Ionicons name="checkmark-circle-outline" size={16} color={theme.colors.success} />
                <Text style={[styles.helper, { color: theme.colors.success }]}>All inventory levels are healthy.</Text>
              </View>
            )}
          </View>
        </>
      ) : (
        !loading && <EmptyState title="Dashboard unavailable" subtitle="Check your Supabase setup then refresh." />
      )}

      <Pressable
        style={[styles.refreshButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
        onPress={loadData}
      >
        <Ionicons name="refresh-outline" size={15} color={theme.colors.textMuted} />
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
    gap: 12,
    padding: 14,
    paddingBottom: 24,
  },
  greetingCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  greetingTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  greetingSub: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    borderRadius: 14,
    padding: 14,
    rowGap: 8,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  helper: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: 6,
  },
  topProductRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rankBadge: {
    alignItems: 'center',
    borderRadius: 8,
    height: 22,
    justifyContent: 'center',
    minWidth: 22,
    paddingHorizontal: 4,
  },
  rankText: {
    fontSize: 10,
    fontWeight: '700',
  },
  topProductImage: {
    borderRadius: 8,
    height: 38,
    width: 38,
  },
  topProductFallback: {
    alignItems: 'center',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  topProductInfo: {
    flex: 1,
    minWidth: 0,
  },
  topProductMeta: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  listLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    paddingRight: 8,
  },
  listValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  categoryEntry: {
    gap: 4,
  },
  categoryLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  barTrack: {
    borderRadius: 999,
    height: 5,
    overflow: 'hidden',
  },
  barFill: {
    borderRadius: 999,
    height: '100%',
  },
  alertRow: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stockPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  stockPillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  healthyRow: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  refreshButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: 4,
    paddingVertical: 12,
  },
  refreshText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

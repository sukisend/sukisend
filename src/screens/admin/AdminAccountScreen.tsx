import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { EmptyState } from '../../components/EmptyState';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { AdminTabsParamList } from '../../navigation/types';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import {
  adminDeleteCustomerAccount,
  adminLiftCustomerRestriction,
  adminSetCustomerRestriction,
  fetchAdminCustomersPage,
} from '../../services/chatModerationService';
import { CustomerModerationUser, RestrictionSeverity } from '../../types/models';
import { formatDateTime } from '../../utils/date';

const SEVERITY_LABEL: Record<RestrictionSeverity, string> = {
  warning: 'Warning',
  restricted: 'Restricted',
  banned: 'Banned',
};
const CUSTOMER_PAGE_SIZE = 8;

export function AdminAccountScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<AdminTabsParamList>>();
  const { theme } = useTheme();
  const { profile, signOut } = useAuth();
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<CustomerModerationUser[]>([]);
  const [search, setSearch] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [customerTotal, setCustomerTotal] = useState(0);
  const [sortByPending, setSortByPending] = useState(true);
  const customerPageCount = Math.max(1, Math.ceil(customerTotal / CUSTOMER_PAGE_SIZE));

  const sortedCustomers = sortByPending
    ? [...customers].sort((a, b) => b.pendingOrders - a.pendingOrders)
    : customers;

  const loadCustomers = async (page = customerPage, keyword = search) => {
    setLoading(true);
    try {
      const result = await fetchAdminCustomersPage({
        page,
        pageSize: CUSTOMER_PAGE_SIZE,
        search: keyword,
      });
      setCustomers(result.rows);
      setCustomerTotal(result.total);
    } catch {
      setCustomers([]);
      setCustomerTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers(customerPage, search);
  }, [customerPage, search]);

  const applyRestriction = async (customer: CustomerModerationUser, severity: RestrictionSeverity) => {
    const durationHours = severity === 'warning' ? 24 : severity === 'restricted' ? 72 : undefined;
    const defaultReason =
      severity === 'warning'
        ? 'Policy reminder sent due to suspicious order behavior.'
        : severity === 'restricted'
          ? 'Ordering temporarily restricted due to policy violation.'
          : 'Account permanently banned due to repeated severe violations.';

    try {
      await adminSetCustomerRestriction({
        customerId: customer.id,
        reason: defaultReason,
        severity,
        durationHours,
      });
      await loadCustomers();
      showAlert({
        title: `${SEVERITY_LABEL[severity]} applied`,
        message: `${customer.fullName} has been updated.`,
        tone: 'success',
      });
    } catch (error) {
      showAlert({
        title: 'Action failed',
        message: error instanceof Error ? error.message : 'Unable to apply restriction.',
        tone: 'error',
      });
    }
  };

  const liftRestriction = async (customer: CustomerModerationUser) => {
    if (!customer.activeRestriction) {
      return;
    }

    try {
      await adminLiftCustomerRestriction(customer.activeRestriction.id, 'Restriction cleared by admin');
      await loadCustomers();
      showAlert({
        title: 'Restriction removed',
        message: `${customer.fullName} can place orders again.`,
        tone: 'success',
      });
    } catch (error) {
      showAlert({
        title: 'Unable to lift restriction',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    }
  };

  const removeAccount = (customer: CustomerModerationUser) => {
    showAlert({
      title: 'Delete customer account',
      message: `Permanently delete ${customer.fullName}? This cannot be undone.`,
      tone: 'error',
      actionLabel: 'Delete Account',
      onAction: async () => {
        try {
          await adminDeleteCustomerAccount(customer.id, 'Removed by admin for severe policy violation');
          await loadCustomers();
          showAlert({
            title: 'Account deleted',
            message: `${customer.fullName} has been permanently removed.`,
            tone: 'success',
          });
        } catch (error) {
          showAlert({
            title: 'Delete failed',
            message: error instanceof Error ? error.message : 'Unable to delete account.',
            tone: 'error',
          });
        }
      },
    });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Profile Card ─── */}
      <View style={[styles.profileCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, theme.shadow.card]}>
        <View style={[styles.avatarCircle, { backgroundColor: `${theme.colors.primary}15` }]}>
          <Ionicons name="person" size={28} color={theme.colors.primary} />
        </View>
        <Text style={[styles.profileName, { color: theme.colors.text }]}>{profile?.fullName}</Text>
        <Text style={[styles.profileRole, { color: theme.colors.primary }]}>{profile?.role === 'admin' ? 'Administrator' : profile?.role}</Text>

        <View style={[styles.profileDivider, { backgroundColor: theme.colors.border }]} />

        <View style={styles.profileRow}>
          <Ionicons name="person-outline" size={14} color={theme.colors.textMuted} />
          <Text style={[styles.profileMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>{profile?.email?.split('@')[0] ?? ''}</Text>
        </View>
      </View>

      {/* ─── Quick Actions ─── */}
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, theme.shadow.card]}>
        <View style={styles.cardHeader}>
          <Ionicons name="chatbubbles-outline" size={16} color={theme.colors.primary} />
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Quick Actions</Text>
        </View>
        <Pressable
          style={[styles.actionRow, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
          onPress={() => navigation.navigate('Inbox')}
        >
          <View style={styles.actionRowLeft}>
            <Ionicons name="mail-unread-outline" size={18} color={theme.colors.primary} />
            <View>
              <Text style={[styles.actionLabel, { color: theme.colors.text }]}>Seller Inbox</Text>
              <Text style={[styles.actionSub, { color: theme.colors.textMuted }]}>View customer messages</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      {/* ─── Customer Moderation ─── */}
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, theme.shadow.card]}>
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.primary} />
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Customer Moderation</Text>
          </View>
          {customers.length > 0 ? (
            <Pressable
              style={[styles.sortToggle, { borderColor: sortByPending ? theme.colors.primary : theme.colors.border, backgroundColor: sortByPending ? `${theme.colors.primary}15` : theme.colors.surface }]}
              onPress={() => setSortByPending((prev) => !prev)}
            >
              <Ionicons name={sortByPending ? 'arrow-down' : 'swap-vertical'} size={12} color={sortByPending ? theme.colors.primary : theme.colors.textMuted} />
              <Text style={[styles.sortToggleText, { color: sortByPending ? theme.colors.primary : theme.colors.textMuted }]}>
                {sortByPending ? 'Pending' : 'Sort by Pending'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <View style={[styles.searchWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          <Ionicons name="search-outline" size={15} color={theme.colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={(value) => {
              setSearch(value);
              setCustomerPage(1);
            }}
            placeholder="Search by name or username..."
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.searchInput, { color: theme.colors.text, outlineWidth: 0 }]}
          />
        </View>

        {loading ? (
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Loading customers...</Text>
        ) : null}

        {!loading && customers.length === 0 ? (
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>No customers found.</Text>
        ) : (
          <View style={styles.customerList}>
            {sortedCustomers.map((customer) => (
              <View
                key={customer.id}
                style={[styles.customerCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
              >
                <View style={styles.customerTop}>
                  {customer.avatarUrl ? (
                    <Image source={{ uri: customer.avatarUrl }} style={styles.customerAvatar} />
                  ) : (
                    <View style={[styles.customerAvatarFallback, { backgroundColor: `${theme.colors.primary}18` }]}>
                      <Ionicons name="person" size={18} color={theme.colors.primary} />
                    </View>
                  )}
                  <View style={styles.customerInfo}>
                    <View style={styles.customerNameRow}>
                      <Text style={[styles.customerName, { color: theme.colors.text }]} numberOfLines={1}>{customer.fullName}</Text>
                      <View style={styles.customerQuickActions}>
                        <Pressable
                          style={[styles.quickActionBtn, { backgroundColor: customer.contactNumber ? `${theme.colors.primary}15` : `${theme.colors.textMuted}15` }]}
                          hitSlop={12}
                          onPress={async () => {
                            if (!customer.contactNumber) {
                              Alert.alert('No Phone', 'This customer has no phone number on file.');
                              return;
                            }
                            const num = customer.contactNumber.replace(/[^0-9]/g, '');
                            const formatted = num.startsWith('63') ? `+${num}` : num.startsWith('0') ? `+63${num.slice(1)}` : `+63${num}`;
                            if (Platform.OS === 'web') {
                              await Clipboard.setStringAsync(formatted);
                              showAlert({ title: 'Number copied', message: `${formatted} copied to clipboard.`, tone: 'success' });
                            } else {
                              try {
                                await Linking.openURL(`tel:${formatted}`);
                              } catch {
                                Alert.alert('Call', `Dial: ${formatted}`);
                              }
                            }
                          }}
                        >
                          <Ionicons name="call" size={14} color={customer.contactNumber ? theme.colors.primary : theme.colors.textMuted} />
                        </Pressable>
                        <Pressable
                          style={[styles.quickActionBtn, { backgroundColor: `${theme.colors.primary}15` }]}
                          hitSlop={12}
                          onPress={() => {
                            navigation.navigate('Inbox', { openCustomerId: customer.id });
                          }}
                        >
                          <Ionicons name="chatbubble" size={14} color={theme.colors.primary} />
                        </Pressable>
                      </View>
                    </View>
                    <Text style={[styles.customerEmail, { color: theme.colors.textMuted }]} numberOfLines={1}>
                      {customer.email?.split('@')[0] ?? customer.id}
                    </Text>
                  </View>
                  {customer.activeRestriction ? (
                    <View style={[styles.severityPill, { backgroundColor: theme.colors.warningBg }]}>
                      <Text style={[styles.severityPillText, { color: theme.colors.warning }]}>
                        {SEVERITY_LABEL[customer.activeRestriction.severity]}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.customerStats}>
                  <View style={[styles.statPill, { backgroundColor: theme.colors.surfaceAlt }]}>
                    <Text style={[styles.statText, { color: theme.colors.textMuted }]}>Orders: {customer.totalOrders}</Text>
                  </View>
                  <View style={[styles.statPill, { backgroundColor: theme.colors.surfaceAlt }]}>
                    <Text style={[styles.statText, { color: theme.colors.textMuted }]}>Ongoing: {customer.pendingOrders}</Text>
                  </View>
                </View>

                {customer.activeRestriction ? (
                  <Text style={[styles.restrictionNote, { color: theme.colors.warning }]}>
                    Until {customer.activeRestriction.endsAt ? formatDateTime(customer.activeRestriction.endsAt) : 'Permanent'}
                  </Text>
                ) : null}

                <View style={styles.actionsRow}>
                  {!customer.activeRestriction ? (
                    <>
                      <Pressable
                        style={[styles.actionBtn, { borderColor: theme.colors.border }]}
                        onPress={() => applyRestriction(customer, 'warning')}
                      >
                        <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>Warn</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.actionBtn, { borderColor: theme.colors.border }]}
                        onPress={() => applyRestriction(customer, 'restricted')}
                      >
                        <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>Restrict</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.actionBtn, { borderColor: theme.colors.border }]}
                        onPress={() => applyRestriction(customer, 'banned')}
                      >
                        <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>Ban</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      style={[styles.actionBtn, { borderColor: theme.colors.success }]}
                      onPress={() => liftRestriction(customer)}
                    >
                      <Text style={[styles.actionBtnText, { color: theme.colors.success }]}>Lift</Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={[styles.actionBtn, { borderColor: theme.colors.danger }]}
                    onPress={() => removeAccount(customer)}
                  >
                    <Text style={[styles.actionBtnText, { color: theme.colors.danger }]}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {customerTotal > CUSTOMER_PAGE_SIZE || customerPage > 1 ? (
          <View style={styles.paginationRow}>
            <Pressable
              style={[styles.paginationBtn, { borderColor: theme.colors.border, backgroundColor: customerPage <= 1 ? theme.colors.surfaceAlt : theme.colors.surface }]}
              disabled={customerPage <= 1}
              onPress={() => setCustomerPage((prev) => Math.max(1, prev - 1))}
            >
              <Text style={[styles.paginationBtnText, { color: customerPage <= 1 ? theme.colors.textMuted : theme.colors.text }]}>Previous</Text>
            </Pressable>
            <Text style={[styles.paginationLabel, { color: theme.colors.textMuted }]}>
              {customerPage}/{customerPageCount}
            </Text>
            <Pressable
              style={[styles.paginationBtn, { borderColor: theme.colors.border, backgroundColor: customerPage >= customerPageCount ? theme.colors.surfaceAlt : theme.colors.surface }]}
              disabled={customerPage >= customerPageCount}
              onPress={() => setCustomerPage((prev) => Math.min(customerPageCount, prev + 1))}
            >
              <Text style={[styles.paginationBtnText, { color: customerPage >= customerPageCount ? theme.colors.textMuted : theme.colors.text }]}>Next</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* ─── Sign Out ─── */}
      <Pressable
        style={[styles.signOutCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
        onPress={() => signOut()}
      >
        <Ionicons name="log-out-outline" size={18} color={theme.colors.danger} />
        <Text style={[styles.signOutText, { color: theme.colors.danger }]}>Sign Out</Text>
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
    gap: 12,
    padding: 14,
    paddingBottom: 24,
  },
  profileCard: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  avatarCircle: {
    alignItems: 'center',
    borderRadius: 999,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
  },
  profileRole: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  profileDivider: {
    height: 1,
    marginTop: 12,
    width: '100%',
  },
  profileRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    width: '100%',
  },
  profileMeta: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  actionRowLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  searchWrap: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    paddingVertical: 4,
  },
  meta: {
    fontSize: 12,
    fontWeight: '500',
  },
  customerList: {
    gap: 8,
  },
  customerCard: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  customerTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  customerAvatar: {
    borderRadius: 20,
    height: 40,
    width: 40,
  },
  customerAvatarFallback: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  customerInfo: {
    flex: 1,
    gap: 2,
  },
  customerNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  customerName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  customerQuickActions: {
    flexDirection: 'row',
    gap: 4,
  },
  quickActionBtn: {
    alignItems: 'center',
    borderRadius: 14,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  customerEmail: {
    fontSize: 11,
    fontWeight: '500',
  },
  customerPhoneRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 1,
  },
  customerPhone: {
    fontSize: 11,
    fontWeight: '500',
  },
  severityPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  severityPillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  customerStats: {
    flexDirection: 'row',
    gap: 6,
  },
  statPill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statText: {
    fontSize: 11,
    fontWeight: '500',
  },
  restrictionNote: {
    fontSize: 11,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  paginationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 4,
  },
  paginationBtn: {
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 90,
    paddingVertical: 8,
  },
  paginationBtnText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  paginationLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  signOutCard: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 4,
    paddingVertical: 14,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sortToggle: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sortToggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

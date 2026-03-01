import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { BrandLogoCard } from '../../components/BrandLogoCard';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { AdminTabsParamList } from '../../navigation/types';
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
  const customerPageCount = Math.max(1, Math.ceil(customerTotal / CUSTOMER_PAGE_SIZE));

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
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.colors.text }]}>Admin Account</Text>
      <BrandLogoCard title="SUKI SEND Admin" subtitle="Manage store operations securely." style={styles.brandCard} />

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Profile</Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Name: {profile?.fullName}</Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Email: {profile?.email}</Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Role: {profile?.role}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Messages & Inbox</Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Open the dedicated inbox page for cleaner message management and pagination.</Text>
        <Pressable
          style={[styles.inboxButton, { backgroundColor: theme.colors.primary }]}
          onPress={() => navigation.navigate('Inbox')}
        >
          <Text style={[styles.inboxButtonText, { color: theme.colors.primaryContrast }]}>Open Seller Inbox</Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Customer Moderation</Text>
        <TextInput
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setCustomerPage(1);
          }}
          placeholder="Search by name, email, or user id..."
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.searchInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />
        {loading ? <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Loading customers...</Text> : null}
        {!loading && customers.length === 0 ? (
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>No customers found.</Text>
        ) : (
          <View style={styles.sectionList}>
            {customers.map((customer) => (
              <View
                key={customer.id}
                style={[styles.customerCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
              >
                <Text style={[styles.customerName, { color: theme.colors.text }]}>{customer.fullName}</Text>
                <Text style={[styles.meta, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  {customer.email || customer.id}
                </Text>
                <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Orders: {customer.totalOrders} | Ongoing: {customer.pendingOrders}</Text>
                {customer.activeRestriction ? (
                  <Text style={[styles.meta, { color: theme.colors.warning ?? '#F59E0B' }]}>
                    Active: {SEVERITY_LABEL[customer.activeRestriction.severity]}{' '}
                    {customer.activeRestriction.endsAt
                      ? `until ${formatDateTime(customer.activeRestriction.endsAt)}`
                      : '(Permanent)'}
                  </Text>
                ) : (
                  <Text style={[styles.meta, { color: theme.colors.success }]}>No active restrictions</Text>
                )}
                <View style={styles.actionsRow}>
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
                  {customer.activeRestriction ? (
                    <Pressable
                      style={[styles.actionBtn, { borderColor: theme.colors.success }]}
                      onPress={() => liftRestriction(customer)}
                    >
                      <Text style={[styles.actionBtnText, { color: theme.colors.success }]}>Lift</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={[styles.actionBtn, { borderColor: theme.colors.danger ?? '#EF4444' }]}
                    onPress={() => removeAccount(customer)}
                  >
                    <Text style={[styles.actionBtnText, { color: theme.colors.danger ?? '#EF4444' }]}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
        {customerTotal > CUSTOMER_PAGE_SIZE || customerPage > 1 ? (
          <View style={styles.paginationRow}>
            <Pressable
              style={[
                styles.paginationBtn,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: customerPage <= 1 ? theme.colors.surfaceAlt : theme.colors.surface,
                },
              ]}
              disabled={customerPage <= 1}
              onPress={() => setCustomerPage((prev) => Math.max(1, prev - 1))}
            >
              <Text style={[styles.paginationBtnText, { color: customerPage <= 1 ? theme.colors.textMuted : theme.colors.text }]}>
                Previous
              </Text>
            </Pressable>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
              Page {customerPage} / {customerPageCount}
            </Text>
            <Pressable
              style={[
                styles.paginationBtn,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: customerPage >= customerPageCount ? theme.colors.surfaceAlt : theme.colors.surface,
                },
              ]}
              disabled={customerPage >= customerPageCount}
              onPress={() => setCustomerPage((prev) => Math.min(customerPageCount, prev + 1))}
            >
              <Text
                style={[
                  styles.paginationBtnText,
                  { color: customerPage >= customerPageCount ? theme.colors.textMuted : theme.colors.text },
                ]}
              >
                Next
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={[styles.card, styles.signOutCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <BrandLogoCard compact title="Secure Session" subtitle="Sign out to protect admin access." />
        <Pressable style={[styles.signOutButton, { backgroundColor: theme.colors.danger }]} onPress={() => signOut()}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </View>

      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 14,
    paddingBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
  },
  brandCard: {
    marginTop: 12,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    marginTop: 12,
    padding: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  meta: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchInput: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  sectionList: {
    gap: 8,
  },
  paginationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 10,
  },
  paginationBtn: {
    borderRadius: 9,
    borderWidth: 1,
    minWidth: 92,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  paginationBtnText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  customerCard: {
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    padding: 10,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  actionBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  inboxButton: {
    borderRadius: 999,
    marginTop: 6,
    paddingVertical: 11,
  },
  inboxButtonText: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  signOutButton: {
    borderRadius: 999,
    paddingVertical: 13,
  },
  signOutCard: {
    marginTop: 16,
  },
  signOutText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
});

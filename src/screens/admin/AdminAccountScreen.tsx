import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { ThemeModeToggle } from '../../components/ThemeModeToggle';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import {
  adminDeleteCustomerAccount,
  adminLiftCustomerRestriction,
  adminSetCustomerRestriction,
  fetchAdminCustomers,
  fetchAdminSellerThreads,
  fetchSellerChatMessages,
  markSellerChatThreadRead,
  sendSellerChatMessage,
} from '../../services/chatModerationService';
import { CustomerModerationUser, RestrictionSeverity, SellerChatMessage, SellerChatThread } from '../../types/models';
import { formatDateTime } from '../../utils/date';

const SEVERITY_LABEL: Record<RestrictionSeverity, string> = {
  warning: 'Warning',
  restricted: 'Restricted',
  banned: 'Banned',
};

export function AdminAccountScreen() {
  const { theme } = useTheme();
  const { profile, signOut } = useAuth();
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<CustomerModerationUser[]>([]);
  const [threads, setThreads] = useState<SellerChatThread[]>([]);
  const [search, setSearch] = useState('');
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [activeThread, setActiveThread] = useState<SellerChatThread | null>(null);
  const [threadMessages, setThreadMessages] = useState<SellerChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [sendingChat, setSendingChat] = useState(false);

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return customers;
    }
    return customers.filter(
      (item) =>
        item.fullName.toLowerCase().includes(keyword) ||
        item.email.toLowerCase().includes(keyword) ||
        item.id.toLowerCase().includes(keyword),
    );
  }, [customers, search]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [nextCustomers, nextThreads] = await Promise.all([fetchAdminCustomers(), fetchAdminSellerThreads()]);
      setCustomers(nextCustomers);
      setThreads(nextThreads);
    } catch {
      setCustomers([]);
      setThreads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!activeThread) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const nextMessages = await fetchSellerChatMessages(activeThread.id);
        if (!cancelled) {
          setThreadMessages(nextMessages);
          await markSellerChatThreadRead(activeThread.id);
          await loadData();
        }
      } catch {
        // keep previous snapshot on polling failure
      }
    };

    poll();
    const timer = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeThread]);

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
      await loadData();
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
      await loadData();
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
          await loadData();
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

  const openThread = async (thread: SellerChatThread) => {
    try {
      const nextMessages = await fetchSellerChatMessages(thread.id);
      setActiveThread(thread);
      setThreadMessages(nextMessages);
      setChatDraft('');
      setChatModalVisible(true);
      await markSellerChatThreadRead(thread.id);
      await loadData();
    } catch {
      showAlert({
        title: 'Unable to open chat',
        message: 'Please try again.',
        tone: 'error',
      });
    }
  };

  const sendChat = async () => {
    if (!activeThread || !chatDraft.trim() || sendingChat) {
      return;
    }

    const message = chatDraft.trim();
    setSendingChat(true);
    setChatDraft('');
    try {
      await sendSellerChatMessage(activeThread.id, message);
      const nextMessages = await fetchSellerChatMessages(activeThread.id);
      setThreadMessages(nextMessages);
      await markSellerChatThreadRead(activeThread.id);
      await loadData();
    } catch (error) {
      setChatDraft(message);
      showAlert({
        title: 'Unable to send',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setSendingChat(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.colors.text }]}>Admin Account</Text>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Profile</Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Name: {profile?.fullName}</Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Email: {profile?.email}</Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Role: {profile?.role}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Appearance</Text>
        <View style={styles.row}>
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Dark Mode</Text>
          <ThemeModeToggle compact />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Seller Inbox</Text>
        {threads.length === 0 ? (
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>No chat threads yet.</Text>
        ) : (
          <View style={styles.sectionList}>
            {threads.map((thread) => (
              <Pressable
                key={thread.id}
                style={[styles.threadRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                onPress={() => openThread(thread)}
              >
                <View style={styles.threadInfo}>
                  <Text style={[styles.threadName, { color: theme.colors.text }]} numberOfLines={1}>
                    {thread.customerName}
                  </Text>
                  <Text style={[styles.meta, { color: theme.colors.textMuted }]} numberOfLines={1}>
                    {thread.lastMessage || 'No messages yet'}
                  </Text>
                  <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
                    {formatDateTime(thread.lastMessageAt)}
                  </Text>
                </View>
                {thread.unreadCount > 0 ? (
                  <View style={[styles.unreadBadge, { backgroundColor: theme.colors.primary }]}>
                    <Text style={[styles.unreadText, { color: theme.colors.primaryContrast }]}>{thread.unreadCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Customer Moderation</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, email, or user id..."
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.searchInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />
        {loading ? <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Loading customers...</Text> : null}
        {!loading && filteredCustomers.length === 0 ? (
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>No customers found.</Text>
        ) : (
          <View style={styles.sectionList}>
            {filteredCustomers.map((customer) => (
              <View
                key={customer.id}
                style={[styles.customerCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
              >
                <Text style={[styles.customerName, { color: theme.colors.text }]}>{customer.fullName}</Text>
                <Text style={[styles.meta, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  {customer.email || customer.id}
                </Text>
                <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
                  Orders: {customer.totalOrders} | Ongoing: {customer.pendingOrders}
                </Text>
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
      </View>

      <Pressable style={[styles.signOutButton, { backgroundColor: theme.colors.danger }]} onPress={() => signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

      <Modal
        visible={chatModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setChatModalVisible(false);
          setActiveThread(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              {activeThread ? `Chat: ${activeThread.customerName}` : 'Chat'}
            </Text>
            <ScrollView style={styles.modalMessages} contentContainerStyle={styles.modalMessagesContent}>
              {threadMessages.map((message) => {
                const own = message.senderRole === 'admin';
                return (
                  <View key={message.id} style={[styles.chatRow, own ? styles.chatRowRight : styles.chatRowLeft]}>
                    <View
                      style={[
                        styles.chatBubble,
                        {
                          backgroundColor: own ? theme.colors.primary : theme.colors.surface,
                          borderColor: own ? theme.colors.primary : theme.colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.chatText, { color: own ? theme.colors.primaryContrast : theme.colors.text }]}>
                        {message.message}
                      </Text>
                      <Text
                        style={[
                          styles.chatMeta,
                          { color: own ? `${theme.colors.primaryContrast}CC` : theme.colors.textMuted },
                        ]}
                      >
                        {formatDateTime(message.createdAt)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <TextInput
              value={chatDraft}
              onChangeText={setChatDraft}
              placeholder="Reply..."
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.chatInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalSecondaryBtn, { borderColor: theme.colors.border }]}
                onPress={() => {
                  setChatModalVisible(false);
                  setActiveThread(null);
                }}
              >
                <Text style={[styles.modalSecondaryText, { color: theme.colors.text }]}>Close</Text>
              </Pressable>
              <Pressable
                style={[styles.modalPrimaryBtn, { backgroundColor: sendingChat ? theme.colors.surfaceAlt : theme.colors.primary }]}
                onPress={sendChat}
              >
                <Text style={[styles.modalPrimaryText, { color: sendingChat ? theme.colors.textMuted : theme.colors.primaryContrast }]}>
                  {sendingChat ? 'Sending...' : 'Send'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  threadRow: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  threadInfo: {
    flex: 1,
    gap: 1,
  },
  threadName: {
    fontSize: 13,
    fontWeight: '800',
  },
  unreadBadge: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '800',
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
  signOutButton: {
    borderRadius: 999,
    marginTop: 16,
    paddingVertical: 13,
  },
  signOutText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalOverlay: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    flex: 1,
    justifyContent: 'center',
    padding: 14,
  },
  modalCard: {
    borderRadius: 14,
    borderWidth: 1,
    maxHeight: '88%',
    padding: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  modalMessages: {
    marginTop: 10,
    maxHeight: 340,
  },
  modalMessagesContent: {
    gap: 8,
    paddingBottom: 10,
  },
  chatRow: {
    flexDirection: 'row',
  },
  chatRowLeft: {
    justifyContent: 'flex-start',
  },
  chatRowRight: {
    justifyContent: 'flex-end',
  },
  chatBubble: {
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: '86%',
    paddingHorizontal: 9,
    paddingTop: 7,
    paddingBottom: 6,
  },
  chatText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  chatMeta: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  chatInput: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
    marginTop: 8,
    maxHeight: 110,
    paddingHorizontal: 10,
    paddingVertical: 9,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  modalSecondaryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  modalSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalPrimaryBtn: {
    borderRadius: 10,
    flex: 1,
    paddingVertical: 10,
  },
  modalPrimaryText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
});

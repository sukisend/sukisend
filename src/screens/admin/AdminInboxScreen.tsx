import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppVideo } from '../../components/AppVideo';
import { BrandAlertModal } from '../../components/BrandAlertModal';
import { EmptyState } from '../../components/EmptyState';
import { ModalBackdrop } from '../../components/ModalBackdrop';
import { SectionHeader } from '../../components/SectionHeader';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { useTheme } from '../../providers/ThemeProvider';
import {
  fetchAdminSellerThreadsPage,
  fetchSellerChatMessagesPage,
  markSellerChatThreadRead,
  sendSellerChatAttachmentMessage,
  sendSellerChatMessage,
} from '../../services/chatModerationService';
import { pickAndUploadChatMedia } from '../../services/mediaService';
import { SellerChatMessage, SellerChatThread } from '../../types/models';
import { formatDateTime } from '../../utils/date';

const THREAD_PAGE_SIZE = 10;
const MESSAGE_PAGE_SIZE = 24;

function getLatestMessageKey(messages: SellerChatMessage[]) {
  const last = messages[messages.length - 1];
  if (!last) {
    return null;
  }
  return `${last.id}:${last.createdAt}`;
}

export function AdminInboxScreen() {
  const { theme } = useTheme();
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const [loading, setLoading] = useState(false);
  const [threads, setThreads] = useState<SellerChatThread[]>([]);
  const [threadPage, setThreadPage] = useState(1);
  const [threadTotal, setThreadTotal] = useState(0);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [activeThread, setActiveThread] = useState<SellerChatThread | null>(null);
  const [threadMessages, setThreadMessages] = useState<SellerChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesPage, setMessagesPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const modalMessagesRef = useRef<ScrollView | null>(null);
  const threadMessagesRef = useRef<SellerChatMessage[]>([]);

  const threadPageCount = Math.max(1, Math.ceil(threadTotal / THREAD_PAGE_SIZE));
  const totalUnread = useMemo(
    () => threads.reduce((sum, thread) => sum + Math.max(0, Number(thread.unreadCount ?? 0)), 0),
    [threads],
  );

  const loadThreads = async (page = threadPage, search = searchQuery, silent = false) => {
    setLoading(true);
    try {
      const result = await fetchAdminSellerThreadsPage({
        page,
        pageSize: THREAD_PAGE_SIZE,
        search,
      });
      setThreads(result.rows);
      setThreadTotal(result.total);
    } catch (error) {
      setThreads([]);
      setThreadTotal(0);
      if (!silent) {
        showAlert({
          title: 'Unable to load inbox',
          message: error instanceof Error ? error.message : 'Please try again.',
          tone: 'error',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const loadThreadMessages = async (
    threadId: string,
    page = 1,
    mode: 'replace' | 'prepend' = 'replace',
    suppressLoader = false,
    forceScrollToBottom = false,
  ) => {
    if (!suppressLoader) {
      setLoadingMessages(true);
    }

    try {
      const result = await fetchSellerChatMessagesPage(threadId, {
        page,
        pageSize: MESSAGE_PAGE_SIZE,
      });

      setMessagesPage(page);
      setHasMoreMessages(result.hasNextPage);
      const currentRows = threadMessagesRef.current;
      const nextRows = mode === 'prepend' ? [...result.rows, ...currentRows] : result.rows;
      const previousLatestKey = getLatestMessageKey(currentRows);
      const nextLatestKey = getLatestMessageKey(nextRows);
      const hasNewLatestMessage = previousLatestKey !== nextLatestKey;

      threadMessagesRef.current = nextRows;
      setThreadMessages(nextRows);

      if (mode === 'replace' && page === 1 && (forceScrollToBottom || hasNewLatestMessage)) {
        requestAnimationFrame(() => {
          modalMessagesRef.current?.scrollToEnd({ animated: true });
        });
      }
    } catch (error) {
      if (!suppressLoader) {
        showAlert({
          title: 'Unable to load messages',
          message: error instanceof Error ? error.message : 'Please try again.',
          tone: 'error',
        });
      }
    } finally {
      if (!suppressLoader) {
        setLoadingMessages(false);
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      const nextQuery = searchDraft.trim();
      setSearchQuery(nextQuery);
      setThreadPage(1);
    }, 280);

    return () => clearTimeout(timer);
  }, [searchDraft]);

  useEffect(() => {
    loadThreads(threadPage, searchQuery);
  }, [threadPage, searchQuery]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadThreads(threadPage, searchQuery, true);
    }, 5000);
    return () => clearInterval(timer);
  }, [threadPage, searchQuery]);

  useEffect(() => {
    if (!activeThread || !chatModalVisible) {
      return;
    }

    const timer = setInterval(async () => {
      await loadThreadMessages(activeThread.id, 1, 'replace', true);
    }, 4000);

    return () => clearInterval(timer);
  }, [activeThread, chatModalVisible]);

  const openThread = async (thread: SellerChatThread) => {
    try {
      setActiveThread(thread);
      setChatModalVisible(true);
      setChatDraft('');
      await loadThreadMessages(thread.id, 1, 'replace', false, true);
      await markSellerChatThreadRead(thread.id);
      await loadThreads(threadPage, searchQuery);
    } catch (error) {
      showAlert({
        title: 'Unable to open chat',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    }
  };

  const closeThread = () => {
    setChatModalVisible(false);
    setActiveThread(null);
    setThreadMessages([]);
    threadMessagesRef.current = [];
    setHasMoreMessages(false);
    setMessagesPage(1);
    setChatDraft('');
  };

  const loadOlderMessages = async () => {
    if (!activeThread || loadingMessages || !hasMoreMessages) {
      return;
    }

    await loadThreadMessages(activeThread.id, messagesPage + 1, 'prepend');
  };

  const sendChat = async () => {
    if (!activeThread || !chatDraft.trim() || sendingChat || uploadingMedia) {
      return;
    }

    const message = chatDraft.trim();
    setSendingChat(true);
    setChatDraft('');
    try {
      await sendSellerChatMessage(activeThread.id, message);
      await loadThreadMessages(activeThread.id, 1, 'replace', false, true);
      await markSellerChatThreadRead(activeThread.id);
      await loadThreads(threadPage, searchQuery);
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

  const sendAttachment = async () => {
    if (!activeThread || sendingChat || uploadingMedia) {
      return;
    }

    try {
      setUploadingMedia(true);
      setUploadError('');
      const picked = await pickAndUploadChatMedia({
        folder: `seller-chat/admin-replies/${activeThread.customerId}`,
        maxBytes: 10 * 1024 * 1024,
      });

      if (!picked) {
        return;
      }

      await sendSellerChatAttachmentMessage(
        activeThread.id,
        {
          url: picked.url,
          type: picked.type,
          mimeType: picked.mimeType,
          sizeBytes: picked.sizeBytes,
        },
        chatDraft.trim() ? chatDraft.trim() : undefined,
      );

      if (chatDraft.trim()) {
        setChatDraft('');
      }

      await loadThreadMessages(activeThread.id, 1, 'replace', false, true);
      await markSellerChatThreadRead(activeThread.id);
      await loadThreads(threadPage, searchQuery, true);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Unable to send media now.');
    } finally {
      setUploadingMedia(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader title="Seller Inbox" subtitle="Monitor inquiries, reply faster, and keep conversations organized." />

        <View style={[styles.summaryRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
          <View style={styles.summaryCol}>
            <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>Unread Inquiries</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.primary }]}>{totalUnread}</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />
          <View style={styles.summaryCol}>
            <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>Threads</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{threadTotal}</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />
          <View style={styles.summaryCol}>
            <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>Page</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              {threadPage}/{threadPageCount}
            </Text>
          </View>
        </View>

        <View style={[styles.searchRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
          <Ionicons name="search-outline" size={16} color={theme.colors.textMuted} />
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder="Search by customer name or email..."
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.searchInput, { color: theme.colors.text }]}
          />
        </View>

        {loading ? <Text style={[styles.helper, { color: theme.colors.textMuted }]}>Loading inbox...</Text> : null}

        {!loading && threads.length === 0 ? (
          <EmptyState title="No messages yet" subtitle="Customer inquiries will appear here once they start chatting." />
        ) : (
          <View style={styles.threadList}>
            {threads.map((thread) => (
              <Pressable
                key={thread.id}
                style={[styles.threadCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
                onPress={() => openThread(thread)}
              >
                <View style={styles.threadTop}>
                  <Text style={[styles.threadName, { color: theme.colors.text }]} numberOfLines={1}>
                    {thread.customerName}
                  </Text>
                  {thread.unreadCount > 0 ? (
                    <View style={[styles.unreadBadge, { backgroundColor: theme.colors.primary }]}>
                      <Text style={[styles.unreadText, { color: theme.colors.primaryContrast }]}>
                        {thread.unreadCount}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.unreadBadge, { backgroundColor: theme.colors.surfaceAlt }]}>
                      <Text style={[styles.unreadText, { color: theme.colors.textMuted }]}>0</Text>
                    </View>
                  )}
                </View>

                <Text style={[styles.threadPreview, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  {thread.lastMessage || 'No messages yet'}
                </Text>
                <Text style={[styles.threadTime, { color: theme.colors.textMuted }]}>
                  {formatDateTime(thread.lastMessageAt)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.paginationRow}>
          <Pressable
            style={[
              styles.pageButton,
              {
                borderColor: theme.colors.border,
                backgroundColor: threadPage <= 1 ? theme.colors.surfaceAlt : theme.colors.card,
              },
            ]}
            disabled={threadPage <= 1}
            onPress={() => setThreadPage((prev) => Math.max(1, prev - 1))}
          >
            <Text style={[styles.pageButtonText, { color: threadPage <= 1 ? theme.colors.textMuted : theme.colors.text }]}>
              Previous
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.pageButton,
              {
                borderColor: theme.colors.border,
                backgroundColor: threadPage >= threadPageCount ? theme.colors.surfaceAlt : theme.colors.card,
              },
            ]}
            disabled={threadPage >= threadPageCount}
            onPress={() => setThreadPage((prev) => Math.min(threadPageCount, prev + 1))}
          >
            <Text
              style={[
                styles.pageButtonText,
                { color: threadPage >= threadPageCount ? theme.colors.textMuted : theme.colors.text },
              ]}
            >
              Next
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={chatModalVisible} transparent animationType="slide" onRequestClose={closeThread}>
        <ModalBackdrop overlayOpacity={0.45}>
          <View style={[styles.modalCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                {activeThread ? activeThread.customerName : 'Conversation'}
              </Text>
              <Pressable style={styles.modalClose} onPress={closeThread}>
                <Ionicons name="close" size={20} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            {hasMoreMessages ? (
              <Pressable
                style={[styles.loadOlderBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                onPress={loadOlderMessages}
                disabled={loadingMessages}
              >
                <Text style={[styles.loadOlderText, { color: theme.colors.text }]}>
                  {loadingMessages ? 'Loading...' : 'Load older messages'}
                </Text>
              </Pressable>
            ) : null}

            <ScrollView
              ref={(instance) => {
                modalMessagesRef.current = instance;
              }}
              style={styles.modalMessages}
              contentContainerStyle={styles.modalMessagesContent}
            >
              {loadingMessages && threadMessages.length === 0 ? (
                <Text style={[styles.helper, { color: theme.colors.textMuted }]}>Loading messages...</Text>
              ) : null}
              {!loadingMessages && threadMessages.length === 0 ? (
                <Text style={[styles.helper, { color: theme.colors.textMuted }]}>No messages yet.</Text>
              ) : null}
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
                      {message.attachment ? (
                        message.attachment.type === 'image' ? (
                          <Image source={{ uri: message.attachment.url }} style={styles.chatImage} resizeMode="cover" />
                        ) : (
                          <AppVideo
                            source={{ uri: message.attachment.url }}
                            style={styles.chatVideo}
                            contentFit="contain"
                            nativeControls
                            autoPlay={false}
                            loop={false}
                            muted={false}
                            allowsFullscreen
                          />
                        )
                      ) : null}
                      {message.message.trim().length > 0 ? (
                        <Text style={[styles.chatText, { color: own ? theme.colors.primaryContrast : theme.colors.text }]}>
                          {message.message}
                        </Text>
                      ) : null}
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

            <View style={styles.composeTopRow}>
              <Pressable
                style={[styles.mediaButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                onPress={sendAttachment}
                disabled={sendingChat || uploadingMedia}
              >
                <Ionicons name="attach-outline" size={15} color={theme.colors.text} />
                <Text style={[styles.mediaButtonText, { color: theme.colors.text }]}>
                  {uploadingMedia ? 'Uploading...' : 'Photo/Video'}
                </Text>
              </Pressable>
              <Text style={[styles.composeHint, { color: theme.colors.textMuted }]}>Max 10MB</Text>
            </View>

            <TextInput
              value={chatDraft}
              onChangeText={setChatDraft}
              placeholder="Reply to customer..."
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.chatInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
              multiline
            />
            {uploadError ? <Text style={[styles.helper, { color: theme.colors.warning }]}>{uploadError}</Text> : null}

            <Pressable
              style={[styles.sendBtn, { backgroundColor: sendingChat ? theme.colors.surfaceAlt : theme.colors.primary }]}
              onPress={sendChat}
              disabled={sendingChat || uploadingMedia || !chatDraft.trim()}
            >
              <Text
                style={[
                  styles.sendBtnText,
                  { color: sendingChat || !chatDraft.trim() ? theme.colors.textMuted : theme.colors.primaryContrast },
                ]}
              >
                {sendingChat ? 'Sending...' : 'Send Reply'}
              </Text>
            </Pressable>
          </View>
        </ModalBackdrop>
      </Modal>

      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: 10,
    padding: 14,
    paddingBottom: 10,
  },
  summaryRow: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  summaryCol: {
    alignItems: 'center',
    flex: 1,
  },
  summaryDivider: {
    height: 32,
    width: 1,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 3,
  },
  searchRow: {
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
  helper: {
    fontSize: 12,
    fontWeight: '600',
  },
  threadList: {
    gap: 8,
  },
  threadCard: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 10,
  },
  threadTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  threadName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  threadPreview: {
    fontSize: 12,
    fontWeight: '500',
  },
  threadTime: {
    fontSize: 11,
    fontWeight: '500',
  },
  unreadBadge: {
    alignItems: 'center',
    borderRadius: 999,
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '800',
  },
  paginationRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  pageButton: {
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 110,
    paddingVertical: 9,
  },
  pageButtonText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalCard: {
    borderRadius: 14,
    borderWidth: 1,
    maxHeight: '90%',
    padding: 12,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  modalClose: {
    padding: 2,
  },
  loadOlderBtn: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    paddingVertical: 8,
  },
  loadOlderText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalMessages: {
    marginTop: 8,
    maxHeight: 350,
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
  chatImage: {
    borderRadius: 8,
    height: 170,
    marginBottom: 6,
    width: 210,
  },
  chatVideo: {
    borderRadius: 8,
    height: 190,
    marginBottom: 6,
    width: 220,
  },
  chatInput: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
    marginTop: 8,
    maxHeight: 110,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 9,
    textAlignVertical: 'top',
  },
  composeTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  mediaButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mediaButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  composeHint: {
    fontSize: 11,
    fontWeight: '600',
  },
  sendBtn: {
    borderRadius: 999,
    marginTop: 8,
    paddingVertical: 12,
  },
  sendBtnText: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
});

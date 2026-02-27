import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppVideo } from '../../components/AppVideo';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import {
  fetchSellerChatMessages,
  getOrCreateSellerThread,
  markSellerChatThreadRead,
  sendSellerChatAttachmentMessage,
  sendSellerChatMessage,
} from '../../services/chatModerationService';
import { pickAndUploadChatMedia } from '../../services/mediaService';
import { SellerChatMessage } from '../../types/models';
import { formatDateTime } from '../../utils/date';

export function ChatSellerScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { role, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SellerChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const messagesScrollRef = useRef<ScrollView | null>(null);
  const previousLatestMessageKeyRef = useRef<string | null>(null);
  const isCustomer = role === 'customer' && !!profile?.id;

  const titleLine = useMemo(() => {
    if (!isCustomer) {
      return '';
    }
    const first = profile?.fullName?.trim().split(/\s+/)[0] ?? 'Suki';
    return `Hi ${first}, chat with our store team for order concerns and delivery updates.`;
  }, [isCustomer, profile?.fullName]);

  const latestMessageKey = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last) {
      return null;
    }
    return `${last.id}:${last.createdAt}`;
  }, [messages]);

  useEffect(() => {
    if (!isCustomer || !profile?.id) {
      setThreadId(null);
      setMessages([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const nextThreadId = await getOrCreateSellerThread(profile.id);
        if (cancelled) {
          return;
        }
        setThreadId(nextThreadId);
        const nextMessages = await fetchSellerChatMessages(nextThreadId);
        if (!cancelled) {
          setMessages(nextMessages);
          await markSellerChatThreadRead(nextThreadId);
        }
      } catch {
        if (!cancelled) {
          setMessages([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isCustomer, profile?.id]);

  useEffect(() => {
    if (!threadId) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const nextMessages = await fetchSellerChatMessages(threadId);
        if (!cancelled) {
          setMessages(nextMessages);
          await markSellerChatThreadRead(threadId);
        }
      } catch {
        // Keep current messages when polling fails.
      }
    };

    const timer = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [threadId]);

  useEffect(() => {
    if (!latestMessageKey) {
      previousLatestMessageKeyRef.current = null;
      return;
    }

    const hasNewMessage = previousLatestMessageKeyRef.current !== latestMessageKey;
    if (hasNewMessage) {
      requestAnimationFrame(() => {
        messagesScrollRef.current?.scrollToEnd({ animated: true });
      });
    }

    previousLatestMessageKeyRef.current = latestMessageKey;
  }, [latestMessageKey]);

  const sendMessage = async () => {
    if (!threadId || !draft.trim() || sending) {
      return;
    }

    const nextText = draft.trim();
    setSending(true);
    setDraft('');
    try {
      await sendSellerChatMessage(threadId, nextText);
      const nextMessages = await fetchSellerChatMessages(threadId);
      setMessages(nextMessages);
      await markSellerChatThreadRead(threadId);
    } catch {
      setDraft(nextText);
    } finally {
      setSending(false);
    }
  };

  const sendAttachment = async () => {
    if (!threadId || !profile?.id || uploadingMedia || sending) {
      return;
    }

    try {
      setUploadingMedia(true);
      setMediaError('');
      const picked = await pickAndUploadChatMedia({
        folder: `seller-chat/${profile.id}`,
        maxBytes: 10 * 1024 * 1024,
      });

      if (!picked) {
        return;
      }

      await sendSellerChatAttachmentMessage(
        threadId,
        {
          url: picked.url,
          type: picked.type,
          mimeType: picked.mimeType,
          sizeBytes: picked.sizeBytes,
        },
        draft.trim() ? draft.trim() : undefined,
      );

      if (draft.trim()) {
        setDraft('');
      }

      const nextMessages = await fetchSellerChatMessages(threadId);
      setMessages(nextMessages);
      await markSellerChatThreadRead(threadId);
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : 'Unable to send media right now.');
    } finally {
      setUploadingMedia(false);
    }
  };

  if (!isCustomer) {
    return (
      <View
        style={[
          styles.guestWrap,
          {
            backgroundColor: theme.colors.background,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingTop: insets.top + 10,
          },
        ]}
      >
        <EmptyState
          title="Sign in to message the store"
          subtitle="Customer support and order inquiries are available after sign in."
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top + 10 }]}>
      <View style={[styles.headerCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Chat Seller</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{titleLine}</Text>
      </View>

      <ScrollView
        ref={(instance) => {
          messagesScrollRef.current = instance;
        }}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
      >
        {loading ? <Text style={[styles.helper, { color: theme.colors.textMuted }]}>Loading conversation...</Text> : null}
        {!loading && messages.length === 0 ? (
          <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
            Start a conversation. We usually reply quickly during store hours.
          </Text>
        ) : null}
        {messages.map((message) => {
          const own = message.senderRole === 'customer';
          return (
            <View key={message.id} style={[styles.messageRow, own ? styles.messageRowRight : styles.messageRowLeft]}>
              <View
                style={[
                  styles.bubble,
                  {
                    backgroundColor: own ? theme.colors.primary : theme.colors.card,
                    borderColor: own ? theme.colors.primary : theme.colors.border,
                  },
                ]}
              >
                {message.attachment ? (
                  message.attachment.type === 'image' ? (
                    <Image source={{ uri: message.attachment.url }} style={styles.attachmentImage} resizeMode="cover" />
                  ) : (
                    <AppVideo
                      source={{ uri: message.attachment.url }}
                      style={styles.attachmentVideo}
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
                  <Text style={[styles.messageText, { color: own ? theme.colors.primaryContrast : theme.colors.text }]}>
                    {message.message}
                  </Text>
                ) : null}
                <Text
                  style={[
                    styles.messageMeta,
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

      <View
        style={[
          styles.composeWrap,
          {
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}
      >
        <View style={styles.composeTopRow}>
          <Pressable
            style={[styles.mediaButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
            onPress={sendAttachment}
            disabled={uploadingMedia || sending}
          >
            <Ionicons name="attach-outline" size={16} color={theme.colors.text} />
            <Text style={[styles.mediaButtonText, { color: theme.colors.text }]}>
              {uploadingMedia ? 'Uploading...' : 'Photo/Video'}
            </Text>
          </Pressable>
          <Text style={[styles.attachmentHint, { color: theme.colors.textMuted }]}>Max 10MB</Text>
        </View>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Type your message..."
          placeholderTextColor={theme.colors.textMuted}
          multiline
          style={[
            styles.input,
            {
              borderColor: theme.colors.border,
              color: theme.colors.text,
              backgroundColor: theme.colors.background,
            },
          ]}
        />
        {mediaError ? <Text style={[styles.helper, { color: theme.colors.warning ?? '#F59E0B' }]}>{mediaError}</Text> : null}
        <Pressable
          style={[styles.sendButton, { backgroundColor: sending ? theme.colors.surfaceAlt : theme.colors.primary }]}
          onPress={sendMessage}
          disabled={sending || uploadingMedia || !draft.trim()}
        >
          <Text
            style={[
              styles.sendButtonText,
              {
                color: sending || !draft.trim() ? theme.colors.textMuted : theme.colors.primaryContrast,
              },
            ]}
          >
            {sending ? 'Sending...' : 'Send'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  guestWrap: {
    flex: 1,
    paddingHorizontal: 14,
  },
  headerCard: {
    borderRadius: 14,
    borderWidth: 1,
    marginHorizontal: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 4,
  },
  messages: {
    flex: 1,
    marginTop: 10,
    paddingHorizontal: 14,
  },
  messagesContent: {
    gap: 8,
    paddingBottom: 14,
  },
  helper: {
    fontSize: 12,
    fontWeight: '600',
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    borderRadius: 12,
    borderWidth: 1,
    maxWidth: '84%',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
  },
  messageText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  messageMeta: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  composeWrap: {
    borderTopWidth: 1,
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  composeTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  attachmentHint: {
    fontSize: 11,
    fontWeight: '600',
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    lineHeight: 20,
    maxHeight: 110,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  sendButton: {
    borderRadius: 999,
    paddingVertical: 12,
  },
  sendButtonText: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  attachmentImage: {
    borderRadius: 8,
    height: 170,
    marginBottom: 6,
    width: 210,
  },
  attachmentVideo: {
    borderRadius: 8,
    height: 190,
    marginBottom: 6,
    width: 220,
  },
});

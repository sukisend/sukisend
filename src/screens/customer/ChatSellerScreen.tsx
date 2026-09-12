import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppVideo } from '../../components/AppVideo';
import { AppTextInput } from '../../components/AppTextInput';
import { EmptyState } from '../../components/EmptyState';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { TypingPlaceholder } from '../../components/TypingPlaceholder';
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
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
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
      {/* Compact welcome banner */}
      <View style={[styles.welcomeBanner, { backgroundColor: theme.colors.surfaceAlt }]}>
        <View style={styles.welcomeRow}>
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.colors.textMuted} />
          <Text style={[styles.welcomeText, { color: theme.colors.textMuted }]} numberOfLines={2}>
            {titleLine}
          </Text>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={(instance) => {
          messagesScrollRef.current = instance;
        }}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
      >
        {loading ? (
          <View style={[styles.loadingChip, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>Loading conversation...</Text>
          </View>
        ) : null}
        {!loading && messages.length === 0 ? (
          <View style={[styles.emptyChat, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Ionicons name="chatbubbles-outline" size={28} color={theme.colors.textMuted} />
            <Text style={[styles.emptyChatTitle, { color: theme.colors.text }]}>Start a conversation</Text>
            <Text style={[styles.emptyChatSub, { color: theme.colors.textMuted }]}>
              We usually reply quickly during store hours.
            </Text>
          </View>
        ) : null}
        {messages.map((message) => {
          const own = message.senderRole === 'customer';
          const attachment = message.attachment;
          return (
            <View key={message.id} style={[styles.messageRow, own ? styles.messageRowRight : styles.messageRowLeft]}>
              {!own ? (
                <View style={[styles.avatarSmall, { backgroundColor: theme.colors.surfaceAlt }]}>
                  <Ionicons name="storefront-outline" size={12} color={theme.colors.textMuted} />
                </View>
              ) : null}
              <View
                style={[
                  styles.bubble,
                  {
                    backgroundColor: own ? theme.colors.primary : theme.colors.card,
                    borderColor: own ? theme.colors.primary : theme.colors.border,
                  },
                ]}
              >
                {attachment ? (
                  attachment.type === 'image' ? (
                    <Pressable
                      onPress={() => {
                        setPreviewImages([attachment.url]);
                        setPreviewIndex(0);
                        setPreviewVisible(true);
                      }}
                      hitSlop={2}
                    >
                      <Image source={{ uri: attachment.url }} style={styles.attachmentImage} resizeMode="cover" />
                    </Pressable>
                  ) : (
                    <AppVideo
                      source={{ uri: attachment.url }}
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

      {/* Compose */}
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
            <Ionicons name="image-outline" size={16} color={theme.colors.text} />
            <Text style={[styles.mediaButtonText, { color: theme.colors.text }]}>
              {uploadingMedia ? 'Uploading...' : 'Photo/Video'}
            </Text>
          </Pressable>
          <Text style={[styles.attachmentHint, { color: theme.colors.textMuted }]}>Max 10MB</Text>
        </View>
        {mediaError ? <Text style={[styles.mediaErrorText, { color: theme.colors.warning ?? '#F59E0B' }]}>{mediaError}</Text> : null}
        <View style={styles.inputRow}>
          <View style={styles.inputWrap}>
            <AppTextInput
              webName="chat-seller-message"
              value={draft}
              onChangeText={setDraft}
              placeholder=""
              placeholderTextColor={theme.colors.textMuted}
              multiline
              accessibilityLabel="Message"
              style={[
                styles.input,
                {
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                  backgroundColor: theme.colors.background,
                },
              ]}
            />
            <TypingPlaceholder visible={!draft} color={theme.colors.textMuted} />
          </View>
          <Pressable
            style={[
              styles.sendIconButton,
              {
                backgroundColor: sending || !draft.trim() ? theme.colors.surfaceAlt : theme.colors.primary,
              },
            ]}
            onPress={sendMessage}
            disabled={sending || uploadingMedia || !draft.trim()}
          >
            <Ionicons
              name="send"
              size={16}
              color={sending || !draft.trim() ? theme.colors.textMuted : '#FFFFFF'}
            />
          </Pressable>
        </View>
      </View>
      <ImagePreviewModal
        visible={previewVisible}
        images={previewImages}
        initialIndex={previewIndex}
        onClose={() => setPreviewVisible(false)}
      />
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
  welcomeBanner: {
    marginHorizontal: 14,
    marginTop: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  welcomeRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  welcomeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  messages: {
    flex: 1,
    marginTop: 8,
    paddingHorizontal: 14,
  },
  messagesContent: {
    gap: 10,
    paddingBottom: 14,
  },
  loadingChip: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  loadingText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyChat: {
    alignItems: 'center',
    borderRadius: 14,
    gap: 4,
    marginTop: 40,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  emptyChatTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
  },
  emptyChatSub: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  messageRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 6,
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  avatarSmall: {
    alignItems: 'center',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  bubble: {
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: '78%',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 5,
  },
  messageText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  messageMeta: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 3,
  },
  composeWrap: {
    borderTopWidth: 1,
    gap: 6,
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
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mediaButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  attachmentHint: {
    fontSize: 10,
    fontWeight: '600',
  },
  mediaErrorText: {
    fontSize: 11,
    fontWeight: '600',
  },
  inputRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    position: 'relative',
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    maxHeight: 100,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlignVertical: 'top',
  },
  sendIconButton: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  attachmentImage: {
    borderRadius: 10,
    height: 160,
    marginBottom: 4,
    width: 200,
  },
  attachmentVideo: {
    borderRadius: 10,
    height: 180,
    marginBottom: 4,
    width: 210,
  },
});

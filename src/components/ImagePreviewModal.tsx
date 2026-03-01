import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ModalBackdrop } from './ModalBackdrop';

interface ImagePreviewModalProps {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

export function ImagePreviewModal({ visible, images, initialIndex = 0, onClose }: ImagePreviewModalProps) {
  const width = useMemo(() => Dimensions.get('window').width, []);
  const scrollRef = useRef<ScrollView | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!visible || !scrollRef.current) {
      return;
    }

    const index = Math.max(0, Math.min(initialIndex, Math.max(0, images.length - 1)));
    setActiveIndex(index);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: index * width, animated: false });
    });
  }, [images.length, initialIndex, visible, width]);

  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex < images.length - 1;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalBackdrop overlayOpacity={0.6} intensity={36} paddingHorizontal={0}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Product Image Previews</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={22} color="#F8FAFC" />
          </Pressable>
        </View>

        <ScrollView
          ref={(instance) => {
            scrollRef.current = instance;
          }}
          style={styles.gallery}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ width: width * images.length }}
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
            setActiveIndex(Math.max(0, Math.min(nextIndex, Math.max(0, images.length - 1))));
          }}
        >
          {images.map((uri, index) => (
            <View key={`${uri}-${index}`} style={[styles.imageSlide, { width }]}>
              <Image source={{ uri }} style={styles.image} resizeMode="contain" />
            </View>
          ))}
        </ScrollView>

        {images.length > 1 ? (
          <View style={styles.controlsRow}>
            <Pressable
              style={[styles.navButton, !canGoPrev ? styles.navButtonDisabled : null]}
              disabled={!canGoPrev}
              onPress={() => {
                const next = Math.max(0, activeIndex - 1);
                setActiveIndex(next);
                scrollRef.current?.scrollTo({ x: next * width, animated: true });
              }}
            >
              <Ionicons name="chevron-back" size={18} color={canGoPrev ? '#F8FAFC' : '#94A3B8'} />
              <Text style={[styles.navText, { color: canGoPrev ? '#F8FAFC' : '#94A3B8' }]}>Prev</Text>
            </Pressable>

            <Text style={styles.counterText}>
              {activeIndex + 1} / {images.length}
            </Text>

            <Pressable
              style={[styles.navButton, !canGoNext ? styles.navButtonDisabled : null]}
              disabled={!canGoNext}
              onPress={() => {
                const next = Math.min(images.length - 1, activeIndex + 1);
                setActiveIndex(next);
                scrollRef.current?.scrollTo({ x: next * width, animated: true });
              }}
            >
              <Text style={[styles.navText, { color: canGoNext ? '#F8FAFC' : '#94A3B8' }]}>Next</Text>
              <Ionicons name="chevron-forward" size={18} color={canGoNext ? '#F8FAFC' : '#94A3B8'} />
            </Pressable>
          </View>
        ) : null}
      </ModalBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: 16,
    position: 'absolute',
    right: 0,
    top: 44,
    zIndex: 2,
  },
  headerText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  closeButton: {
    padding: 6,
  },
  gallery: {
    flex: 1,
  },
  imageSlide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 82,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  controlsRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  navButton: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    minWidth: 82,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  navButtonDisabled: {
    opacity: 0.6,
  },
  navText: {
    fontSize: 12,
    fontWeight: '700',
  },
  counterText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
});

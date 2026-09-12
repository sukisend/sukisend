import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../providers/ThemeProvider';

interface ImagePreviewModalProps {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

export function ImagePreviewModal({ visible, images, initialIndex = 0, onClose }: ImagePreviewModalProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const width = useMemo(() => Dimensions.get('window').width, []);
  const height = useMemo(() => Dimensions.get('window').height, []);
  const scrollRef = useRef<ScrollView | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!visible || !scrollRef.current) return;
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
      <View style={styles.overlay}>
        {/* Blurred background using the current image */}
        {images[activeIndex] ? (
          <Image
            source={{ uri: images[activeIndex] }}
            style={styles.blurredBg}
            blurRadius={50}
            resizeMode="cover"
          />
        ) : null}
        <View style={styles.dimOverlay} />

        {/* Close button */}
        <Pressable
          style={[styles.closeButton, { top: insets.top + 10 }]}
          onPress={onClose}
          hitSlop={12}
        >
          <View style={styles.closeCircle}>
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </View>
        </Pressable>

        {/* Centered image gallery */}
        <ScrollView
          ref={(instance) => { scrollRef.current = instance; }}
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
            <View key={`${uri}-${index}`} style={[styles.imageSlide, { width, height }]}>
              <Image source={{ uri }} style={styles.image} resizeMode="contain" />
            </View>
          ))}
        </ScrollView>

        {/* Counter */}
        <View style={[styles.counterRow, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.counterText}>
            {activeIndex + 1} / {images.length}
          </Text>
        </View>

        {/* Navigation arrows (only for multiple images) */}
        {images.length > 1 && (
          <>
            {canGoPrev && (
              <Pressable
                style={[styles.navBtn, styles.navBtnLeft, { top: height / 2 - 20 }]}
                onPress={() => {
                  const next = Math.max(0, activeIndex - 1);
                  setActiveIndex(next);
                  scrollRef.current?.scrollTo({ x: next * width, animated: true });
                }}
              >
                <Ionicons name="chevron-back" size={22} color="#FFF" />
              </Pressable>
            )}
            {canGoNext && (
              <Pressable
                style={[styles.navBtn, styles.navBtnRight, { top: height / 2 - 20 }]}
                onPress={() => {
                  const next = Math.min(images.length - 1, activeIndex + 1);
                  setActiveIndex(next);
                  scrollRef.current?.scrollTo({ x: next * width, animated: true });
                }}
              >
                <Ionicons name="chevron-forward" size={22} color="#FFF" />
              </Pressable>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  blurredBg: {
    ...StyleSheet.absoluteFillObject,
    height: '100%',
    width: '100%',
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
  },
  closeCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  gallery: {
    flex: 1,
    zIndex: 1,
  },
  imageSlide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  image: {
    borderRadius: 8,
    height: '70%',
    maxHeight: 500,
    width: '85%',
  },
  counterRow: {
    alignItems: 'center',
    paddingTop: 8,
    zIndex: 2,
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  navBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    width: 40,
    zIndex: 5,
  },
  navBtnLeft: {
    left: 10,
  },
  navBtnRight: {
    right: 10,
  },
});

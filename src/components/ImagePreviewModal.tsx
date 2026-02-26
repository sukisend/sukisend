import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef } from 'react';
import { Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface ImagePreviewModalProps {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

export function ImagePreviewModal({ visible, images, initialIndex = 0, onClose }: ImagePreviewModalProps) {
  const width = useMemo(() => Dimensions.get('window').width, []);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (!visible || !scrollRef.current) {
      return;
    }

    const index = Math.max(0, Math.min(initialIndex, Math.max(0, images.length - 1)));
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: index * width, animated: false });
    });
  }, [images.length, initialIndex, visible, width]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Image Preview</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={22} color="#F8FAFC" />
          </Pressable>
        </View>

        <ScrollView
          ref={(instance) => {
            scrollRef.current = instance;
          }}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ width: width * images.length }}
        >
          {images.map((uri, index) => (
            <View key={`${uri}-${index}`} style={[styles.imageSlide, { width }]}>
              <Image source={{ uri }} style={styles.image} resizeMode="contain" />
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(2,6,23,0.95)',
    flex: 1,
    justifyContent: 'center',
  },
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
  imageSlide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  image: {
    height: '80%',
    width: '100%',
  },
});

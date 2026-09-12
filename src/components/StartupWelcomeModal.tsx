import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';
import { ModalBackdrop } from './ModalBackdrop';

interface StartupWelcomeModalProps {
  visible: boolean;
  onClose: () => void;
}

export function StartupWelcomeModal({ visible, onClose }: StartupWelcomeModalProps) {
  const { theme } = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <ModalBackdrop overlayOpacity={0.15}>
        <View style={styles.outerWrap}>
          <View style={styles.content}>
            <View style={[styles.logoWrap, { borderColor: 'rgba(255,255,255,0.42)' }]}>
              <Image source={require('../../assets/suki-send-logo.png')} style={styles.logo} resizeMode="contain" />
            </View>

            <Pressable onPress={onClose} style={styles.btnWrap}>
              <Animated.View style={[styles.shopNowBtn, { transform: [{ scale: pulseAnim }] }]}>
                <View style={styles.shopNowInner}>
                  <Ionicons name="bag-handle-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.shopNowText}>SHOP NOW!</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                </View>
              </Animated.View>
            </Pressable>
          </View>
        </View>
      </ModalBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  outerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    zIndex: 10,
  },
  logoWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: -4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
  },
  logo: {
    height: 134,
    width: 260,
  },
  btnWrap: {
    borderWidth: 0,
    marginTop: 0,
    outlineColor: 'transparent',
    outlineStyle: 'none',
    outlineWidth: 0,
    width: 280,
  },
  shopNowBtn: {
    borderRadius: 999,
    overflow: 'hidden',
    width: '100%',
  },
  shopNowInner: {
    alignItems: 'center',
    backgroundColor: '#FF6B00',
    borderRadius: 999,
    borderWidth: 0,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 14,
  },
  shopNowText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
